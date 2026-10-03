# SoleStream — Clickstream Pipeline

## Goal

Shoe storefront emitting clickstream events (views, filters, reactions, cart,
purchases) into Kafka for analytics; `consumer.py` stands in for real processing.

## Stack

Vanilla HTML/CSS/JS (no framework, no build) · Flask + flask-cors + `kafka-python`
· single-node Kafka in KRaft mode via Compose · `python-dotenv` via `config.py`.

## Layout

```
index.html / shoes.html / style.css  Storefront; no build, served by app.py
script.js          Product data, cart/profile, trackEvent() -> POST /api/events
app.py             Flask: serves the storefront + ingestion API -> Kafka. HOST.
consumer.py        Topic printer + contract check -> DLQ. Containerised.
sink.py            Kafka -> Parquet, data/bronze/event_date=/hour=. Containerised.
config.py          Single source of Kafka settings for every service.
docker-compose.yml kafka (named volume) + consumer + sink (app.py deliberately excluded)
.env.example       Template; copy to .env (gitignored)
docs/tracking-plan.md   Event contract. Authority for required/optional fields.
requirements.txt   Production deps, installed into the Docker images.
requirements-dev.txt    Local tooling + test data (pandas, pyarrow); host only.
requirements-sink.txt   Production set + pyarrow; the sink image only.
scripts/make_test_parquet.py   Seeded fake events -> data/test_events.parquet.
```

## Conventions

- **Config from `config.py` only.** Never hardcode a broker address or topic;
  defaults live in its `DEFAULTS` dict alone. Every entrypoint calls
  `print_config(<service>)` at startup.
- **Two correct broker addresses.** Host: `localhost:29092` (`PLAINTEXT_HOST`).
  In-network: `kafka:9092` (`PLAINTEXT`). `.env` holds the host value, compose
  sets the in-network one. Adding a listener means updating `KAFKA_LISTENERS`,
  `KAFKA_ADVERTISED_LISTENERS` **and** `KAFKA_LISTENER_SECURITY_PROTOCOL_MAP`
  together — an unmapped name stops the broker booting.
- **Formatting is deliberately airy**: banner comments, blank line between steps,
  arguments one per line. Python: double quotes, 4-space indent, plain `print`
  (Dockerfiles set `PYTHONUNBUFFERED=1`). JS: `onclick` calling globals,
  `localStorage` for profile/cart/reactions.
- **Two requirements files.** `requirements.txt` is production only — the
  Dockerfiles install it, so every entry grows the images. Local tooling and
  test-data deps go in `requirements-dev.txt` (which `-r` includes the
  production set; install that one on the host).
- **Same-origin storefront.** `trackEvent()` posts to the relative
  `/api/events`, so pages must be served by `app.py` (http://localhost:5000/),
  never opened as `file://`. `app.py` serves a fixed whitelist of storefront
  files — never the project directory, which holds `.env`.
- **Sink commits after writing.** `sink.py` has auto-commit off and commits
  offsets only after the Parquet file is renamed into place; it flushes on
  SIGTERM. It does not DLQ — `consumer.py` owns the DLQ. It runs as
  `SINK_UID:SINK_GID` (default 1000:1000 = ec2-user) so bronze files are not
  root-owned; `data/bronze` must exist, owned by that user, before first `up`.
- **Kafka state lives in the `kafka-data` volume** (topics + committed offsets)
  and survives `down`. `docker compose down -v` is the deliberate wipe.
- `FLASK_DEBUG` (default off) is the only way to enable Flask debug.

## Event schema

**The field contract lives in [docs/tracking-plan.md](docs/tracking-plan.md) —
that file is the authority. Do not restate the field list here.**

Handle three cases distinctly — blanket `.get()` turns a missing required field
into a silent null that corrupts analytics instead of surfacing the producer:

1. **Required** (per the tracking plan) — validate explicitly; a message missing
   one goes to the DLQ with its offset and the missing key, never processed with
   nulls filled in.
2. **Optional** — `.get()` with an explicit default.
3. **Malformed bytes/JSON** — skip and log the offset; one bad message must never
   stop the stream.

> **Phase 1 in place.** The storefront (`script.js`), the only event producer,
> emits the required ids. `consumer.py` does
> all three: presence check on required fields -> DLQ (`KAFKA_DLQ_TOPIC` in
> `config.py`), `.get()` defaults for optional fields, skip-and-log on bad bytes.
> Not done yet: type/format validation, per-event properties, and the pre-cutover
> replay decision (see the tracking plan).
