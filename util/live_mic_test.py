import asyncio
import base64
import json
import os
import time

import pyaudio
import websockets

WS_URL = os.getenv("LIVE_WS_URL", "ws://127.0.0.1:5001/api/live")
SAMPLE_RATE = 16000
CHANNELS = 1
CHUNK_SIZE = 1024
FORMAT = pyaudio.paInt16


async def mic_sender(ws, stop_event):
    pya = pyaudio.PyAudio()
    stream = pya.open(
        format=FORMAT,
        channels=CHANNELS,
        rate=SAMPLE_RATE,
        input=True,
        frames_per_buffer=CHUNK_SIZE,
    )
    try:
        while not stop_event.is_set():
            data = stream.read(CHUNK_SIZE, exception_on_overflow=False)
            payload = {
                "type": "input_audio",
                "audio": base64.b64encode(data).decode("utf-8"),
                "mime_type": "audio/pcm",
                "end_of_turn": False,
            }
            await ws.send(json.dumps(payload))
            await asyncio.sleep(0)
    finally:
        stream.stop_stream()
        stream.close()
        pya.terminate()


async def audio_receiver(ws, stop_event):
    pya = pyaudio.PyAudio()
    out_stream = pya.open(
        format=FORMAT,
        channels=CHANNELS,
        rate=24000,
        output=True,
    )
    try:
        while not stop_event.is_set():
            raw = await ws.recv()
            msg = json.loads(raw)
            msg_type = msg.get("type")
            if msg_type == "assistant_audio":
                audio_bytes = base64.b64decode(msg.get("audio") or "")
                if audio_bytes:
                    out_stream.write(audio_bytes)
            elif msg_type == "assistant_text":
                print("ASSISTANT:", msg.get("text"))
            elif msg_type == "style_payload":
                print("STYLE PAYLOAD:\n", msg.get("payload"))
            elif msg_type == "session_end":
                print("SESSION END:", msg.get("reason"))
                stop_event.set()
    finally:
        out_stream.stop_stream()
        out_stream.close()
        pya.terminate()


async def main():
    stop_event = asyncio.Event()
    # Flask-Sock advertises permessage-deflate but doesn't fully support it.
    # Disabling compression avoids RSV/protocol errors in common clients.
    async with websockets.connect(WS_URL, compression=None) as ws:
        await ws.send(json.dumps({"type": "config", "response_modalities": ["AUDIO"]}))
        ready = await ws.recv()
        print("READY", ready)

        sender_task = asyncio.create_task(mic_sender(ws, stop_event))
        receiver_task = asyncio.create_task(audio_receiver(ws, stop_event))

        try:
            # Run until user interrupts or payload captured.
            while not stop_event.is_set():
                await asyncio.sleep(0.2)
        except KeyboardInterrupt:
            stop_event.set()
        finally:
            # Send a final end_of_turn to flush the model.
            await ws.send(json.dumps({
                "type": "input_audio",
                "audio": "",
                "mime_type": "audio/pcm",
                "end_of_turn": True,
            }))
            sender_task.cancel()
            receiver_task.cancel()


if __name__ == "__main__":
    asyncio.run(main())
