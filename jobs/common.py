import re
from pathlib import Path

from pyspark.sql import SparkSession


# =========================================
# Paths
#
# Relative to the project root, which is
# /opt/app in the spark container (./data,
# ./jobs and ./docs are mounted there).
# =========================================

ROOT = Path(__file__).resolve().parent.parent

DATA = ROOT / "data"

# Parquet files written by sink.py
BRONZE_FILES = DATA / "bronze"

# Delta tables
LAKE = DATA / "lake"
BRONZE_TABLE = LAKE / "bronze"
SILVER_EVENTS = LAKE / "silver_events"
SILVER_SESSIONS = LAKE / "silver_sessions"
SILVER_REJECTS = LAKE / "silver_rejects"

# Plain Parquet for Power BI
GOLD = DATA / "gold"

TRACKING_PLAN = ROOT / "docs" / "tracking-plan.md"


# =========================================
# Shared Rules
# =========================================

# Same inactivity gap the storefront uses
# for its own session_id (script.js).
SESSION_GAP_MINUTES = 30

# Must match USER_ID_SALT / USER_ID_LENGTH
# in script.js: silver applies the same
# hash to legacy raw-number user_ids.
USER_ID_SALT = "solestream-user-id-v1:"
USER_ID_LENGTH = 12


# =========================================
# Spark Session
#
# Delta is enabled through the session
# extension and catalog; the jars are
# already in the image. Everything runs in
# UTC so event dates and session gaps do
# not depend on the machine's timezone.
# =========================================

def spark_session(app_name):

    spark = (
        SparkSession.builder

        .appName(app_name)

        .config(
            "spark.sql.extensions",
            "io.delta.sql.DeltaSparkSessionExtension"
        )

        .config(
            "spark.sql.catalog.spark_catalog",
            "org.apache.spark.sql.delta.catalog.DeltaCatalog"
        )

        .config("spark.sql.session.timeZone", "UTC")

        # Small data, one machine: the default
        # 200 shuffle partitions is pure overhead
        .config("spark.sql.shuffle.partitions", "4")

        .config("spark.ui.enabled", "false")

        .getOrCreate()
    )

    spark.sparkContext.setLogLevel("WARN")

    return spark


def delta_exists(spark, path):

    from delta.tables import DeltaTable

    return DeltaTable.isDeltaTable(
        spark,
        str(path)
    )


# =========================================
# Required Fields
#
# Read from the "Required" table of
# docs/tracking-plan.md at runtime, so the
# tracking plan stays the single authority.
# Fails loudly if the section cannot be
# found rather than validating nothing.
# =========================================

def required_fields():

    text = TRACKING_PLAN.read_text(encoding="utf-8")

    match = re.search(
        r"^## Required\s*$(.*?)(?=^## )",
        text,
        re.M | re.S
    )

    if not match:
        raise RuntimeError(
            f"No '## Required' section in {TRACKING_PLAN}"
        )

    fields = re.findall(
        r"^\|\s*`(\w+)`\s*\|",
        match.group(1),
        re.M
    )

    if not fields:
        raise RuntimeError(
            f"'## Required' in {TRACKING_PLAN} lists no fields"
        )

    return fields
