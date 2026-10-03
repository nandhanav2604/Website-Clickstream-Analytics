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
deploy/            EC2 only: docker-compose.prod.yml + Dockerfile.collector
                   (app.py under gunicorn, port 80). Local work never uses it.
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
- **Create Kafka clients via `config.connect_with_retry()`** (backoff, gives up
  after 120s) — app.py, consumer.py and sink.py all do. Compose also gates
  consumer/sink on kafka's healthcheck, runs them with `init: true` (prompt
  SIGTERM), and restarts kafka `unless-stopped`. Catch
  broker-down errors via `config.BROKER_UNAVAILABLE` — kafka-python 3.x removed
  `NoBrokersAvailable`, so importing it directly breaks every service.
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

## Deploy (single EC2 demo)

c7i-flex.large · Amazon Linux 2023 · ap-south-1. Security group: inbound TCP 80
from anywhere, TCP 22 from your IP only. Never open 9092.

Fresh instance, as `ec2-user`. AL2023's docker RPM has no Compose plugin and an
old Buildx (`compose build requires buildx 0.17 or later`), so install both:

```bash
sudo dnf install -y docker git
sudo systemctl enable --now docker
sudo usermod -aG docker ec2-user && exit          # log back in for the group

mkdir -p ~/.docker/cli-plugins
curl -fsSL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
  -o ~/.docker/cli-plugins/docker-compose
BX=$(curl -fsSL https://api.github.com/repos/docker/buildx/releases/latest | grep -oP '"tag_name": "\K[^"]+')
curl -fsSL "https://github.com/docker/buildx/releases/download/$BX/buildx-$BX.linux-amd64" \
  -o ~/.docker/cli-plugins/docker-buildx
chmod +x ~/.docker/cli-plugins/docker-*
docker compose version && docker buildx version

git clone https://github.com/DharneshE/WebStreamETDS.git && cd WebStreamETDS
mkdir -p data/bronze          # as ec2-user, BEFORE up - else Docker makes it root-owned
docker compose -f deploy/docker-compose.prod.yml up -d --build
curl -s localhost/health      # then browse http://<public-dns>/
```

**Download the data BEFORE terminating — `data/bronze` and the Kafka volume
live on the instance's disk and die with it.** Stop the sink first so it
flushes its buffer (up to 49 events / 60s) to Parquet:

```bash
# on the instance
docker compose -f deploy/docker-compose.prod.yml stop sink
# on your machine
scp -i <key>.pem -r ec2-user@<public-dns>:~/WebStreamETDS/data/bronze ./data/bronze-ec2
```
