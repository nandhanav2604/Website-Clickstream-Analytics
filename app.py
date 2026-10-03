import os
from pathlib import Path

from flask import Flask, request, jsonify, send_from_directory, abort
from flask_cors import CORS
from kafka import KafkaProducer
import json

from config import (
    KAFKA_BOOTSTRAP_SERVERS,
    KAFKA_TOPIC,
    print_config
)


# =========================================
# Flask Application
# =========================================

app = Flask(__name__)

CORS(app)


# =========================================
# Kafka Configuration
# =========================================

print_config("clickstream-ingestion-api")


# =========================================
# Kafka Producer
# =========================================

producer = KafkaProducer(
    bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,

    value_serializer=lambda value:
        json.dumps(value).encode("utf-8"),

    acks="all",

    retries=5
)


print("Kafka connection configured.")


# =========================================
# Health Check
# =========================================

@app.route("/health", methods=["GET"])
def health():

    return jsonify({
        "status": "healthy",
        "service": "clickstream-ingestion-api"
    })


# =========================================
# Storefront
#
# script.js posts to the RELATIVE path
# /api/events, so the pages must come from
# this same origin. Only the named files are
# served - never the whole directory, which
# also holds .env and the Python sources.
# =========================================

STOREFRONT_DIR = Path(__file__).resolve().parent

STOREFRONT_FILES = {
    "index.html",
    "shoes.html",
    "style.css",
    "script.js"
}


@app.route("/", methods=["GET"])
def storefront_home():

    return send_from_directory(
        STOREFRONT_DIR,
        "index.html"
    )


@app.route("/<filename>", methods=["GET"])
def storefront_file(filename):

    if filename not in STOREFRONT_FILES:

        abort(404)

    return send_from_directory(
        STOREFRONT_DIR,
        filename
    )


# =========================================
# Receive Clickstream Event
# =========================================

@app.route("/api/events", methods=["POST"])
def receive_event():

    try:

        event = request.get_json()

        if not event:

            return jsonify({
                "status": "error",
                "message": "No event data received"
            }), 400


        # Send event to Kafka

        future = producer.send(
            KAFKA_TOPIC,
            value=event
        )

        # Wait until Kafka acknowledges the message

        record_metadata = future.get(
            timeout=10
        )


        print(
            "Event sent to Kafka:",
            event
        )


        return jsonify({

            "status": "success",

            "topic":
                record_metadata.topic,

            "partition":
                record_metadata.partition,

            "offset":
                record_metadata.offset

        }), 200


    except Exception as e:

        print(
            "Error sending event:",
            str(e)
        )


        return jsonify({

            "status": "error",

            "message":
                str(e)

        }), 500


# =========================================
# Run Application
# =========================================

# Debug is OFF unless FLASK_DEBUG is set to
# a true value. The server binds 0.0.0.0,
# and the debug console runs arbitrary code
# for anyone who can reach the port - so it
# must be opted into, never defaulted.

DEBUG = os.getenv(
    "FLASK_DEBUG",
    ""
).strip().lower() in ("1", "true", "yes", "on")


if __name__ == "__main__":

    print(
        "Starting SoleStream Clickstream API..."
    )

    print(
        f"Debug mode: {'ON (local use only)' if DEBUG else 'off'}"
    )

    app.run(
        host="0.0.0.0",
        port=5000,
        debug=DEBUG
    )