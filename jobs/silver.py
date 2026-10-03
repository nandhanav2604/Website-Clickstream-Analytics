from pyspark.sql import Window
from pyspark.sql import functions as F

from common import (
    BRONZE_TABLE,
    SESSION_GAP_MINUTES,
    SILVER_EVENTS,
    SILVER_REJECTS,
    SILVER_SESSIONS,
    USER_ID_LENGTH,
    USER_ID_SALT,
    delta_exists,
    required_fields,
    spark_session
)


# =========================================
# Silver
#
#   bronze -> validate -> clean -> MERGE
#          -> silver_events   (one row per event_id)
#          -> silver_sessions (rebuilt every run)
#          -> silver_rejects  (rebuilt every run)
# =========================================

spark = spark_session("silver")

REQUIRED = required_fields()

print(f"Required fields (docs/tracking-plan.md): {', '.join(REQUIRED)}")


bronze = spark.read.format("delta").load(str(BRONZE_TABLE))


# =========================================
# 1. Validate
#
# A required field that is null or blank is
# missing - same rule as consumer.py. The
# timestamp must also parse: casting is
# where silver first checks format, and an
# event with no usable time cannot be
# dated or sessionised.
#
# Failures are not dropped silently: they
# go to silver_rejects with the reasons.
# =========================================

events = bronze.withColumn(
    "event_ts",
    F.col("timestamp").cast("timestamp")
)


checks = [

    F.when(
        F.col(field).isNull() | (F.trim(F.col(field)) == ""),
        F.lit(f"missing_{field}")
    )

    for field in REQUIRED

]

checks.append(
    F.when(
        F.col("timestamp").isNotNull() & F.col("event_ts").isNull(),
        F.lit("unparseable_timestamp")
    )
)


events = events.withColumn(
    "reject_reasons",
    F.filter(
        F.array(*checks),
        lambda reason: reason.isNotNull()
    )
)


rejects = events.filter(F.size("reject_reasons") > 0)

valid = events.filter(F.size("reject_reasons") == 0)


# =========================================
# Incremental: only bronze rows loaded
# since the last silver run.
#
# Each bronze load stamps all its rows with
# one ingest_time, and silver_events keeps
# it as bronze_ingest_time, so the newest
# one already in silver is the watermark.
# A duplicate arriving in a LATER load is
# therefore never in the same DataFrame as
# its original - only MERGE, which checks
# the whole table, can catch it.
#
# (A load whose rows were all duplicates
# leaves the watermark unchanged and is
# re-read next run; MERGE skips it again.)
# =========================================

if delta_exists(spark, SILVER_EVENTS):

    watermark = (
        spark.read.format("delta")
        .load(str(SILVER_EVENTS))
        .agg(F.max("bronze_ingest_time"))
        .first()[0]
    )

    if watermark is not None:

        valid = valid.filter(F.col("ingest_time") > F.lit(watermark))


# =========================================
# 2. Clean
#
# user_id: profiles saved before the
# storefront hashed ids sent the raw mobile
# number. Apply the storefront's exact rule
# (digits only, drop a 91 / 0 prefix, keep
# 10, then sha256(salt + number)[:12]) so
# raw numbers never reach silver or gold,
# and old and new events from the same
# number share one user_id. Bronze keeps
# the original, as a raw layer should.
#
# product_id: the plan allows string or
# int; the storefront sends ints. Cast,
# null if not numeric.
#
# Per-event properties come out of the
# JSON "properties" column sink.py wrote.
# =========================================

digits = F.regexp_replace(F.col("user_id"), r"[^0-9]", "")

phone = (
    F.when(
        (F.length(digits) == 12) & digits.startswith("91"),
        F.substring(digits, 3, 10)
    )
    .when(
        (F.length(digits) == 11) & digits.startswith("0"),
        F.substring(digits, 2, 10)
    )
    .otherwise(digits)
)

# Any id made only of phone characters is
# treated as a raw number and hashed - even
# one that is not a valid 10-digit number
# (a typo is still personal data). Valid
# ones hash exactly as the storefront does,
# so they match post-cutover logins; the
# rest hash their digits as-is.
looks_like_phone = (
    F.col("user_id").rlike(r"^[0-9+() \-]+$")
    & (F.length(digits) > 0)
)

hashed_user_id = F.substring(
    F.sha2(
        F.concat(
            F.lit(USER_ID_SALT),
            F.when(F.length(phone) == 10, phone).otherwise(digits)
        ),
        256
    ),
    1,
    USER_ID_LENGTH
)


def prop(name):

    return F.get_json_object(
        F.col("properties"),
        f"$.{name}"
    )


clean = valid.select(

    # Required (validated above)
    "event_id",
    "session_id",
    "anonymous_id",
    "event",
    "event_ts",
    F.to_date("event_ts").alias("event_date"),

    # Optional
    F.when(looks_like_phone, hashed_user_id)
        .otherwise(F.col("user_id"))
        .alias("user_id"),
    "page",
    "age_group",
    "gender",
    F.col("product_id").cast("int").alias("product_id"),
    "product_name",
    "brand",

    # Per-event properties
    prop("selected_size").alias("selected_size"),
    prop("reaction").alias("reaction"),
    prop("brand_filter").alias("brand_filter"),
    prop("category_filter").alias("category_filter"),
    prop("colour_filter").alias("colour_filter"),
    prop("price_filter").alias("price_filter"),
    prop("items_purchased").cast("int").alias("items_purchased"),
    prop("total_amount").cast("double").alias("total_amount"),
    "properties",

    # Lineage
    "kafka_partition",
    "kafka_offset",
    "source_file",
    F.col("ingest_time").alias("bronze_ingest_time"),
    F.current_timestamp().alias("silver_time")

)


# user_name is real names and nothing
# downstream uses it: it stays in bronze
# (raw layer) and is deliberately not
# selected above. Fail loudly if a future
# edit lets it through.
if "user_name" in clean.columns:

    raise RuntimeError("user_name must not be written to silver")


# =========================================
# 3. Dedupe within the batch
#
# MERGE requires each target row to match
# at most ONE source row; two copies of an
# event_id in the same batch would make it
# fail. So collapse them first, keeping the
# copy that reached Kafka first (lowest
# partition/offset) - deterministic.
# =========================================

first_copy = Window.partitionBy("event_id").orderBy(
    "kafka_partition",
    "kafka_offset",
    "source_file"
)

batch = (
    clean
    .withColumn("_copy", F.row_number().over(first_copy))
    .filter(F.col("_copy") == 1)
    .drop("_copy")
)


# =========================================
# 4. MERGE into silver_events
#
# Insert-only: an event_id already in the
# table is left alone, a new one is
# inserted. Rerunning silver, replaying
# Kafka, or a producer retry therefore
# cannot create a second row for an event.
# =========================================

if not delta_exists(spark, SILVER_EVENTS):

    (
        batch.limit(0).write
        .format("delta")
        .partitionBy("event_date")
        .save(str(SILVER_EVENTS))
    )


batch.createOrReplaceTempView("incoming_events")

# Measured, not read from DESCRIBE HISTORY:
# a MERGE that inserts nothing commits no
# new version, so "latest history entry"
# would report the previous run's numbers.
rows_before = spark.read.format("delta").load(str(SILVER_EVENTS)).count()

spark.sql(f"""

    MERGE INTO delta.`{SILVER_EVENTS}` AS target

    USING incoming_events AS source

    ON target.event_id = source.event_id

    WHEN NOT MATCHED THEN INSERT *

""")


rows_after = spark.read.format("delta").load(str(SILVER_EVENTS)).count()

inserted = rows_after - rows_before


# =========================================
# 5. Sessionise on anonymous_id
#
# A new session starts at a visitor's first
# event, or after more than 30 minutes with
# no event. Rebuilt from all of
# silver_events every run, not merged: a
# late event can extend a session or join
# two into one, so old sessions are not
# immutable.
#
# session_key = hash of visitor + session
# start: stable across reruns while the
# session's first event does not change.
# =========================================

silver_events = spark.read.format("delta").load(str(SILVER_EVENTS))

visitor_timeline = Window.partitionBy("anonymous_id").orderBy(
    "event_ts",
    "event_id"
)

gap_seconds = (
    F.col("event_ts").cast("long")
    - F.lag("event_ts").over(visitor_timeline).cast("long")
)

numbered = (
    silver_events

    .withColumn(
        "_new_session",
        F.when(
            gap_seconds.isNull() | (gap_seconds > SESSION_GAP_MINUTES * 60),
            1
        ).otherwise(0)
    )

    .withColumn(
        "_session_number",
        F.sum("_new_session").over(
            visitor_timeline.rowsBetween(Window.unboundedPreceding, 0)
        )
    )
)


def count_event(name):

    # "_count" suffix: "like" alone is an
    # SQL keyword and breaks queries
    return F.sum(
        F.when(F.col("event") == name, 1).otherwise(0)
    ).alias(f"{name}_count")


sessions = (
    numbered

    .groupBy("anonymous_id", "_session_number")

    .agg(
        F.min("event_ts").alias("session_start"),
        F.max("event_ts").alias("session_end"),
        F.count("*").alias("event_count"),

        F.min_by("page", "event_ts").alias("entry_page"),

        # A shared browser can switch shopper
        # mid-session; keep every user_id seen
        F.array_sort(F.collect_set("user_id")).alias("user_ids"),

        F.countDistinct("session_id").alias("client_session_count"),

        count_event("shop_page_view"),
        count_event("filter_applied"),
        count_event("filters_cleared"),
        count_event("like"),
        count_event("dislike"),
        count_event("add_to_cart"),
        count_event("remove_from_cart"),
        count_event("view_cart"),
        count_event("buy_now"),
        count_event("cart_purchase"),

        F.coalesce(
            F.sum(
                F.when(F.col("event") == "cart_purchase", F.col("total_amount"))
            ),
            F.lit(0.0)
        ).alias("cart_purchase_amount")
    )

    .withColumn(
        "session_key",
        F.substring(
            F.sha2(
                F.concat_ws(
                    "|",
                    "anonymous_id",
                    F.col("session_start").cast("string")
                ),
                256
            ),
            1,
            16
        )
    )

    .withColumn("session_date", F.to_date("session_start"))

    .withColumn(
        "duration_seconds",
        F.col("session_end").cast("long") - F.col("session_start").cast("long")
    )

    .drop("_session_number")
)


(
    sessions.write
    .format("delta")
    .mode("overwrite")
    .option("overwriteSchema", "true")
    .save(str(SILVER_SESSIONS))
)


# =========================================
# 6. Rejects report (rebuilt every run)
# =========================================

(
    rejects

    .select(
        "event_id",
        "anonymous_id",
        "event",
        "timestamp",
        "reject_reasons",
        "kafka_partition",
        "kafka_offset",
        "source_file"
    )

    .write
    .format("delta")
    .mode("overwrite")
    .option("overwriteSchema", "true")
    .save(str(SILVER_REJECTS))
)


# =========================================
# Report
# =========================================

bronze_rows = bronze.count()
reject_rows = rejects.count()
valid_rows = valid.count()
batch_rows = batch.count()

print(f"Bronze rows (all):           {bronze_rows}")
print(f"Rejected (silver_rejects):   {reject_rows}")
print(f"Valid, new since last run:   {valid_rows}")
print(f"Duplicates within batch:     {valid_rows - batch_rows}")
print(f"MERGE inserted:              {inserted}")
print(f"Already present (skipped):   {batch_rows - inserted}")
print(f"silver_events total:         {rows_after}")
print(f"silver_sessions:             {sessions.count()}")

spark.stop()
