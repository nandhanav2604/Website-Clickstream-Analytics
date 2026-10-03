import json
from kafka import KafkaConsumer, KafkaProducer

from config import (
    KAFKA_BOOTSTRAP_SERVERS,
    KAFKA_TOPIC,
    KAFKA_DLQ_TOPIC,
    connect_with_retry,
    print_config
)


# --------------------------------
# Kafka Configuration
# --------------------------------

print_config("clickstream-consumer")


# --------------------------------
# Event Contract
#
# docs/tracking-plan.md is the
# authority. Keep this tuple in step
# with its "Required" table.
#
# A required field that is absent,
# null or blank is MISSING. Filling
# it in with a default would hide the
# broken producer inside the
# analytics, so the event goes to the
# DLQ instead.
# --------------------------------

REQUIRED_FIELDS = (
    "event_id",
    "session_id",
    "anonymous_id",
    "timestamp",
    "event"
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
# Create Kafka Consumer
# --------------------------------

# Retried with backoff: at "up" this can
# start before the broker accepts
# connections.

consumer = connect_with_retry(
    lambda: KafkaConsumer(
        KAFKA_TOPIC,
        bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,

        # Read from the beginning if this
        # consumer group has no previous offset
        auto_offset_reset="earliest",

        # Automatically commit offsets
        enable_auto_commit=True,

        # Consumer group
        group_id="clickstream-consumer-group"
    ),
    "consumer"
)


# --------------------------------
# Create DLQ Producer
# --------------------------------

dlq_producer = connect_with_retry(
    lambda: KafkaProducer(
        bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,

        value_serializer=lambda value:
            json.dumps(value).encode("utf-8"),

        acks="all",

        retries=5
    ),
    "DLQ producer"
)


# --------------------------------
# Dead-Letter Routing
#
# The DLQ record carries everything
# needed to find and fix the producer:
# where the event came from, which
# keys it lacked, and the event as it
# arrived.
#
# The send is awaited so a failing
# DLQ raises here instead of losing
# the event quietly.
# --------------------------------

def send_to_dlq(message, event, missing):

    dlq_record = {
        "error": "missing_required_fields",
        "missing_fields": missing,
        "source_topic": message.topic,
        "source_partition": message.partition,
        "source_offset": message.offset,
        "event": event
    }

    dlq_producer.send(
        KAFKA_DLQ_TOPIC,
        value=dlq_record
    ).get(
        timeout=10
    )

    print(
        f"Sent to DLQ: offset {message.offset} "
        f"missing {', '.join(missing)}"
    )


# --------------------------------
# Event Rendering
#
# Only called on events that passed
# validation, so required fields are
# indexed directly. Optional fields
# use .get() with an explicit default
# and are shown only when present.
#
# user_id is absent for anonymous
# traffic; anonymous_id identifies the
# visitor instead.
# --------------------------------

def describe(event):

    fields = [
        ("Event", event["event"]),
        ("User", event.get("user_id", "")),
        # str() first: presence is validated,
        # type is not, so a numeric id must
        # not crash the slice
        ("Visitor", str(event["anonymous_id"])[:8]),
        ("Session", str(event["session_id"])[:8]),
        ("Page", event.get("page", "")),
        ("Product", event.get("product_name", "")),
        ("Time", event["timestamp"])
    ]

    shown = [
        f"{label}={value}"
        for label, value in fields
        if value not in (None, "")
    ]

    return "Received event: " + " | ".join(shown)


print("Starting Kafka Clickstream Consumer...")
print("Waiting for events...\n")


try:

    for message in consumer:

        # One malformed message must not take
        # down the whole consumer: log it,
        # skip it, keep reading.

        try:

            # Convert Kafka bytes → string
            json_event = message.value.decode("utf-8")

            # Convert JSON string → Python object
            event = json.loads(json_event)

        except (UnicodeDecodeError, json.JSONDecodeError) as error:

            print(
                f"Skipping unreadable message "
                f"at offset {message.offset}: {error}"
            )

            continue


        if not isinstance(event, dict):

            print(
                f"Skipping non-object message "
                f"at offset {message.offset}: {event!r}"
            )

            continue


        # Contract check: never process an
        # event with required fields missing

        missing = missing_required(event)

        if missing:

            send_to_dlq(message, event, missing)

            continue


        # Display event
        print(describe(event))


except KeyboardInterrupt:

    print("\nStopping consumer...")


finally:

    consumer.close()

    dlq_producer.close()
