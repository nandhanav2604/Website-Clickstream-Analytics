from flask import Flask, request, jsonify
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

if __name__ == "__main__":

    print(
        "Starting SoleStream Clickstream API..."
    )

    app.run(
        host="0.0.0.0",
        port=5000,
        debug=True
    )