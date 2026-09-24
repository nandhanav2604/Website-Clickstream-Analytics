import random
import time
import json
import uuid
from datetime import datetime, timezone

from kafka import KafkaProducer

from config import (
    KAFKA_BOOTSTRAP_SERVERS,
    KAFKA_TOPIC,
    print_config
)


# --------------------------------
# Kafka Configuration
# --------------------------------

print_config("clickstream-producer")


# --------------------------------
# Create Kafka Producer
# --------------------------------

producer = KafkaProducer(
    bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS
)


# --------------------------------
# Simulated Visitors
#
# Each visitor is one browser: a stable
# anonymous_id, plus a user_id only if
# they are signed in. Most traffic is
# anonymous, so most visitors have none.
# --------------------------------

visitors = [

    {
        "anonymous_id": str(uuid.uuid4()),
        "user_id": user_id,
        "session_id": str(uuid.uuid4())
    }

    for user_id in [
        "U001",
        "U002",
        None,
        None,
        None,
        None,
        None
    ]

]


# Chance that a visitor's next event starts
# a new session instead of continuing the
# current one.

NEW_SESSION_PROBABILITY = 0.1


# --------------------------------
# Website Pages
# --------------------------------

pages = [
    "/",
    "/products",
    "/products/laptop",
    "/products/phone",
    "/cart",
    "/about",
    "/contact"
]


# --------------------------------
# Possible User Actions
# --------------------------------

events = [
    "page_view",
    "click",
    "search"
]


print("Starting Kafka Clickstream Producer...")
print("Press Ctrl+C to stop.\n")


# --------------------------------
# Generate and Send Events
# --------------------------------

try:

    while True:

        # Choose random visitor
        visitor = random.choice(visitors)

        # Sometimes start a fresh session
        if random.random() < NEW_SESSION_PROBABILITY:
            visitor["session_id"] = str(uuid.uuid4())

        # Choose random page
        page = random.choice(pages)

        # Choose random event
        event = random.choice(events)

        # ISO 8601 in UTC, same shape as the
        # browser's toISOString()
        timestamp = (
            datetime.now(timezone.utc)
            .isoformat(timespec="milliseconds")
            .replace("+00:00", "Z")
        )

        # Required fields first - the contract
        # lives in docs/tracking-plan.md
        clickstream_event = {
            "event_id": str(uuid.uuid4()),
            "session_id": visitor["session_id"],
            "anonymous_id": visitor["anonymous_id"],
            "timestamp": timestamp,
            "event": event,
            "page": page
        }

        # Optional: absent for anonymous traffic
        if visitor["user_id"] is not None:
            clickstream_event["user_id"] = visitor["user_id"]

        # Convert event to JSON
        json_event = json.dumps(clickstream_event)

        # Send JSON message to Kafka
        producer.send(
            KAFKA_TOPIC,
            value=json_event.encode("utf-8")
        )

        # Make sure message is sent
        producer.flush()

        # Display what was sent
        print(
            f"Sent to Kafka: {json_event}"
        )

        # Wait 2 seconds
        time.sleep(2)


except KeyboardInterrupt:

    print("\nStopping producer...")


finally:

    producer.close()