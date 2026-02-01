FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=on \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# System deps (build tools for psycopg2, etc.)
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install -r requirements.txt \
    && pip install gunicorn gevent gevent-websocket

# Copy backend code only
COPY api ./api
COPY util ./util
EXPOSE 5001

# Use the same dev server behavior as local (Flask built-in). Single process, but simplest for WS compatibility.
CMD ["python", "api/index.py"]
