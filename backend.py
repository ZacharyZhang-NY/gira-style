from flask import Flask, request, jsonify
from flask_cors import CORS
from google import genai
from google.genai import types
import json
import os
from dotenv import load_dotenv
load_dotenv()

# Initialize Flask app
app = Flask(__name__)
# Enable CORS for the API so a frontend served from another origin can call it
CORS(app, resources={r"/api/*": {"origins": "*"}})

# Configuration
ORDER_HISTORY = '128255, 128156, 117963, 129456, 125003, 125434, 124183'
MY_LIST = '128522, 129668'

SYSTEM_INSTRUCTION = (
    "You are an Aritzia fashion agent. Based on the Aritzia SKU, please provide item recommendation based on user input. "
    "Here are some important information you need to consider: user order history (if available), user list, season, temperature, location. "
    "User order history and list are provided in SKU number format, it can contain some out of date item, please ignore if you can't find it in the database. "
    "The output should be in JSON format, contain a full outfit only with these fields: description (description of the situation), outfit (contains item_name, sku, color, link, reason), accessories_recommend (a general guidance on what accessories is good to pair with the whole outfit), reason (why this is a good outfit in the situation). "
    "Please do NOT generate any text beyond json file. "
    "You need to 2 very important check: 1. Please double check and make sure the SKU and color exists in the database. 2. make sure the item name match with the link. "
    f"User order history: {ORDER_HISTORY}. "
    f"User list: {MY_LIST}. "
)

FILE_SEARCH_STORE_NAME = 'fileSearchStores/aritzia-agent-data-store-0tmh163nx2gu'

# Initialize Genai client
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
if not GEMINI_API_KEY:
    raise ValueError("GEMINI_API_KEY environment variable not set. Cannot initialize client.")
client = genai.Client(api_key=GEMINI_API_KEY)

@app.route('/api/recommend', methods=['POST'])
def get_recommendation():
    """Get outfit recommendation from the Aritzia agent"""
    try:
        data = request.json
        user_input = data.get('userInput', '').strip()
        
        if not user_input:
            return jsonify({'error': 'User input is required'}), 400
        
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
            print(response_text)
            return jsonify({'success': True, 'data': {'formatted_response': response_text}})
        
    except Exception as e:
        print(f"Error: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({'status': 'ok'})

if __name__ == '__main__':
    app.run(debug=True, port=5001)
