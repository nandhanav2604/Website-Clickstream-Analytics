import json
import os
import signal
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq
from kafka import KafkaConsumer

from config import (
    KAFKA_BOOTSTRAP_SERVERS,
    KAFKA_TOPIC,
    connect_with_retry,
    print_config
)


# --------------------------------
# Kafka Configuration
# --------------------------------

print_config("clickstream-sink")


# --------------------------------
# Sink Settings
#
# A batch is written when it reaches
# BATCH_SIZE events, or when its OLDEST
# event has waited FLUSH_SECONDS -
# whichever comes first. An empty buffer
# writes nothing.
#
# Output is relative to this file, so it
# is data/bronze in the project on the
# host and /app/data/bronze in the
# container (bind-mounted to the host).
# --------------------------------

BATCH_SIZE = 50

FLUSH_SECONDS = 60

OUTPUT_DIR = Path(__file__).resolve().parent / "data" / "bronze"


# --------------------------------
# Event Contract
#
# docs/tracking-plan.md is the
# authority. Keep this tuple in step
# with its "Required" table AND with
# consumer.py.
#
# The sink does not DLQ: consumer.py
# owns the DLQ and reads the same topic
# in its own group. A contract-breaking
# event is logged and left out of
# bronze, never written with nulls.
# --------------------------------

REQUIRED_FIELDS = (
    "event_id",
    "session_id",
    "anonymous_id",
    "timestamp",
    "event"
)


# Optional fields from the tracking plan
# get their own columns. Everything else
# the event carries (per-event properties,
# not yet specified) is kept losslessly
# in the "properties" JSON column.

OPTIONAL_FIELDS = (
    "user_id",
    "page",
    "user_name",
    "age_group",
    "gender",
    "product_id",
    "product_name",
    "brand"
)


def is_missing(value):

    if value is None:
        return True

    return isinstance(value, str) and value.strip() == ""


def missing_required(event):

    return [
        field
        for field in REQUIRED_FIELDS
        if is_missing(event.get(field))
    ]


# --------------------------------
# Parquet Schema
#
# Contract fields are stored as strings:
# the tracking plan allows product_id to
# be "string / int" and types are not
# validated yet, so a strict numeric
# column would let one odd producer fail
# a whole batch. Casting happens
# downstream, in silver.
# --------------------------------

SCHEMA = pa.schema(

    [
        pa.field(name, pa.string(), nullable=False)
        for name in REQUIRED_FIELDS
    ]

    +

    [
        pa.field(name, pa.string())
        for name in OPTIONAL_FIELDS
    ]

    +

    [
        pa.field("properties", pa.string()),

        # Lineage: where each row came from,
        # for replay and event_id dedupe later
        pa.field("kafka_topic", pa.string(), nullable=False),
        pa.field("kafka_partition", pa.int32(), nullable=False),
        pa.field("kafka_offset", pa.int64(), nullable=False),
        pa.field("ingested_at", pa.timestamp("ms", tz="UTC"), nullable=False)
    ]

)


def as_text(value):

    if value is None:
        return None

    if isinstance(value, str):
        return value

    return json.dumps(value)


def to_row(message, event, ingested_at):

    row = {
        name: as_text(event[name])
        for name in REQUIRED_FIELDS
    }


    for name in OPTIONAL_FIELDS:

        row[name] = as_text(
            event.get(name, None)
        )


    extras = {
        key: value
        for key, value in event.items()
        if key not in REQUIRED_FIELDS
        and key not in OPTIONAL_FIELDS
    }

    row["properties"] = (
        json.dumps(extras, sort_keys=True)
        if extras
        else None
    )


    row["kafka_topic"] = message.topic
    row["kafka_partition"] = message.partition
    row["kafka_offset"] = message.offset
    row["ingested_at"] = ingested_at

    return row


# --------------------------------
# Partitioning
#
# event_date / hour come from the
# event's own timestamp (UTC), so a
# late event lands in the hour it
# happened. If that timestamp does not
# parse, fall back to the time Kafka
# stored the message.
# --------------------------------

def partition_time(message, event):

    try:

        moment = datetime.fromisoformat(
            str(event["timestamp"]).replace("Z", "+00:00")
        )

        if moment.tzinfo is None:
            moment = moment.replace(tzinfo=timezone.utc)

        return moment.astimezone(timezone.utc)

    except ValueError:

        print(
            f"Unparseable timestamp at offset {message.offset}; "
            f"partitioning by Kafka time instead"
        )

        return datetime.fromtimestamp(
            message.timestamp / 1000,
            tz=timezone.utc
        )


def partition_dir(moment):

    return (
        OUTPUT_DIR
        / f"event_date={moment:%Y-%m-%d}"
        / f"hour={moment:%H}"
    )


# --------------------------------
# Write
#
# One file per partition touched by the
# batch. Each file is written under a
# dot-prefixed temp name and renamed into
# place, so a reader (Spark, pandas)
# never sees a half-written file - they
# skip dot-files.
# --------------------------------

def write_batch(buffer):

    groups = {}

    for directory, row in buffer:

        groups.setdefault(directory, []).append(row)


    for directory, rows in groups.items():

        directory.mkdir(
            parents=True,
            exist_ok=True
        )

        first_offset = rows[0]["kafka_offset"]

        name = (
            f"part-{datetime.now(timezone.utc):%Y%m%dT%H%M%S}"
            f"-{first_offset}-{uuid.uuid4().hex[:8]}.parquet"
        )

        final_path = directory / name

        temp_path = directory / f".{name}.tmp"


        table = pa.Table.from_pylist(
            rows,
            schema=SCHEMA
        )

        pq.write_table(
            table,
            temp_path
        )

        os.replace(
            temp_path,
            final_path
        )


        print(
            f"Wrote {len(rows)} events -> "
            f"{final_path.relative_to(OUTPUT_DIR.parent.parent)}"
        )


# --------------------------------
# Create Kafka Consumer
#
# Own group, so it gets every event
# independently of the debug consumer.
#
# Auto-commit is OFF: offsets are
# committed only after the Parquet
# write succeeds. A crash before that
# re-reads the batch on restart
# (at-least-once; duplicates are
# removable later by event_id).
#
# Retried with backoff: at "up" this can
# start before the broker accepts
# connections.
# --------------------------------

consumer = connect_with_retry(
    lambda: KafkaConsumer(
        KAFKA_TOPIC,
        bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,

        group_id="clickstream-sink",

        auto_offset_reset="earliest",

        enable_auto_commit=False
    ),
    "sink consumer"
)


# --------------------------------
# Shutdown
#
# docker compose down sends SIGTERM (and
# Ctrl+C sends SIGINT). Either one only
# sets a flag: the loop finishes its
# current poll, flushes, commits and
# exits cleanly. poll() returns at least
# once a second, well inside compose's
# stop grace period.
# --------------------------------

running = True


def request_stop(signum, frame):

    global running

    print(f"\nReceived signal {signum}; flushing and stopping...")

    running = False


signal.signal(signal.SIGTERM, request_stop)

signal.signal(signal.SIGINT, request_stop)


# --------------------------------
# Flush
#
# Write first, commit second. If the
# write raises, nothing is committed and
# the process exits non-zero; compose
# restarts it and the batch is re-read.
#
# commit() with no arguments commits
# everything polled so far. That is
# exactly what was just written (plus
# any skipped bad messages), because
# poll() is capped so the buffer never
# holds more than one batch.
# --------------------------------

buffer = []

buffer_started = None

uncommitted = False


def flush():

    global buffer, buffer_started, uncommitted

    if buffer:

        write_batch(buffer)


    if uncommitted:

        consumer.commit()


    buffer = []

    buffer_started = None

    uncommitted = False


print("Starting Kafka Clickstream Sink...")
print(f"Writing Parquet to {OUTPUT_DIR}\n")


try:

    while running:

        records = consumer.poll(
            timeout_ms=1000,
            max_records=BATCH_SIZE - len(buffer)
        )


        for messages in records.values():

            for message in messages:

                uncommitted = True


                # Malformed bytes / JSON: skip and
                # log; never stop the stream

                try:

                    event = json.loads(
                        message.value.decode("utf-8")
                    )

                except (UnicodeDecodeError, json.JSONDecodeError) as error:

                    print(
                        f"Skipping unreadable message "
                        f"at offset {message.offset}: {error}"
                    )

                    continue


                if not isinstance(event, dict):

                    print(
                        f"Skipping non-object message "
                        f"at offset {message.offset}"
                    )

                    continue


                # Contract check: the DLQ copy is
                # consumer.py's job

                missing = missing_required(event)

                if missing:

                    print(
                        f"Not writing offset {message.offset}: "
                        f"missing {', '.join(missing)}"
                    )

                    continue


                buffer.append(
                    (
                        partition_dir(partition_time(message, event)),
                        to_row(message, event, datetime.now(timezone.utc))
                    )
                )

                if buffer_started is None:

                    buffer_started = time.monotonic()


        batch_full = len(buffer) >= BATCH_SIZE

        batch_stale = (
            buffer_started is not None
            and time.monotonic() - buffer_started >= FLUSH_SECONDS
        )

        if batch_full or batch_stale:

            flush()


    # Stop requested: persist whatever is
    # buffered before leaving

    flush()


finally:

    consumer.close()

    print("Sink stopped.")
