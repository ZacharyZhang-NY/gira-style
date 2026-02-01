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
COPY templates ./templates

EXPOSE 5001

# Use gunicorn with gevent-websocket worker for Flask-Sock
CMD ["gunicorn", "-k", "geventwebsocket.gunicorn.workers.GeventWebSocketWorker", "-w", "1", "-b", "0.0.0.0:5001", "api.index:app"]
