from curl_cffi import requests

def fetch_image_from_url(url):
    """Fetches image bytes from a URL using curl_cffi to bypass anti-bot protections."""
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.aritzia.com/',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive'
    }
    print(f"Fetching image from: {url}")
    response = requests.get(url, headers=headers, impersonate="chrome")
    response.raise_for_status()
    return response.content