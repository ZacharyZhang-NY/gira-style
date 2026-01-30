"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  COLD_START_QUESTIONS,
  EMPTY_COLD_START_ANSWERS,
  type ColdStartAnswers,
} from "./questions";

type LiveAssistantProps = {
  onComplete: (answers: ColdStartAnswers) => void;
  onBack?: () => void;
};


const AUDIO_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/ogg",
  "audio/wav",
];

const MAX_RECORDING_MS = 9000;
const MIN_RECORDING_MS = 1200;
const SILENCE_DURATION_MS = 900;
const SILENCE_THRESHOLD = 0.02;

function getPreferredMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  const supported = AUDIO_MIME_TYPES.find((type) =>
    MediaRecorder.isTypeSupported(type),
  );
  return supported || "";
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
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

function buildLiveSystemInstruction() {
  const questionLines = COLD_START_QUESTIONS.map((question, index) => {
    const values = question.options.map((opt) => `"${opt.value}"`).join(", ");
    const selectNote = question.multi
      ? "Multiple selections allowed."
      : "Choose exactly one.";
    return `Q${index + 1} (${question.id}): ${question.title}\nAllowed answers: ${values}\n${selectNote}`;
  }).join("\n\n");

  return [
    "You are Gira, a live sales assistant. Ask the four questions below in order.",
    "Ask ONE question per turn, wait for the user's reply, then confirm briefly before the next question.",
    "Use the exact question wording and answer choices provided. If the user's answer is unclear, ask a short follow-up to map it to the allowed answers.",
    "After all four questions are answered, say one short confirmation sentence, then immediately output the JSON payload wrapped with the markers exactly as shown.",
    "Payload format:",
    "---BEGIN_STYLE_PAYLOAD---",
    "{\"q1\":[\"\"],\"q2\":[\"\"],\"q3\":[\"\"],\"q4\":\"\"}",
    "---END_STYLE_PAYLOAD---",
    "Use ONLY the allowed answer values in the payload. Do not add extra keys. Do not add any text after the payload.",
    "",
    "Questions:",
    questionLines,
  ].join("\n");
}

function extractJson(rawText: string) {
  let cleaned = rawText.replace(/^\uFEFF/, "").trim();
  if (!cleaned) return "";

  cleaned = cleaned.replace(/tool_code/g, "").trim();
  cleaned = cleaned.replace(/^```json\s*/i, "");
  cleaned = cleaned.replace(/^```\s*/i, "");
  cleaned = cleaned.replace(/```\s*$/g, "");

  const jsonStart = cleaned.indexOf("{");
  const jsonEnd = cleaned.lastIndexOf("}");
  if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
    cleaned = cleaned.slice(jsonStart, jsonEnd + 1);
  }
  return cleaned.trim();
}

function coerceAnswers(payload: string): ColdStartAnswers | null {
  if (!payload) return null;
  try {
    const cleaned = extractJson(payload);
    const parsed = cleaned ? (JSON.parse(cleaned) as Partial<ColdStartAnswers>) : null;
    if (!parsed) return null;

    const allowed = Object.fromEntries(
      COLD_START_QUESTIONS.map((question) => [
        question.id,
        new Set(question.options.map((opt) => opt.value)),
      ]),
    ) as Record<keyof ColdStartAnswers, Set<string>>;

    const normalizeMulti = (value: unknown) => {
      if (Array.isArray(value)) {
        return value.filter(
          (item): item is string =>
            typeof item === "string" && item.trim().length > 0,
        );
      }
      if (typeof value === "string" && value.trim()) return [value.trim()];
      return [];
    };

    const q1 = normalizeMulti(parsed.q1).filter((value) => allowed.q1.has(value));
    const q2 = normalizeMulti(parsed.q2).filter((value) => allowed.q2.has(value));
    const q3 = normalizeMulti(parsed.q3).filter((value) => allowed.q3.has(value));
    const q4Candidate = typeof parsed.q4 === "string" ? parsed.q4.trim() : "";
    const q4 = allowed.q4.has(q4Candidate) ? q4Candidate : "";

    if (!q1.length || !q2.length || !q3.length || !q4) return null;

    return {
      ...EMPTY_COLD_START_ANSWERS,
      q1,
      q2,
      q3,
      q4,
    };
  } catch {
    return null;
  }
}

export function LiveAssistant({ onComplete, onBack }: LiveAssistantProps) {
  const [status, setStatus] = React.useState<
    "idle" | "connecting" | "ready" | "recording" | "processing" | "error"
  >("idle");
  const [error, setError] = React.useState<string>("");
  const statusRef = React.useRef(status);
  const wsRef = React.useRef<WebSocket | null>(null);
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const queueRef = React.useRef<Array<{ audio: string; mimeType?: string }>>(
    [],
  );
  const playingRef = React.useRef(false);
  const playbackTimeRef = React.useRef(0);
  const audioContextRef = React.useRef<AudioContext | null>(null);
  const analyserRef = React.useRef<AnalyserNode | null>(null);
  const sourceRef = React.useRef<MediaStreamAudioSourceNode | null>(null);
  const rafRef = React.useRef<number | null>(null);
  const recordingStartRef = React.useRef<number>(0);
  const silenceStartRef = React.useRef<number | null>(null);
  const autoRecordTimerRef = React.useRef<number | null>(null);

  const clearAutoRecordTimer = React.useCallback(() => {
    if (typeof window === "undefined") return;
    if (autoRecordTimerRef.current !== null) {
      window.clearTimeout(autoRecordTimerRef.current);
      autoRecordTimerRef.current = null;
    }
  }, []);

  const stopMonitoring = React.useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    silenceStartRef.current = null;
  }, []);

  React.useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const teardownMedia = React.useCallback(() => {
    clearAutoRecordTimer();
    stopMonitoring();
    recorderRef.current?.stop();
    recorderRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => undefined);
      audioContextRef.current = null;
    }
  }, [clearAutoRecordTimer, stopMonitoring]);

  const stopRecording = React.useCallback(() => {
    stopMonitoring();
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
  }, [stopMonitoring]);

  const startRecording = React.useCallback(async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    if (statusRef.current !== "ready") return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Voice recording isn't supported in this browser.");
      setStatus("error");
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      setError("Voice recording isn't available on this device.");
      setStatus("error");
      return;
    }
    setError("");
    setStatus("recording");
    try {
      if (!streamRef.current) {
        streamRef.current = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
      }
    } catch {
      setError("Microphone access is blocked. Enable it and try again.");
      setStatus("error");
      return;
    }
    const mimeType = getPreferredMimeType();
    const recorder = new MediaRecorder(
      streamRef.current,
      mimeType ? { mimeType } : undefined,
    );
    recorderRef.current = recorder;
    chunksRef.current = [];
    stopMonitoring();
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = async () => {
      stopMonitoring();
      const blob = new Blob(chunksRef.current, { type: mimeType || undefined });
      chunksRef.current = [];
      setStatus("processing");
      try {
        const dataUrl = await blobToDataUrl(blob);
        wsRef.current?.send(
          JSON.stringify({
            type: "input_audio",
            audio: dataUrl,
            mime_type: blob.type || undefined,
            end_of_turn: true,
          }),
        );
        setStatus("ready");
      } catch {
        setError("We couldn't send that recording. Try again.");
        setStatus("error");
      }
    };
    if (streamRef.current) {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }
      if (sourceRef.current) {
        sourceRef.current.disconnect();
      }
      const source = audioContextRef.current.createMediaStreamSource(
        streamRef.current,
      );
      const analyser = audioContextRef.current.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      sourceRef.current = source;
      analyserRef.current = analyser;
      const data = new Uint8Array(analyser.fftSize);
      recordingStartRef.current = performance.now();
      silenceStartRef.current = null;
      const monitor = () => {
        if (!recorderRef.current || recorderRef.current.state !== "recording") return;
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i += 1) {
          const normalized = (data[i] - 128) / 128;
          sum += normalized * normalized;
        }
        const rms = Math.sqrt(sum / data.length);
        const now = performance.now();
        const elapsed = now - recordingStartRef.current;
        if (rms < SILENCE_THRESHOLD) {
          if (silenceStartRef.current === null) {
            silenceStartRef.current = now;
          }
          if (
            silenceStartRef.current &&
            now - silenceStartRef.current > SILENCE_DURATION_MS &&
            elapsed > MIN_RECORDING_MS
          ) {
            stopRecording();
            return;
          }
        } else {
          silenceStartRef.current = null;
        }
        if (elapsed > MAX_RECORDING_MS) {
          stopRecording();
          return;
        }
        rafRef.current = requestAnimationFrame(monitor);
      };
      rafRef.current = requestAnimationFrame(monitor);
    }
    recorder.start();
  }, [stopMonitoring, stopRecording]);

  const scheduleAutoRecord = React.useCallback(
    (delayMs = 200) => {
      if (typeof window === "undefined") return;
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
            return;
          case "assistant_text":
            return;
          case "assistant_audio":
            if (payload.audio) {
              clearAutoRecordTimer();
              queueRef.current.push({
                audio: payload.audio,
                mimeType: payload.mime_type || "audio/wav",
              });
              playNext();
            }
            return;
          case "style_payload": {
            const parsed = payload.payload ? coerceAnswers(payload.payload) : null;
            if (!parsed) {
              setError(
                "We couldn't read the voice answers. Please try the live assistant again.",
              );
              setStatus("error");
              return;
            }
            onComplete(parsed);
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
    [clearAutoRecordTimer, onComplete, playNext],
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
      const systemInstruction = buildLiveSystemInstruction();
      ws.send(
        JSON.stringify({
          type: "config",
          response_modalities: ["AUDIO"],
          system_instruction: systemInstruction,
        }),
      );
    };
    ws.onmessage = handleSocketMessage;
    ws.onerror = () => {
      setError("Unable to connect to the live assistant.");
      setStatus("error");
    };
    ws.onclose = () => {
      wsRef.current = null;
      setStatus((prev) => (prev === "error" ? prev : "idle"));
    };
  }, [handleSocketMessage]);

  const resetSession = React.useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    queueRef.current = [];
    playingRef.current = false;
    playbackTimeRef.current = 0;
    teardownMedia();
    setError("");
    setStatus("idle");
  }, [teardownMedia]);

  const restartSession = React.useCallback(() => {
    resetSession();
    connect();
  }, [connect, resetSession]);

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
