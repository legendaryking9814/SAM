"""
SAM AI Chatbot v3.0 — Ultimate Backend
=======================================
Features:
  1. Streaming chat responses (Server-Sent Events)
  2. Image vision analysis (NVIDIA Nemotron)
  3. Chat history management
  4. Ultra-engaging personality
"""

import os
import json
import time
from flask import Flask, request, jsonify, send_from_directory, Response, stream_with_context
import requests
from dotenv import load_dotenv

load_dotenv()

# ─── Configuration ──────────────────────────────────────────────────────────
CHAT_MODEL   = "arcee-ai/trinity-large-preview:free"
VISION_MODEL = "nvidia/nemotron-nano-12b-v2-vl:free"
OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")

SYSTEM_PROMPT = """You are SAM — Super Amusing Machine ⚡

PERSONALITY RULES:
• You're the wittiest, most entertaining AI alive
• Every answer blends humor with genuine helpfulness
• Use clever analogies, puns, and pop culture references
• Emojis are your seasoning — use them strategically, not excessively
• For technical answers: be accurate but explain like a fun teacher
• For creative requests: go ALL out — be bold and imaginative
• Format with markdown: **bold**, `code`, bullet points, headers
• Keep paragraphs short and punchy — max 2-3 sentences each
• End with something memorable — a joke, fun fact, or witty sign-off
• Your catchphrase: "Stay curious! 🚀"

NEVER be boring. NEVER be generic. Make every response feel like chatting with the coolest, smartest friend."""

VISION_SYSTEM_PROMPT = """You are SAM ⚡ with superhuman vision.
Analyze images with wit. Be specific about colors, objects, text, expressions.
Make funny observations. Use markdown and emojis. Be entertaining AND thorough."""

# ─── Flask Setup ────────────────────────────────────────────────────────────
app = Flask(__name__, static_folder="static")


@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/api/config")
def config():
    return jsonify({
        "chatModel": CHAT_MODEL,
        "visionModel": VISION_MODEL,
        "hasApiKey": bool(OPENROUTER_API_KEY),
    })


# ─── Streaming Chat (SSE) ──────────────────────────────────────────────────
@app.route("/api/chat/stream", methods=["POST"])
def chat_stream():
    """
    Streaming chat endpoint using Server-Sent Events.
    Sends tokens in real-time as they arrive from OpenRouter.
    """
    if not OPENROUTER_API_KEY:
        return jsonify({"error": "🔑 API key not configured!"}), 500

    data = request.get_json()
    if not data or "messages" not in data:
        return jsonify({"error": "Invalid request."}), 400

    user_messages = data["messages"]
    messages_payload = [{"role": "system", "content": SYSTEM_PROMPT}] + user_messages

    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:5000",
        "X-Title": "SAM AI Chatbot",
    }

    body = {
        "model": CHAT_MODEL,
        "messages": messages_payload,
        "stream": True,  # Enable streaming!
    }

    def generate():
        start_time = time.time()
        try:
            response = requests.post(
                OPENROUTER_API_URL, headers=headers, json=body,
                timeout=90, stream=True
            )
            response.raise_for_status()

            full_content = ""
            for line in response.iter_lines():
                if line:
                    line_str = line.decode("utf-8")
                    if line_str.startswith("data: "):
                        payload = line_str[6:]
                        if payload.strip() == "[DONE]":
                            elapsed = round(time.time() - start_time, 2)
                            yield f"data: {json.dumps({'done': True, 'time': elapsed})}\n\n"
                            break
                        try:
                            chunk = json.loads(payload)
                            delta = chunk.get("choices", [{}])[0].get("delta", {})
                            content = delta.get("content", "")
                            if content:
                                full_content += content
                                yield f"data: {json.dumps({'token': content})}\n\n"
                        except json.JSONDecodeError:
                            continue

        except requests.exceptions.Timeout:
            yield f"data: {json.dumps({'error': '⏰ Request timed out!'})}\n\n"
        except requests.exceptions.ConnectionError:
            yield f"data: {json.dumps({'error': '🌐 Connection failed!'})}\n\n"
        except requests.exceptions.HTTPError as e:
            try:
                detail = e.response.json().get("error", {}).get("message", str(e))
            except Exception:
                detail = str(e)
            yield f"data: {json.dumps({'error': f'API error: {detail}'})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': f'Error: {str(e)}'})}\n\n"

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        }
    )


# ─── Non-streaming Chat (fallback) ─────────────────────────────────────────
@app.route("/api/chat", methods=["POST"])
def chat():
    if not OPENROUTER_API_KEY:
        return jsonify({"error": "🔑 API key not configured!"}), 500

    data = request.get_json()
    if not data or "messages" not in data:
        return jsonify({"error": "Invalid request."}), 400

    messages_payload = [{"role": "system", "content": SYSTEM_PROMPT}] + data["messages"]

    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:5000",
        "X-Title": "SAM AI Chatbot",
    }

    try:
        start = time.time()
        response = requests.post(OPENROUTER_API_URL, headers=headers,
                                 json={"model": CHAT_MODEL, "messages": messages_payload},
                                 timeout=60)
        response.raise_for_status()
        elapsed = round(time.time() - start, 2)
        result = response.json()
        ai_message = result["choices"][0]["message"]["content"]
        return jsonify({"reply": ai_message, "time": elapsed})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ─── Vision Endpoint ───────────────────────────────────────────────────────
@app.route("/api/vision", methods=["POST"])
def vision():
    if not OPENROUTER_API_KEY:
        return jsonify({"error": "🔑 API key not configured!"}), 500

    data = request.get_json()
    if not data or "image" not in data:
        return jsonify({"error": "📸 No image provided!"}), 400

    messages_payload = [
        {"role": "system", "content": VISION_SYSTEM_PROMPT},
        {
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": data["image"]}},
                {"type": "text", "text": data.get("prompt", "Describe this image in detail!")}
            ]
        }
    ]

    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:5000",
        "X-Title": "SAM AI Chatbot",
    }

    try:
        start = time.time()
        response = requests.post(OPENROUTER_API_URL, headers=headers,
                                 json={"model": VISION_MODEL, "messages": messages_payload},
                                 timeout=90)
        response.raise_for_status()
        elapsed = round(time.time() - start, 2)
        result = response.json()
        return jsonify({"reply": result["choices"][0]["message"]["content"], "time": elapsed})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    print("")
    print("  ====================================================")
    print("    SAM v3.0 (Super Amusing Machine) is running!")
    print("    Open http://localhost:5000")
    print("    Streaming enabled!")
    print("  ====================================================")
    print("")
    app.run(debug=True, port=5000)
