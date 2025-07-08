from flask import Flask, request, Response
import tempfile
import os

app = Flask(__name__)

TEMP_DIR = tempfile.gettempdir()
LAST_RECEIVED_FILE = os.path.join(TEMP_DIR, "last_received.ttl")

@app.route("/", methods=["GET"])
def hello():
    return f"""
    <h2>Hello! POST your Turtle to <code>/upload</code></h2>
    <p>View the last received Turtle at: <a href="/view">/view</a></p>
    <p>Temp file: {LAST_RECEIVED_FILE}</p>
    """

@app.route("/upload", methods=["POST"])
def upload_ttl():
    ttl_data = request.data.decode("utf-8")
    print("\n=== Received Turtle ===")
    print(ttl_data)

    # Save to file so you can view it later
    with open(LAST_RECEIVED_FILE, "w", encoding="utf-8") as f:
        f.write(ttl_data)

    return "Turtle received and saved!", 200

@app.route("/view", methods=["GET"])
def view_last_ttl():
    try:
        with open(LAST_RECEIVED_FILE, "r", encoding="utf-8") as f:
            ttl_content = f.read()
        # Return as plain text
        return Response(ttl_content, mimetype="text/plain")
    except FileNotFoundError:
        return "No Turtle file received yet.", 404

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
