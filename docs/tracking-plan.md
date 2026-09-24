# Tracking Plan

The authority for the clickstream event contract. `CLAUDE.md` points here; the
field list is not duplicated there.

> **Status — Phase 1 in place.** `script.js` and `producer.py` both emit every
> required field. `consumer.py` checks presence (absent, null or blank counts as
> missing) and routes failures to `KAFKA_DLQ_TOPIC`. Types and formats are not
> validated yet, and per-event properties are still unspecified.

## Identifier semantics

- `anonymous_id` — storefront: UUID created once per browser in `localStorage`,
  kept across login/logout. Producer: one per simulated visitor.
- `session_id` — storefront: rotates after 30 minutes with no tracked activity,
  shared across tabs. Producer: rotates at random (10% per event).
- `event_id` — a fresh UUID for every event.
- `timestamp` — UTC with a `Z` suffix and millisecond precision from both sources.

## Required

Every event carries all of these. A message missing any one is routed to the DLQ
with its offset and the missing key — never processed with nulls filled in.

| Field | Type | Notes |
| --- | --- | --- |
| `event_id` | UUID string | Unique per event. Idempotency key for dedupe on replay or producer retry. |
| `session_id` | UUID string | Groups events within one browsing session. |
| `anonymous_id` | UUID string | Stable pseudonymous browser/device id. Present on every event, signed in or not. |
| `timestamp` | ISO 8601, UTC | When the event occurred at the source. |
| `event` | string | Event name — `page_view`, `add_to_cart`, `search`. |

## Optional

Read with `.get()` and an explicit default. Absence here is normal and carries
no signal.

| Field | Type | Notes |
| --- | --- | --- |
| `user_id` | string | Only once identified. Absent for all anonymous browsing, which is the majority case — `anonymous_id` carries continuity instead. |
| `page` | string | Browser-specific and meaningless for server-side events, so it cannot be required. |
| `user_name`, `age_group`, `gender` | string | Profile detail captured on `index.html`. |
| `product_id`, `product_name`, `brand` | string / int | Present on product-scoped events only. |

## Per-event properties

Not yet specified. Each event name gets its own property list during Phase 1 —
for example `add_to_cart` requiring `product_id` and a quantity. Until that
work lands, only the global contract above applies.

## Migration notes

- **`event_id` is collected from Phase 1, but nothing dedupes on it until the
  Phase 5 Spark silver job** (`dropDuplicates` on `event_id`, bounded by a
  watermark). Deduplication needs durable state to remember which ids it has
  already seen, and the consumer has none. In the interval between those phases
  the key exists but is inert: Kafka's at-least-once delivery means duplicates
  are possible and will pass through **undetected**. Treat raw counts derived
  from the stream before Phase 5 as upper bounds, not exact figures. Ratios such
  as conversion rates are **unreliable in unknown direction**, not upper bounds:
  duplicates inflate numerator and denominator independently, so a pre-Phase-5
  rate can be skewed either up or down.
- *Done in Phase 1:* `script.js` no longer sends `"anonymous"` as `user_id` /
  `user_name`, or null product and profile fields. Optional fields that do not
  apply are omitted. The *absence* of `user_id` marks anonymous traffic.
- **Open decision:** events already in the topic predate all three required ids.
  At present they are all sent to the DLQ, so nothing is lost, but the DLQ fills
  with pre-cutover noise. Decide whether to backfill, or to bound enforcement to
  events at or after the Phase 1 cutover offset.
