(function () {
  "use strict";

  const STORAGE_KEY = "girastyle.wireframe.coldstart.v1";
  const VERSIONS_KEY = "girastyle.wireframe.versions.v1";
  const FEEDBACK_KEY = "girastyle.wireframe.feedback.v1";

  function safeJsonParse(value, fallback) {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  function readStore() {
    const existing = safeJsonParse(localStorage.getItem(STORAGE_KEY), null);
    if (existing && existing.answers) return existing;

    const params = new URLSearchParams(window.location.search || "");
    const q1 = params.get("q1") || "";
    const q2 = params.get("q2") || "";
    const q3 = params.get("q3") || "";

    if (q1 || q2 || q3) {
      const payload = { answers: { q1, q2, q3 }, updatedAt: new Date().toISOString() };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch {
        /* ignore */
      }
      return payload;
    }

    return null;
  }

  function writeStore(payload) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  }

  function writeFeedback(payload) {
    try {
      localStorage.setItem(FEEDBACK_KEY, JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  }

  function readVersionsState() {
    return safeJsonParse(localStorage.getItem(VERSIONS_KEY), {
      versions: [],
      selectedIndex: 0,
      updatedAt: "",
    });
  }

  function writeVersionsState(payload) {
    try {
      localStorage.setItem(VERSIONS_KEY, JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  }

  function qs(selector, root = document) {
    return root.querySelector(selector);
  }

  function qsa(selector, root = document) {
    return Array.from(root.querySelectorAll(selector));
  }

  function setHidden(el, hidden) {
    if (!el) return;
    el.classList.toggle("hidden", Boolean(hidden));
  }

  function setDisabled(el, disabled) {
    if (!el) return;
    el.toggleAttribute("disabled", Boolean(disabled));
    el.classList.toggle("opacity-50", Boolean(disabled));
    el.classList.toggle("cursor-not-allowed", Boolean(disabled));
  }

  function bindAnswers(root = document) {
    const data = readStore() || {};

    qsa("[data-wf-bind]", root).forEach((el) => {
      const key = String(el.getAttribute("data-wf-bind") || "").trim();
      if (!key) return;

      let value = "";
      if (data.answers && Object.prototype.hasOwnProperty.call(data.answers, key)) {
        value = String(data.answers[key] || "");
      } else if (Object.prototype.hasOwnProperty.call(data, key)) {
        value = String(data[key] || "");
      }

      el.textContent = value || "—";
    });
  }

  function initColdStart() {
    const pageRoot = qs('[data-wf-page="cold-start"]');
    if (!pageRoot) return;

    const steps = qsa("[data-wf-step]", pageRoot);
    const progressText = qs("[data-wf-progress-text]", pageRoot);
    const progressBar = qs("[data-wf-progress-bar]", pageRoot);

    const answers = { q1: "", q2: "", q3: "" };
    let index = 0;

    function updateProgress() {
      if (progressText) progressText.textContent = `${index + 1} / ${steps.length}`;
      if (progressBar) progressBar.style.width = `${((index + 1) / steps.length) * 100}%`;
    }

    function showStep(nextIndex) {
      steps.forEach((el, i) => setHidden(el, i !== nextIndex));
      index = nextIndex;
      updateProgress();
    }

    function collectStep(stepEl) {
      const form = qs("form", stepEl);
      if (!form) return true;

      const errorEl = qs("[data-wf-error]", stepEl);
      setHidden(errorEl, true);

      if (!form.checkValidity()) {
        setHidden(errorEl, false);
        return false;
      }

      const fd = new FormData(form);
      for (const [key, value] of fd.entries()) {
        if (typeof key === "string" && key in answers) answers[key] = String(value);
      }
      return true;
    }

    qsa("[data-wf-action='next']", pageRoot).forEach((btn) => {
      btn.addEventListener("click", () => {
        const current = steps[index];
        if (!collectStep(current)) return;
        showStep(Math.min(index + 1, steps.length - 1));
      });
    });

    qsa("[data-wf-action='back']", pageRoot).forEach((btn) => {
      btn.addEventListener("click", () => showStep(Math.max(index - 1, 0)));
    });

    const finishBtn = qs("[data-wf-action='finish']", pageRoot);
    if (finishBtn) {
      finishBtn.addEventListener("click", () => {
        const current = steps[index];
        if (!collectStep(current)) return;

        writeStore({ answers, updatedAt: new Date().toISOString() });

        const target = finishBtn.getAttribute("data-wf-href") || "home.html";
        const query = new URLSearchParams(answers).toString();
        window.location.href = query ? `${target}?${query}` : target;
      });
    }

    showStep(0);
  }

  function initSimpleHome() {
    const pageRoot = qs('[data-wf-page="home"]');
    if (!pageRoot) return;

    bindAnswers(pageRoot);

    const feedbackSection = qs("[data-wf-feedback]", pageRoot);
    const feedbackStatus = qs("[data-wf-feedback-status]", pageRoot);
    const btnUp = qs('[data-wf-feedback-btn="up"]', pageRoot);
    const btnDown = qs('[data-wf-feedback-btn="down"]', pageRoot);

    const versionPrev = qs("[data-wf-version-prev]", pageRoot);
    const versionNext = qs("[data-wf-version-next]", pageRoot);
    const versionLabel = qs("[data-wf-version-label]", pageRoot);

    const refineForm = qs("[data-wf-refine-form]", pageRoot);
    const refineInput = qs("[data-wf-refine-input]", pageRoot);
    const refineError = qs("[data-wf-refine-error]", pageRoot);
    const refineSubmit = qs("[data-wf-refine-submit]", pageRoot);

    const chatScroll = qs("[data-wf-chat-scroll]", pageRoot);
    const chatHistory = qs("[data-wf-chat-history]", pageRoot);

    const intentDialog = qs("[data-wf-intent-dialog]", pageRoot);
    const intentTextarea = qs("[data-wf-intent-textarea]", pageRoot);
    const intentError = qs("[data-wf-intent-error]", pageRoot);
    const intentSubmit = qs("[data-wf-intent-submit]", pageRoot);

    const textOutput = qs("[data-wf-text-output]", pageRoot);
    const imageOutput = qs("[data-wf-image-output]", pageRoot);
    const videoOutput = qs("[data-wf-video-output]", pageRoot);

    const timers = [];
    let isGenerating = false;
    let pendingRequest = "";

    function getStoredRequest() {
      const data = readStore();
      return data && typeof data.request === "string" ? data.request : "";
    }

    function setStoredRequest(requestText) {
      const nextRequest = String(requestText || "").trim();
      const current = readStore() || { answers: { q1: "", q2: "", q3: "" } };
      const next = { ...current, request: nextRequest, updatedAt: new Date().toISOString() };
      writeStore(next);
      return nextRequest;
    }

    function setFeedbackStatus(message) {
      if (!feedbackStatus) return;
      feedbackStatus.textContent = message || "—";
    }

    function stageLabel(state) {
      if (state === "pending") return "Pending";
      if (state === "loading") return "Generating";
      if (state === "done") return "Ready";
      return "—";
    }

    function setStageState(stageKey, state) {
      const stageEl = qs(`[data-wf-stage="${stageKey}"]`, pageRoot);
      if (!stageEl) return;

      setHidden(qs('[data-wf-state="pending"]', stageEl), state !== "pending");
      setHidden(qs('[data-wf-state="loading"]', stageEl), state !== "loading");
      setHidden(qs('[data-wf-state="done"]', stageEl), state !== "done");

      const badge = qs(`[data-wf-stage-badge="${stageKey}"]`, pageRoot);
      if (badge) badge.textContent = stageLabel(state);
    }

    function clearTimers() {
      while (timers.length) {
        const t = timers.pop();
        window.clearTimeout(t);
      }
    }

    function getAnswers() {
      const data = readStore();
      return data && data.answers ? data.answers : { q1: "", q2: "", q3: "" };
    }

    function buildVibe(answers) {
      return [answers.q1, answers.q2, answers.q3].filter(Boolean).join(" / ") || "—";
    }

    function buildOutputs({ requestText, versionNumber }) {
      const req = String(requestText || getStoredRequest() || "").trim() || "—";
      const vibe = buildVibe(getAnswers());

      const colors = ["Charcoal", "Navy", "Cream", "Olive", "Black"];
      const color = colors[(versionNumber - 1) % colors.length];

      return {
        text: [`Request: "${req}"`, `Vibe: ${vibe}`, "Outfit: outerwear + top + bottom + shoes", `Version: ${versionNumber}`].join(
          "\n",
        ),
        items: [
          { title: `Outerwear (v${versionNumber})`, meta: `SKU ${versionNumber}01 · Color ${color}` },
          { title: `Top (v${versionNumber})`, meta: `SKU ${versionNumber}02 · Color ${color}` },
          { title: `Bottom (v${versionNumber})`, meta: `SKU ${versionNumber}03 · Color ${color}` },
          { title: `Shoes (v${versionNumber})`, meta: `SKU ${versionNumber}04 · Color ${color}` },
        ],
        image: `Generated image (3:4) · Version ${versionNumber}`,
        video: `Generated 3-second video · Version ${versionNumber}`,
      };
    }

    function renderShopItems(items) {
      const cards = qsa("[data-wf-shop-item]", pageRoot);
      cards.forEach((card, i) => {
        const title = qs("[data-wf-shop-title]", card);
        const meta = qs("[data-wf-shop-meta]", card);
        const item = Array.isArray(items) ? items[i] : null;
        if (title) title.textContent = item && item.title ? String(item.title) : "Product —";
        if (meta) meta.textContent = item && item.meta ? String(item.meta) : "SKU — · Color —";
      });
    }

    function applyOutputs(outputs) {
      if (textOutput) textOutput.textContent = outputs && outputs.text ? String(outputs.text) : "—";
      renderShopItems(outputs && outputs.items ? outputs.items : []);
      if (imageOutput) imageOutput.textContent = outputs && outputs.image ? String(outputs.image) : "Generated image (3:4)";
      if (videoOutput) videoOutput.textContent = outputs && outputs.video ? String(outputs.video) : "Generated 3-second video";
    }

    function normalizeState(raw) {
      const versions = raw && Array.isArray(raw.versions) ? raw.versions : [];
      const selectedIndexRaw =
        raw && Number.isInteger(raw.selectedIndex) ? raw.selectedIndex : versions.length - 1;
      const selectedIndex = versions.length ? Math.max(0, Math.min(selectedIndexRaw, versions.length - 1)) : 0;
      return { versions, selectedIndex };
    }

    function writeState(next) {
      writeVersionsState({ ...next, updatedAt: new Date().toISOString() });
    }

    function updateIterateControls(state) {
      const total = state.versions.length;
      const selected = state.selectedIndex;

      if (versionLabel) versionLabel.textContent = total ? `Version ${selected + 1} / ${total}` : "Version — / —";
      setDisabled(versionPrev, isGenerating || selected <= 0);
      setDisabled(versionNext, isGenerating || selected >= total - 1);

      setDisabled(refineInput, isGenerating);
      setDisabled(refineSubmit, isGenerating);
      setDisabled(btnUp, isGenerating || total === 0);
      setDisabled(btnDown, isGenerating || total === 0);
    }

    function clearElement(el) {
      if (!el) return;
      while (el.firstChild) el.removeChild(el.firstChild);
    }

    function buildChatBubble({ role, heading, meta, text, highlight }) {
      const bubble = document.createElement("div");
      bubble.className = [
        "max-w-[92%] rounded-2xl border px-3 py-2",
        role === "user" ? "self-end bg-white" : "self-start bg-gray-50",
        highlight ? "border-gray-900" : "border-gray-200",
      ].join(" ");

      const top = document.createElement("div");
      top.className = "flex items-center justify-between gap-2 text-[11px]";

      const label = document.createElement("span");
      label.className = "font-semibold text-gray-700";
      label.textContent = heading;
      top.appendChild(label);

      if (meta) {
        const tag = document.createElement("span");
        tag.className = "text-gray-500";
        tag.textContent = meta;
        top.appendChild(tag);
      }

      const body = document.createElement("div");
      body.className = "mt-1 whitespace-pre-wrap text-sm text-gray-900";
      body.textContent = text;

      bubble.appendChild(top);
      bubble.appendChild(body);
      return bubble;
    }

    function scrollChatToBottom() {
      const scroller = chatScroll || chatHistory;
      if (!scroller) return;
      scroller.scrollTop = scroller.scrollHeight;
    }

    function renderChat(state) {
      if (!chatHistory) return;
      const nextState = state && typeof state === "object" ? state : normalizeState(readVersionsState());

      clearElement(chatHistory);

      chatHistory.appendChild(
        buildChatBubble({
          role: "assistant",
          heading: "GiraStyle",
          meta: "",
          text: ["What are you dressing for today?", "Example: 我今晚有个约会，偏深色、想显精神。"].join("\n"),
          highlight: nextState.versions.length === 0 && !pendingRequest,
        }),
      );

      nextState.versions.forEach((version, index) => {
        const requestText = version && typeof version.request === "string" ? version.request : "";
        if (requestText) {
          chatHistory.appendChild(
            buildChatBubble({
              role: "user",
              heading: "You",
              meta: `v${index + 1}`,
              text: requestText,
              highlight: index === nextState.selectedIndex && !pendingRequest,
            }),
          );
        }

        const feedback = version && typeof version.feedback === "string" ? version.feedback : "";
        const assistantLines = [`Version ${index + 1} ready (A→B→C)`];
        if (feedback === "up") assistantLines.push("Feedback: 👍 Thumb up");
        if (feedback === "down") assistantLines.push("Feedback: 👎 Thumb down");

        chatHistory.appendChild(
          buildChatBubble({
            role: "assistant",
            heading: "GiraStyle",
            meta: `v${index + 1}`,
            text: assistantLines.join("\n"),
            highlight: index === nextState.selectedIndex && !pendingRequest,
          }),
        );
      });

      if (pendingRequest) {
        chatHistory.appendChild(
          buildChatBubble({
            role: "user",
            heading: "You",
            meta: "draft",
            text: pendingRequest,
            highlight: true,
          }),
        );
        chatHistory.appendChild(
          buildChatBubble({
            role: "assistant",
            heading: "GiraStyle",
            meta: "…",
            text: "Generating A→B→C… (wireframe)",
            highlight: true,
          }),
        );
      }

      window.requestAnimationFrame(scrollChatToBottom);
    }

    function openIntentDialog() {
      if (!intentDialog) return;
      setHidden(intentDialog, false);
      setHidden(intentError, true);
      if (intentTextarea) {
        intentTextarea.value = String(getStoredRequest() || "").trim();
        intentTextarea.focus();
      }
    }

    function closeIntentDialog() {
      setHidden(intentDialog, true);
      setHidden(intentError, true);
    }

    function showFeedback(message) {
      setHidden(feedbackSection, false);
      const state = normalizeState(readVersionsState());
      updateIterateControls(state);

      setHidden(refineError, true);
      setFeedbackStatus(message || "Ready. Use ←/→ to compare versions, or enter a new request below.");
      renderChat(state);
    }

    function hideFeedback() {
      setHidden(feedbackSection, false);
      const state = normalizeState(readVersionsState());
      updateIterateControls(state);
      setFeedbackStatus("Type a request on the right to start generating.");
      setHidden(refineError, true);
      renderChat(state);
    }

    function viewVersion(nextIndex) {
      clearTimers();
      isGenerating = false;
      pendingRequest = "";

      const raw = readVersionsState();
      const state = normalizeState(raw);
      if (!state.versions.length) return;

      const idx = Math.max(0, Math.min(Number(nextIndex) || 0, state.versions.length - 1));
      const version = state.versions[idx];

      const requestText = version && typeof version.request === "string" ? version.request : "";
      if (requestText) {
        setStoredRequest(requestText);
        bindAnswers(pageRoot);
      }

      const versionNumber = version && typeof version.versionNumber === "number" ? version.versionNumber : idx + 1;
      const outputs =
        version && version.outputs && typeof version.outputs === "object"
          ? version.outputs
          : buildOutputs({ requestText, versionNumber });

      if (!version.outputs || !version.versionNumber) {
        const nextVersions = state.versions.slice();
        nextVersions[idx] = { ...version, versionNumber, outputs };
        writeState({ versions: nextVersions, selectedIndex: idx });
      } else {
        writeState({ versions: state.versions, selectedIndex: idx });
      }

      if (textOutput) textOutput.textContent = outputs.text;
      renderShopItems(outputs.items);
      if (imageOutput) imageOutput.textContent = outputs.image;
      if (videoOutput) videoOutput.textContent = outputs.video;

      setStageState("a", "done");
      setStageState("b", "done");
      setStageState("c", "done");

      showFeedback(`Viewing: Version ${idx + 1} / ${state.versions.length}`);
    }

    function recordFeedback(type) {
      const raw = readVersionsState();
      const state = normalizeState(raw);
      if (!state.versions.length) return;

      const idx = state.selectedIndex;
      const version = state.versions[idx];
      const nextVersions = state.versions.slice();
      nextVersions[idx] = { ...version, feedback: type };
      writeState({ versions: nextVersions, selectedIndex: idx });

      writeFeedback({
        type,
        versionId: version && typeof version.id === "string" ? version.id : "",
        versionNumber: idx + 1,
        at: new Date().toISOString(),
      });

      setFeedbackStatus(`Recorded: ${type === "up" ? "Thumb up" : "Thumb down"} (Version ${idx + 1})`);
      renderChat({ versions: nextVersions, selectedIndex: idx });
    }

    function runSequence({ requestText = "" } = {}) {
      clearTimers();

      const req = String(requestText || "").trim();
      if (!req) return;

      const base = normalizeState(readVersionsState());
      const versionNumber = base.versions.length + 1;
      const outputs = buildOutputs({ requestText: req, versionNumber });

      setStoredRequest(req);
      bindAnswers(pageRoot);

      pendingRequest = req;
      isGenerating = true;
      updateIterateControls(base);
      setHidden(refineError, true);
      setFeedbackStatus("Generating…");
      renderChat(base);

      setStageState("a", "loading");
      setStageState("b", "pending");
      setStageState("c", "pending");

      timers.push(
        window.setTimeout(() => {
          setStageState("a", "done");
          if (textOutput) textOutput.textContent = outputs.text;
          renderShopItems(outputs.items);
          setStageState("b", "loading");
        }, 1200),
      );

      timers.push(
        window.setTimeout(() => {
          setStageState("b", "done");
          if (imageOutput) imageOutput.textContent = outputs.image;
          setStageState("c", "loading");
        }, 1200 + 1500),
      );

      timers.push(
        window.setTimeout(() => {
          setStageState("c", "done");
          if (videoOutput) videoOutput.textContent = outputs.video;

          const finalState = normalizeState(readVersionsState());
          const nextVersion = {
            id: `v_${Date.now()}_${Math.random().toString(16).slice(2)}`,
            versionNumber,
            request: req,
            outputs,
            feedback: "",
            createdAt: new Date().toISOString(),
          };
          const nextVersions = [...finalState.versions, nextVersion];
          writeState({ versions: nextVersions, selectedIndex: nextVersions.length - 1 });

          isGenerating = false;
          pendingRequest = "";
          showFeedback(`Ready: Version ${nextVersions.length} / ${nextVersions.length}`);
        }, 1200 + 1500 + 1600),
      );
    }

    if (btnUp) btnUp.addEventListener("click", () => recordFeedback("up"));

    if (btnDown) {
      btnDown.addEventListener("click", () => {
        recordFeedback("down");
        if (refineInput) refineInput.focus();
      });
    }

    if (versionPrev) {
      versionPrev.addEventListener("click", () => {
        const state = normalizeState(readVersionsState());
        viewVersion(state.selectedIndex - 1);
      });
    }

    if (versionNext) {
      versionNext.addEventListener("click", () => {
        const state = normalizeState(readVersionsState());
        viewVersion(state.selectedIndex + 1);
      });
    }

    if (refineForm) {
      refineForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const value = refineInput ? String(refineInput.value || "").trim() : "";
        if (!value) {
          setHidden(refineError, false);
          if (refineInput) refineInput.focus();
          return;
        }
        setHidden(refineError, true);
        runSequence({ requestText: value });
        if (refineInput) refineInput.value = "";
      });
    }

    if (refineInput) {
      refineInput.addEventListener("input", () => setHidden(refineError, true));
    }

    if (intentSubmit) {
      intentSubmit.addEventListener("click", () => {
        const value = intentTextarea ? String(intentTextarea.value || "").trim() : "";
        if (!value) {
          setHidden(intentError, false);
          if (intentTextarea) intentTextarea.focus();
          return;
        }
        runSequence({ requestText: value });
      });
    }

    const existing = normalizeState(readVersionsState());
    if (existing.versions.length) {
      viewVersion(existing.selectedIndex);
      return;
    }

    const initialRequest = String(getStoredRequest() || "").trim();
    if (initialRequest) {
      runSequence({ requestText: initialRequest });
    } else {
      setStageState("a", "pending");
      setStageState("b", "pending");
      setStageState("c", "pending");
      hideFeedback();
      if (refineInput) refineInput.focus();
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    initColdStart();
    initSimpleHome();
  });
})();
