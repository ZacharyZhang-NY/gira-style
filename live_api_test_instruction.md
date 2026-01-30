# Live API Conversation Test Instructions

## Prerequisites
- Google Gemini API key available to the server (via `GEMINI_API_KEY` or `api/env.py`).
- Google Cloud Speech-to-Text credentials file at:
  - `/workspaces/aura_style_agent/service_account.json`
- Speech-to-Text API enabled in that Google Cloud project.

## Start the API server (port 5001)
```bash
nohup env GOOGLE_APPLICATION_CREDENTIALS=/workspaces/aura_style_agent/service_account.json \
  python - <<'PY' >/tmp/aura_live_5001.log 2>&1 & echo $!
from api.index import app
app.run(host='0.0.0.0', port=5001, debug=False)
PY
```

Verify:
```bash
curl -sS http://127.0.0.1:5001/health
```
Expected:
```json
{"status":"ok"}
```

## Serve the browser test page (port 8000)
```bash
nohup python -m http.server 8000 >/tmp/live_browser_8000.log 2>&1 & echo $!
```

Open:
```
http://127.0.0.1:8000/live_browser_test.html
```

## Configure the WebSocket URL
- Local:
  - `ws://127.0.0.1:5001/api/live`
- Codespaces (forwarded ports):
  - `wss://<your-codespace>-5001.app.github.dev/api/live`

## Run a test session
1. Click **Start**.
2. Speak clearly for 10–20 seconds.
3. Click **Stop**.

Expected logs:
- `transcript: <your words>`
- `style_payload: ...`
- `session_end: stop_summary`

## Troubleshooting
### No transcript
Check server log:
```bash
tail -n 120 /tmp/aura_live_5001.log
```
Common causes:
- Speech-to-Text API not enabled in Google Cloud.
- Service account missing `roles/speech` (Speech-to-Text User).
- Very short audio; speak longer and louder.

### “policy violation” / 1008 errors
- The server no longer sends any extra Live nudge on Stop.
- If you see 1008, verify that the client is still using `response_modalities: ["AUDIO"]`.

### Browser audio issues
- Make sure mic permissions are allowed for the test page.
- If Codespaces, confirm port 5001 visibility is Public.

## Useful logs
- API: `/tmp/aura_live_5001.log`
- Browser server: `/tmp/live_browser_8000.log`
