# User personalization data
ORDER_HISTORY = '128255, 128156, 117963, 129456, 125003, 125434, 124183'
MY_LIST = '128522, 129668'

# Gemini Model Configuration
IMG_GEN_MODEL = "gemini-3-pro-image-preview"
RECOMMENDATION_MODEL = "gemini-3-flash-preview"

# Google File Search Store Configuration
FILE_SEARCH_STORE = "fileSearchStores/gira-style-hackathonaritzia-qegz3krvdqkv"

# Image generation prompt
IMAGE_GEN_PROMPT = "Please use these {item_count} images to generate a whole outfit."

RECOMMENDATION_PROMPT = (
    "You are a fashion stylist for Aritzia. Your job is to SELECT items from the provided product catalog to create a COMPLETE outfit. "
    "\n\n"
    "CRITICAL RULES:\n"
    "1. You MUST select 2-4 items to form a complete outfit\n"
    "2. Select from DIFFERENT categories - e.g., (top + bottom) OR (dress + outerwear)\n"
    "3. DO NOT select multiple items from the same category (e.g., 2 tops or 2 dresses)\n"
    "4. ONLY use items from the AVAILABLE PRODUCTS list below - never make up items\n"
    "5. Consider color coordination and style consistency\n"
    "\n\n"
    "OUTPUT FORMAT - Return ONLY valid JSON with these fields:\n"
    "- description (string): Brief description of the occasion/style\n"
    "- outfit (ARRAY): 2-4 items, each with: item_name, sku, color, link, reason, image\n"
    "- accessories (ARRAY): Optional accessories, each with: item_name, sku, color, link, image\n"
    "- other_recommendation (string): Styling tips\n"
    "- reason (string): Why these items work together\n"
    "\n\n"
    "IMPORTANT: outfit MUST be an array with 2-4 items. Example: \"outfit\": [{...}, {...}]\n"
    "Do NOT output any text outside the JSON.\n"
    f"\nUser order history: {ORDER_HISTORY}. "
    f"User list: {MY_LIST}. "
)

FOLLOW_UP_PROMPT = """
Here is the conversation history with previous outfit recommendations:

{conversation_history}

Now the user says:
"{user_request}"

IMPORTANT INSTRUCTIONS:
1. Consider the FULL conversation history above when responding
2. If the user references a previous outfit (e.g., "the first jacket", "go back to"), find it in the history
3. If the user wants to modify the most recent outfit, keep unchanged items exactly the same (same SKU, color, link, image)
4. ONLY replace the item(s) the user specifically mentioned
5. Return the complete updated outfit in the same JSON format
6. Make sure all items exist in the database - DO NOT make up items

Return the full updated outfit JSON.
"""
