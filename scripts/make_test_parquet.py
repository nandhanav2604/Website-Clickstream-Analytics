import random
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq


# --------------------------------
# Test Parquet Generator
#
# Writes 100 fake clickstream events
# shaped like docs/tracking-plan.md
# to data/test_events.parquet, for
# exercising downstream jobs without
# a running broker.
#
# Run from anywhere:
#   python scripts/make_test_parquet.py
# --------------------------------

PROJECT_ROOT = Path(__file__).resolve().parent.parent

OUTPUT_PATH = PROJECT_ROOT / "data" / "test_events.parquet"

EVENT_COUNT = 100

# Fixed seed: the same file every run,
# so tests can assert on its contents.
random.seed(42)


# --------------------------------
# Schema
#
# Declared explicitly rather than
# inferred, so an optional column that
# happens to be all-null in a sample
# still gets its real type.
#
# Parquet has fixed columns, so an
# optional field that the wire format
# OMITS is stored here as null. Required
# fields are non-nullable: the file
# itself refuses a row that breaks the
# contract.
#
# timestamp stays an ISO 8601 string,
# exactly as it arrives on the topic.
# --------------------------------

SCHEMA = pa.schema([

    # Required
    pa.field("event_id", pa.string(), nullable=False),
    pa.field("session_id", pa.string(), nullable=False),
    pa.field("anonymous_id", pa.string(), nullable=False),
    pa.field("timestamp", pa.string(), nullable=False),
    pa.field("event", pa.string(), nullable=False),

    # Optional
    pa.field("user_id", pa.string()),
    pa.field("page", pa.string()),
    pa.field("product_id", pa.int64()),
    pa.field("product_name", pa.string()),
    pa.field("brand", pa.string())

])


# --------------------------------
# Storefront Data
#
# Event names and products mirror
# script.js, so the test data looks
# like real storefront traffic.
# --------------------------------

PRODUCTS = [
    (1, "Nike Air Sprint", "Nike"),
    (2, "Nike Red Runner", "Nike"),
    (3, "Nike Blue Court", "Nike"),
    (4, "Adidas Daily Comfort", "Adidas"),
    (5, "Adidas Blue Runner", "Adidas"),
    (6, "Adidas Street Black", "Adidas"),
    (7, "Puma Red Speed", "Puma"),
    (8, "Puma White Flex", "Puma"),
    (9, "Puma Urban Black", "Puma"),
    (10, "New Balance Blue Flow", "New Balance"),
    (11, "New Balance White Walk", "New Balance"),
    (12, "New Balance Red Court", "New Balance")
]

# Events that carry product fields
PRODUCT_EVENTS = [
    "add_to_cart",
    "remove_from_cart",
    "buy_now",
    "like",
    "dislike",
    "reaction_removed"
]

# Events that do not
PAGE_EVENTS = [
    "shop_page_view",
    "filter_applied",
    "filters_cleared",
    "view_cart",
    "cart_purchase",
    "user_login"
]

PAGES = [
    "index.html",
    "shoes.html"
]


# --------------------------------
# Simulated Visitors
#
# Same model as the storefront: a stable
# anonymous_id per browser, a user_id
# only for signed-in visitors (the
# minority), and sessions that rotate.
# --------------------------------

visitors = [

    {
        "anonymous_id": str(uuid.UUID(int=random.getrandbits(128))),
        "user_id": user_id,
        "session_id": str(uuid.UUID(int=random.getrandbits(128)))
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

NEW_SESSION_PROBABILITY = 0.1


# --------------------------------
# Generate Events
#
# Timestamps step forward from a fixed
# start so the file reads in order.
# --------------------------------

def make_uuid():

    # Drawn from the seeded generator,
    # not uuid4(), so reruns match
    return str(uuid.UUID(int=random.getrandbits(128)))


def format_timestamp(moment):

    # Same shape as the browser's
    # toISOString(): UTC, ms, Z suffix
    return (
        moment
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )


moment = datetime(2026, 1, 1, 9, 0, 0, tzinfo=timezone.utc)

rows = []

for _ in range(EVENT_COUNT):

    visitor = random.choice(visitors)

    if random.random() < NEW_SESSION_PROBABILITY:
        visitor["session_id"] = make_uuid()

    moment += timedelta(
        seconds=random.randint(1, 90),
        milliseconds=random.randint(0, 999)
    )

    is_product_event = random.random() < 0.5

    event = random.choice(
        PRODUCT_EVENTS if is_product_event else PAGE_EVENTS
    )

    row = {
        "event_id": make_uuid(),
        "session_id": visitor["session_id"],
        "anonymous_id": visitor["anonymous_id"],
        "timestamp": format_timestamp(moment),
        "event": event,
        "user_id": visitor["user_id"],
        "page": random.choice(PAGES),
        "product_id": None,
        "product_name": None,
        "brand": None
    }

    if is_product_event:

        product_id, product_name, brand = random.choice(PRODUCTS)

        row["product_id"] = product_id
        row["product_name"] = product_name
        row["brand"] = brand

    rows.append(row)


# --------------------------------
# Write Parquet
# --------------------------------

df = pd.DataFrame(
    rows,
    columns=SCHEMA.names
)

table = pa.Table.from_pandas(
    df,
    schema=SCHEMA,
    preserve_index=False
)

OUTPUT_PATH.parent.mkdir(
    parents=True,
    exist_ok=True
)

pq.write_table(
    table,
    OUTPUT_PATH
)


# --------------------------------
# Report
#
# Read back from disk, so what is
# printed is what was actually written.
# --------------------------------

written = pq.read_table(OUTPUT_PATH)

print(f"Wrote {OUTPUT_PATH}")
print()
print(written.schema)
print()
print(f"Rows: {written.num_rows}")
