# 🤖 AI Chatbot — Powered by OpenRouter

A sleek, ChatGPT-like AI chatbot built with **Python Flask** and **vanilla HTML/CSS/JS**, powered by the [OpenRouter API](https://openrouter.ai/).

---

## ✨ Features

| Feature                  | Description                                       |
|--------------------------|---------------------------------------------------|
| 💬 Chat UI               | ChatGPT-style interface with message bubbles      |
| 🧠 Conversation Memory   | Full chat history sent with each request           |
| 🌙 Dark Mode             | Beautiful dark theme by default                    |
| ⌨️ Typing Animation      | Character-by-character text reveal for AI replies  |
| 📜 Auto-scroll           | Automatically scrolls to the latest message        |
| ⏳ Loading Indicator      | Animated dots while waiting for AI                 |
| ⚠️ Error Handling         | Friendly error messages for API/network issues     |
| 📱 Responsive            | Works on desktop and mobile                        |

---

## 📁 Project Structure

```
Project 6 SAM/
├── app.py                 # Flask backend (API proxy to OpenRouter)
├── requirements.txt       # Python dependencies
├── .env.example           # Template for API key
├── .env                   # Your actual API key (you create this)
├── README.md              # This file
└── static/
    ├── index.html         # Chat interface
    ├── style.css          # Dark-mode styling
    └── script.js          # Chat logic & typing animation
```

---

## 🚀 Setup Instructions

### 1. Prerequisites

- **Python 3.8+** installed ([download](https://www.python.org/downloads/))
- An **OpenRouter API key** ([get one free](https://openrouter.ai/keys))

### 2. Install Dependencies

Open a terminal in the project folder and run:

```bash
pip install -r requirements.txt
```

### 3. Set Up Your API Key

Create a `.env` file in the project root (same folder as `app.py`):

```bash
# Copy the example file
copy .env.example .env
```

Then open `.env` and replace `your_api_key_here` with your actual key:

```
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxxxxxxxxx
```

### 4. Run the Chatbot

```bash
python app.py
```

### 5. Open in Browser

4. Open `http://localhost:5000` in your browser.

## 🚀 Deployment (Free on Render.com)

SAM is ready to be hosted online for free!

### 1. Push to GitHub
1. Create a new repository on GitHub.
2. Push your code:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
   git push -u origin main
   ```

### 2. Deploy on Render
1. Sign up/Log in to [Render.com](https://render.com).
2. Click **New +** -> **Web Service**.
3. Connect your GitHub repository.
4. Use these settings:
   - **Name:** `sam-chatbot` (or whatever you like)
   - **Runtime:** `Python 3`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `gunicorn app:app`
   - **Instance Type:** `Free`

### 3. Configure Environment Variables
1. Scroll down to **Environment Variables**.
2. Add a new variable:
   - **Key:** `OPENROUTER_API_KEY`
   - **Value:** `sk-or-v1-...` (paste your full API key)
3. Click **Create Web Service**.

Wait a few minutes, and your chatbot will be live at `https://sam-chatbot.onrender.com`! ⚡tart chatting! 🎉

---

## ⚙️ Configuration

### Changing the AI Model

Open `app.py` and edit the `MODEL` variable near the top:

```python
MODEL = "openai/gpt-4o-mini"       # Default — fast & cheap
# MODEL = "openai/gpt-4o"          # More powerful
# MODEL = "anthropic/claude-3-haiku"  # Alternative
# MODEL = "google/gemini-pro"      # Google's model
```

Browse all available models at [openrouter.ai/models](https://openrouter.ai/models).

### Changing the System Prompt

Edit the `SYSTEM_PROMPT` variable in `app.py` to change the AI's personality.

---

## 🛠️ Tech Stack

- **Backend:** Python 3 + Flask
- **Frontend:** HTML + CSS + Vanilla JavaScript
- **API:** OpenRouter (compatible with OpenAI format)
- **Font:** Inter (Google Fonts)
