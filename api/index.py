from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from google import genai
from google.genai import types
import json
import os
import base64
from api.constants import (
    IMG_GEN_MODEL,
    RECOMMENDATION_MODEL,
    RECOMMENDATION_PROMPT,
    FILE_SEARCH_STORE_NAME,
    IMAGE_GEN_PROMPT
)

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
if not GEMINI_API_KEY:
    print("WARNING: GEMINI_API_KEY environment variable not set.")
    client = None
else:
    client = genai.Client(api_key=GEMINI_API_KEY)


@app.route('/')
def serve_frontend():
    return send_from_directory(os.getcwd(), 'artizia.html')


@app.route('/api/recommend', methods=['POST'])
def get_recommendation():
    """Get outfit recommendation from the Aritzia agent."""
    if not client:
        return jsonify({'error': 'Gemini client not initialized (API key missing)'}), 500

    try:
        data = request.json
        user_input = data.get('userInput', '').strip()
        
        if not user_input:
            return jsonify({'error': 'User input is required'}), 400
        
        chat = client.chats.create(
            model=RECOMMENDATION_MODEL,
            config={
                "system_instruction": RECOMMENDATION_PROMPT,
                "tools": [
                    types.Tool(
                        file_search=types.FileSearch(
                            file_search_store_names=[FILE_SEARCH_STORE_NAME]
                        )
                    )
                ]
            }
        )
        
        response = chat.send_message(user_input)
        response_text = response.text
        
        cleaned_text = response_text.strip()
        if cleaned_text.startswith('```'):
            first_newline = cleaned_text.find('\n')
            if first_newline != -1:
                cleaned_text = cleaned_text[first_newline + 1:]
            else:
                cleaned_text = cleaned_text[3:]
        if cleaned_text.endswith('```'):
            cleaned_text = cleaned_text[:-3]
        cleaned_text = cleaned_text.strip()
        
        try:
            outfit_data = json.loads(cleaned_text)
            return jsonify({'success': True, 'data': outfit_data})
        except json.JSONDecodeError:
            print(f"JSONDecodeError: Raw response was {response_text}")
            return jsonify({'success': True, 'data': {'formatted_response': response_text}})
        
    except Exception as e:
        print(f"Error: {str(e)}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/generate-image', methods=['POST'])
def generate_image():
    """Generate an outfit visualization using Gemini image generation."""
    if not client:
        return jsonify({'error': 'Gemini client not initialized (API key missing)'}), 500

    try:
        data = request.json
        outfit_items = data.get('outfit_items', [])
        
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
                    print(f"Added image for {item_name}, size: {len(image_bytes)} bytes")
                except Exception as e:
                    print(f"Failed to decode base64 for {item_name}: {e}")
        
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

        print(f"Sending image and prompt to {IMG_GEN_MODEL}...")
        
        response = client.models.generate_content(
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
        print(f"Error generating image: {str(e)}")
        return jsonify({'error': str(e)}), 500


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint."""
    return jsonify({'status': 'ok'})


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5001)
