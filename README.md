# WebStreamETDS — Website Clickstream Analytics

An end-to-end clickstream analytics pipeline built entirely from free and open-source
components: a real storefront emits events, Kafka buffers them, Spark and Delta Lake
turn them into analytical tables, and Power BI reports on them.

Nothing in the pipeline is simulated. The dataset was collected from real visitors
using the site on their own devices: **999 events, 55 sessions, 51 browsers.**

---

## What it does

**SoleStream** is a shoe storefront built for this project — 12 products across four
brands, a login page, a filterable shop page with like/dislike reactions, and a cart.
It has two purchase routes: a direct *Buy now* on the product, and a conventional cart
checkout. A JavaScript SDK embedded in the pages emits one event per meaningful
interaction and posts it to `/api/events`.

Everything downstream exists to turn that stream of clicks into four tables a dashboard
can answer business questions from.

---

## Architecture

```
INGESTION  (AWS EC2 · always on)
  Visitor browser  →  Collector  →  Kafka  →  Parquet sink  →  data/bronze/
                      (Flask +      (topic:    (Hive-partitioned by
                       Gunicorn)    clickstream)  event_date / hour)
                           ↓
                      dead-letter topic (malformed events)

                           ↓  scp — pull the new raw files

PROCESSING  (Docker · Spark 3.5.6 + Delta Lake · batch, on demand)
  bronze.py  →  silver.py  →  gold.py
  register      validate,      four aggregate
  new files     dedupe,        tables
                sessionise

                           ↓

SERVING
  data/gold/*.parquet  →  Power BI Desktop (Import mode, five pages)
```

The containers are deployed on **Kubernetes**: the collector as a Deployment behind a
Service, Kafka as a StatefulSet with a persistent volume claim so the topic survives a
restart, and each Spark job submitted as a Job that runs to completion and exits.

---

## Repository layout

```
jobs/
  common.py        Shared Spark session, paths, constants, and the tracking-plan reader
  bronze.py        Registers newly arrived Parquet files into the Delta lake
  silver.py        Validation, deduplication, sessionisation
  gold.py          Builds the four aggregate tables
  stats.py         Read-only: prints every headline figure
  metadata.py      Generates docs/gold-metadata.md from the actual Parquet schemas
docs/
  tracking-plan.md The data contract — the jobs read the required-field list from here
deploy/
  docker-compose.prod.yml   Server-side stack (collector, Kafka, consumer, sink)
docker-compose.yml          Local stack (Kafka, consumer, sink, Spark under a profile)
Dockerfile.spark            Spark 3.5.6 + Delta Lake 3.3.2
refresh.bat                 One command: pull → bronze → silver → gold → publish
data/
  bronze/   Raw events as received, partitioned by date and hour
  silver/   Delta tables: events, sessions, rejects
  gold/     funnel_daily, product_performance, session_summary, user_features
```

---

## Running it

### Prerequisites

Docker Desktop. That is all — Spark, Python and the Delta jars live inside the image,
so nothing needs installing on the host.

### Local pipeline

```bash
# bring up Kafka, the consumer and the sink
docker compose up -d

# run the three Spark jobs in order
docker compose run --rm spark jobs/bronze.py
docker compose run --rm spark jobs/silver.py
docker compose run --rm spark jobs/gold.py
```

The Spark service sits behind a Compose profile, so `docker compose up` never starts it
by accident — it only runs when invoked explicitly. Each job is a one-shot container
that exits when it finishes.

### Reporting

```bash
# every headline figure: events, duplicates, rejects, sessions, browsers, funnel
docker compose run --rm spark jobs/stats.py

# regenerate the gold-layer metadata document from the real schemas
docker compose run --rm spark jobs/metadata.py
```

### Full refresh (Windows)

```bat
refresh.bat
```

This pulls new raw files from the server, runs the three jobs in order, and copies the
finished tables to the folder Power BI reads. It stops at the first failure rather than
carrying on with stale data — if step 2 fails, steps 3 and 4 do not run.

### Server

```bash
docker compose -f deploy/docker-compose.prod.yml up -d
docker compose -f deploy/docker-compose.prod.yml logs -f consumer
```

---

## The data contract

Every event carries five mandatory fields:

| Field | Meaning |
| --- | --- |
| `event_id` | Unique per interaction — the deduplication key |
| `session_id` | The visit, assigned client-side |
| `anonymous_id` | The browser; exists before any login |
| `timestamp` | When the interaction happened |
| `event` | Which of the 12 event types this is |

Twelve event types are instrumented: `user_login`, `shop_page_view`, `filter_applied`,
`filters_cleared`, `like`, `dislike`, `reaction_removed`, `add_to_cart`,
`remove_from_cart`, `view_cart`, `buy_now`, `cart_purchase`.

The required-field list lives in `docs/tracking-plan.md` and is parsed at run time by
`jobs/common.py`. The contract is written once and enforced from one place rather than
restated in code.

### Identity

Three identifiers operate at different scopes, and conflating them is the easiest way to
produce a wrong number:

- `event_id` — one interaction
- `anonymous_id` — one browser
- `user_id` — one person, derived from a salted SHA-256 hash of the mobile number given
  at login. The raw number never passes beyond the bronze layer, so the analytical
  tables hold pseudonymised data.

A shared device makes browser counts and people counts diverge, which is why both are
reported separately.

---

## Correctness guarantees

**Idempotent.** Re-running any job over the same input changes nothing. Bronze uses a
left anti-join on the source file name, so a file that has already been ingested is
never read again. Silver uses `MERGE ... WHEN NOT MATCHED THEN INSERT` keyed on
`event_id`, so a second run inserts zero rows.

**Incremental.** Silver watermarks on the bronze ingest time and reads only rows that
arrived since the last run, rather than reprocessing the full history each time.

**At-least-once delivery, handled.** The sink commits its Kafka offset only after the
Parquet write succeeds. A crash between the two replays events — which is correct
behaviour, and exactly why deduplication exists downstream.

**Nothing is dropped silently.** Events that fail validation go to a dead-letter topic
and into a `silver_rejects` table carrying the reason they failed, instead of
disappearing.

**Gold is recomputed in full** on every run, so the output always matches the current
state of silver.

---

## Gold tables

| Table | One row is | Answers |
| --- | --- | --- |
| `funnel_daily` | one funnel stage on one day | Where visitors stop |
| `product_performance` | one product | Which shoes attract interest, and which convert |
| `session_summary` | one visit | Visit length, depth, and purchase outcome |
| `user_features` | one person | Recency, frequency, category affinity |

Run `jobs/metadata.py` for the full column-level documentation, generated from the
Parquet files themselves rather than maintained by hand.

---

## Dashboard

Five Power BI pages: Overview, Conversion funnel, Product performance, Session
behaviour, Data quality. Import mode, pointed at `data/gold/`.

Two notes that matter when reading it:

- Per-product purchases count the direct *Buy now* route only. A cart checkout carries
  no product identifier, so cart sales are visible in the funnel but not attributable to
  individual shoes.
- There is no per-product view event — the site records a view of the product grid, not
  of a single product — so no view-to-purchase rate can be calculated.

---

## Known gaps

- The dead-letter queue stores rejected events, but nothing reads them back yet.
  Recovery is possible in principle, not yet automatic.
- `cart_purchase` carries no product identifier.
- No per-product view event.
- Spark processing runs in batch on demand, not on a schedule.

---

## Built with

Python · Flask · Gunicorn · Apache Kafka (KRaft) · Apache Spark 3.5.6 · Delta Lake 3.3.2
· Apache Parquet · Docker · Kubernetes · AWS EC2 · Power BI

MSc Big Data Analytics — Lakshmi PS (252BDA08), Nandhana V (252BDA11),
Dharnesh E (252BDA27)
