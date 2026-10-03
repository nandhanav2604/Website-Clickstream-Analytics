import os
import shutil

from pyspark.sql import Window
from pyspark.sql import functions as F

from common import (
    GOLD,
    SILVER_EVENTS,
    SILVER_SESSIONS,
    spark_session
)


# =========================================
# Gold: Power BI tables
#
# Plain Parquet, one file per table, at a
# fixed name: data/gold/<table>.parquet.
# Rebuilt in full every run from silver.
# =========================================

spark = spark_session("gold")

# INT96 (Spark's legacy default) is not
# read reliably outside Spark
spark.conf.set("spark.sql.parquet.outputTimestampType", "TIMESTAMP_MICROS")


events = spark.read.format("delta").load(str(SILVER_EVENTS))

sessions = spark.read.format("delta").load(str(SILVER_SESSIONS))


def write_gold(df, name):

    # Spark writes a folder of part files plus
    # _SUCCESS and .crc files; Power BI wants
    # one file. Write to a temp folder, move
    # the single part file into place, drop
    # the rest.
    temp_dir = GOLD / f"_tmp_{name}"

    (
        df.coalesce(1)
        .write
        .mode("overwrite")
        .parquet(str(temp_dir))
    )

    part = next(temp_dir.glob("part-*.parquet"))

    final_path = GOLD / f"{name}.parquet"

    os.replace(part, final_path)

    shutil.rmtree(temp_dir)

    print(f"{final_path.relative_to(GOLD.parent.parent)}: {df.count()} rows")


GOLD.mkdir(parents=True, exist_ok=True)


# =========================================
# session_summary
#
# One row per session (silver_sessions),
# flattened for Power BI (no arrays) and
# with funnel flags.
#
# buy_now is a completed single-item
# purchase (it fires on "Place order"), so
# purchased = buy_now or cart_purchase.
# =========================================

session_summary = (
    sessions

    .withColumn("user_id", F.element_at("user_ids", 1))
    .withColumn("user_count", F.size("user_ids"))

    .withColumn("viewed_shop", F.col("shop_page_view_count") > 0)

    .withColumn(
        "interacted_with_product",
        (
            F.col("like_count")
            + F.col("dislike_count")
            + F.col("add_to_cart_count")
            + F.col("buy_now_count")
        ) > 0
    )

    .withColumn(
        "added_to_cart_or_bought",
        (F.col("add_to_cart_count") + F.col("buy_now_count")) > 0
    )

    .withColumn(
        "purchased",
        (F.col("buy_now_count") + F.col("cart_purchase_count")) > 0
    )

    # Added to cart and bought nothing at all
    # in the session - neither a cart
    # checkout nor a Buy now.
    .withColumn(
        "abandoned_cart",
        (F.col("add_to_cart_count") > 0) & ~F.col("purchased")
    )

    .drop("user_ids")
)


# =========================================
# funnel_daily
#
# Long format (date, step, sessions) - what
# Power BI's funnel visual expects. Each
# step counts sessions that reached it on
# their own terms: "Buy now" skips the cart,
# and a cart can be bought in a later
# session, so steps are not strict subsets.
# =========================================

FUNNEL_STEPS = [
    (1, "Session started", F.lit(True)),
    (2, "Viewed shop", F.col("viewed_shop")),
    (3, "Interacted with a product", F.col("interacted_with_product")),
    (4, "Added to cart or bought", F.col("added_to_cart_or_bought")),
    (5, "Purchased", F.col("purchased")),
]

funnel_long = None

for order, label, reached in FUNNEL_STEPS:

    step = (
        session_summary
        .groupBy(F.col("session_date").alias("event_date"))
        .agg(F.sum(F.when(reached, 1).otherwise(0)).alias("sessions"))
        .withColumn("step_order", F.lit(order))
        .withColumn("step", F.lit(label))
    )

    funnel_long = step if funnel_long is None else funnel_long.unionByName(step)


by_date = Window.partitionBy("event_date").orderBy("step_order")

funnel_daily = (
    funnel_long

    .withColumn(
        "pct_of_sessions",
        F.round(
            F.col("sessions") / F.first("sessions").over(by_date),
            4
        )
    )

    .withColumn(
        "pct_of_previous_step",
        F.round(
            F.col("sessions") / F.lag("sessions").over(by_date),
            4
        )
    )

    .select(
        "event_date",
        "step_order",
        "step",
        "sessions",
        "pct_of_sessions",
        "pct_of_previous_step"
    )

    .orderBy("event_date", "step_order")
)


# =========================================
# product_performance
#
# Product-scoped events only. cart_purchase
# carries no product (just a count and a
# total), so cart sales cannot be
# attributed per product - only Buy now can.
# =========================================

def count_event(name, alias):

    return F.sum(
        F.when(F.col("event") == name, 1).otherwise(0)
    ).alias(alias)


product_performance = (
    events

    .filter(F.col("product_id").isNotNull())

    .groupBy("product_id", "product_name", "brand")

    .agg(
        count_event("like", "likes"),
        count_event("dislike", "dislikes"),
        count_event("reaction_removed", "reactions_removed"),
        count_event("add_to_cart", "add_to_cart"),
        count_event("remove_from_cart", "remove_from_cart"),
        count_event("buy_now", "buy_now_purchases"),
        F.countDistinct("anonymous_id").alias("unique_visitors"),
        F.countDistinct("user_id").alias("unique_users"),
        F.min("event_ts").alias("first_interaction"),
        F.max("event_ts").alias("last_interaction")
    )

    .withColumn(
        "like_rate",
        F.when(
            (F.col("likes") + F.col("dislikes")) > 0,
            F.round(F.col("likes") / (F.col("likes") + F.col("dislikes")), 4)
        )
    )

    .withColumn(
        "net_cart_adds",
        F.col("add_to_cart") - F.col("remove_from_cart")
    )

    .orderBy("product_id")
)


# =========================================
# user_features
#
# One row per user_id (signed-in shoppers;
# user_id is the pseudonymised id). No
# user_name: gold is for analysis and does
# not need real names.
# =========================================

user_events = events.filter(F.col("user_id").isNotNull())

event_features = (
    user_events

    .groupBy("user_id")

    .agg(
        F.min("event_ts").alias("first_seen"),
        F.max("event_ts").alias("last_seen"),
        F.count("*").alias("events"),
        F.countDistinct("event_date").alias("active_days"),
        F.countDistinct("anonymous_id").alias("devices"),

        F.max_by("age_group", "event_ts").alias("age_group"),
        F.max_by("gender", "event_ts").alias("gender"),

        count_event("filter_applied", "filters_applied"),
        count_event("like", "likes"),
        count_event("dislike", "dislikes"),
        count_event("add_to_cart", "add_to_cart"),
        count_event("remove_from_cart", "remove_from_cart"),
        count_event("buy_now", "buy_now_purchases"),
        count_event("cart_purchase", "cart_purchases"),

        F.coalesce(
            F.sum(F.when(F.col("event") == "cart_purchase", F.col("total_amount"))),
            F.lit(0.0)
        ).alias("cart_purchase_amount")
    )

    .withColumn(
        "purchases",
        F.col("buy_now_purchases") + F.col("cart_purchases")
    )
)


# Most-interacted brand; ties broken
# alphabetically so reruns agree
brand_counts = (
    user_events
    .filter(F.col("brand").isNotNull())
    .groupBy("user_id", "brand")
    .count()
)

favourite_brand = (
    brand_counts

    .withColumn(
        "_rank",
        F.row_number().over(
            Window.partitionBy("user_id").orderBy(F.desc("count"), "brand")
        )
    )

    .filter(F.col("_rank") == 1)

    .select("user_id", F.col("brand").alias("favourite_brand"))
)


session_features = (
    session_summary

    # A session can hold several user_ids on
    # a shared browser: credit each of them
    .join(
        sessions.select("session_key", F.explode("user_ids").alias("uid")),
        on="session_key"
    )

    .groupBy(F.col("uid").alias("user_id"))

    .agg(
        F.count("*").alias("sessions"),
        F.round(F.avg("duration_seconds"), 1).alias("avg_session_seconds"),
        F.sum(F.when(F.col("purchased"), 1).otherwise(0)).alias("converted_sessions")
    )

    .withColumn(
        "session_conversion_rate",
        F.round(F.col("converted_sessions") / F.col("sessions"), 4)
    )
)


user_features = (
    event_features
    .join(session_features, on="user_id", how="left")
    .join(favourite_brand, on="user_id", how="left")
    .orderBy("user_id")
)


# =========================================
# Write
# =========================================

write_gold(funnel_daily, "funnel_daily")
write_gold(product_performance, "product_performance")
write_gold(session_summary, "session_summary")
write_gold(user_features, "user_features")

spark.stop()
