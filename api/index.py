from flask import Flask, request, jsonify
from flask_cors import CORS
from google import genai
from google.genai import types
import json
import os
# --- REMOVED: load_dotenv() is not needed/used in Vercel environment ---

# Initialize Flask app
app = Flask(__name__)
# Enable CORS for the API. Vercel automatically handles cross-origin requests.
# NOTE: Vercel functions are served from a single path, so CORS settings are simple.
CORS(app, resources={r"/api/*": {"origins": "*"}})

# Configuration
ORDER_HISTORY = '128255, 128156, 117963, 129456, 125003, 125434, 124183'
MY_LIST = '128522, 129668'

SYSTEM_INSTRUCTION = (
    "You are an Aritzia fashion agent. Based on the Aritzia SKU, please provide item recommendation based on user input. "
    "Here are some important information you need to consider: user order history (if available), user list, season, temperature, location. "
    "User order history and list are provided in SKU number format, it can contain some out of date item, please ignore if you can't find it in the database. "
    "The output should be in JSON format, contain a full outfit only with these fields: description (description of the situation), outfit (contains item_name, sku, color, link, reason, image), accessories (contains item_name, sku, color, link, image), other_recommendation (general guidance on what other accessories that is good to go with this outfit), reason (why this is a good outfit in the situation). "
    "Please do NOT generate any text beyond json file. "
    "You need to do 2 very important check: 1. Please double check and make sure the SKU and color exists in the database. DO NOT make up things 2. make sure the item name match with the link. "
    "Please DO NOT make things up!!! Only use item in the database. "
    "Please make the description, other_recommendation and reason as concise as possible. "
    f"User order history: {ORDER_HISTORY}. "
    f"User list: {MY_LIST}. "
)

FILE_SEARCH_STORE_NAME = 'fileSearchStores/aritzia-agent-data-store-0tmh163nx2gu'

# Initialize Genai client
# Vercel injects GEMINI_API_KEY as an environment variable.
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
if not GEMINI_API_KEY:
    # Print a warning for Vercel logs, but don't raise an exception here to allow 
    # the function to be deployed/initialized before the variable is set. 
    # The actual API call will fail if the key is missing.
    print("WARNING: GEMINI_API_KEY environment variable not set.")
    client = None
else:
    client = genai.Client(api_key=GEMINI_API_KEY)

# The route remains the same, Vercel maps /api/recommend to this function.
@app.route('/api/recommend', methods=['POST'])
def get_recommendation():
    """Get outfit recommendation from the Aritzia agent"""
    if not client:
        return jsonify({'error': 'Internal server configuration error: Gemini client not initialized (API key missing)'}), 500

    try:
        data = request.json
        user_input = data.get('userInput', '').strip()
        
        if not user_input:
            return jsonify({'error': 'User input is required'}), 400
        
        # NOTE: Using gemini-2.5-flash which is generally faster and cheaper than Pro.
        # This helps reduce the risk of serverless function timeouts (max 60s for free tier).
        
        # Create chat with file search tool
        chat = client.chats.create(
            model="gemini-2.5-flash",
            config={
                "system_instruction": SYSTEM_INSTRUCTION,
                "tools": [
                    types.Tool(
                        file_search=types.FileSearch(
                            file_search_store_names=[FILE_SEARCH_STORE_NAME]
                        )
                    )
                ]
            }
        )
        
        # Send user message
        response = chat.send_message(user_input)
        
        # Extract response text
        response_text = response.text
        
        # Try to parse as JSON, otherwise return as formatted text
        try:
            outfit_data = json.loads(response_text)
            return jsonify({'success': True, 'data': outfit_data})
        except json.JSONDecodeError:
            # If not JSON, return as formatted response
            print(f"JSONDecodeError: Raw response was {response_text}")
            return jsonify({'success': True, 'data': {'formatted_response': response_text}})
        
    except Exception as e:
        # Print error for Vercel logs
        print(f"Error: {str(e)}")
        return jsonify({'error': str(e)}), 500

# Health check endpoint is helpful for Vercel monitoring
@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({'status': 'ok'})