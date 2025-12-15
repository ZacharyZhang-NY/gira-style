ORDER_HISTORY = '128255, 128156, 117963, 129456, 125003, 125434, 124183'
MY_LIST = '128522, 129668'

IMG_GEN_MODEL = "gemini-3-pro-image-preview"
RECOMMENDATION_MODEL = "gemini-2.5-flash"

FILE_SEARCH_STORE_NAME = 'fileSearchStores/aritzia-agent-data-store-0tmh163nx2gu'

IMAGE_GEN_PROMPT = "Please use these {item_count} images to generate a whole outfit."

RECOMMENDATION_PROMPT = (
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
