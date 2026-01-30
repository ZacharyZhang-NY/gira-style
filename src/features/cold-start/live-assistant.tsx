"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";

type LiveAssistantPayload = {
  stylePayload: string;
};

type LiveAssistantProps = {
  onComplete: (payload: LiveAssistantPayload) => void;
  autoEnableMic?: boolean;
  initialStream?: MediaStream | null;
  initialInputContext?: AudioContext | null;
  onBack?: () => void;
};

const TARGET_SAMPLE_RATE = 16000;
const VAD_CHECK_INTERVAL_MS = 200;
const VAD_SILENCE_MS = 1000;
const VAD_MIN_RMS = 0.015;
const INPUT_BUFFER_SIZE = 4096;

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function computeRms(samples: Float32Array) {
  let sumSq = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const s = samples[i];
    sumSq += s * s;
  }
  return Math.sqrt(sumSq / samples.length);
}

function downsampleBuffer(
  buffer: Float32Array,
  inputSampleRate: number,
  outputSampleRate: number,
) {
  if (outputSampleRate === inputSampleRate) {
    return buffer;
  }
  const ratio = inputSampleRate / outputSampleRate;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
    let sum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i += 1) {
      sum += buffer[i];
      count += 1;
    }
    result[offsetResult] = sum / count;
    offsetResult += 1;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
}

function pcmFloatTo16BitPCM(input: Float32Array) {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    let s = Math.max(-1, Math.min(1, input[i]));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return output;
}

function base64ToArrayBuffer(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function parseSampleRate(mimeType?: string) {
  if (!mimeType) return null;
  const match = mimeType.match(/rate=(\d+)/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function pcm16leToFloat32(arrayBuffer: ArrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const sampleCount = Math.floor(bytes.byteLength / 2);
  const pcm16 = new Int16Array(sampleCount);
  for (let i = 0; i < sampleCount; i += 1) {
    const lo = bytes[i * 2];
    const hi = bytes[i * 2 + 1];
    let val = (hi << 8) | lo;
    if (val & 0x8000) {
      val -= 0x10000;
    }
    pcm16[i] = val;
  }
  const float32 = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i += 1) {
    float32[i] = Math.max(-1, Math.min(1, pcm16[i] / 0x8000));
  }
  return float32;
}

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function buildWebSocketUrl(path: string) {
  const liveOverride = process.env.NEXT_PUBLIC_LIVE_WS_URL;
  if (liveOverride) {
    const base = stripTrailingSlash(liveOverride);
    return base.endsWith(path) ? base : `${base}${path}`;
  }
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (configured) {
    const base = stripTrailingSlash(configured);
    return base.replace(/^http/, "ws") + path;
  }

  if (typeof window === "undefined") return path;

  const { hostname, protocol } = window.location;

  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return `ws://${hostname}:5001${path}`;
  }

  if (hostname === "aura-style-agent.vercel.app" || hostname.endsWith(".vercel.app")) {
    return `wss://aritzia.girastyleai.com${path}`;
  }

  const codespacePattern = /-(\d+)\.app\.github\.dev$/;
  const match = hostname.match(codespacePattern);
  if (match) {
    const currentPort = match[1];
    if (currentPort !== "5001") {
      const newHostname = hostname.replace(codespacePattern, "-5001.app.github.dev");
      return `wss://${newHostname}${path}`;
    }
  }

  const wsProtocol = protocol === "https:" ? "wss:" : "ws:";
  return `${wsProtocol}//${hostname}${path}`;
}

export function LiveAssistant({
  onComplete,
  onBack,
  autoEnableMic = false,
  initialStream = null,
  initialInputContext = null,
}: LiveAssistantProps) {
  const [status, setStatus] = React.useState<
    "idle" | "connecting" | "ready" | "recording" | "processing" | "error"
  >("idle");
  const [error, setError] = React.useState<string>("");
  const [micEnabled, setMicEnabled] = React.useState(false);
  const statusRef = React.useRef(status);
  const wsRef = React.useRef<WebSocket | null>(null);
  const queueRef = React.useRef<Array<{ audio: string; mimeType?: string }>>(
    [],
  );
  const playingRef = React.useRef(false);
  const playbackTimeRef = React.useRef(0);
  const audioContextRef = React.useRef<AudioContext | null>(null);
  const inputContextRef = React.useRef<AudioContext | null>(null);
  const inputStreamRef = React.useRef<MediaStream | null>(null);
  const inputSourceRef = React.useRef<MediaStreamAudioSourceNode | null>(null);
  const inputProcessorRef = React.useRef<ScriptProcessorNode | null>(null);
  const inputGainRef = React.useRef<GainNode | null>(null);
  const ownsInputStreamRef = React.useRef(false);
  const ownsInputContextRef = React.useRef(false);
  const vadIntervalRef = React.useRef<number | null>(null);
  const recordingRef = React.useRef(false);
  const voiceStartedRef = React.useRef(false);
  const lastVoiceAtRef = React.useRef(0);
  const endOfTurnSentRef = React.useRef(false);
  const userActivatedRef = React.useRef(false);
  const readyRef = React.useRef(false);
  const autoEnableAttemptedRef = React.useRef(false);
  const autoRecordTimerRef = React.useRef<number | null>(null);
  const startRetryTimerRef = React.useRef<number | null>(null);

  const clearAutoRecordTimer = React.useCallback(() => {
    if (typeof window === "undefined") return;
    if (autoRecordTimerRef.current !== null) {
      window.clearTimeout(autoRecordTimerRef.current);
      autoRecordTimerRef.current = null;
    }
  }, []);

  const clearStartRetryTimer = React.useCallback(() => {
    if (typeof window === "undefined") return;
    if (startRetryTimerRef.current !== null) {
      window.clearTimeout(startRetryTimerRef.current);
      startRetryTimerRef.current = null;
    }
  }, []);

  const stopVadLoop = React.useCallback(() => {
    if (typeof window === "undefined") return;
    if (vadIntervalRef.current !== null) {
      window.clearInterval(vadIntervalRef.current);
      vadIntervalRef.current = null;
    }
  }, []);

  React.useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const sendEndOfTurn = React.useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    if (endOfTurnSentRef.current) return;
    endOfTurnSentRef.current = true;
    recordingRef.current = false;
    stopVadLoop();
    wsRef.current.send(
      JSON.stringify({
        type: "input_audio",
        audio: "",
        mime_type: "audio/pcm",
        end_of_turn: true,
      }),
    );
    setStatus("ready");
  }, [stopVadLoop]);

  const sendAudioChunk = React.useCallback((chunk: Int16Array) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    if (!recordingRef.current) return;
    wsRef.current.send(
      JSON.stringify({
        type: "input_audio",
        audio: arrayBufferToBase64(chunk.buffer),
        mime_type: "audio/pcm",
        end_of_turn: false,
      }),
    );
  }, []);

  const ensureInputPipeline = React.useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Voice recording isn't supported in this browser.");
      setStatus("error");
      throw new Error("media_devices_unavailable");
    }
    setError("");
    let stream = inputStreamRef.current;
    if (!stream) {
      if (initialStream) {
        stream = initialStream;
        inputStreamRef.current = stream;
        ownsInputStreamRef.current = false;
      }
    }
    if (!stream) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      } catch {
        setError("Microphone access is blocked. Enable it and try again.");
        setStatus("error");
        throw new Error("mic_blocked");
      }
      inputStreamRef.current = stream;
      ownsInputStreamRef.current = true;
    }
    let context = inputContextRef.current;
    if (!context) {
      if (initialInputContext) {
        context = initialInputContext;
        inputContextRef.current = context;
        ownsInputContextRef.current = false;
      }
    }
    if (!context) {
      context = new AudioContext();
      inputContextRef.current = context;
      ownsInputContextRef.current = true;
    }
    if (context.state === "suspended") {
      await context.resume();
    }
    if (!inputSourceRef.current) {
      inputSourceRef.current = context.createMediaStreamSource(stream);
    }
    if (!inputProcessorRef.current) {
      const processor = context.createScriptProcessor(INPUT_BUFFER_SIZE, 1, 1);
      processor.onaudioprocess = (event) => {
        if (!recordingRef.current) return;
        const inputBuffer = event.inputBuffer.getChannelData(0);
        const rms = computeRms(inputBuffer);
        if (rms >= VAD_MIN_RMS) {
          voiceStartedRef.current = true;
          lastVoiceAtRef.current = Date.now();
          endOfTurnSentRef.current = false;
        }
        const downsampled = downsampleBuffer(
          inputBuffer,
          context.sampleRate,
          TARGET_SAMPLE_RATE,
        );
        const int16 = pcmFloatTo16BitPCM(downsampled);
        sendAudioChunk(int16);
      };
      inputProcessorRef.current = processor;
      const gain = context.createGain();
      gain.gain.value = 0;
      inputGainRef.current = gain;
      processor.connect(gain);
      gain.connect(context.destination);
      inputSourceRef.current.connect(processor);
    }
  }, [initialInputContext, initialStream, sendAudioChunk]);

  const startVadLoop = React.useCallback(() => {
    if (typeof window === "undefined") return;
    if (vadIntervalRef.current !== null) return;
    vadIntervalRef.current = window.setInterval(() => {
      if (!recordingRef.current || !voiceStartedRef.current) return;
      if (endOfTurnSentRef.current) return;
      const silenceMs = Date.now() - lastVoiceAtRef.current;
      if (silenceMs >= VAD_SILENCE_MS) {
        sendEndOfTurn();
      }
    }, VAD_CHECK_INTERVAL_MS);
  }, [sendEndOfTurn]);

  const teardownMedia = React.useCallback(() => {
    clearAutoRecordTimer();
    clearStartRetryTimer();
    stopVadLoop();
    recordingRef.current = false;
    if (inputProcessorRef.current) {
      inputProcessorRef.current.disconnect();
      inputProcessorRef.current = null;
    }
    if (inputSourceRef.current) {
      inputSourceRef.current.disconnect();
      inputSourceRef.current = null;
    }
    if (inputGainRef.current) {
      inputGainRef.current.disconnect();
      inputGainRef.current = null;
    }
    if (inputStreamRef.current) {
      if (ownsInputStreamRef.current) {
        inputStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      inputStreamRef.current = null;
    }
    if (inputContextRef.current) {
      if (ownsInputContextRef.current) {
        inputContextRef.current.close().catch(() => undefined);
      }
      inputContextRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => undefined);
      audioContextRef.current = null;
    }
  }, [clearAutoRecordTimer, clearStartRetryTimer, stopVadLoop]);

  const stopRecording = React.useCallback(() => {
    recordingRef.current = false;
    stopVadLoop();
    setStatus("ready");
  }, [stopVadLoop]);

  const startRecording = React.useCallback(async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return false;
    if (!userActivatedRef.current) return false;
    if (recordingRef.current) return true;
    try {
      await ensureInputPipeline();
    } catch {
      return false;
    }
    endOfTurnSentRef.current = false;
    voiceStartedRef.current = false;
    lastVoiceAtRef.current = Date.now();
    recordingRef.current = true;
    setMicEnabled(true);
    setStatus("recording");
    startVadLoop();
    return true;
  }, [ensureInputPipeline, startVadLoop]);

  const attemptStartRecording = React.useCallback(async () => {
    if (!userActivatedRef.current) return;
    if (!readyRef.current) return;
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    if (recordingRef.current) return;
    const started = await startRecording();
    if (!started && typeof window !== "undefined") {
      clearStartRetryTimer();
      startRetryTimerRef.current = window.setTimeout(() => {
        startRetryTimerRef.current = null;
        void attemptStartRecording();
      }, 300);
    }
  }, [clearStartRetryTimer, startRecording]);

  const scheduleAutoRecord = React.useCallback(
    (delayMs = 200) => {
      if (typeof window === "undefined") return;
      if (!userActivatedRef.current) return;
      clearAutoRecordTimer();
      autoRecordTimerRef.current = window.setTimeout(() => {
        autoRecordTimerRef.current = null;
        void startRecording();
      }, delayMs);
    },
    [clearAutoRecordTimer, startRecording],
  );

  const playNext = React.useCallback(() => {
    if (playingRef.current) return;
    const next = queueRef.current.shift();
    if (!next) {
      scheduleAutoRecord();
      return;
    }
    playingRef.current = true;
    const playChunk = async () => {
      try {
        if (!audioContextRef.current) {
          audioContextRef.current = new AudioContext();
        }
        const context = audioContextRef.current;
        if (context.state === "suspended") {
          await context.resume();
        }
        const buffer = base64ToArrayBuffer(next.audio);
        try {
          const decoded = await context.decodeAudioData(buffer.slice(0));
          await new Promise<void>((resolve) => {
            const src = context.createBufferSource();
            src.buffer = decoded;
            src.connect(context.destination);
            const now = context.currentTime;
            if (playbackTimeRef.current < now) {
              playbackTimeRef.current = now;
            }
            src.onended = () => resolve();
            src.start(playbackTimeRef.current);
            playbackTimeRef.current += decoded.duration;
          });
          return;
        } catch {
          const sampleRate = parseSampleRate(next.mimeType) ?? 24000;
          const float32 = pcm16leToFloat32(buffer);
          const audioBuffer = context.createBuffer(
            1,
            float32.length,
            sampleRate,
          );
          audioBuffer.copyToChannel(float32, 0);
          await new Promise<void>((resolve) => {
            const src = context.createBufferSource();
            src.buffer = audioBuffer;
            src.connect(context.destination);
            const now = context.currentTime;
            if (playbackTimeRef.current < now) {
              playbackTimeRef.current = now;
            }
            src.onended = () => resolve();
            src.start(playbackTimeRef.current);
            playbackTimeRef.current += audioBuffer.duration;
          });
        }
      } finally {
        playingRef.current = false;
        playNext();
      }
    };
    void playChunk();
  }, [scheduleAutoRecord]);

  const handleSocketMessage = React.useCallback(
    (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data) as {
          type?: string;
          message?: string;
          text?: string;
          audio?: string;
          mime_type?: string;
          payload?: string;
        };
        switch (payload.type) {
          case "ready":
            setStatus("ready");
            setError("");
            statusRef.current = "ready";
            readyRef.current = true;
            void attemptStartRecording();
            return;
          case "assistant_text":
            return;
          case "assistant_audio":
            if (payload.audio) {
              clearAutoRecordTimer();
              stopRecording();
              queueRef.current.push({
                audio: payload.audio,
                mimeType: payload.mime_type || "audio/wav",
              });
              playNext();
            }
            return;
          case "style_payload": {
            const stylePayload = payload.payload?.trim();
            if (!stylePayload) {
              setError(
                "We couldn't capture the style summary. Please try the live assistant again.",
              );
              setStatus("error");
              return;
            }
            onComplete({ stylePayload });
            wsRef.current?.close();
            return;
          }
          case "error":
            setError(payload.message || "Live assistant error.");
            setStatus("error");
            return;
          default:
            return;
        }
      } catch {
        // Ignore non-JSON frames.
      }
    },
    [
      clearAutoRecordTimer,
      onComplete,
      playNext,
      scheduleAutoRecord,
      stopRecording,
    ],
  );

  const connect = React.useCallback(() => {
    if (wsRef.current) {
      if (
        wsRef.current.readyState !== WebSocket.CLOSED &&
        wsRef.current.readyState !== WebSocket.CLOSING
      ) {
        return;
      }
      wsRef.current = null;
    }
    setStatus("connecting");
    setError("");
    const ws = new WebSocket(buildWebSocketUrl("/api/live"));
    wsRef.current = ws;
    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: "config",
          response_modalities: ["AUDIO"],
        }),
      );
      if (userActivatedRef.current) {
        void attemptStartRecording();
      }
    };
    ws.onmessage = handleSocketMessage;
    ws.onerror = () => {
      setError("Unable to connect to the live assistant.");
      setStatus("error");
    };
    ws.onclose = () => {
      wsRef.current = null;
      stopRecording();
      setStatus((prev) => (prev === "error" ? prev : "idle"));
    };
  }, [attemptStartRecording, handleSocketMessage, stopRecording]);

  const resetSession = React.useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    queueRef.current = [];
    playingRef.current = false;
    playbackTimeRef.current = 0;
    userActivatedRef.current = false;
    readyRef.current = false;
    teardownMedia();
    setError("");
    setMicEnabled(false);
    setStatus("idle");
  }, [teardownMedia]);

  const restartSession = React.useCallback(() => {
    resetSession();
    connect();
  }, [connect, resetSession]);

  const handleEnableMic = React.useCallback(async () => {
    userActivatedRef.current = true;
    try {
      await ensureInputPipeline();
      setMicEnabled(true);
    } catch {
      return;
    }
    await attemptStartRecording();
  }, [attemptStartRecording, ensureInputPipeline]);

  React.useEffect(() => {
    if (!autoEnableMic) return;
    if (autoEnableAttemptedRef.current) return;
    autoEnableAttemptedRef.current = true;
    void handleEnableMic();
  }, [autoEnableMic, handleEnableMic]);

  React.useEffect(() => {
    if (initialStream && !userActivatedRef.current) {
      userActivatedRef.current = true;
      setMicEnabled(true);
      void attemptStartRecording();
    }
  }, [attemptStartRecording, initialStream]);

  React.useEffect(() => {
    connect();
    return () => {
      const current = wsRef.current;
      wsRef.current = null;
      current?.close();
      teardownMedia();
    };
  }, [connect, teardownMedia]);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="mt-3 font-display text-xl leading-[1.2] tracking-tight text-text sm:text-3xl sm:leading-[1.15]">
          Gira Live Sales Assistant
        </h2>
      </div>

      {error ? (
        <p role="alert" className="text-xs text-text sm:text-sm">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        {!micEnabled ? (
          <Button
            tone="ghost"
            onClick={handleEnableMic}
            className="text-xs sm:text-sm"
          >
            Enable microphone
          </Button>
        ) : null}

        <Button
          tone="ghost"
          onClick={restartSession}
          className="text-xs sm:text-sm"
        >
          Restart session
        </Button>

        {onBack ? (
          <Button
            tone="ghost"
            onClick={onBack}
            className="text-xs sm:text-sm"
          >
            Back
          </Button>
        ) : null}
      </div>
    </div>
  );
}
