import urllib.request
import json
import base64
import os

url = "http://127.0.0.1:5001/api/generate-image"
data = {
    "outfit_items": [
        {
            "item_name": "Original Contour '90s Tank",
            "image": "https://assets.aritzia.com/image/upload/q_auto,f_auto,dpr_auto,w_1920/f25_a01_128956_28537_on_a"
        },
        {
            "item_name": "Portico Pant - Crepette™",
            "image": "https://assets.aritzia.com/image/upload/q_auto,f_auto,dpr_auto,w_1920/f25_a06_128261_35451_on_a"
        },
        {
            "item_name": "Morningside Blazer - (Re)ssential",
            "image": "https://assets.aritzia.com/image/upload/q_auto,f_auto,dpr_auto,w_1920/f25_a04_127300_1274_on_a"
        }
    ]
}
json_data = json.dumps(data).encode("utf-8")

req = urllib.request.Request(url, data=json_data, headers={"Content-Type": "application/json"})

print(f"Sending request to {url}...")
try:
    with urllib.request.urlopen(req) as response:
        response_body = response.read()
        result = json.loads(response_body)
        
        if result.get("success"):
            print(f"Prompt used: {result.get('prompt')}")
            image_data = result.get("image_data")
            if image_data:
                # Handle potential data URI scheme if present (though previous output didn't show it)
                if "," in image_data[:50]: # Check start of string
                    image_data = image_data.split(",", 1)[1]
                
                img_bytes = base64.b64decode(image_data)
                output_path = os.path.abspath("generated_outfit.png")
                with open(output_path, "wb") as f:
                    f.write(img_bytes)
                print(f"Successfully saved image to: {output_path}")
            else:
                print("Response missing 'image_data' field")
        else:
            print("API returned success=False")
            print(result)
except Exception as e:
    print(f"Error: {e}")
