# =========================================
# Spark pipeline: bronze -> silver -> gold
#
#   make pipeline    all three, in order; stops at the first failure
#   make bronze | silver | gold    one stage
#   make spark-image               (re)build the Spark + Delta image
#
# Each stage is a one-off container from the "jobs" profile in
# docker-compose.yml; ./data is mounted, nothing else needs to run.
# =========================================

SPARK_RUN = docker compose run --rm spark

.PHONY: pipeline bronze silver gold spark-image

pipeline: spark-image
	$(SPARK_RUN) jobs/bronze.py
	$(SPARK_RUN) jobs/silver.py
	$(SPARK_RUN) jobs/gold.py

bronze: spark-image
	$(SPARK_RUN) jobs/bronze.py

silver: spark-image
	$(SPARK_RUN) jobs/silver.py

gold: spark-image
	$(SPARK_RUN) jobs/gold.py

spark-image:
	docker compose --profile jobs build spark
