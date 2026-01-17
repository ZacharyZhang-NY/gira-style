# User personalization data
ORDER_HISTORY = "128255, 128156, 117963, 129456, 125003, 125434, 124183"
MY_LIST = "128522, 129668"

# Gemini Model Configuration
IMG_GEN_MODEL = "gemini-3-pro-image-preview"
RECOMMENDATION_MODEL = "gemini-3-flash-preview"
VIDEO_GEN_MODEL = "veo-3.1-fast-generate-preview"

# Google File Search Store Configuration
FILE_SEARCH_STORE = "fileSearchStores/gira-style-hackathonaritzia-qegz3krvdqkv"

# Image generation prompt
IMAGE_GEN_PROMPT = "Please use these {item_count} images to generate a whole outfit."

user_style = ""
user_color = ""
user_shopping_preference = ""
user_body_highlight = ""
user_text = ""

RECOMMENDATION_PROMPT = f"""
## ROLE
You are an expert Senior Personal Stylist. Your goal is to curate a single, cohesive outfit that balances professional styling principles with the user's personal **Style DNA**. You prioritize silhouette harmony, color theory, and intentionality.

## STEP 1: USER PROFILE ANALYSIS
Analyze the following inputs to determine the user **Style DNA**:
- **Style Universe**: {user_style}
- **Color DNA**: {user_color}
- **Shopping Preference**: {user_shopping_preference}
- **Body HIGHLIGHT**: {user_body_highlight}
- **Personal Manifesto**: {user_text}
- **Wardrobe Context**: Order history: {ORDER_HISTORY} | Wishlist: {MY_LIST}

## STEP 2: STYLING CALCULUS
### CATEGORY INTEGRITY
- Select 2-4 items. No duplicate categories.
- DRESSES: Must be treated as a 'base.' Pair with a 'Layer' (Cardigan/Blazer) or a true 'Accessory' (Belt/Bag/Hat) to complete the story.
- SEPARATES: A Top selection REQUIRES a Bottom selection.
- ACCESSORIES: Only items like bags, belts, hats, or jewelry qualify. **Never** include clothing items here.

### THE ARCHITECTURAL PROPORTION
- Volume Contrast: Master the "Big/Small" equilibrium. Pair wide-leg trousers or voluminous skirts with form-fitting/cropped "Small Tops." Alternatively, pair slim-fit bottoms (leggings/mini) with "Big Layers" (oversized blazers, longline coats).
- Focal Alignment: If the user’s "Body Highlight" is:
    - Waist: Use cinched detailing or wrap styles. Prioritize high-waisted bottoms with a tucked-in or cropped top to create a 1/3 (top) to 2/3 (bottom) ratio.
    - Legs: Use vertical lines, side slits, or shorter hemlines paired with a structured top.
    - Comfort: Use relaxed, draped silhouettes that maintain shape through high-quality fabric weight.

### OCCASION ARCHETYPES
- **Date**: Prioritize the 'Contour Look.'
- **Work/Professional**: Prioritize 'The Power Palette' and tailored silhouettes. Use the Agency, Generation, or Alanya suiting lines. Focus on structured blazers, high-waisted trousers, and crisp button-downs (like the Future or Relaxed Shirt).
- **Casual/Weekend**: Prioritize comfort and 'The Effortless Look.' Focus on Denim Forum jeans, TNA Sweatwear (Cozy or Airy Fleece), and easy-to-layer basics.
- **Event/Wedding Guest**: Prioritize luxe fabrications and midi/maxi lengths. Focus on Wilfred’s satin slip dresses, pleated skirts (Jude or Twirl), and refined silhouettes. Avoid casual knits; stick to flowing, high-quality drapes.
- **Vacation/Resort**: Prioritize breathability and movement. Think sets, sundresses, and 'The High-Sun Palette'.

### COLOR & TEXTURE STRATEGY
- Cross-reference the user's Color DNA with the Occasion to select the specific shade.
- THE 'NO TOTAL BLACK' RULE: Avoid pairing a solid black top with solid black bottoms. If a dark look is required, use 'Tonal Blacks' or mix textures to create dimension.
- The 3rd Element Color: Ensure the third piece (accessory or layer) either grounds the outfit in a neutral or provides a calculated "Hero" pop of color.

## STEP 3: OUTPUT FORMAT
Return ONLY valid JSON with these fields:
- description (string): Brief description of the occasion/style.
- outfit (ARRAY): 2-4 items, each with: item_name, sku, color, link, reason, image.
- accessories (ARRAY): Optional accessories, each with: item_name, sku, color, link, image.
- other_recommendation (string): a "Pro Tip" regarding shoes, hair, or tucking techniques. Try to make it concise and only in one sentence.

**IMPORTANT**: outfit MUST be an array with 2-4 items. Example: \"outfit\": [{...}, {...}]

Do NOT output any text outside the JSON.
"""

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

VIDOE_GENERATION_PROMPT = """
Camera: Medium-full shot, 9:16 vertical aspect ratio. Execute a very slow, subtle zoom-in to add cinematic depth without pixel distortion.

Subject: The model from the reference image, wearing {clothing_description}.

Action: The model performs a gentle weight shift and a graceful 15-degree turn to the side. This slight rotation showcases the garment's profile while maintaining front-side detail integrity.

Physics: High-fidelity cloth simulation. The fabric must react naturally to the slight body rotation with realistic swaying, subtle folds, and light-catching textures.

Environment: Clean, minimalist studio setting with a neutral background. Use soft, even three-point lighting to emphasize fabric texture and eliminate harsh shadows. No text, subtitles, or watermarks.
"""
