import logging
import json
import os
import base64

from flask import Flask, request, jsonify, send_from_directory
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
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

# Initialize Gemini client
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
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


@app.route('/api/recommend', methods=['POST'])
def get_recommendation():
    """Get outfit recommendation using Gemini with File Search."""
    if not gemini_client:
        return jsonify({'error': 'Gemini client not initialized (API key missing)'}), 500

    try:
        data = request.json
        user_input = data.get('userInput', '').strip()
        conversation_history = data.get('conversationHistory', [])

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

        # Generate recommendation with Gemini using File Search
        response = gemini_client.models.generate_content(
            model=RECOMMENDATION_MODEL,
            contents=context_prompt,
            config=types.GenerateContentConfig(
                system_instruction=RECOMMENDATION_PROMPT,
                tools=[file_search_tool],
                temperature=0.7,
            )
        )

        response_text = response.text

        # Clean up response - remove tool_code markers and markdown formatting
        cleaned_text = response_text.strip()

        # Remove any "tool_code" prefixes (from File Search tool execution)
        while 'tool_code' in cleaned_text:
            cleaned_text = cleaned_text.replace('tool_code', '').strip()

        # Remove markdown code blocks
        if cleaned_text.startswith('```json'):
            cleaned_text = cleaned_text[7:]
        elif cleaned_text.startswith('```'):
            first_newline = cleaned_text.find('\n')
            if first_newline != -1:
                cleaned_text = cleaned_text[first_newline + 1:]
            else:
                cleaned_text = cleaned_text[3:]
        if cleaned_text.endswith('```'):
            cleaned_text = cleaned_text[:-3]
        cleaned_text = cleaned_text.strip()

        # Find the JSON object in the response (in case there's extra text)
        json_start = cleaned_text.find('{')
        json_end = cleaned_text.rfind('}')
        if json_start != -1 and json_end != -1:
            cleaned_text = cleaned_text[json_start:json_end + 1]

        try:
            outfit_data = json.loads(cleaned_text)
            outfit_count = len(outfit_data.get('outfit', []))
            logger.info(f"[File Search] Complete. Selected {outfit_count} items for outfit.")
            logger.debug(f"[File Search] Outfit data: {json.dumps(outfit_data, indent=2)}")
            return jsonify({'success': True, 'data': outfit_data})
        except json.JSONDecodeError as e:
            logger.warning(f"[File Search] JSONDecodeError: {e}")
            logger.warning(f"[File Search] Raw response: {response_text}")
            logger.warning(f"[File Search] Cleaned text: {cleaned_text}")
            return jsonify({'success': True, 'data': {'formatted_response': response_text}})

    except Exception as e:
        logger.error(f"Recommendation error: {str(e)}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/generate-image', methods=['POST'])
def generate_image():
    """Generate an outfit visualization using Gemini image generation."""
    if not gemini_client:
        return jsonify({'error': 'Gemini client not initialized (API key missing)'}), 500

    try:
        data = request.json
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

        for part in response.candidates[0].content.parts:
            if part.inline_data:
                image_base64 = base64.b64encode(part.inline_data.data).decode('utf-8')
                return jsonify({
                    'success': True,
                    'image_data': f"data:image/png;base64,{image_base64}",
                    'prompt': prompt
                })
            
        return jsonify({'error': 'Model executed, but no image data was found in the response.'}), 500

    except Exception as e:
        logger.error(f"Error generating image: {str(e)}")
        return jsonify({'error': str(e)}), 500


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint."""
    return jsonify({'status': 'ok'})


if __name__ == '__main__':
    debug_mode = os.getenv('FLASK_DEBUG', 'false').lower() == 'true'
    app.run(debug=debug_mode, host='0.0.0.0', port=5001)
