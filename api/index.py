import logging
import json
import os
import sys
import mimetypes
import base64
import time
import urllib.request
import urllib.parse
import uuid
import random
import asyncio

from flask import Flask, request, jsonify, send_from_directory, Response, stream_with_context
from flask_sock import Sock
from flask_cors import CORS
from google import genai
from google.genai import types
from google.oauth2 import service_account
from dotenv import load_dotenv
import boto3
from botocore.config import Config
import psycopg2
from psycopg2.extras import Json

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

TEMPLATE_EXTENSIONS = (".png", ".jpg", ".jpeg", ".webp")

# Load environment variables from .env.local for local dev
load_dotenv(os.path.join(ROOT_DIR, ".env.local"))

try:
    from api.env import api_key as GEMINI_API_KEY
except ImportError:
    try:
        from env import api_key as GEMINI_API_KEY
    except ImportError:
        GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')

from api.constants import (
    IMG_GEN_MODEL,
    RECOMMENDATION_MODEL,
    CHIPS_MODEL,
    RECOMMENDATION_PROMPT,
    build_recommendation_prompt,
    FOLLOW_UP_PROMPT,
    IMAGE_GEN_PROMPT,
    CHIPS_PROMPT,
    FILE_SEARCH_STORE,
    VIDEO_GEN_MODEL,
    VIDOE_GENERATION_PROMPT,
    STYLE_INVESTIGATOR_INSTRUCTION,
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS_ORIGINS = os.getenv('CORS_ORIGINS', '*')
CORS(app, resources={r"/api/*": {"origins": CORS_ORIGINS}})
sock = Sock(app)

# Initialize Gemini client
ALLOWED_IMAGE_MIME_TYPES = ('image/png', 'image/jpeg', 'image/webp')
VIDEO_POLL_INTERVAL_SECONDS = float(os.getenv('VIDEO_POLL_INTERVAL_SECONDS', '3'))
VIDEO_MAX_WAIT_SECONDS = float(os.getenv('VIDEO_MAX_WAIT_SECONDS', '120'))
if not GEMINI_API_KEY:
    logger.warning("GEMINI_API_KEY environment variable not set.")
    gemini_client = None
else:
    gemini_client = genai.Client(api_key=GEMINI_API_KEY)
    logger.info(f"Gemini client initialized. File Search Store: {FILE_SEARCH_STORE}")

DATABASE_URL = os.getenv("DATABASE_URL") or os.getenv("NEON_DATABASE_URL")
R2_BUCKET = os.getenv("R2_BUCKET", "")
R2_ENDPOINT = os.getenv("R2_ENDPOINT", "")
R2_ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID", "")
R2_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY", "")
R2_PUBLIC_BASE_URL = os.getenv("R2_PUBLIC_BASE_URL", "")
R2_TEMPLATE_PREFIX = os.getenv("R2_TEMPLATE_PREFIX", "templates/")

_r2_client = None
_chat_cache = {}
_weather_cache = {}

BEGIN_PAYLOAD = "---BEGIN_STYLE_PAYLOAD---"
END_PAYLOAD = "---END_STYLE_PAYLOAD---"
DEFAULT_LIVE_MODEL_ID = os.getenv(
    "LIVE_MODEL_ID",
    "models/gemini-2.5-flash-native-audio-preview-12-2025",
)
DEFAULT_LIVE_MODALITIES = ["AUDIO"]
DEFAULT_LIVE_API_VERSION = os.getenv("LIVE_API_VERSION", "v1beta")
DEFAULT_LIVE_VOICE = os.getenv("LIVE_VOICE", "Zephyr")

WEATHER_CACHE_TTL_SECONDS = float(os.getenv('WEATHER_CACHE_TTL_SECONDS', '600'))
WEATHER_CACHE_MAX_ENTRIES = int(os.getenv('WEATHER_CACHE_MAX_ENTRIES', '200'))

OPEN_METEO_GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search"
OPEN_METEO_WEATHER_URL = "https://api.open-meteo.com/v1/forecast"

WEATHER_CODE_DESCRIPTIONS = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    56: "Light freezing drizzle",
    57: "Dense freezing drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    66: "Light freezing rain",
    67: "Heavy freezing rain",
    71: "Slight snow fall",
    73: "Moderate snow fall",
    75: "Heavy snow fall",
    77: "Snow grains",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    85: "Slight snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with slight hail",
    99: "Thunderstorm with heavy hail",
}


def get_db_connection():
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL is not configured.")
    return psycopg2.connect(DATABASE_URL)


def get_r2_client():
    global _r2_client
    if _r2_client:
        return _r2_client
    if not (R2_BUCKET and R2_ENDPOINT and R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY):
        raise RuntimeError("R2 storage credentials are not fully configured.")
    _r2_client = boto3.client(
        "s3",
        endpoint_url=R2_ENDPOINT,
        aws_access_key_id=R2_ACCESS_KEY_ID,
        aws_secret_access_key=R2_SECRET_ACCESS_KEY,
        region_name="auto",
        config=Config(signature_version="s3v4"),
    )
    return _r2_client


def build_r2_url(object_key: str):
    if R2_PUBLIC_BASE_URL:
        return f"{R2_PUBLIC_BASE_URL.rstrip('/')}/{object_key}"
    if not R2_ENDPOINT:
        return ""
    return f"{R2_ENDPOINT.rstrip('/')}/{R2_BUCKET}/{object_key}"


def build_signed_r2_url(object_key: str, expires_in: int = 3600):
    client = get_r2_client()
    return client.generate_presigned_url(
        "get_object",
        Params={"Bucket": R2_BUCKET, "Key": object_key},
        ExpiresIn=expires_in,
    )


def parse_data_url(data_url: str):
    if not data_url or not isinstance(data_url, str):
        return None, None
    if not data_url.startswith("data:"):
        return None, None
    header, encoded = data_url.split(",", 1)
    mime_type = header.split(":")[1].split(";")[0] if ":" in header else "application/octet-stream"
    return mime_type, base64.b64decode(encoded)


def clean_jsonish_text(raw_text: str):
    if not raw_text or not isinstance(raw_text, str):
        return ""
    cleaned = raw_text.strip()
    while "tool_code" in cleaned:
        cleaned = cleaned.replace("tool_code", "").strip()

    if cleaned.startswith("```json"):
        cleaned = cleaned[7:]
    elif cleaned.startswith("```"):
        first_newline = cleaned.find("\n")
        if first_newline != -1:
            cleaned = cleaned[first_newline + 1:]
        else:
            cleaned = cleaned[3:]

    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]

    cleaned = cleaned.strip()

    json_start = cleaned.find("{")
    json_end = cleaned.rfind("}")
    if json_start != -1 and json_end != -1 and json_end > json_start:
        cleaned = cleaned[json_start:json_end + 1]

    return cleaned.strip()


def upload_to_r2(object_key: str, data: bytes, mime_type: str):
    client = get_r2_client()
    client.put_object(
        Bucket=R2_BUCKET,
        Key=object_key,
        Body=data,
        ContentType=mime_type or "application/octet-stream",
    )
    return build_r2_url(object_key)


def fetch_video_bytes(video_uri: str):
    if not GEMINI_API_KEY:
        return None
    if not video_uri:
        return None
    video_url = video_uri
    if "key=" not in video_url:
        separator = "&" if "?" in video_url else "?"
        video_url = f"{video_url}{separator}key={GEMINI_API_KEY}"
    try:
        with urllib.request.urlopen(video_url, timeout=60) as response:
            return response.read()
    except Exception as e:
        logger.warning(f"Failed to fetch video bytes: {e}")
        return None


def load_random_template_image():
    prefix = R2_TEMPLATE_PREFIX.rstrip("/") + "/"
    try:
        client = get_r2_client()
    except Exception as e:  # pragma: no cover - env guard
        logger.warning("R2 client not available: %s", e)
        return None

    try:
        resp = client.list_objects_v2(Bucket=R2_BUCKET, Prefix=prefix)
        contents = resp.get("Contents", []) if resp else []
        candidates = [
            obj for obj in contents
            if obj.get("Key", "").lower().endswith(TEMPLATE_EXTENSIONS)
        ]
        if not candidates:
            logger.warning("No template images found in R2 prefix %s", prefix)
            return None
        chosen = random.choice(candidates)
        key = chosen.get("Key")
        obj = client.get_object(Bucket=R2_BUCKET, Key=key)
        image_bytes = obj["Body"].read()
        mime_type = mimetypes.guess_type(key)[0] or "image/png"
        if mime_type not in ALLOWED_IMAGE_MIME_TYPES:
            logger.warning(
                "Template image has unsupported mime type: %s (%s)",
                mime_type,
                os.path.basename(key),
            )
            return None
        return image_bytes, mime_type, os.path.basename(key)
    except Exception as e:
        logger.warning("Failed to load template image from R2: %s", e)
        return None


def normalize_uuid(raw_value):
    if not raw_value:
        return None
    try:
        return str(uuid.UUID(str(raw_value)))
    except (ValueError, TypeError):
        return None


def normalize_session_id(raw_session_id):
    return normalize_uuid(raw_session_id)


def build_media_key(session_id: str, turn_index: int, filename: str):
    return f"sessions/{session_id}/turns/{turn_index}/{filename}"

def safe_float(value):
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def describe_weather_code(code):
    try:
        code_int = int(code)
    except (TypeError, ValueError):
        return ""
    return WEATHER_CODE_DESCRIPTIONS.get(code_int, f"Weather code {code_int}")


def fetch_json(url, timeout=10, headers=None):
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=timeout) as response:
        data = response.read()
    return json.loads(data.decode("utf-8"))


def trim_weather_cache():
    if len(_weather_cache) <= WEATHER_CACHE_MAX_ENTRIES:
        return
    entries = sorted(_weather_cache.items(), key=lambda item: item[1].get("ts", 0))
    remove_count = max(0, len(entries) - WEATHER_CACHE_MAX_ENTRIES)
    for i in range(remove_count):
        _weather_cache.pop(entries[i][0], None)


def geocode_zip(zip_code, language="en"):
    if not zip_code:
        return None
    params = {
        "name": zip_code,
        "count": 1,
        "language": language or "en",
        "format": "json",
    }
    url = f"{OPEN_METEO_GEOCODING_URL}?{urllib.parse.urlencode(params)}"
    try:
        payload = fetch_json(url, timeout=8)
    except Exception:
        return None
    results = payload.get("results") if isinstance(payload, dict) else None
    if not results or not isinstance(results, list):
        return None
    first = results[0] if results else None
    if not isinstance(first, dict):
        return None
    latitude = safe_float(first.get("latitude"))
    longitude = safe_float(first.get("longitude"))
    if latitude is None or longitude is None:
        return None
    return {
        "latitude": latitude,
        "longitude": longitude,
        "name": first.get("name"),
        "admin1": first.get("admin1"),
        "country": first.get("country"),
        "country_code": first.get("country_code"),
    }


def fetch_current_weather(latitude, longitude, use_imperial=True):
    if latitude is None or longitude is None:
        return None

    cache_key = f"{round(float(latitude), 3)}:{round(float(longitude), 3)}:{'imp' if use_imperial else 'met'}"
    now_ts = time.time()
    cached = _weather_cache.get(cache_key)
    if cached and now_ts - cached.get("ts", 0) < WEATHER_CACHE_TTL_SECONDS:
        return cached.get("summary")

    params = {
        "latitude": latitude,
        "longitude": longitude,
        "current": ",".join(
            [
                "temperature_2m",
                "apparent_temperature",
                "precipitation",
                "weather_code",
                "wind_speed_10m",
            ]
        ),
        "timezone": "auto",
        "temperature_unit": "fahrenheit" if use_imperial else "celsius",
        "wind_speed_unit": "mph" if use_imperial else "kmh",
        "precipitation_unit": "inch" if use_imperial else "mm",
    }
    url = f"{OPEN_METEO_WEATHER_URL}?{urllib.parse.urlencode(params)}"

    try:
        payload = fetch_json(url, timeout=10)
    except Exception:
        return None

    if not isinstance(payload, dict):
        return None
    current = payload.get("current") if isinstance(payload.get("current"), dict) else {}
    units = payload.get("current_units") if isinstance(payload.get("current_units"), dict) else {}

    temperature = current.get("temperature_2m")
    apparent = current.get("apparent_temperature")
    precipitation = current.get("precipitation")
    wind_speed = current.get("wind_speed_10m")
    weather_code = current.get("weather_code")
    description = describe_weather_code(weather_code)

    temp_unit = units.get("temperature_2m") or ("°F" if use_imperial else "°C")
    precip_unit = units.get("precipitation") or ("in" if use_imperial else "mm")
    wind_unit = units.get("wind_speed_10m") or ("mph" if use_imperial else "km/h")

    parts = []
    if isinstance(temperature, (int, float)):
        temp_str = f"{round(float(temperature))}{temp_unit}"
        if isinstance(apparent, (int, float)) and round(float(apparent)) != round(float(temperature)):
            temp_str += f" (feels like {round(float(apparent))}{temp_unit})"
        parts.append(temp_str)
    if description:
        parts.append(description)
    if isinstance(precipitation, (int, float)) and float(precipitation) > 0:
        parts.append(f"precip {precipitation}{precip_unit}")
    if isinstance(wind_speed, (int, float)) and float(wind_speed) > 0:
        parts.append(f"wind {round(float(wind_speed))} {wind_unit}")

    summary = ", ".join(parts).strip() if parts else None
    if summary:
        _weather_cache[cache_key] = {"ts": now_ts, "summary": summary}
        trim_weather_cache()
    return summary


def upsert_session(session_id, preferences, system_prompt, user_agent, locale, timezone):
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO sessions (
                    session_id, preferences, system_prompt, user_agent, locale, timezone, updated_at
                ) VALUES (%s, %s, %s, %s, %s, %s, now())
                ON CONFLICT (session_id) DO UPDATE SET
                    preferences = EXCLUDED.preferences,
                    system_prompt = EXCLUDED.system_prompt,
                    user_agent = EXCLUDED.user_agent,
                    locale = EXCLUDED.locale,
                    timezone = EXCLUDED.timezone,
                    updated_at = now()
                """,
                (session_id, Json(preferences), system_prompt, user_agent, locale, timezone),
            )


def upsert_turn(session_id, turn_index, user_message, assistant_response,
                feedback, image_key, image_url, video_key, video_url):
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO session_turns (
                    session_id, turn_index, user_message, assistant_response,
                    feedback, image_key, image_url, video_key, video_url
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (session_id, turn_index) DO UPDATE SET
                    user_message = EXCLUDED.user_message,
                    assistant_response = EXCLUDED.assistant_response,
                    feedback = COALESCE(EXCLUDED.feedback, session_turns.feedback),
                    image_key = COALESCE(EXCLUDED.image_key, session_turns.image_key),
                    image_url = COALESCE(EXCLUDED.image_url, session_turns.image_url),
                    video_key = COALESCE(EXCLUDED.video_key, session_turns.video_key),
                    video_url = COALESCE(EXCLUDED.video_url, session_turns.video_url)
                """,
                (
                    session_id,
                    turn_index,
                    user_message,
                    Json(assistant_response),
                    feedback,
                    image_key,
                    image_url,
                    video_key,
                    video_url,
                ),
            )

def fetch_session_preferences(session_id):
    if not session_id:
        return None, None
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT preferences, system_prompt FROM sessions WHERE session_id = %s",
                (session_id,),
            )
            row = cur.fetchone()
            if not row:
                return None, None
            preferences, system_prompt = row[0], row[1]
            if isinstance(preferences, str):
                try:
                    preferences = json.loads(preferences)
                except json.JSONDecodeError:
                    preferences = None
            return preferences, system_prompt


def fetch_session_turns(session_id):
    if not session_id:
        return []
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT user_message, assistant_response
                FROM session_turns
                WHERE session_id = %s
                ORDER BY turn_index ASC
                """,
                (session_id,),
            )
            rows = cur.fetchall()
    history = []
    for user_message, assistant_response in rows:
        response_payload = assistant_response
        if isinstance(assistant_response, str):
            try:
                response_payload = json.loads(assistant_response)
            except json.JSONDecodeError:
                response_payload = assistant_response
        history.append({"user": user_message, "assistant": response_payload})
    return history

def upsert_session_chips(session_id, turn_index, chips):
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO session_chips (session_id, turn_index, chips, created_at)
                VALUES (%s, %s, %s, now())
                ON CONFLICT (session_id, turn_index) DO UPDATE SET
                    chips = EXCLUDED.chips,
                    created_at = now()
                """,
                (session_id, turn_index, Json(chips)),
            )


def _normalize_chip_text(value):
    if not isinstance(value, str):
        return ""
    return value.strip()


def _build_chip_profile(preferences):
    if not isinstance(preferences, dict):
        return ""
    def _list_to_text(value):
        if isinstance(value, list):
            items = [str(item).strip() for item in value if str(item).strip()]
            return ", ".join(items)
        if isinstance(value, str) and value.strip():
            return value.strip()
        return ""

    lines = []
    style = _list_to_text(preferences.get("q1"))
    color = _list_to_text(preferences.get("q2"))
    shopping = _list_to_text(preferences.get("q3"))
    highlight = _list_to_text(preferences.get("q4"))
    note = _list_to_text(preferences.get("styleNote") or preferences.get("style_note"))
    if style:
        lines.append(f"Style: {style}")
    if color:
        lines.append(f"Color: {color}")
    if shopping:
        lines.append(f"Shopping: {shopping}")
    if highlight:
        lines.append(f"Focus: {highlight}")
    if note:
        lines.append(f"Note: {note}")
    return "\n".join(lines)


def _load_live_api_key():
    try:
        from api.env import api_key
        return api_key
    except Exception:
        try:
            from env import api_key
            return api_key
        except Exception:
            return os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")


def _load_service_account_info():
    raw_json = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON")
    if raw_json:
        try:
            info = json.loads(raw_json)
            if isinstance(info, dict):
                return info
        except Exception:
            pass

    private_key = os.getenv("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY") or ""
    if private_key:
        private_key = private_key.replace("\\n", "\n")

    info = {
        "type": os.getenv("GOOGLE_SERVICE_ACCOUNT_TYPE") or "service_account",
        "project_id": os.getenv("GOOGLE_SERVICE_ACCOUNT_PROJECT_ID")
        or os.getenv("GOOGLE_CLOUD_PROJECT"),
        "private_key_id": os.getenv("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY_ID"),
        "private_key": private_key,
        "client_email": os.getenv("GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL"),
        "client_id": os.getenv("GOOGLE_SERVICE_ACCOUNT_CLIENT_ID"),
        "auth_uri": os.getenv("GOOGLE_SERVICE_ACCOUNT_AUTH_URI"),
        "token_uri": os.getenv("GOOGLE_SERVICE_ACCOUNT_TOKEN_URI"),
        "auth_provider_x509_cert_url": os.getenv(
            "GOOGLE_SERVICE_ACCOUNT_AUTH_PROVIDER_CERT_URL"
        ),
        "client_x509_cert_url": os.getenv("GOOGLE_SERVICE_ACCOUNT_CLIENT_CERT_URL"),
        "universe_domain": os.getenv("GOOGLE_SERVICE_ACCOUNT_UNIVERSE_DOMAIN"),
    }

    required = ("project_id", "private_key", "client_email", "token_uri")
    if not all(info.get(key) for key in required):
        return None
    return info


def _build_live_client():
    api_key = _load_live_api_key()
    if api_key:
        return genai.Client(
            api_key=api_key, http_options={"api_version": DEFAULT_LIVE_API_VERSION}
        )
    info = _load_service_account_info()
    if not info:
        return None
    project_id = os.getenv("GOOGLE_CLOUD_PROJECT") or info.get("project_id")
    if not project_id:
        return None
    location = (
        os.getenv("GOOGLE_CLOUD_LOCATION")
        or os.getenv("GOOGLE_CLOUD_REGION")
        or "us-central1"
    )
    credentials = service_account.Credentials.from_service_account_info(
        info, scopes=["https://www.googleapis.com/auth/cloud-platform"]
    )
    return genai.Client(
        vertexai=True,
        credentials=credentials,
        project=project_id,
        location=location,
        http_options={"api_version": DEFAULT_LIVE_API_VERSION},
    )


def _parse_data_url(data_url: str):
    if not data_url or not isinstance(data_url, str) or not data_url.startswith("data:"):
        return None, None
    header, encoded = data_url.split(",", 1)
    mime_type = header.split(":")[1].split(";")[0] if ":" in header else "application/octet-stream"
    try:
        return mime_type, base64.b64decode(encoded)
    except Exception:
        return None, None


def _coerce_message(raw):
    if isinstance(raw, bytes):
        try:
            raw = raw.decode("utf-8")
        except Exception:
            return None
    if not isinstance(raw, str):
        return None
    raw = raw.strip()
    if not raw:
        return None
    try:
        data = json.loads(raw)
        if isinstance(data, dict):
            return data
    except json.JSONDecodeError:
        return {"type": "input_text", "text": raw}
    return None


async def _send_json(ws, payload):
    try:
        await asyncio.to_thread(ws.send, json.dumps(payload))
    except Exception as e:
        logger.warning(f"[LiveSession] send_json failed for payload type={getattr(payload,'get',lambda k:'?')('type') if isinstance(payload,dict) else type(payload)} error={e}")
        return


async def _close_ws(ws):
    try:
        await asyncio.to_thread(ws.close)
    except Exception:
        return


async def _send_live_input(session, payload, end_of_turn=True):
    if isinstance(payload, dict) and payload.get("data") is not None:
        if hasattr(session, "send_realtime_input"):
            audio_bytes = payload.get("data") or b""
            mime_type = payload.get("mime_type") or "audio/pcm"
            # Google GenAI only allows ONE argument at a time: audio OR audio_stream_end
            # Send audio first if present
            if audio_bytes:
                audio_blob = types.Blob(data=audio_bytes, mime_type=mime_type)
                await session.send_realtime_input(audio=audio_blob)
            # Then send stream end signal separately if end_of_turn
            if end_of_turn:
                await session.send_realtime_input(audio_stream_end=True)
            return
        part = types.Part.from_bytes(
            data=payload.get("data"),
            mime_type=payload.get("mime_type") or "application/octet-stream",
        )
        await session.send_client_content(
            turns=[types.Content(role="user", parts=[part])],
            turn_complete=end_of_turn,
        )
        return
    if hasattr(session, "send_client_content"):
        if isinstance(payload, str):
            part = types.Part(text=payload)
        else:
            part = types.Part(text=str(payload))
        await session.send_client_content(
            turns=[types.Content(role="user", parts=[part])],
            turn_complete=end_of_turn,
        )
        return
    if hasattr(session, "send"):
        await session.send(input=payload, end_of_turn=end_of_turn)
        return
    if isinstance(payload, str):
        part = types.Part(text=payload)
    else:
        part = types.Part(text=str(payload))
    await session.send_client_content(
        turns=[types.Content(role="user", parts=[part])],
        turn_complete=end_of_turn,
    )


async def _handle_client_message(session, ws, message):
    msg_type = message.get("type")
    if msg_type == "config":
        await _send_json(ws, {"type": "error", "message": "Config can only be set on the first message."})
        return True

    if msg_type == "control":
        if message.get("action") in ("close", "stop", "end"):
            return False
        return True

    if msg_type == "input_text":
        await _send_json(ws, {"type": "error", "message": "Audio input only. Use type=input_audio."})
        return True

    if msg_type == "input_audio":
        audio_data = message.get("audio")
        mime_type = message.get("mime_type")
        end_of_turn = message.get("end_of_turn")
        if end_of_turn is None:
            end_of_turn = False
        if isinstance(audio_data, str) and audio_data.startswith("data:"):
            mime_type, audio_bytes = _parse_data_url(audio_data)
        else:
            audio_bytes = None
            if isinstance(audio_data, str):
                try:
                    audio_bytes = base64.b64decode(audio_data)
                except Exception:
                    audio_bytes = None
        if audio_bytes is None or (not audio_bytes and not end_of_turn):
            await _send_json(ws, {"type": "error", "message": "Invalid audio payload."})
            return True
        await _send_live_input(
            session,
            {
                "data": audio_bytes,
                "mime_type": mime_type or "audio/pcm",
            },
            end_of_turn=bool(end_of_turn),
        )
        if end_of_turn:
            # Count completed user turns for fallback gating
            try:
                _handle_client_message.user_turns += 1
            except Exception:
                _handle_client_message.user_turns = 1
        return True

    return True


async def _handle_live_session(ws, client: genai.Client):
    logger.info("Live session started")
    session_start_ts = time.time()
    user_turns = 0
    _handle_client_message.user_turns = 0
    last_activity = time.time()
    session_config = {
        "system_instruction": STYLE_INVESTIGATOR_INSTRUCTION,
        "response_modalities": DEFAULT_LIVE_MODALITIES,
    }
    model_id = DEFAULT_LIVE_MODEL_ID
    voice_name = DEFAULT_LIVE_VOICE

    initial_raw = await asyncio.to_thread(ws.receive)
    if initial_raw is None:
        logger.info("Live session closed before config message")
        return
    logger.info("Live session initial message received: %s", type(initial_raw).__name__)
    initial_msg = _coerce_message(initial_raw)
    initial_user_message = None
    if initial_msg and initial_msg.get("type") == "config":
        model_override = initial_msg.get("model")
        if isinstance(model_override, str) and model_override.strip():
            model_id = model_override.strip()
        modalities = initial_msg.get("response_modalities")
        if isinstance(modalities, list) and modalities:
            session_config["response_modalities"] = modalities
        system_instruction = initial_msg.get("system_instruction")
        if isinstance(system_instruction, str) and system_instruction.strip():
            session_config["system_instruction"] = system_instruction.strip()
        voice_override = initial_msg.get("voice")
        if isinstance(voice_override, str) and voice_override.strip():
            voice_name = voice_override.strip()
    elif initial_msg:
        initial_user_message = initial_msg

    response_modalities = session_config["response_modalities"]
    if "TEXT" not in response_modalities:
        # Native audio preview models can reject TEXT in response modalities.
        if "native-audio" not in (model_id or ""):
            response_modalities = [*response_modalities, "TEXT"]
            session_config["response_modalities"] = response_modalities
    speech_config = None
    if "AUDIO" in response_modalities:
        speech_config = types.SpeechConfig(
            voice_config=types.VoiceConfig(
                prebuilt_voice_config=types.PrebuiltVoiceConfig(
                    voice_name=voice_name
                )
            )
        )

    live_config = types.LiveConnectConfig(
        response_modalities=response_modalities,
        speech_config=speech_config,
        context_window_compression=types.ContextWindowCompressionConfig(
            trigger_tokens=25600,
            sliding_window=types.SlidingWindow(target_tokens=12800),
        ),
        system_instruction=types.Content(
            parts=[types.Part.from_text(text=session_config["system_instruction"])],
        ),
    )

    try:
        async with client.aio.live.connect(model=model_id, config=live_config) as session:
            await _send_json(ws, {"type": "ready", "model": model_id})
            if not initial_user_message:
                # Start the conversation with explicit instruction to follow the output format
                await _send_live_input(session, "Begin. When you have gathered enough information, you MUST say exactly: 'This has been so helpful! I have a really good sense of your style now. I'm going to get to work on your personalized catalog.' Do not add any other farewell. IMMEDIATELY after that sentence, output the style payload between ---BEGIN_STYLE_PAYLOAD--- and ---END_STYLE_PAYLOAD--- markers.", end_of_turn=True)

            payload_parts = []
            payload_complete = False
            in_payload = False
            buffer = ""
            recent_text = ""
            recent_text_limit = 8000
            force_timeout_task = None
            pending_force_task = None

            def _touch_activity():
                nonlocal last_activity
                last_activity = time.time()

            def _append_recent_text(chunk: str):
                nonlocal recent_text
                if not chunk:
                    return
                recent_text += chunk
                if len(recent_text) > recent_text_limit:
                    recent_text = recent_text[-recent_text_limit:]
                _touch_activity()

            def _normalized_recent_tail():
                tail = recent_text[-600:]
                if not tail:
                    return ""
                cleaned = (
                    tail.lower()
                    .replace("’", "'")
                    .replace("‘", "'")
                    .replace("`", "'")
                    .replace("*", "")
                    .replace("_", "")
                )
                return " ".join(cleaned.split())

            async def _send_minimal_and_close(reason: str):
                nonlocal payload_complete
                # Always send a session_end so the client can close cleanly.
                if not payload_complete:
                    payload_complete = True
                    minimal_payload = f"""{BEGIN_PAYLOAD}
[USER INTENT]:
[ESTABLISHED STYLE]:
[STYLE ASPIRATIONS]:
[FASHION PERSONALITY]:
{END_PAYLOAD}"""
                    await _send_json(ws, {"type": "style_payload", "payload": minimal_payload})
                    await asyncio.sleep(0.05)
                await _send_json(ws, {"type": "session_end", "reason": reason})
                # Do NOT close server-side; let client close to avoid frame errors
                return True

            async def _grace_force(reason: str, delay: float = 1.5):
                nonlocal pending_force_task
                try:
                    await asyncio.sleep(delay)
                    if payload_complete:
                        return True
                    return await _send_minimal_and_close(reason)
                finally:
                    pending_force_task = None

            async def _schedule_force(reason: str, delay: float = 1.5):
                nonlocal pending_force_task
                if payload_complete:
                    return True
                if pending_force_task:
                    return True
                _touch_activity()
                pending_force_task = asyncio.create_task(_grace_force(reason, delay))
                return True

            async def _maybe_force_payload():
                nonlocal payload_complete
                if in_payload or payload_complete:
                    return False
                _touch_activity()
                recent_tail = _normalized_recent_tail()
                if not recent_tail:
                    return False
                # If explicit end phrase is present, bypass thresholds
                explicit_end = any(
                    phrase in recent_tail
                    for phrase in [
                        "i have gathered enough information",
                        "i've gathered enough information",
                        "have gathered enough information",
                        "that's enough information",
                    ]
                )
                # Don't force early; require some interaction or time unless explicit end
                elapsed = time.time() - session_start_ts
                current_turns = getattr(_handle_client_message, "user_turns", 0)
                if not explicit_end and current_turns < 3 and elapsed < 60:
                    return False
                if (
                    "concluding the session" in recent_tail
                    or "session complete" in recent_tail
                    or "concluding session" in recent_tail
                    or "concluding the decision flow" in recent_tail
                    or "concluding decision flow" in recent_tail
                    or "concluding the decision" in recent_tail
                    or "concluding the discovery phase" in recent_tail
                    or "concluding discovery phase" in recent_tail
                    or "discovery phase concluded" in recent_tail
                    or "concluding the inquiry" in recent_tail
                    or "concluding inquiry" in recent_tail
                    or "finalizing the analysis" in recent_tail
                    or "finalising the analysis" in recent_tail
                    or "natural exit point" in recent_tail
                    or "acknowledging complete task" in recent_tail
                    or "acknowledge complete task" in recent_tail
                    or "confirm the completion" in recent_tail
                    or "completion of all tasks" in recent_tail
                    or "completed all tasks" in recent_tail
                    or "all tasks as per the instructions" in recent_tail
                    or explicit_end
                ):
                    logger.info(f"[LiveSession] URGENT: Detected concluding marker - forcing payload send; recent_tail='{recent_tail}'")
                    return await _schedule_force("concluding_detected", 1.5)

                exit_phrases = [
                    "i'll talk to you soon",
                    "ill talk to you soon",
                    "talk to you soon",
                    "talk to you soon!",
                    "talk to you soon.",
                    "talk soon",
                    "talk soon!",
                    "personalized catalog",
                    "personalised catalogue",
                    "goodbye",
                    "bye for now",
                    "this has been so helpful",
                    "i have a really good sense",
                    "i have gathered enough information",
                    "i've gathered enough information",
                    "have gathered enough information",
                    "gathered enough information",
                    "i have enough information",
                    "i've got enough information",
                    "that's enough information",
                    "i'm going to get to work",
                    "im going to get to work",
                    "i will get to work",
                    "i'll get to work",
                    "ill get to work",
                    "i'm going to get to work on your personalized catalog",
                    "i will get to work on your personalized catalog",
                    "i'll get to work on your personalized catalog",
                    "ill get to work on your personalized catalog",
                    "i'm going to get to work on your personalised catalogue",
                    "i will get to work on your personalised catalogue",
                    "i'll get to work on your personalised catalogue",
                    "ill get to work on your personalised catalogue",
                    "wrap up here",
                    "that covers everything",
                    "that's everything i need",
                    "that is everything i need",
                    "we're done here",
                    "we are done here",
                ]
                if any(phrase in recent_tail for phrase in exit_phrases):
                    logger.info(f"[LiveSession] Detected natural exit phrase")
                    # Send the payload quickly; client is responsible for delaying navigation
                    # long enough to let the goodbye audio finish playing.
                    return await _schedule_force("natural_exit_detected", 0.5)
                return False

            async def _force_timeout():
                nonlocal payload_complete
                nonlocal last_activity
                try:
                    while True:
                        await asyncio.sleep(5)
                        if payload_complete:
                            return
                        idle = time.time() - last_activity
                        # Only force after long idle (5 minutes) to avoid premature cutoff
                        if idle >= 300:
                            break
                except asyncio.CancelledError:
                    return
                if payload_complete:
                    return
                logger.info("[LiveSession] Timeout reached without payload - forcing minimal payload")
                await _schedule_force("timeout_force_payload", 0.5)

            async def handle_text_chunk(chunk: str):
                nonlocal buffer, in_payload, payload_complete
                if not chunk:
                    return
                logger.info(f"[LiveSession] Text chunk received ({len(chunk)} chars): {chunk[:100]}...")
                # Direct check for payload markers
                if BEGIN_PAYLOAD in chunk:
                    logger.info(f"[LiveSession] DETECTED BEGIN_PAYLOAD marker in chunk!")
                if END_PAYLOAD in chunk:
                    logger.info(f"[LiveSession] DETECTED END_PAYLOAD marker in chunk!")
                buffer += chunk
                _append_recent_text(chunk)
                logger.info(f"[LiveSession] Buffer state: in_payload={in_payload}, buffer_len={len(buffer)}, payload_parts={len(payload_parts)}")
                
                # Safety check: if buffer gets too large without finding markers, log a warning
                if len(buffer) > 10000 and not in_payload:
                    logger.warning(f"[LiveSession] Buffer growing large without finding BEGIN_PAYLOAD. Buffer preview: {buffer[:200]}...")
                
                if await _maybe_force_payload():
                    return
                
                while buffer:
                    if not in_payload:
                        begin_index = buffer.find(BEGIN_PAYLOAD)
                        if begin_index == -1:
                            safe_len = max(0, len(buffer) - (len(BEGIN_PAYLOAD) - 1))
                            if safe_len:
                                await _send_json(ws, {"type": "assistant_text", "text": buffer[:safe_len]})
                                buffer = buffer[safe_len:]
                            else:
                                break
                        else:
                            if begin_index:
                                await _send_json(ws, {"type": "assistant_text", "text": buffer[:begin_index]})
                                logger.info(f"[LiveSession] Sent assistant_text: {buffer[:begin_index][:100]}...")
                            buffer = buffer[begin_index + len(BEGIN_PAYLOAD):]
                            in_payload = True
                    else:
                        end_index = buffer.find(END_PAYLOAD)
                        if end_index == -1:
                            payload_parts.append(buffer)
                            buffer = ""
                        else:
                            if end_index:
                                payload_parts.append(buffer[:end_index])
                            buffer = buffer[end_index + len(END_PAYLOAD):]
                            payload_complete = True
                            in_payload = False
                            payload = "".join(payload_parts).strip()
                            logger.info(f"[LiveSession] Payload captured: {payload[:200]}...")
                            # Send payload and session_end, then wait a moment before closing
                            # to ensure client receives the messages
                            await _send_json(ws, {"type": "style_payload", "payload": payload})
                            logger.info("[LiveSession] Sent style_payload")
                            await asyncio.sleep(0.5)  # Give client time to process
                            await _send_json(ws, {"type": "session_end", "reason": "style_payload_captured"})
                            logger.info("[LiveSession] Sent session_end")
                            await asyncio.sleep(0.5)  # Give client time to receive
                            await _close_ws(ws)
                            return

            async def handle_signal_chunk(chunk: str):
                if not chunk:
                    return
                _append_recent_text(chunk)
                await _maybe_force_payload()

            async def pump_from_client():
                if initial_user_message:
                    await _handle_client_message(session, ws, initial_user_message)
                nonlocal force_timeout_task
                if force_timeout_task is None:
                    force_timeout_task = asyncio.create_task(_force_timeout())
                while True:
                    raw = await asyncio.to_thread(ws.receive)
                    if raw is None:
                        break
                    message = _coerce_message(raw)
                    if not message:
                        continue
                    
                    # Check if user is trying to end the session
                    msg_type = message.get("type", "")
                    if msg_type == "input_text":
                        text = message.get("text", "").lower().strip()
                        if any(phrase in text for phrase in ["i'm done", "thats it", "that's it", "i am done", "done", "end", "finish", "complete"]):
                            logger.info(f"[LiveSession] User signaled end of conversation: {text}")
                    
                    should_continue = await _handle_client_message(session, ws, message)
                    if not should_continue:
                        break

            async def pump_from_model():
                nonlocal force_timeout_task
                if force_timeout_task is None:
                    force_timeout_task = asyncio.create_task(_force_timeout())
                while True:
                    try:
                        turn = session.receive()
                        async for response in turn:
                            # Handle server_content format (primary for newer API)
                            server_content = getattr(response, "server_content", None)
                            if server_content:
                                model_turn = getattr(server_content, "model_turn", None)
                                if model_turn:
                                    parts = getattr(model_turn, "parts", [])
                                    for part in parts:
                                        if getattr(part, "text", None):
                                            logger.info(f"[LiveSession] Got text from server_content: {part.text[:100]}...")
                                            await handle_text_chunk(part.text)
                                            if payload_complete:
                                                return
                                        if getattr(part, "thought", None):
                                            await handle_signal_chunk(str(part.thought))
                                        if getattr(part, "inline_data", None):
                                            _touch_activity()
                                            audio_bytes = part.inline_data.data
                                            mime_type = part.inline_data.mime_type or "audio/pcm;rate=24000"
                                            audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
                                            await _send_json(ws, {"type": "assistant_audio", "audio": audio_b64, "mime_type": mime_type})
                                continue
                            
                            # Handle direct text/data format (fallback)
                            if getattr(response, "text", None):
                                logger.info(f"[LiveSession] Got text from response.text: {response.text[:100]}...")
                                await handle_text_chunk(response.text)
                                if payload_complete:
                                    return
                            if getattr(response, "thought", None):
                                await handle_signal_chunk(str(response.thought))
                            if getattr(response, "data", None):
                                last_activity = time.time()
                                audio_bytes = response.data
                                mime_type = getattr(response, "mime_type", None) or "audio/pcm;rate=24000"
                                audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
                                await _send_json(ws, {"type": "assistant_audio", "audio": audio_b64, "mime_type": mime_type})
                    except Exception as e:
                        logger.warning(f"Primary receive loop error: {e}")
                        # Fallback to alternative API format
                        try:
                            async for message in session.receive():
                                if not message:
                                    continue
                                # Try server_content format
                                server_content = getattr(message, "server_content", None)
                                if server_content:
                                    model_turn = getattr(server_content, "model_turn", None)
                                    if model_turn and getattr(model_turn, "parts", None):
                                        for part in model_turn.parts:
                                            if getattr(part, "text", None):
                                                await handle_text_chunk(part.text)
                                                if payload_complete:
                                                    return
                                            if getattr(part, "thought", None):
                                                await handle_signal_chunk(str(part.thought))
                                            if getattr(part, "inline_data", None):
                                                _touch_activity()
                                                audio_bytes = part.inline_data.data
                                                mime_type = part.inline_data.mime_type or "audio/pcm;rate=24000"
                                                audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
                                                await _send_json(ws, {"type": "assistant_audio", "audio": audio_b64, "mime_type": mime_type})
                                # Try direct text/data format
                                if getattr(message, "text", None):
                                    await handle_text_chunk(message.text)
                                    if payload_complete:
                                        return
                                if getattr(message, "thought", None):
                                    await handle_signal_chunk(str(message.thought))
                                if getattr(message, "data", None):
                                    _touch_activity()
                                    audio_bytes = message.data
                                    mime_type = getattr(message, "mime_type", None) or "audio/pcm;rate=24000"
                                    audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
                                    await _send_json(ws, {"type": "assistant_audio", "audio": audio_b64, "mime_type": mime_type})
                        except Exception as e2:
                            logger.error(f"Fallback receive loop error: {e2}")
                            # Don't exit - keep trying to receive
                            await asyncio.sleep(0.1)

            client_task = asyncio.create_task(pump_from_client())
            model_task = asyncio.create_task(pump_from_model())

            done, pending = await asyncio.wait(
                [client_task, model_task],
                return_when=asyncio.FIRST_COMPLETED,
            )

            if force_timeout_task:
                force_timeout_task.cancel()

            for task in pending:
                task.cancel()
            if not payload_complete:
                await _send_json(ws, {"type": "session_end", "reason": "client_closed"})
                await _close_ws(ws)
    except Exception as e:
        logger.exception("Live session error")
        await _send_json(ws, {"type": "error", "message": f"Live session error: {str(e)}"})
        await _close_ws(ws)


@app.route('/')
def serve_frontend():
    return send_from_directory(os.getcwd(), 'artizia.html')


@sock.route("/api/live")
def live(ws):
    try:
        logger.info(
            "Live WS connect: origin=%s upgrade=%s connection=%s key=%s",
            request.headers.get("Origin"),
            request.headers.get("Upgrade"),
            request.headers.get("Connection"),
            request.headers.get("Sec-WebSocket-Key"),
        )
    except Exception:
        logger.exception("Live WS connect logging failed")
    client = _build_live_client()
    if not client:
        ws.send(json.dumps({"type": "error", "message": "Live credentials not configured."}))
        return
    asyncio.run(_handle_live_session(ws, client))


@app.route('/api/sessions', methods=['POST'])
def create_session():
    if not DATABASE_URL:
        return jsonify({'error': 'Database not configured.'}), 500
    try:
        data = request.get_json(silent=True) or {}
        preferences = data.get('preferences')
        if not isinstance(preferences, dict):
            return jsonify({'error': 'preferences must be an object'}), 400

        session_id = normalize_session_id(data.get('sessionId') or data.get('session_id'))
        if not session_id:
            session_id = str(uuid.uuid4())

        system_prompt = data.get('systemPrompt') or data.get('system_prompt')
        user_agent = data.get('userAgent') or data.get('user_agent')
        locale = data.get('locale')
        timezone = data.get('timezone')

        upsert_session(session_id, preferences, system_prompt, user_agent, locale, timezone)
        return jsonify({'success': True, 'sessionId': session_id})
    except Exception as e:
        logger.exception("Session creation error")
        return jsonify({'error': str(e)}), 500


@app.route('/api/sessions/<session_id>/turns', methods=['POST'])
def create_session_turn(session_id):
    if not DATABASE_URL:
        return jsonify({'error': 'Database not configured.'}), 500
    normalized_session_id = normalize_session_id(session_id)
    if not normalized_session_id:
        return jsonify({'error': 'Invalid session id.'}), 400
    try:
        data = request.get_json(silent=True) or {}
        turn_index_raw = data.get('turnIndex') if 'turnIndex' in data else data.get('turn_index')
        try:
            turn_index = int(turn_index_raw)
        except (TypeError, ValueError):
            return jsonify({'error': 'turnIndex must be an integer.'}), 400
        if turn_index < 1:
            return jsonify({'error': 'turnIndex must be >= 1.'}), 400

        user_message = str(data.get('userMessage', '')).strip()
        assistant_response = data.get('assistantResponse')
        if not user_message:
            return jsonify({'error': 'userMessage is required.'}), 400
        if not isinstance(assistant_response, dict):
            return jsonify({'error': 'assistantResponse must be an object.'}), 400

        feedback = data.get('feedback')
        if feedback in ("", None):
            feedback = None
        elif feedback not in ("up", "down"):
            return jsonify({'error': 'feedback must be "up" or "down".'}), 400

        image_key = None
        image_url = None
        image_data = data.get('imageData')
        if image_data:
            image_mime, image_bytes = parse_data_url(image_data)
            if image_bytes:
                image_key = build_media_key(normalized_session_id, turn_index, "image.png")
                image_url = upload_to_r2(image_key, image_bytes, image_mime or "image/png")

        video_key = None
        video_url = None
        video_data = data.get('videoData')
        video_uri = data.get('videoUri')
        video_mime = None
        video_bytes = None
        if video_data:
            video_mime, video_bytes = parse_data_url(video_data)
        elif video_uri:
            video_mime = "video/mp4"
            video_bytes = fetch_video_bytes(video_uri)

        if video_bytes:
            video_key = build_media_key(normalized_session_id, turn_index, "video.mp4")
            video_url = upload_to_r2(video_key, video_bytes, video_mime or "video/mp4")

        upsert_turn(
            normalized_session_id,
            turn_index,
            user_message,
            assistant_response,
            feedback,
            image_key,
            image_url,
            video_key,
            video_url,
        )

        return jsonify({'success': True})
    except Exception as e:
        logger.exception("Session turn logging error")
        return jsonify({'error': str(e)}), 500


@app.route('/api/sessions/<session_id>/turns/<int:turn_index>/feedback', methods=['POST'])
def update_session_feedback(session_id, turn_index):
    if not DATABASE_URL:
        return jsonify({'error': 'Database not configured.'}), 500
    normalized_session_id = normalize_session_id(session_id)
    if not normalized_session_id:
        return jsonify({'error': 'Invalid session id.'}), 400
    try:
        data = request.get_json(silent=True) or {}
        feedback = data.get('feedback')
        if feedback in ("", None):
            feedback = None
        elif feedback not in ("up", "down"):
            return jsonify({'error': 'feedback must be "up" or "down".'}), 400

        voter_id = normalize_uuid(data.get('voterId') or data.get('voter_id'))

        with get_db_connection() as conn:
            with conn.cursor() as cur:
                if voter_id:
                    cur.execute(
                        """
                        SELECT 1 FROM session_turns
                        WHERE session_id = %s AND turn_index = %s
                        """,
                        (normalized_session_id, turn_index),
                    )
                    if cur.fetchone() is None:
                        return jsonify({'error': 'Session turn not found.'}), 404
                    if feedback is None:
                        cur.execute(
                            """
                            DELETE FROM session_turn_votes
                            WHERE session_id = %s AND turn_index = %s AND voter_id = %s
                            """,
                            (normalized_session_id, turn_index, voter_id),
                        )
                    else:
                        cur.execute(
                            """
                            INSERT INTO session_turn_votes (session_id, turn_index, voter_id, vote, updated_at)
                            VALUES (%s, %s, %s, %s, now())
                            ON CONFLICT (session_id, turn_index, voter_id) DO UPDATE SET
                                vote = EXCLUDED.vote,
                                updated_at = now()
                            """,
                            (normalized_session_id, turn_index, voter_id, feedback),
                        )

                    cur.execute(
                        """
                        SELECT feedback
                        FROM session_turns
                        WHERE session_id = %s AND turn_index = %s
                        """,
                        (normalized_session_id, turn_index),
                    )
                    session_feedback_row = cur.fetchone()
                    session_feedback = session_feedback_row[0] if session_feedback_row else None

                    cur.execute(
                        """
                        SELECT
                            COALESCE(SUM(CASE WHEN vote = 'up' THEN 1 ELSE 0 END), 0) AS up_votes,
                            COALESCE(SUM(CASE WHEN vote = 'down' THEN 1 ELSE 0 END), 0) AS down_votes
                        FROM session_turn_votes
                        WHERE session_id = %s AND turn_index = %s
                        """,
                        (normalized_session_id, turn_index),
                    )
                    totals_row = cur.fetchone()
                    up_votes = totals_row[0] if totals_row else 0
                    down_votes = totals_row[1] if totals_row else 0
                    total_up = up_votes + (1 if session_feedback == "up" else 0)
                    total_down = down_votes + (1 if session_feedback == "down" else 0)

                    return jsonify(
                        {
                            "success": True,
                            "upVotes": int(total_up),
                            "downVotes": int(total_down),
                            "viewerFeedback": feedback or "",
                        }
                    )
                else:
                    cur.execute(
                        """
                        UPDATE session_turns
                        SET feedback = %s
                        WHERE session_id = %s AND turn_index = %s
                        """,
                        (feedback, normalized_session_id, turn_index),
                    )
                    if cur.rowcount == 0:
                        return jsonify({'error': 'Session turn not found.'}), 404

        return jsonify({'success': True})
    except Exception as e:
        logger.exception("Session feedback update error")
        return jsonify({'error': str(e)}), 500


@app.route('/api/sessions/<session_id>/turns/<int:turn_index>', methods=['GET'])
def get_session_turn(session_id, turn_index):
    if not DATABASE_URL:
        return jsonify({'error': 'Database not configured.'}), 500
    normalized_session_id = normalize_session_id(session_id)
    if not normalized_session_id:
        return jsonify({'error': 'Invalid session id.'}), 400
    if turn_index < 1:
        return jsonify({'error': 'turn_index must be >= 1.'}), 400
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT assistant_response
                    FROM session_turns
                    WHERE session_id = %s AND turn_index = %s
                    """,
                    (normalized_session_id, turn_index),
                )
                row = cur.fetchone()
                if row is None:
                    return jsonify({'error': 'Session turn not found.'}), 404
                assistant_response = row[0]

        if not isinstance(assistant_response, dict):
            return jsonify({'error': 'Invalid assistant response.'}), 500

        return jsonify({'success': True, 'assistantResponse': assistant_response})
    except Exception as e:
        logger.exception("Session turn fetch error")
        return jsonify({'error': str(e)}), 500


@app.route('/api/sessions/<session_id>/chips', methods=['POST'])
def generate_session_chips(session_id):
    if not DATABASE_URL:
        return jsonify({'error': 'Database not configured.'}), 500
    if not gemini_client:
        return jsonify({'error': 'Gemini client not initialized (API key missing)'}), 500
    normalized_session_id = normalize_session_id(session_id)
    if not normalized_session_id:
        return jsonify({'error': 'Invalid session id.'}), 400
    try:
        data = request.get_json(silent=True) or {}
        turn_index_raw = data.get('turnIndex') if 'turnIndex' in data else data.get('turn_index')
        try:
            turn_index = int(turn_index_raw)
        except (TypeError, ValueError):
            return jsonify({'error': 'turnIndex must be an integer.'}), 400
        if turn_index < 0:
            return jsonify({'error': 'turnIndex must be >= 0.'}), 400

        preferences, _system_prompt = fetch_session_preferences(normalized_session_id)
        if preferences is None:
            return jsonify({'error': 'Session not found.'}), 404

        conversation_history = data.get('conversationHistory') or data.get('conversation_history')
        if not isinstance(conversation_history, list):
            conversation_history = fetch_session_turns(normalized_session_id)

        if len(conversation_history) > 6:
            conversation_history = conversation_history[-6:]

        history_text = ""
        for i, exchange in enumerate(conversation_history, 1):
            user_msg = exchange.get('user', '')
            assistant_response = exchange.get('assistant', {})
            history_text += f"--- Exchange {i} ---\n"
            history_text += f"User: {user_msg}\n"
            history_text += f"Recommendation: {json.dumps(assistant_response, indent=2)}\n\n"

        system_context_lines = []

        client_time = data.get('clientTime') or data.get('client_time') or {}
        if not isinstance(client_time, dict):
            client_time = {}
        client_local_datetime = str(
            client_time.get('localDateTime')
            or client_time.get('local_date_time')
            or data.get('clientLocalDateTime')
            or data.get('client_local_date_time')
            or ''
        ).strip()
        client_timezone = str(
            client_time.get('timezone')
            or data.get('clientTimezone')
            or data.get('client_timezone')
            or ''
        ).strip()
        client_locale = str(
            client_time.get('locale')
            or data.get('clientLocale')
            or data.get('client_locale')
            or ''
        ).strip()

        if client_local_datetime:
            if client_timezone:
                system_context_lines.append(
                    f"User local datetime: {client_local_datetime} ({client_timezone})"
                )
            else:
                system_context_lines.append(f"User local datetime: {client_local_datetime}")
        elif client_timezone:
            system_context_lines.append(f"User timezone: {client_timezone}")

        if client_locale:
            system_context_lines.append(f"User locale: {client_locale}")

        client_location = data.get('clientLocation') or data.get('client_location') or {}
        if not isinstance(client_location, dict):
            client_location = {}

        zip_code = str(
            client_location.get('zipCode')
            or client_location.get('zip_code')
            or client_location.get('postalCode')
            or client_location.get('postal_code')
            or ''
        ).strip()

        latitude = safe_float(client_location.get('latitude') or client_location.get('lat'))
        longitude = safe_float(
            client_location.get('longitude')
            or client_location.get('lon')
            or client_location.get('lng')
        )

        pref_location = {}
        if isinstance(preferences, dict):
            if not zip_code:
                zip_code = str(
                    preferences.get('zipCode')
                    or preferences.get('zip_code')
                    or ''
                ).strip()
            pref_location = (
                preferences.get('location')
                if isinstance(preferences.get('location'), dict)
                else {}
            )
            if latitude is None:
                latitude = safe_float(
                    pref_location.get('latitude')
                    or preferences.get('latitude')
                    or preferences.get('lat')
                )
            if longitude is None:
                longitude = safe_float(
                    pref_location.get('longitude')
                    or preferences.get('longitude')
                    or preferences.get('lon')
                    or preferences.get('lng')
                )

        if zip_code:
            system_context_lines.append(f"User zip code: {zip_code}")

        geo_result = None
        if (latitude is None or longitude is None) and zip_code:
            language_hint = client_locale.split("-")[0] if client_locale else "en"
            geo_result = geocode_zip(zip_code, language=language_hint)
            if geo_result:
                latitude = geo_result.get("latitude")
                longitude = geo_result.get("longitude")

        use_imperial = True
        if client_locale:
            use_imperial = client_locale.lower().startswith("en-us")
        if geo_result and geo_result.get("country_code") == "US":
            use_imperial = True

        weather_summary = fetch_current_weather(
            latitude,
            longitude,
            use_imperial=use_imperial,
        )
        if weather_summary:
            location_label_parts = []
            if geo_result and isinstance(geo_result, dict):
                name = geo_result.get("name")
                admin1 = geo_result.get("admin1")
                country = geo_result.get("country")
                if name and admin1:
                    location_label_parts.append(f"{name}, {admin1}")
                elif name:
                    location_label_parts.append(str(name))
                elif admin1:
                    location_label_parts.append(str(admin1))
                if country:
                    location_label_parts.append(str(country))
            if zip_code:
                location_label_parts.append(f"ZIP {zip_code}")
            location_label = " 路 ".join([part for part in location_label_parts if part])
            if location_label:
                system_context_lines.append(
                    f"Current weather ({location_label}): {weather_summary}"
                )
            else:
                system_context_lines.append(f"Current weather: {weather_summary}")

        profile_text = _build_chip_profile(preferences)
        context_prompt = CHIPS_PROMPT.strip()
        if profile_text:
            context_prompt += f"\n\nUSER PROFILE:\n{profile_text}"
        if system_context_lines:
            context_prompt += "\n\nCONTEXT:\n" + "\n".join(f"- {line}" for line in system_context_lines)
        if history_text:
            context_prompt += "\n\nCONVERSATION HISTORY:\n" + history_text

        response = gemini_client.models.generate_content(
            model=CHIPS_MODEL,
            contents=context_prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.6,
                thinking_config=types.ThinkingConfig(
                    include_thoughts=False,
                    thinking_level="MINIMAL",
                ),
            ),
        )

        if not response or not response.candidates:
            return jsonify({'error': 'No chips returned.'}), 500

        raw_text = ""
        for part in response.candidates[0].content.parts:
            chunk_text = getattr(part, "text", None)
            if chunk_text:
                raw_text += chunk_text

        cleaned = clean_jsonish_text(raw_text)
        try:
            payload = json.loads(cleaned)
        except json.JSONDecodeError:
            return jsonify({'error': 'Invalid chips response.'}), 500

        chips = payload.get("chips") if isinstance(payload, dict) else None
        if not isinstance(chips, list):
            return jsonify({'error': 'chips must be an array.'}), 500

        normalized = []
        seen = set()
        for value in chips:
            text = _normalize_chip_text(value)
            if not text:
                continue
            if text in seen:
                continue
            seen.add(text)
            normalized.append(text)

        if len(normalized) < 3:
            return jsonify({'error': 'chips must include 3 values.'}), 500

        normalized = normalized[:3]
        upsert_session_chips(normalized_session_id, turn_index, normalized)

        return jsonify({'chips': normalized})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/community/looks', methods=['GET'])
def fetch_community_looks():
    if not DATABASE_URL:
        return jsonify({'error': 'Database not configured.'}), 500
    try:
        voter_id = normalize_uuid(request.args.get('voterId') or request.args.get('voter_id'))
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    WITH vote_totals AS (
                        SELECT
                            session_id,
                            turn_index,
                            COALESCE(SUM(CASE WHEN vote = 'up' THEN 1 ELSE 0 END), 0) AS up_votes,
                            COALESCE(SUM(CASE WHEN vote = 'down' THEN 1 ELSE 0 END), 0) AS down_votes
                        FROM session_turn_votes
                        GROUP BY session_id, turn_index
                    ),
                    viewer_vote AS (
                        SELECT session_id, turn_index, vote AS viewer_vote
                        FROM session_turn_votes
                        WHERE voter_id = %s
                    ),
                    ranked AS (
                        SELECT
                            st.session_id,
                            st.turn_index,
                            st.feedback,
                            st.image_url,
                            st.image_key,
                            st.created_at,
                            COALESCE(vt.up_votes, 0) AS up_votes,
                            COALESCE(vt.down_votes, 0) AS down_votes,
                            COALESCE(vt.up_votes, 0) + CASE WHEN st.feedback = 'up' THEN 1 ELSE 0 END AS total_up,
                            COALESCE(vt.down_votes, 0) + CASE WHEN st.feedback = 'down' THEN 1 ELSE 0 END AS total_down,
                            vv.viewer_vote
                        FROM session_turns st
                        LEFT JOIN vote_totals vt
                            ON vt.session_id = st.session_id AND vt.turn_index = st.turn_index
                        LEFT JOIN viewer_vote vv
                            ON vv.session_id = st.session_id AND vv.turn_index = st.turn_index
                        WHERE (st.image_url IS NOT NULL OR st.image_key IS NOT NULL)
                    ),
                    top_three AS (
                        SELECT *
                        FROM ranked
                        ORDER BY total_up DESC, total_down ASC, created_at DESC
                        LIMIT 3
                    ),
                    random_three AS (
                        SELECT *
                        FROM ranked
                        WHERE (session_id, turn_index) NOT IN (
                            SELECT session_id, turn_index FROM top_three
                        )
                        AND (
                            (total_up = 0 AND total_down = 0)
                            OR (total_up::numeric >= 1.5 * total_down)
                        )
                        ORDER BY random()
                        LIMIT 3
                    )
                    SELECT
                        session_id,
                        turn_index,
                        feedback,
                        image_url,
                        image_key,
                        created_at,
                        up_votes,
                        down_votes,
                        total_up,
                        total_down,
                        viewer_vote
                    FROM top_three
                    UNION ALL
                    SELECT
                        session_id,
                        turn_index,
                        feedback,
                        image_url,
                        image_key,
                        created_at,
                        up_votes,
                        down_votes,
                        total_up,
                        total_down,
                        viewer_vote
                    FROM random_three
                    """
                    ,
                    (voter_id,)
                )
                rows = cur.fetchall()

        looks = []
        for session_id, turn_index, feedback, image_url, image_key, created_at, up_votes, down_votes, total_up, total_down, viewer_vote in rows:
            resolved_url = None
            if image_key:
                try:
                    resolved_url = build_signed_r2_url(image_key)
                except Exception:
                    resolved_url = build_r2_url(image_key)
            if not resolved_url:
                resolved_url = image_url
            if not resolved_url:
                continue
            looks.append(
                {
                    "sessionId": str(session_id),
                    "turnIndex": int(turn_index),
                    "imageUrl": resolved_url,
                    "feedback": feedback or "",
                    "upVotes": int(total_up or 0),
                    "downVotes": int(total_down or 0),
                    "viewerFeedback": viewer_vote or "",
                }
            )

        return jsonify({"looks": looks})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


def is_follow_up_request(user_input):
    """Detect if the user input is a follow-up/modification request."""
    follow_up_keywords = [
        'change', 'swap', 'replace', 'different', 'another', 'instead',
        'modify', 'update', 'switch', 'prefer', 'don\'t like', 'not like',
        'something else', 'other option', 'alternative', 'warmer', 'cooler',
        'more casual', 'more formal', 'less', 'more', 'keep the', 'but',
        'whole outfit', 'full outfit', 'complete outfit', 'not just', 'not only',
        'add more', 'need more', 'want more', 'standalone', 'single item'
    ]
    user_lower = user_input.lower()
    return any(keyword in user_lower for keyword in follow_up_keywords)


def build_clothing_description(outfit_items):
    item_names = [
        item.get('item_name') for item in outfit_items if item.get('item_name')
    ]
    if not item_names:
        return "the outfit"
    if len(item_names) == 1:
        return item_names[0]
    if len(item_names) == 2:
        return f"{item_names[0]} and {item_names[1]}"
    return f"{', '.join(item_names[:-1])}, and {item_names[-1]}"


def generate_video_from_image(image_bytes, clothing_description, mime_type):
    video_prompt = VIDOE_GENERATION_PROMPT.format(
        clothing_description=clothing_description
    )
    source = types.GenerateVideosSource(
        prompt=video_prompt,
        image=types.Image(image_bytes=image_bytes, mime_type=mime_type),
    )
    config = types.GenerateVideosConfig(
        number_of_videos=1,
        aspect_ratio="9:16",
        resolution="720p",
        person_generation="allow_adult",
    )
    logger.info(f"Sending reference image and prompt to {VIDEO_GEN_MODEL}...")
    operation = gemini_client.models.generate_videos(
        model=VIDEO_GEN_MODEL,
        source=source,
        config=config,
    )
    start_time = time.time()
    while not operation.done:
        if time.time() - start_time > VIDEO_MAX_WAIT_SECONDS:
            raise RuntimeError("Video generation timed out while polling the operation.")
        time.sleep(VIDEO_POLL_INTERVAL_SECONDS)
        operation = gemini_client.operations.get(operation)

    if operation.error:
        error_payload = operation.error
        if hasattr(error_payload, "to_dict"):
            error_payload = error_payload.to_dict()
        raise RuntimeError(f"Video generation failed: {error_payload}")

    def dump_genai_payload(obj):
        if obj is None:
            return None
        if hasattr(obj, "model_dump"):
            try:
                return obj.model_dump(exclude_none=True)
            except TypeError:
                return obj.model_dump()
        if hasattr(obj, "to_dict"):
            return obj.to_dict()
        if hasattr(obj, "__dict__"):
            return obj.__dict__
        return str(obj)

    if hasattr(operation, "to_dict") or hasattr(operation, "model_dump"):
        logger.info(
            "Video generation operation payload: %s",
            json.dumps(dump_genai_payload(operation), default=str),
        )

    response = operation.response or operation.result
    if response is None:
        logger.warning("Video generation returned no response payload.")
    elif hasattr(response, "to_dict") or hasattr(response, "model_dump"):
        logger.info(
            "Video generation response payload: %s",
            json.dumps(dump_genai_payload(response), default=str),
        )
    else:
        logger.info("Video generation response type: %s", type(response))
    if response:
        filtered_count = getattr(response, "rai_media_filtered_count", None)
        filtered_reasons = getattr(response, "rai_media_filtered_reasons", None)
        if filtered_count or filtered_reasons:
            raise RuntimeError(
                f"Video generation filtered: count={filtered_count}, reasons={filtered_reasons}"
            )
    if not response or not response.generated_videos:
        raise RuntimeError("No videos were generated.")

    video_obj = response.generated_videos[0].video
    if not video_obj or not video_obj.uri:
        raise RuntimeError("Generated video is missing a URI.")

    return video_obj.uri, video_prompt


def fetch_video_data(video_uri):
    if not GEMINI_API_KEY:
        return None
    video_url = video_uri
    if "key=" not in video_url:
        separator = "&" if "?" in video_url else "?"
        video_url = f"{video_url}{separator}key={GEMINI_API_KEY}"
    try:
        with urllib.request.urlopen(video_url, timeout=60) as response:
            video_bytes = response.read()
        return "data:video/mp4;base64," + base64.b64encode(video_bytes).decode("utf-8")
    except Exception as e:
        logger.warning(f"Failed to fetch video bytes: {e}")
        return None


@app.route('/api/recommend', methods=['POST'])
def get_recommendation():
    """Get outfit recommendation using Gemini with File Search (streaming)."""
    if not gemini_client:
        return jsonify({'error': 'Gemini client not initialized (API key missing)'}), 500

    try:
        data = request.get_json(silent=True) or {}
        user_input = str(data.get('userInput', '')).strip()
        conversation_history = data.get('conversationHistory', [])
        session_id = normalize_session_id(data.get('sessionId') or data.get('session_id'))
        system_prompt = data.get('systemPrompt', '')
        system_prompt = str(system_prompt).strip() if system_prompt is not None else ''
        if len(system_prompt) > 4000:
            system_prompt = system_prompt[:4000]
        if not isinstance(conversation_history, list):
            return jsonify({'error': 'conversationHistory must be an array'}), 400

        if not user_input:
            return jsonify({'error': 'User input is required'}), 400

        # Determine if this is a follow-up request (has previous conversation)
        session_preferences = None
        session_system_prompt = ""
        if session_id and DATABASE_URL:
            try:
                session_preferences, session_system_prompt = fetch_session_preferences(session_id)
                stored_history = fetch_session_turns(session_id)
                if stored_history and len(stored_history) >= len(conversation_history):
                    conversation_history = stored_history
            except Exception as e:
                logger.warning(f"Failed to load session context: {e}")

        has_previous = len(conversation_history) > 0
        is_follow_up = has_previous and is_follow_up_request(user_input)

        logger.info(f"[File Search] Starting recommendation for: {user_input}")

        system_instruction = build_recommendation_prompt(session_preferences)
        if not session_preferences:
            system_instruction = RECOMMENDATION_PROMPT
        if session_system_prompt:
            system_instruction = f"{system_instruction}\n\n{session_system_prompt}"
        if system_prompt:
            system_instruction = f"{system_instruction}\n\n{system_prompt}"

        # Build the prompt with context
        if has_previous:
            # Format conversation history for context
            history_text = ""
            for i, exchange in enumerate(conversation_history, 1):
                user_msg = exchange.get('user', '')
                assistant_response = exchange.get('assistant', {})
                history_text += f"--- Exchange {i} ---\n"
                history_text += f"User: {user_msg}\n"
                history_text += f"Recommendation: {json.dumps(assistant_response, indent=2)}\n\n"

            if is_follow_up:
                context_prompt = FOLLOW_UP_PROMPT.format(
                    conversation_history=history_text,
                    user_request=user_input
                )
            else:
                context_prompt = (
                    "Here is the conversation history with previous outfit recommendations:\n\n"
                    f"{history_text}"
                    "Now the user says:\n"
                    f"\"{user_input}\"\n\n"
                    "Use the history as context for preferences and continuity, "
                    "but treat this as a new request unless the user explicitly asks to modify a prior outfit."
                )
        else:
            context_prompt = user_input

        system_context_lines = []

        client_time = data.get('clientTime') or data.get('client_time') or {}
        if not isinstance(client_time, dict):
            client_time = {}
        client_local_datetime = str(
            client_time.get('localDateTime')
            or client_time.get('local_date_time')
            or data.get('clientLocalDateTime')
            or data.get('client_local_date_time')
            or ''
        ).strip()
        client_timezone = str(
            client_time.get('timezone')
            or data.get('clientTimezone')
            or data.get('client_timezone')
            or ''
        ).strip()
        client_locale = str(
            client_time.get('locale')
            or data.get('clientLocale')
            or data.get('client_locale')
            or ''
        ).strip()

        if client_local_datetime:
            if client_timezone:
                system_context_lines.append(
                    f"User local datetime: {client_local_datetime} ({client_timezone})"
                )
            else:
                system_context_lines.append(f"User local datetime: {client_local_datetime}")
        elif client_timezone:
            system_context_lines.append(f"User timezone: {client_timezone}")

        if client_locale:
            system_context_lines.append(f"User locale: {client_locale}")

        client_location = data.get('clientLocation') or data.get('client_location') or {}
        if not isinstance(client_location, dict):
            client_location = {}

        zip_code = str(
            client_location.get('zipCode')
            or client_location.get('zip_code')
            or client_location.get('postalCode')
            or client_location.get('postal_code')
            or ''
        ).strip()

        latitude = safe_float(client_location.get('latitude') or client_location.get('lat'))
        longitude = safe_float(
            client_location.get('longitude')
            or client_location.get('lon')
            or client_location.get('lng')
        )

        pref_location = {}
        if session_preferences and isinstance(session_preferences, dict):
            if not zip_code:
                zip_code = str(
                    session_preferences.get('zipCode')
                    or session_preferences.get('zip_code')
                    or ''
                ).strip()
            pref_location = (
                session_preferences.get('location')
                if isinstance(session_preferences.get('location'), dict)
                else {}
            )
            if latitude is None:
                latitude = safe_float(
                    pref_location.get('latitude')
                    or session_preferences.get('latitude')
                    or session_preferences.get('lat')
                )
            if longitude is None:
                longitude = safe_float(
                    pref_location.get('longitude')
                    or session_preferences.get('longitude')
                    or session_preferences.get('lon')
                    or session_preferences.get('lng')
                )

        if zip_code:
            system_context_lines.append(f"User zip code: {zip_code}")

        geo_result = None
        if (latitude is None or longitude is None) and zip_code:
            language_hint = client_locale.split("-")[0] if client_locale else "en"
            geo_result = geocode_zip(zip_code, language=language_hint)
            if geo_result:
                latitude = geo_result.get("latitude")
                longitude = geo_result.get("longitude")

        use_imperial = True
        if client_locale:
            use_imperial = client_locale.lower().startswith("en-us")
        if geo_result and geo_result.get("country_code") == "US":
            use_imperial = True

        weather_summary = fetch_current_weather(
            latitude,
            longitude,
            use_imperial=use_imperial,
        )
        if weather_summary:
            location_label_parts = []
            if geo_result and isinstance(geo_result, dict):
                name = geo_result.get("name")
                admin1 = geo_result.get("admin1")
                country = geo_result.get("country")
                if name and admin1:
                    location_label_parts.append(f"{name}, {admin1}")
                elif name:
                    location_label_parts.append(str(name))
                elif admin1:
                    location_label_parts.append(str(admin1))
                if country:
                    location_label_parts.append(str(country))
            if zip_code:
                location_label_parts.append(f"ZIP {zip_code}")
            location_label = " · ".join([part for part in location_label_parts if part])
            if location_label:
                system_context_lines.append(
                    f"Current weather ({location_label}): {weather_summary}"
                )
            else:
                system_context_lines.append(f"Current weather: {weather_summary}")

        if system_context_lines:
            context_prompt = (
                "SYSTEM CONTEXT (do not repeat):\n"
                + "\n".join(f"- {line}" for line in system_context_lines)
                + "\n\n"
                + context_prompt
            )

        # Configure File Search tool
        file_search_tool = types.Tool(
            file_search=types.FileSearch(
                file_search_store_names=[FILE_SEARCH_STORE]
            )
        )

        def stream_recommendation():
            full_text = ""
            try:
                chat = None
                if session_id:
                    chat = _chat_cache.get(session_id)

                if not chat:
                    chat = gemini_client.chats.create(
                        model=RECOMMENDATION_MODEL,
                        config=types.GenerateContentConfig(
                            system_instruction=system_instruction,
                            tools=[file_search_tool],
                            temperature=1.0,  # Gemini 3 is optimized for 1.0
                            response_mime_type="application/json",
                            thinking_config=types.ThinkingConfig(
                                include_thoughts=False,
                                thinking_level="MINIMAL"  # Use "MINIMAL" or "LOW" for speed
                            ),
                        ),
                    )
                    if session_id:
                        _chat_cache[session_id] = chat

                response_stream = chat.send_message_stream(context_prompt)

                for chunk in response_stream:
                    chunk_text = getattr(chunk, "text", None)
                    if not chunk_text:
                        continue
                    full_text += chunk_text
                    yield chunk_text

                cleaned_text = clean_jsonish_text(full_text)
                try:
                    outfit_data = json.loads(cleaned_text)
                    outfit_count = len(outfit_data.get('outfit', []))
                    logger.info(f"[File Search] Complete. Selected {outfit_count} items for outfit.")
                    logger.debug(f"[File Search] Outfit data: {json.dumps(outfit_data, indent=2)}")
                except json.JSONDecodeError as e:
                    logger.warning(f"[File Search] JSONDecodeError: {e}")
                    logger.warning(f"[File Search] Raw response: {full_text}")
                    logger.warning(f"[File Search] Cleaned text: {cleaned_text}")
            except Exception as e:
                logger.exception("Recommendation streaming error")
                yield f"\n[ERROR] {str(e)}"

        return Response(stream_with_context(stream_recommendation()), mimetype='text/plain; charset=utf-8')

    except Exception as e:
        logger.exception("Recommendation error")
        return jsonify({'error': str(e)}), 500


@app.route('/api/generate-image', methods=['POST'])
def generate_image():
    """Generate an outfit visualization using Gemini image generation."""
    if not gemini_client:
        return jsonify({'error': 'Gemini client not initialized (API key missing)'}), 500

    try:
        data = request.get_json(silent=True) or {}
        outfit_items = data.get('outfit_items', [])
        logger.info(f"[Image Gen] Received {len(outfit_items)} items for image generation")
        
        if not outfit_items:
            return jsonify({'error': 'Outfit items unavailable.'}), 400

        contents = []
        successful_items = []
        item_parts = []

        def resolve_image_bytes(image_value):
            if not image_value or not isinstance(image_value, str):
                return None, None
            if image_value.startswith('data:'):
                header, encoded = image_value.split(',', 1)
                mime_type = header.split(':')[1].split(';')[0] if ':' in header else 'image/jpeg'
                return base64.b64decode(encoded), mime_type
            if image_value.startswith('http://') or image_value.startswith('https://'):
                request_obj = urllib.request.Request(
                    image_value,
                    headers={'User-Agent': 'Mozilla/5.0'},
                )
                with urllib.request.urlopen(request_obj, timeout=30) as response:
                    image_bytes = response.read()
                    mime_type = response.headers.get_content_type()
                if not mime_type or mime_type == 'application/octet-stream':
                    guessed = mimetypes.guess_type(image_value)[0]
                    mime_type = guessed or mime_type
                return image_bytes, mime_type
            return None, None

        for item in outfit_items:
            item_name = item.get('item_name')
            item_sku = item.get('sku') or item.get('SKU')
            image_base64 = item.get('image_base64')
            image_url = item.get('image')
            image_url = image_url or item.get('image_url') or item.get('imageUrl')

            image_value = image_base64 or image_url
            if not image_value:
                logger.warning(f"No image provided for {item_name} (keys: {list(item.keys())})")
                continue

            try:
                image_bytes, mime_type = resolve_image_bytes(image_value)
                if not image_bytes or not mime_type:
                    logger.warning(f"Missing image bytes for {item_name}")
                    continue
                if mime_type not in ALLOWED_IMAGE_MIME_TYPES:
                    logger.warning(f"Unsupported image mime type for {item_name}: {mime_type}")
                    continue
                label = item_name or "item"
                if item_sku:
                    label = f"{label} (SKU {item_sku})"
                item_parts.append(types.Part.from_text(text=f"This image shows the {label}."))
                item_parts.append(types.Part.from_bytes(data=image_bytes, mime_type=mime_type))
                successful_items.append(label)
                logger.debug(f"Added image for {label}, size: {len(image_bytes)} bytes")
            except Exception as e:
                logger.warning(f"Failed to load image for {item_name}: {e}")
        
        if len(successful_items) == 0:
            return jsonify({'error': 'No valid images received. Unable to generate outfit visualization.'}), 500

        template_payload = load_random_template_image()
        if not template_payload:
            return jsonify({'error': 'No template images available for generation.'}), 500
        template_bytes, template_mime, template_name = template_payload
        contents.append(
            types.Part.from_text(
                text=f"Template model reference ({template_name}). Keep the person and background unchanged."
            )
        )
        contents.append(types.Part.from_bytes(data=template_bytes, mime_type=template_mime))
        contents.extend(item_parts)

        item_count = len(successful_items)
        prompt = IMAGE_GEN_PROMPT.format(item_count=item_count)
        contents.append(types.Part.from_text(text=prompt))

        config = types.GenerateContentConfig(
            response_modalities=['IMAGE', 'TEXT'],
            image_config=types.ImageConfig(
                image_size="1K",
                aspect_ratio="3:4"
            )
        )

        logger.info(f"Sending image and prompt to {IMG_GEN_MODEL}...")

        response = gemini_client.models.generate_content(
            model=IMG_GEN_MODEL,
            contents=contents,
            config=config,
        )

        if not response.candidates:
            return jsonify({'error': 'Image model returned no candidates.'}), 500

        for part in response.candidates[0].content.parts:
            if part.inline_data:
                image_bytes = part.inline_data.data
                image_base64 = base64.b64encode(image_bytes).decode('utf-8')
                return jsonify({
                    'success': True,
                    'image_data': f"data:image/png;base64,{image_base64}",
                    'prompt': prompt,
                })
            
        return jsonify({'error': 'Model executed, but no image data was found in the response.'}), 500

    except Exception as e:
        logger.exception("Error generating image")
        return jsonify({'error': str(e)}), 500


@app.route('/api/generate-video', methods=['POST'])
def generate_video():
    """Generate a short video using Veo from the generated image."""
    if not gemini_client:
        return jsonify({'error': 'Gemini client not initialized (API key missing)'}), 500

    try:
        data = request.get_json(silent=True) or {}
        image_data = str(data.get('image_data', ''))
        outfit_items = data.get('outfit_items', [])
        clothing_description = data.get('clothing_description') or build_clothing_description(
            outfit_items
        )

        if not image_data.startswith('data:'):
            return jsonify({'error': 'image_data must be a data URL.'}), 400

        header, encoded = image_data.split(',', 1)
        mime_type = header.split(':')[1].split(';')[0] if ':' in header else 'image/png'
        if mime_type not in ALLOWED_IMAGE_MIME_TYPES:
            return jsonify({'error': f'Unsupported image mime type: {mime_type}'}), 400

        image_bytes = base64.b64decode(encoded)
        video_uri, video_prompt = generate_video_from_image(
            image_bytes,
            clothing_description,
            mime_type,
        )
        video_data = fetch_video_data(video_uri)

        return jsonify({
            'success': True,
            'video_uri': video_uri,
            'video_prompt': video_prompt,
            'video_data': video_data,
        })

    except Exception as e:
        error_message = str(e)
        error_lower = error_message.lower()
        quota_markers = ("quota", "resource_exhausted", "429")
        if any(marker in error_lower for marker in quota_markers):
            client_message = f"Quota issue: {error_message}"
        else:
            client_message = f"Video generation failed: {error_message}"
        logger.exception("Error generating video")
        return jsonify({'error': client_message}), 500


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint."""
    return jsonify({'status': 'ok'})


if __name__ == '__main__':
    debug_mode = os.getenv('FLASK_DEBUG', 'false').lower() == 'true'
    app.run(debug=debug_mode, host='0.0.0.0', port=5001)
