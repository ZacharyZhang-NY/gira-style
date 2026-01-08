import logging
import json
import os
import base64
import time
import urllib.request

from flask import Flask, request, jsonify, send_from_directory, Response, stream_with_context
from flask_cors import CORS
from google import genai
from google.genai import types
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

from api.constants import (
    IMG_GEN_MODEL,
    RECOMMENDATION_MODEL,
    RECOMMENDATION_PROMPT,
    FOLLOW_UP_PROMPT,
    IMAGE_GEN_PROMPT,
    FILE_SEARCH_STORE,
    VIDEO_GEN_MODEL,
    VIDOE_GENERATION_PROMPT,
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

# Initialize Gemini client
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
ALLOWED_IMAGE_MIME_TYPES = ('image/png', 'image/jpeg', 'image/webp')
VIDEO_POLL_INTERVAL_SECONDS = float(os.getenv('VIDEO_POLL_INTERVAL_SECONDS', '3'))
VIDEO_MAX_WAIT_SECONDS = float(os.getenv('VIDEO_MAX_WAIT_SECONDS', '120'))
if not GEMINI_API_KEY:
    logger.warning("GEMINI_API_KEY environment variable not set.")
    gemini_client = None
else:
    gemini_client = genai.Client(api_key=GEMINI_API_KEY)
    logger.info(f"Gemini client initialized. File Search Store: {FILE_SEARCH_STORE}")

@app.route('/')
def serve_frontend():
    return send_from_directory(os.getcwd(), 'artizia.html')


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

    response = operation.response or operation.result
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
        if not isinstance(conversation_history, list):
            return jsonify({'error': 'conversationHistory must be an array'}), 400

        if not user_input:
            return jsonify({'error': 'User input is required'}), 400

        # Determine if this is a follow-up request (has previous conversation)
        has_previous = len(conversation_history) > 0
        is_follow_up = has_previous and is_follow_up_request(user_input)

        logger.info(f"[File Search] Starting recommendation for: {user_input}")

        # Build the prompt with context
        if is_follow_up:
            # Format conversation history for context
            history_text = ""
            for i, exchange in enumerate(conversation_history, 1):
                user_msg = exchange.get('user', '')
                assistant_response = exchange.get('assistant', {})
                history_text += f"--- Exchange {i} ---\n"
                history_text += f"User: {user_msg}\n"
                history_text += f"Recommendation: {json.dumps(assistant_response, indent=2)}\n\n"

            context_prompt = FOLLOW_UP_PROMPT.format(
                conversation_history=history_text,
                user_request=user_input
            )
        else:
            context_prompt = user_input

        # Configure File Search tool
        file_search_tool = types.Tool(
            file_search=types.FileSearch(
                file_search_store_names=[FILE_SEARCH_STORE]
            )
        )

        def clean_response_text(raw_text):
            cleaned = raw_text.strip()

            while 'tool_code' in cleaned:
                cleaned = cleaned.replace('tool_code', '').strip()

            if cleaned.startswith('```json'):
                cleaned = cleaned[7:]
            elif cleaned.startswith('```'):
                first_newline = cleaned.find('\n')
                if first_newline != -1:
                    cleaned = cleaned[first_newline + 1:]
                else:
                    cleaned = cleaned[3:]
            if cleaned.endswith('```'):
                cleaned = cleaned[:-3]
            cleaned = cleaned.strip()

            json_start = cleaned.find('{')
            json_end = cleaned.rfind('}')
            if json_start != -1 and json_end != -1:
                cleaned = cleaned[json_start:json_end + 1]

            return cleaned

        def stream_recommendation():
            full_text = ""
            try:
                response_stream = gemini_client.models.generate_content_stream(
                    model=RECOMMENDATION_MODEL,
                    contents=context_prompt,
                    config=types.GenerateContentConfig(
                        system_instruction=RECOMMENDATION_PROMPT,
                        tools=[file_search_tool],
                        temperature=1.0,  # Gemini 3 is optimized for 1.0
                        thinking_config=types.ThinkingConfig(
                            include_thoughts=False,
                            thinking_level="MINIMAL"  # Use "MINIMAL" or "LOW" for speed
                        ),
                    )
                )

                for chunk in response_stream:
                    chunk_text = getattr(chunk, "text", None)
                    if not chunk_text:
                        continue
                    full_text += chunk_text
                    yield chunk_text

                cleaned_text = clean_response_text(full_text)
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
        
        for item in outfit_items:
            item_name = item.get('item_name')
            image_base64 = item.get('image_base64')
            
            if image_base64 and image_base64.startswith('data:'):
                try:
                    header, encoded = image_base64.split(',', 1)
                    mime_type = header.split(':')[1].split(';')[0] if ':' in header else 'image/jpeg'
                    if mime_type not in ALLOWED_IMAGE_MIME_TYPES:
                        logger.warning(f"Unsupported image mime type for {item_name}: {mime_type}")
                        continue
                    image_bytes = base64.b64decode(encoded)
                    
                    contents.append(types.Part.from_text(text=f"This image shows the {item_name}."))
                    contents.append(types.Part.from_bytes(data=image_bytes, mime_type=mime_type))
                    successful_items.append(item_name)
                    logger.debug(f"Added image for {item_name}, size: {len(image_bytes)} bytes")
                except Exception as e:
                    logger.warning(f"Failed to decode base64 for {item_name}: {e}")
        
        if len(successful_items) == 0:
            return jsonify({'error': 'No valid images received. Unable to generate outfit visualization.'}), 500

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
