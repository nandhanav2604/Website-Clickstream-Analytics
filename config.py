import os

from dotenv import load_dotenv


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
