"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";

type LiveAssistantPayload = {
  stylePayload: string;
};

type LiveAssistantProps = {
  onComplete: (payload: LiveAssistantPayload) => void;
  onBack?: () => void;
};

const TARGET_SAMPLE_RATE = 16000;
const VAD_CHECK_INTERVAL_MS = 200;
const VAD_SILENCE_MS = 1000;
const VAD_MIN_RMS = 0.015;

function arrayBufferToBase64(buffer: ArrayBufferLike) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function normalizeMimeType(mimeType?: string) {
  return (mimeType || "").trim().toLowerCase();
}

function parseSampleRate(mimeType?: string, fallback = 24000) {
  if (!mimeType) return fallback;
  const match = mimeType.match(/rate\s*=\s*(\d+)/i);
  if (!match) return fallback;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isWavMimeType(mimeType: string) {
  return (
    mimeType.includes("audio/wav") ||
    mimeType.includes("audio/wave") ||
    mimeType.includes("audio/x-wav")
  );
}

function isWavHeader(bytes: Uint8Array) {
  if (bytes.length < 12) return false;
  return (
    bytes[0] === 0x52 && // R
    bytes[1] === 0x49 && // I
    bytes[2] === 0x46 && // F
    bytes[3] === 0x46 && // F
    bytes[8] === 0x57 && // W
    bytes[9] === 0x41 && // A
    bytes[10] === 0x56 && // V
    bytes[11] === 0x45 // E
  );
}

function pcm16ToAudioBuffer(
  ctx: AudioContext,
  buffer: ArrayBuffer,
  sampleRate: number,
) {
  const bytes = new Uint8Array(buffer);
  const sampleCount = Math.floor(bytes.length / 2);
  const float32 = new Float32Array(sampleCount);
  const view = new DataView(buffer);
  for (let i = 0; i < sampleCount; i += 1) {
    const val = view.getInt16(i * 2, true);
    float32[i] = val / 0x8000;
  }
  const audioBuffer = ctx.createBuffer(1, sampleCount, sampleRate);
  audioBuffer.copyToChannel(float32, 0);
  return audioBuffer;
}

function computeRms(samples: Float32Array) {
  let sumSq = 0;
  for (let i = 0; i < samples.length; i += 1) {
    sumSq += samples[i] * samples[i];
  }
  return Math.sqrt(sumSq / samples.length);
}

function downsampleBuffer(buffer: Float32Array, inputRate: number, outputRate: number) {
  if (outputRate === inputRate) return buffer;
  const ratio = inputRate / outputRate;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.floor((i + 1) * ratio);
    let sum = 0;
    for (let j = start; j < end && j < buffer.length; j++) {
      sum += buffer[j];
    }
    result[i] = sum / (end - start);
  }
  return result;
}

function pcmFloatTo16BitPCM(input: Float32Array) {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return output;
}

function buildWebSocketUrl(path: string) {
  if (typeof window === "undefined") return path;
  const { hostname, protocol } = window.location;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return `ws://${hostname}:5001${path}`;
  }
  if (hostname.endsWith(".vercel.app")) {
    return `wss://aritzia.girastyleai.com${path}`;
  }
  const wsProtocol = protocol === "https:" ? "wss:" : "ws:";
  return `${wsProtocol}//${hostname}${path}`;
}

export function LiveAssistant({ onComplete, onBack }: LiveAssistantProps) {
  const [status, setStatus] = React.useState<string>("idle");
  const [audioLevel, setAudioLevel] = React.useState(0);
  const [error, setError] = React.useState("");
  const [waitingForResponse, setWaitingForResponse] = React.useState(false);
  
  // Ref to track status for callbacks
  const statusRef = React.useRef(status);
  React.useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // All mutable state in refs to avoid re-render cascades
  const wsRef = React.useRef<WebSocket | null>(null);
  const audioContextRef = React.useRef<AudioContext | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const sourceRef = React.useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = React.useRef<ScriptProcessorNode | null>(null);
  const playContextRef = React.useRef<AudioContext | null>(null);
  const playQueueRef = React.useRef<Array<{ audio: string; mime: string }>>([]);
  const isPlayingRef = React.useRef(false);
  const nextPlayTimeRef = React.useRef(0);
  const pendingPcmByteRef = React.useRef<Uint8Array | null>(null);

  const micStartedRef = React.useRef(false);
  const voiceStartedRef = React.useRef(false);
  const lastVoiceAtRef = React.useRef(0);
  const endOfTurnSentRef = React.useRef(false);
  const vadIntervalRef = React.useRef<number | null>(null);
  const mountedRef = React.useRef(true);
  const onCompleteRef = React.useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Send audio chunk to server
  const sendAudioChunk = React.useCallback((int16: Int16Array) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    // Don't send audio after end_of_turn has been sent
    if (endOfTurnSentRef.current) return;
    ws.send(JSON.stringify({
      type: "input_audio",
      audio: arrayBufferToBase64(int16.buffer),
      mime_type: "audio/pcm",
      end_of_turn: false,
    }));
  }, []);

  // Send end of turn signal
  const sendEndOfTurn = React.useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (endOfTurnSentRef.current) return;
    console.log("[LiveAssistant] Sending end_of_turn");
    endOfTurnSentRef.current = true;
    setWaitingForResponse(true);
    ws.send(JSON.stringify({
      type: "input_audio",
      audio: "",
      mime_type: "audio/pcm",
      end_of_turn: true,
    }));
  }, []);

  // Start VAD loop
  const startVadLoop = React.useCallback(() => {
    if (vadIntervalRef.current) return;
    vadIntervalRef.current = window.setInterval(() => {
      if (!micStartedRef.current || !voiceStartedRef.current) return;
      if (endOfTurnSentRef.current) return;
      const silenceMs = Date.now() - lastVoiceAtRef.current;
      if (silenceMs >= VAD_SILENCE_MS) {
        sendEndOfTurn();
      }
    }, VAD_CHECK_INTERVAL_MS);
  }, [sendEndOfTurn]);

  // Stop VAD loop
  const stopVadLoop = React.useCallback(() => {
    if (vadIntervalRef.current) {
      window.clearInterval(vadIntervalRef.current);
      vadIntervalRef.current = null;
    }
  }, []);

  // Start mic pipeline - called when "ready" is received
  const startMicPipeline = React.useCallback(async () => {
    if (micStartedRef.current) return;
    micStartedRef.current = true;
    voiceStartedRef.current = false;
    lastVoiceAtRef.current = Date.now();
    endOfTurnSentRef.current = false;

    try {
      // Get microphone
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Create audio context
      const ctx = new AudioContext();
      audioContextRef.current = ctx;

      // Create source from stream
      const source = ctx.createMediaStreamSource(stream);
      sourceRef.current = source;

      // Create processor
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (event) => {
        const inputBuffer = event.inputBuffer.getChannelData(0);
        const rms = computeRms(inputBuffer);

        // Update level display
        if (mountedRef.current) {
          setAudioLevel(Math.min(1, rms / 0.1));
        }

        // VAD: detect voice
        if (rms >= VAD_MIN_RMS) {
          voiceStartedRef.current = true;
          lastVoiceAtRef.current = Date.now();
          endOfTurnSentRef.current = false;
        }

        // Downsample and send
        const downsampled = downsampleBuffer(inputBuffer, ctx.sampleRate, TARGET_SAMPLE_RATE);
        const int16 = pcmFloatTo16BitPCM(downsampled);
        sendAudioChunk(int16);
      };

      // Connect: source -> processor -> destination
      source.connect(processor);
      processor.connect(ctx.destination);

      // Start VAD
      startVadLoop();

      if (mountedRef.current) {
        setStatus("recording");
      }
    } catch (err) {
      if (mountedRef.current) {
        setError("Microphone access denied. Please allow microphone access.");
        setStatus("error");
      }
    }
  }, [sendAudioChunk, startVadLoop]);

  // Stop mic pipeline
  const stopMicPipeline = React.useCallback(() => {
    micStartedRef.current = false;
    stopVadLoop();

    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  }, [stopVadLoop]);

  // Play audio chunk - Gemini Live API returns raw PCM 24kHz 16-bit little-endian
  const playAudioChunk = React.useCallback(async (audioB64: string, mimeType?: string) => {
    if (!playContextRef.current) {
      playContextRef.current = new AudioContext();
    }
    const ctx = playContextRef.current;
    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    const buffer = base64ToArrayBuffer(audioB64);
    const normalizedMime = normalizeMimeType(mimeType);
    let audioBuffer: AudioBuffer | null = null;
    const bytes = new Uint8Array(buffer);
    const shouldDecodeWav =
      (normalizedMime && isWavMimeType(normalizedMime)) || isWavHeader(bytes);

    if (shouldDecodeWav) {
      try {
        audioBuffer = await ctx.decodeAudioData(buffer.slice(0));
      } catch {
        audioBuffer = null;
      }
    }

    if (!audioBuffer) {
      const sampleRate = parseSampleRate(normalizedMime, 24000);
      let pcmBytes = new Uint8Array(buffer);
      if (pendingPcmByteRef.current) {
        const pending = pendingPcmByteRef.current;
        const merged = new Uint8Array(pending.length + pcmBytes.length);
        merged.set(pending, 0);
        merged.set(pcmBytes, pending.length);
        pcmBytes = merged;
        pendingPcmByteRef.current = null;
      }
      if (pcmBytes.length % 2 !== 0) {
        pendingPcmByteRef.current = pcmBytes.slice(pcmBytes.length - 1);
        pcmBytes = pcmBytes.slice(0, pcmBytes.length - 1);
      }
      audioBuffer = pcm16ToAudioBuffer(ctx, pcmBytes.buffer, sampleRate);
    }

    const src = ctx.createBufferSource();
    src.buffer = audioBuffer;
    src.connect(ctx.destination);
    const now = ctx.currentTime;
    if (nextPlayTimeRef.current < now) {
      nextPlayTimeRef.current = now;
    }
    src.start(nextPlayTimeRef.current);
    nextPlayTimeRef.current += audioBuffer.duration;

    return new Promise<void>(resolve => {
      src.onended = () => resolve();
    });
  }, []);

  // Process play queue
  const processPlayQueue = React.useCallback(async () => {
    if (isPlayingRef.current) return;
    const next = playQueueRef.current.shift();
    if (!next) {
      // Queue empty - reset end of turn flag so we can send again
      endOfTurnSentRef.current = false;
      voiceStartedRef.current = false;
      setWaitingForResponse(false);
      // Auto-restart mic for continuous conversation after playback ends
      if (mountedRef.current && !micStartedRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
        endOfTurnSentRef.current = false;
        startMicPipeline();
      }
      return;
    }

    isPlayingRef.current = true;
    try {
      await playAudioChunk(next.audio, next.mime);
    } finally {
      isPlayingRef.current = false;
      processPlayQueue();
    }
  }, [playAudioChunk, startMicPipeline]);

  // Handle WebSocket messages
  const handleMessage = React.useCallback((event: MessageEvent) => {
    try {
      const msg = JSON.parse(event.data);
      console.log("[LiveAssistant] Received message type:", msg.type);

      if (msg.type === "ready") {
        setStatus("ready");
        // Start mic immediately when ready - just like the working utility
        startMicPipeline();
      } else if (msg.type === "assistant_audio" && msg.audio) {
        // Queue audio for playback
        playQueueRef.current.push({ audio: msg.audio, mime: msg.mime_type || "audio/pcm;rate=24000" });
        processPlayQueue();
      } else if (msg.type === "style_payload" && msg.payload) {
        console.log("[LiveAssistant] Received style_payload, calling onComplete");
        onCompleteRef.current({ stylePayload: msg.payload.trim() });
        // Close WebSocket cleanly after receiving payload
        wsRef.current?.close();
      } else if (msg.type === "session_end") {
        // Session complete - close WebSocket
        wsRef.current?.close();
      } else if (msg.type === "error") {
        setError(msg.message || "Live assistant error");
        setStatus("error");
      }
    } catch {
      // Ignore non-JSON
    }
  }, [startMicPipeline, processPlayQueue]);

  // Track if we're currently connecting to prevent race conditions
  const connectingRef = React.useRef(false);

  // Connect WebSocket
  const connect = React.useCallback(() => {
    if (wsRef.current) return;
    if (connectingRef.current) return;
    connectingRef.current = true;

    setStatus("connecting");
    setError("");

    const ws = new WebSocket(buildWebSocketUrl("/api/live"));
    wsRef.current = ws;

    ws.onopen = () => {
      connectingRef.current = false;
      ws.send(JSON.stringify({ type: "config", response_modalities: ["AUDIO"] }));
    };

    ws.onmessage = handleMessage;

    ws.onerror = () => {
      connectingRef.current = false;
      wsRef.current = null;
      setError("Failed to connect to live assistant");
      setStatus("error");
      setWaitingForResponse(false);
    };

    ws.onclose = () => {
      console.log("[LiveAssistant] WebSocket closed");
      connectingRef.current = false;
      wsRef.current = null;
      stopMicPipeline();
      // Reset endOfTurnSentRef so we can send audio on reconnect
      endOfTurnSentRef.current = false;
      voiceStartedRef.current = false;
      // Reset waiting state when connection closes unexpectedly
      setWaitingForResponse(false);
      if (mountedRef.current) {
        // If we were waiting for a response and connection closed, show error
        setStatus((prev) => {
          if (prev === "error") return "error";
          // If connection closed normally after receiving payload, that's ok
          return "idle";
        });
      }
    };
  }, [handleMessage, stopMicPipeline]);

  // Cleanup everything
  const cleanup = React.useCallback(() => {
    stopMicPipeline();
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (playContextRef.current) {
      playContextRef.current.close();
      playContextRef.current = null;
    }
    playQueueRef.current = [];
    isPlayingRef.current = false;
    nextPlayTimeRef.current = 0;
    pendingPcmByteRef.current = null;
  }, [stopMicPipeline]);

  // Restart session - go back to selection page
  const onBackRef = React.useRef(onBack);
  onBackRef.current = onBack;

  const restartSession = React.useCallback(() => {
    cleanup();
    if (onBackRef.current) {
      onBackRef.current();
    }
  }, [cleanup]);

  // Connect on mount with auto-retry
  React.useEffect(() => {
    mountedRef.current = true;
    
    // Try to connect initially
    connect();
    
    // Set up a retry if initial connection fails after 2 seconds
    const retryTimer = setTimeout(() => {
      if (mountedRef.current && !wsRef.current && statusRef.current !== "recording" && statusRef.current !== "ready") {
        connect();
      }
    }, 2000);

    return () => {
      mountedRef.current = false;
      clearTimeout(retryTimer);
      cleanup();
    };
  }, []); // Empty deps - only run once on mount

  return (
    <div className="space-y-8">
      <div>
        <h2 className="mt-3 font-display text-xl leading-[1.2] tracking-tight text-text sm:text-3xl sm:leading-[1.15]">
          Gira Live Sales Assistant
        </h2>
      </div>

      {error && (
        <div role="alert" className="space-y-3">
          <p className="text-xs text-text sm:text-sm">{error}</p>
          <Button
            onClick={connect}
            className="text-xs sm:text-sm"
          >
            Reconnect
          </Button>
        </div>
      )}

      <div className="space-y-2 rounded-lg bg-glass-highlight/10 p-4">
        <div className="flex items-center justify-between text-xs text-text/70">
          <span>Status: {status}</span>
          <span>{micStartedRef.current ? "Mic Active" : "Mic Inactive"}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text/70">Mic Level:</span>
          <div className="flex-1 h-3 bg-glass-highlight/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-gold transition-[width] duration-75"
              style={{ width: `${Math.round(audioLevel * 100)}%` }}
            />
          </div>
          <span className="text-xs text-text/70 w-8">{Math.round(audioLevel * 100)}%</span>
        </div>
        <div className="flex gap-1">
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              className={`h-4 w-1.5 rounded-sm transition-colors duration-75 ${
                audioLevel * 20 > i ? "bg-gold" : "bg-glass-highlight/30"
              }`}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={sendEndOfTurn}
          disabled={status !== "recording" || waitingForResponse}
          className="text-xs sm:text-sm"
        >
          {waitingForResponse ? "Waiting..." : "Done speaking"}
        </Button>

        {onBack && (
          <Button
            tone="ghost"
            onClick={restartSession}
            className="text-xs sm:text-sm"
          >
            Back
          </Button>
        )}
      </div>
    </div>
  );
}
