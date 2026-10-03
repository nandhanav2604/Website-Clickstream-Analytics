import os
import time

from dotenv import load_dotenv
from kafka import errors as kafka_errors


# =========================================
# Load .env
#
# load_dotenv() does NOT overwrite variables
# that are already present in the
# environment. That ordering matters here:
# docker-compose sets KAFKA_BOOTSTRAP_SERVERS
# for the containerised services, and those
# values must win over anything a stray .env
# happens to contain.
# =========================================

load_dotenv()


# =========================================
# Defaults
#
# These literals live here and nowhere else.
# app.py, consumer.py and sink.py all
# import from this module rather than
# spelling out a broker address themselves.
#
# The default is the HOST value, because a
# process you start by hand is running on
# the host. Containers are handed
# kafka:9092 by docker-compose instead.
# =========================================

DEFAULTS = {
    "KAFKA_BOOTSTRAP_SERVERS": "localhost:29092",
    "KAFKA_TOPIC": "clickstream-json",

    # Dead-letter topic: events that parse but
    # break the tracking-plan contract land
    # here, with their source offset and the
    # keys they were missing.
    "KAFKA_DLQ_TOPIC": "clickstream-json-dlq"
}


# =========================================
# Resolution
#
# Each setting is resolved once, and we keep
# track of WHERE it came from so startup can
# report it. A typo in .env then shows up as
# "(default)" instead of silently taking
# effect as nothing at all.
# =========================================

def _resolve(name):

    value = os.getenv(name)

    if value is None or value.strip() == "":
        return DEFAULTS[name], "default"

    return value.strip(), "from environment"


_RESOLVED = {
    name: _resolve(name)
    for name in DEFAULTS
}


KAFKA_BOOTSTRAP_SERVERS = _RESOLVED["KAFKA_BOOTSTRAP_SERVERS"][0]

KAFKA_TOPIC = _RESOLVED["KAFKA_TOPIC"][0]

KAFKA_DLQ_TOPIC = _RESOLVED["KAFKA_DLQ_TOPIC"][0]


# =========================================
# Startup Report
# =========================================

def print_config(service_name):

    width = max(
        len(name) for name in _RESOLVED
    )

    print("=" * 52)
    print(f" {service_name} configuration")
    print("=" * 52)

    for name in sorted(_RESOLVED):

        value, source = _RESOLVED[name]

        print(
            f"  {name.ljust(width)} = "
            f"{value}  ({source})"
        )

    print("=" * 52)


# =========================================
# Startup: Wait for the Broker
#
# Creating a Kafka client fails at once if
# the broker is not accepting connections
# yet (NoBrokersAvailable in kafka-python
# 2.x, KafkaTimeoutError "Unable to
# bootstrap" in 3.x, which removed
# NoBrokersAvailable entirely - so look
# both up instead of importing). Instead of
# exiting and leaning on the container
# restart policy, retry with exponential
# backoff: 1s, 2s, 4s ... capped at 15s.
#
# In 3.x each attempt itself already waits
# up to bootstrap_timeout_ms (30s) before
# raising, so attempts are ~30s apart; in
# 2.x they fail fast and the backoff does
# the pacing.
#
# After STARTUP_TIMEOUT_SECONDS it gives up
# and re-raises, so a genuinely wrong
# broker address still fails loudly rather
# than waiting forever.
# =========================================

STARTUP_TIMEOUT_SECONDS = 120

STARTUP_MAX_BACKOFF_SECONDS = 15


BROKER_UNAVAILABLE = tuple(
    getattr(kafka_errors, name)
    for name in ("NoBrokersAvailable", "KafkaTimeoutError")
    if hasattr(kafka_errors, name)
)


def connect_with_retry(factory, description):

    deadline = time.monotonic() + STARTUP_TIMEOUT_SECONDS

    delay = 1

    attempt = 1


    while True:

        try:

            client = factory()

            if attempt > 1:

                print(f"Connected {description} on attempt {attempt}.")

            return client


        except BROKER_UNAVAILABLE as error:

            if time.monotonic() + delay > deadline:

                print(
                    f"Giving up on {description} after "
                    f"{STARTUP_TIMEOUT_SECONDS}s: {error}"
                )

                raise


            print(
                f"Kafka not ready for {description} "
                f"(attempt {attempt}: {type(error).__name__}); "
                f"retrying in {delay}s..."
            )

            time.sleep(delay)

            delay = min(
                delay * 2,
                STARTUP_MAX_BACKOFF_SECONDS
            )

            attempt += 1
