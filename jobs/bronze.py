from pyspark.sql import functions as F

from common import (
    BRONZE_FILES,
    BRONZE_TABLE,
    delta_exists,
    spark_session
)


# =========================================
# Bronze: sink Parquet -> Delta
#
# Loads every Parquet file sink.py wrote
# under data/bronze/event_date=/hour=/ into
# the Delta table data/lake/bronze, as-is,
# plus two lineage columns:
#   ingest_time   when THIS job loaded it
#   source_file   which file it came from,
#                 relative to data/bronze
#
# Idempotent: a file whose source_file is
# already in the table is skipped, so a
# rerun loads only new files and never
# duplicates rows. (sink.py only ever adds
# files; it never rewrites one.)
# =========================================

spark = spark_session("bronze")


files = sorted(BRONZE_FILES.rglob("*.parquet"))

# sink.py's in-progress files start with
# "." - Spark skips those too.
files = [f for f in files if not f.name.startswith(".")]

if not files:

    print(f"No Parquet files under {BRONZE_FILES}; nothing to load.")

    spark.stop()

    raise SystemExit(0)


# Hive-style folders give event_date and
# hour columns via partition discovery.
incoming = (
    spark.read

    .option("mergeSchema", "true")

    .parquet(str(BRONZE_FILES))

    .withColumn(
        "source_file",
        F.regexp_extract(
            F.col("_metadata.file_path"),
            r"bronze/(.*)$",
            1
        )
    )

    .withColumn(
        "ingest_time",
        F.current_timestamp()
    )
)


if delta_exists(spark, BRONZE_TABLE):

    loaded = (
        spark.read.format("delta")
        .load(str(BRONZE_TABLE))
        .select("source_file")
        .distinct()
    )

    incoming = incoming.join(
        loaded,
        on="source_file",
        how="left_anti"
    )


new_files = incoming.select("source_file").distinct().count()

new_rows = incoming.count()


print(f"Found {len(files)} files under {BRONZE_FILES}")

print(f"New since last run: {new_files} files, {new_rows} rows")


if new_rows > 0:

    (
        incoming.write

        .format("delta")

        .mode("append")

        .option("mergeSchema", "true")

        .partitionBy("event_date")

        .save(str(BRONZE_TABLE))
    )


total = spark.read.format("delta").load(str(BRONZE_TABLE)).count()

print(f"Bronze table {BRONZE_TABLE}: {total} rows")

spark.stop()
