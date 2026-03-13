FROM python:3.11-slim

WORKDIR /app

# System deps: curl (healthcheck), ffmpeg (Whisper audio), build-essential + libpq-dev (psycopg2)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ffmpeg \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Upgrade pip so we get the latest resolver and wheel-build behaviour
RUN pip install --upgrade pip setuptools wheel

# Install Python deps (layer-cached — only re-runs when requirements.txt changes)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source
COPY . .

# Make entrypoint executable
RUN chmod +x /app/entrypoint.sh

# Auto-generate initial migration if none exist, migrate, then start Uvicorn
CMD ["/app/entrypoint.sh"]
