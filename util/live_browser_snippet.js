// Browser mic capture -> WebSocket -> /api/live (audio-only input)
// Uses Web Audio API, downsamples to 16k PCM, base64-encodes chunks.
//
// Usage:
// 1) Start API server: python api/index.py
// 2) Open a blank page and paste this in DevTools Console.
// 3) Call: startLive(); speak; stopLive();

let liveSocket = null;
let audioContext = null;
let sourceNode = null;
let processorNode = null;
let mediaStream = null;
let micStarted = false;
let voiceStartedAtLeastOnce = false;
let lastVoiceAtMs = 0;
let endOfTurnSent = false;
let playbackChain = Promise.resolve();
let nextPlayTime = 0;
let waitingForSummary = false;
let summaryTimeoutId = null;
let recognition = null;
let transcriptText = "";
let conversationTranscript = "";
let assistantTurnLogged = false;
let userAudioChunks = [];

const DEFAULT_WS_URL = (() => {
  const scheme = window.location.protocol === "https:" ? "wss" : "ws";
  const host = window.location.hostname || "127.0.0.1";
  const port = "5001";
  return `${scheme}://${host}:${port}/api/live`;
})();
function getLiveUrl() {
  return window.LIVE_WS_URL || DEFAULT_WS_URL;
}
const TARGET_SAMPLE_RATE = 16000;
const VAD_CHECK_INTERVAL_MS = 200;
const VAD_SILENCE_MS = 1000;
const VAD_MIN_RMS = 0.015;
const SUMMARY_TIMEOUT_MS = 120000;
let vadIntervalId = null;

function appendConversationLine(speaker, text) {
  const line = `[${speaker}]: ${text}`.trim();
  conversationTranscript = conversationTranscript
    ? `${conversationTranscript}\n${line}`
    : line;
  console.log(line);
}

function computeRms(samples) {
  let sumSq = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const s = samples[i];
    sumSq += s * s;
  }
  return Math.sqrt(sumSq / samples.length);
}

function sendEndOfTurn(reason) {
  if (!liveSocket || liveSocket.readyState !== WebSocket.OPEN) {
    return;
  }
  if (endOfTurnSent) {
    return;
  }
  endOfTurnSent = true;
  assistantTurnLogged = false;
  console.log("Auto end_of_turn:", reason);
  liveSocket.send(JSON.stringify({
    type: "input_audio",
    audio: "",
    mime_type: "audio/pcm",
    end_of_turn: true,
  }));
}

function startVadLoop() {
  if (vadIntervalId) {
    return;
  }
  vadIntervalId = window.setInterval(() => {
    if (!micStarted || !voiceStartedAtLeastOnce || endOfTurnSent) {
      return;
    }
    const now = Date.now();
    const silenceMs = now - lastVoiceAtMs;
    if (silenceMs >= VAD_SILENCE_MS) {
      sendEndOfTurn(`silence_${silenceMs}ms`);
    }
  }, VAD_CHECK_INTERVAL_MS);
}

function stopVadLoop() {
  if (vadIntervalId) {
    window.clearInterval(vadIntervalId);
    vadIntervalId = null;
  }
}

function initSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.warn("SpeechRecognition not available in this browser.");
    return null;
  }
  const rec = new SpeechRecognition();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = "en-US";
  rec.onresult = (event) => {
    let finalText = transcriptText;
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      const text = result[0]?.transcript?.trim();
      if (!text) continue;
      if (result.isFinal) {
        finalText += (finalText ? " " : "") + text;
      }
    }
    transcriptText = finalText.trim();
  };
  rec.onerror = (err) => {
    console.warn("SpeechRecognition error:", err?.error || err);
  };
  return rec;
}

function startSpeechRecognition() {
  // Browser STT is unreliable across devices. Prefer server-side STT.
  return;
}

function stopSpeechRecognition() {
  return;
}

function pcmFloatTo16BitPCM(input) {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    let s = Math.max(-1, Math.min(1, input[i]));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return output;
}

function downsampleBuffer(buffer, inputSampleRate, outputSampleRate) {
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

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(b64) {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function playPcm16leChunk(arrayBuffer, sampleRate = 24000) {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  const bytes = new Uint8Array(arrayBuffer);
  const sampleCount = Math.floor(bytes.byteLength / 2);
  if (sampleCount === 0) {
    return;
  }
  const pcm16 = new Int16Array(sampleCount);
  for (let i = 0; i < sampleCount; i += 1) {
    const lo = bytes[i * 2];
    const hi = bytes[i * 2 + 1];
    let val = (hi << 8) | lo;
    if (val & 0x8000) {
      val = val - 0x10000;
    }
    pcm16[i] = val;
  }
  const float32 = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i += 1) {
    float32[i] = Math.max(-1, Math.min(1, pcm16[i] / 0x8000));
  }
  const buffer = audioContext.createBuffer(1, sampleCount, sampleRate);
  buffer.copyToChannel(float32, 0);
  const src = audioContext.createBufferSource();
  src.buffer = buffer;
  src.connect(audioContext.destination);
  const now = audioContext.currentTime;
  if (nextPlayTime < now) {
    nextPlayTime = now;
  }
  src.start(nextPlayTime);
  nextPlayTime += buffer.duration;
}

async function decodeAndPlayAssistantAudio(audioB64, mimeType) {
  if (!audioB64) {
    return;
  }
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }
  const audioBuffer = base64ToArrayBuffer(audioB64);
  try {
    const decoded = await audioContext.decodeAudioData(audioBuffer.slice(0));
    await new Promise((resolve) => {
      const src = audioContext.createBufferSource();
      src.buffer = decoded;
      src.connect(audioContext.destination);
      src.onended = resolve;
      src.start();
    });
  } catch (err) {
    // Live responses often arrive as PCM16LE chunks without full WAV headers.
    // Fall back to treating the bytes as raw 24kHz mono PCM.
    try {
      playPcm16leChunk(audioBuffer, 24000);
    } catch (pcmErr) {
      console.error("assistant audio decode/play failed:", mimeType, err, pcmErr);
    }
  }
}

function enqueueAssistantAudio(audioB64, mimeType) {
  playbackChain = playbackChain.then(() => decodeAndPlayAssistantAudio(audioB64, mimeType));
}

function sendAudioChunk(int16Array) {
  if (!liveSocket || liveSocket.readyState !== WebSocket.OPEN) {
    return;
  }
  if (waitingForSummary) {
    return;
  }
  // Keep a copy of user audio so we can transcribe server-side on Stop.
  userAudioChunks.push(new Uint8Array(int16Array.buffer.slice(0)));
  const payload = {
    type: "input_audio",
    audio: arrayBufferToBase64(int16Array.buffer),
    mime_type: "audio/pcm",
    end_of_turn: false,
  };
  liveSocket.send(JSON.stringify(payload));
}

async function startMicPipeline() {
  if (micStarted) {
    return;
  }
  micStarted = true;
  voiceStartedAtLeastOnce = false;
  lastVoiceAtMs = 0;
  endOfTurnSent = false;
  mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  sourceNode = audioContext.createMediaStreamSource(mediaStream);

  // ScriptProcessorNode is deprecated but works in most browsers for quick testing.
  processorNode = audioContext.createScriptProcessor(4096, 1, 1);
  processorNode.onaudioprocess = (event) => {
    const inputBuffer = event.inputBuffer.getChannelData(0);
    const rms = computeRms(inputBuffer);
    const isVoice = rms >= VAD_MIN_RMS;
    if (isVoice) {
      lastVoiceAtMs = Date.now();
      voiceStartedAtLeastOnce = true;
      endOfTurnSent = false;
    }
    const downsampled = downsampleBuffer(inputBuffer, audioContext.sampleRate, TARGET_SAMPLE_RATE);
    const int16 = pcmFloatTo16BitPCM(downsampled);
    sendAudioChunk(int16);
  };

  sourceNode.connect(processorNode);
  processorNode.connect(audioContext.destination);
  startVadLoop();
  console.log("Live mic streaming started.");
}

function startLive() {
  if (liveSocket) {
    console.warn("Live session already started.");
    return;
  }

  const liveUrl = getLiveUrl();
  console.log("Connecting to live URL:", liveUrl);
  waitingForSummary = false;
  conversationTranscript = "";
  assistantTurnLogged = false;
  userAudioChunks = [];
  if (summaryTimeoutId) {
    window.clearTimeout(summaryTimeoutId);
    summaryTimeoutId = null;
  }
  // Start STT as part of the user gesture from clicking Start.
  startSpeechRecognition();
  liveSocket = new WebSocket(liveUrl);
  liveSocket.addEventListener("open", () => {
    liveSocket.send(JSON.stringify({ type: "config", response_modalities: ["AUDIO"] }));
  });

  liveSocket.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "assistant_audio") {
      if (!assistantTurnLogged && !waitingForSummary) {
        appendConversationLine("user2", "(audio response)");
        assistantTurnLogged = true;
      }
      enqueueAssistantAudio(msg.audio, msg.mime_type);
      console.log("assistant_audio chunk", msg.mime_type, msg.audio.length);
    } else if (msg.type === "ready") {
      console.log("ready:", msg.model);
      startMicPipeline().catch((err) => {
        console.error("mic error:", err);
      });
    } else if (msg.type === "assistant_text") {
      if (msg.text) {
        appendConversationLine("user2", msg.text);
        assistantTurnLogged = true;
      }
      console.log("assistant_text:", msg.text);
    } else if (msg.type === "transcript") {
      if (msg.text) {
        console.log("transcript:", msg.text);
      } else {
        console.log("transcript: (empty)", msg.warning || "");
      }
    } else if (msg.type === "style_payload") {
      console.log("style_payload:\\n", msg.payload);
    } else if (msg.type === "session_end") {
      console.log("session_end:", msg.reason);
      // Close the socket after the summary arrives.
      stopLive({ closeSocket: true, reason: msg.reason || "session_end" });
    } else if (msg.type === "error") {
      console.error("error:", msg.message);
    } else {
      console.log("message:", msg);
    }
  });

  liveSocket.addEventListener("close", (event) => {
    console.log("Live socket closed.", event.code, event.reason);
    liveSocket = null;
  });
  liveSocket.addEventListener("error", (event) => {
    console.error("Live socket error.", event);
  });
}

function teardownAudio() {
  micStarted = false;
  stopVadLoop();
  stopSpeechRecognition();
  if (processorNode) {
    processorNode.disconnect();
    processorNode = null;
  }
  if (sourceNode) {
    sourceNode.disconnect();
    sourceNode = null;
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = null;
  }
}

function stopLive(options = {}) {
  const { closeSocket = false, reason = "manual_stop" } = options;
  if (!liveSocket) {
    return;
  }
  // Build a single PCM buffer for server-side transcription.
  let audioBase64 = "";
  if (userAudioChunks.length) {
    const totalBytes = userAudioChunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    const merged = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of userAudioChunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    audioBase64 = arrayBufferToBase64(merged.buffer);
  }
  teardownAudio();

  if (!closeSocket && liveSocket.readyState === WebSocket.OPEN) {
    waitingForSummary = true;
    sendEndOfTurn(reason);
    liveSocket.send(JSON.stringify({
      type: "control",
      action: "summarize",
      transcript: "",
      conversation_transcript: conversationTranscript || "",
      audio_base64: audioBase64,
      sample_rate_hz: TARGET_SAMPLE_RATE,
    }));
    console.log("Waiting for summary...");
    if (summaryTimeoutId) {
      window.clearTimeout(summaryTimeoutId);
    }
    summaryTimeoutId = window.setTimeout(() => {
      console.warn("Summary timeout; closing socket.");
      stopLive({ closeSocket: true, reason: "summary_timeout" });
    }, SUMMARY_TIMEOUT_MS);
    return;
  }

  waitingForSummary = false;
  if (summaryTimeoutId) {
    window.clearTimeout(summaryTimeoutId);
    summaryTimeoutId = null;
  }
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
  if (liveSocket.readyState === WebSocket.OPEN || liveSocket.readyState === WebSocket.CONNECTING) {
    liveSocket.close();
  }
  liveSocket = null;
}

// Expose helpers
window.startLive = startLive;
window.stopLive = stopLive;
