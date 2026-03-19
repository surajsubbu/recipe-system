# Recipe Manager

A self-hosted app I built that lets me save, cook, and plan meals from any recipe on the internet — including YouTube cooking videos. It runs on my home server and is accessible from my phone anywhere in the world.

---

## What it does

### Save recipes from anywhere
Paste a link from any cooking website (AllRecipes, NYT Cooking, BBC Good Food, etc.) or a YouTube cooking video — the app reads it and extracts the recipe for you automatically. No more screenshots or browser bookmarks.

For YouTube, it reads the video's captions. If there are no captions, it runs speech-to-text on the audio to transcribe what the chef is actually saying.

### Cook mode
A fullscreen, phone-friendly view that walks you through each step one at a time. Built-in timers for steps like "simmer for 20 minutes". The screen stays on so it doesn't lock while your hands are covered in flour.

### Shopping list
Add any recipe to your shopping list. Ingredients are automatically grouped by grocery section (produce, dairy, meat, etc.) so you're not running back and forth across the shop.

### Meal planner
A weekly calendar (Mon–Sun) where you can plan what you're cooking each day. One tap generates a combined shopping list for the whole week.

### Pantry tracker
Mark what you already have at home. The app knows what to skip when building your shopping list.

### Installable on your phone
It works like a native app — add it to your home screen and it opens full-screen without a browser bar. Works offline too.

---

## How it works (the interesting bits)

When you paste a recipe URL, here's what happens behind the scenes:

1. A background job picks it up and fetches the page
2. For YouTube links it downloads captions, or runs Whisper (OpenAI's speech-to-text model) if there are none
3. An AI reads the raw text and extracts a structured recipe: title, ingredients with amounts, numbered steps, and cook time
4. Another AI pass normalises the ingredients (so "1 cup all-purpose flour" and "1 cup AP flour" become the same thing)
5. It appears in your library in a few seconds

The whole pipeline runs on AI models via OpenRouter — I can swap between different models (Claude, GPT, Gemini, Mistral) depending on speed and cost.

---

## Tech stack

| Layer | What I used |
|---|---|
| Frontend | Next.js 14, TypeScript, Tailwind CSS, PWA |
| Backend | Python, FastAPI |
| AI / LLM | OpenRouter API (Claude, GPT, Gemini — switchable) |
| Speech-to-text | Faster-Whisper (runs locally) |
| Task queue | Celery + Redis (background jobs) |
| Database | PostgreSQL |
| Auth | Clerk (sign in with Google / email) |
| Hosting | Self-hosted via Docker, exposed with Cloudflare Tunnel |

Everything runs in Docker on a home server. Cloudflare Tunnel punches a secure HTTPS connection through my home network so I can reach it from anywhere without touching router settings or port forwarding.

---

## Running it yourself

You'll need:
- **Docker Desktop** installed
- A free [Clerk](https://clerk.com) account (handles login)
- A free [OpenRouter](https://openrouter.ai) account (AI models, pay-as-you-go)

```bash
git clone <repo-url> recipe-manager
cd recipe-manager
# Fill in your API keys in .env
docker compose up -d
```

Open [http://localhost:3000](http://localhost:3000) — sign in and you're ready.

Full setup details are in [SETUP.md](SETUP.md) if you want to run your own instance.

---

## Why I built this

I got tired of cooking websites burying recipes behind pop-ups, autoplaying videos, and life-story blog posts. I also wanted a single place for recipes I found on YouTube, Reddit, and various food blogs — without being locked into any particular app or subscription.

Building it also let me properly dig into AI-powered pipelines, background task queues, and self-hosting — things I wanted hands-on experience with.

---

*Built with Next.js, FastAPI, Celery, Whisper, and various AI models via OpenRouter.*
