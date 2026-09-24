# SoleStream — Clickstream Pipeline

## Goal

Shoe storefront emitting clickstream events (views, filters, reactions, cart,
purchases) into Kafka for analytics; `consumer.py` stands in for real processing.

## Stack

Vanilla HTML/CSS/JS (no framework, no build) · Flask + flask-cors + `kafka-python`
· single-node Kafka in KRaft mode via Compose · `python-dotenv` via `config.py`.

## Layout

```
index.html / shoes.html / style.css  Storefront; open directly, no build
script.js          Product data, cart/profile, trackEvent() -> POST /api/events
app.py             Flask ingestion API -> Kafka. Runs ON THE HOST.
producer.py / consumer.py   SYNTHETIC generator / topic printer. Containerised.
config.py          Single source of Kafka settings for every service.
docker-compose.yml kafka + producer + consumer (app.py deliberately excluded)
.env.example       Template; copy to .env (gitignored)
docs/tracking-plan.md   Event contract. Authority for required/optional fields.
requirements.txt   Production deps, installed into the Docker images.
requirements-dev.txt    Local tooling + test data (pandas, pyarrow); host only.
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
- Known gap: API base URL hardcoded as `http://localhost:5000` in `script.js`.

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

> **Phase 1 in place.** Both producers emit the required ids. `consumer.py` does
> all three: presence check on required fields -> DLQ (`KAFKA_DLQ_TOPIC` in
> `config.py`), `.get()` defaults for optional fields, skip-and-log on bad bytes.
> Not done yet: type/format validation, per-event properties, and the pre-cutover
> replay decision (see the tracking plan).
