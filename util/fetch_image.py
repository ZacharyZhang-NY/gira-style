from curl_cffi import requests

IMPERSONATE_OPTIONS = ["chrome124", "chrome120", "chrome110", "chrome", "safari", "safari17", "edge99"]

def fetch_image_from_url(url):
    """Fetches image bytes from a URL using curl_cffi to bypass anti-bot protections."""
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'https://www.aritzia.com/',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Sec-Fetch-Dest': 'image',
        'Sec-Fetch-Mode': 'no-cors',
        'Sec-Fetch-Site': 'cross-site',
        'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"'
    }
    print(f"Fetching image from: {url}")
    
    last_error = None
    for impersonate in IMPERSONATE_OPTIONS:
        try:
            print(f"Trying impersonate={impersonate}")
            response = requests.get(url, headers=headers, impersonate=impersonate, timeout=30)
            print(f"Response status: {response.status_code}, Content-Length: {len(response.content)}")
            if response.status_code == 200 and len(response.content) > 1000:
                return response.content
            last_error = f"Status {response.status_code}"
        except Exception as e:
            print(f"Failed with {impersonate}: {type(e).__name__}: {e}")
            last_error = e
    
    raise Exception(f"All impersonation attempts failed. Last error: {last_error}")