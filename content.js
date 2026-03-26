/**
 * AI Input Assistant — Content Script
 *
 * Tracks which input the user right-clicked, then opens a floating
 * dialog with a prompt field + voice recorder. On submit it calls
 * Chrome's built-in LanguageModel (Gemini Nano) and fills the target
 * input with the AI response.
 */

(function () {
  "use strict";

  // ─── State ───────────────────────────────────────────────────────────────────
  let targetInput = null; // The input/textarea the user right-clicked
  let lastContextX = 0;
  let lastContextY = 0;
  let dialogEl = null;
  let mediaRecorder = null;
  let isRecording = false;
  let recognitionResult = "";

  // ─── Track right-click target ────────────────────────────────────────────────
  document.addEventListener(
    "contextmenu",
    (e) => {
      const el = e.target;
      if (
        el.tagName === "INPUT" ||
        el.tagName === "TEXTAREA" ||
        el.isContentEditable
      ) {
        targetInput = el;
        lastContextX = e.clientX;
        lastContextY = e.clientY;
      } else {
        // Check if we're inside a content-editable or shadow DOM input
        const editable = el.closest(
          '[contenteditable="true"], [contenteditable=""]',
        );
        if (editable) {
          targetInput = editable;
          lastContextX = e.clientX;
          lastContextY = e.clientY;
        }
      }
    },
    true,
  );

  // ─── Listen for open event from background ───────────────────────────────────
  document.addEventListener("ai-assistant:open", () => {
    if (!targetInput) return;
    openDialog(lastContextX, lastContextY);
  });

  // ─── Dialog creation ─────────────────────────────────────────────────────────
  function openDialog(x, y) {
    // Remove existing dialog if any
    closeDialog();

    dialogEl = document.createElement("div");
    dialogEl.id = "ai-assistant-dialog";
    dialogEl.setAttribute("role", "dialog");
    dialogEl.setAttribute("aria-label", "AI Input Assistant");

    // Position near the right-click spot (smart clamping applied after insert)
    dialogEl.style.setProperty("--dialog-x", `${x + 12}px`);
    dialogEl.style.setProperty("--dialog-y", `${y + 8}px`);

    dialogEl.innerHTML = `
      <div class="aia-header">
        <span class="aia-icon">✦</span>
        <span class="aia-title">AI Input Assistant</span>
        <button class="aia-close" aria-label="Close" title="Close">✕</button>
      </div>

      <div class="aia-status" id="aia-status" role="status" aria-live="polite"></div>

      <div class="aia-body">
        <div class="aia-prompt-wrap">
          <textarea
            id="aia-prompt"
            class="aia-prompt"
            placeholder="Ask AI anything… or record your voice ↓"
            rows="3"
            autofocus
          ></textarea>
        </div>

        <div class="aia-toolbar">
          <button class="aia-btn aia-record" id="aia-record" title="Record voice">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="22"/>
            </svg>
            <span id="aia-record-label">Record</span>
          </button>

          <button class="aia-btn aia-send" id="aia-send" title="Send to AI">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
            Send
          </button>
        </div>
      </div>

      <div class="aia-thinking" id="aia-thinking" hidden>
        <span class="aia-dot"></span>
        <span class="aia-dot"></span>
        <span class="aia-dot"></span>
        <span class="aia-thinking-text">Thinking…</span>
      </div>
    `;

    document.body.appendChild(dialogEl);
    clampDialogPosition();

    // Wire up events
    dialogEl.querySelector(".aia-close").addEventListener("click", closeDialog);
    dialogEl.querySelector("#aia-send").addEventListener("click", handleSend);
    dialogEl
      .querySelector("#aia-record")
      .addEventListener("click", toggleRecording);
    dialogEl.querySelector("#aia-prompt").addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleSend();
      if (e.key === "Escape") closeDialog();
    });

    // Close on outside click
    setTimeout(() => {
      document.addEventListener("mousedown", outsideClickHandler);
    }, 100);

    dialogEl.querySelector("#aia-prompt").focus();
    showStatus(""); // clear
  }

  function clampDialogPosition() {
    if (!dialogEl) return;
    const rect = dialogEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let x = parseFloat(
      getComputedStyle(dialogEl).getPropertyValue("--dialog-x"),
    );
    let y = parseFloat(
      getComputedStyle(dialogEl).getPropertyValue("--dialog-y"),
    );

    if (x + rect.width > vw - 16) x = vw - rect.width - 16;
    if (y + rect.height > vh - 16) y = y - rect.height - 20;
    if (x < 8) x = 8;
    if (y < 8) y = 8;

    dialogEl.style.left = `${x}px`;
    dialogEl.style.top = `${y + window.scrollY}px`;
    dialogEl.style.setProperty("--dialog-x", "unset");
    dialogEl.style.setProperty("--dialog-y", "unset");
  }

  function closeDialog() {
    stopRecording();
    if (dialogEl) {
      dialogEl.remove();
      dialogEl = null;
    }
    document.removeEventListener("mousedown", outsideClickHandler);
  }

  function outsideClickHandler(e) {
    if (dialogEl && !dialogEl.contains(e.target)) {
      closeDialog();
    }
  }

  // ─── Status helpers ───────────────────────────────────────────────────────────
  function showStatus(msg, type = "info") {
    const el = document.getElementById("aia-status");
    if (!el) return;
    el.textContent = msg;
    el.className = `aia-status aia-status--${type}`;
    el.hidden = !msg;
  }

  function setThinking(active) {
    const el = document.getElementById("aia-thinking");
    if (el) el.hidden = !active;
    const sendBtn = document.getElementById("aia-send");
    if (sendBtn) sendBtn.disabled = active;
  }

  // ─── Voice Recording (Web Speech API) ────────────────────────────────────────
  function toggleRecording() {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }

  function startRecording() {
    if (
      !("webkitSpeechRecognition" in window) &&
      !("SpeechRecognition" in window)
    ) {
      showStatus("Speech recognition not supported in this browser.", "error");
      return;
    }

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";

    isRecording = true;
    updateRecordButton(true);
    showStatus("🎙 Listening…", "info");

    recognition.onresult = (event) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }
      const promptEl = document.getElementById("aia-prompt");
      if (promptEl) {
        promptEl.value = final || interim;
      }
      if (final) recognitionResult = final;
    };

    recognition.onerror = (e) => {
      showStatus(`Mic error: ${e.error}`, "error");
      stopRecording();
    };

    recognition.onend = () => {
      stopRecording();
      if (recognitionResult) {
        showStatus("✓ Voice captured. Press Send or edit above.", "success");
      }
    };

    recognition.start();
    window._aiaRecognition = recognition;
  }

  function stopRecording() {
    isRecording = false;
    updateRecordButton(false);
    if (window._aiaRecognition) {
      try {
        window._aiaRecognition.stop();
      } catch (_) {}
      window._aiaRecognition = null;
    }
  }

  function updateRecordButton(recording) {
    const btn = document.getElementById("aia-record");
    const label = document.getElementById("aia-record-label");
    if (!btn) return;
    btn.classList.toggle("aia-record--active", recording);
    if (label) label.textContent = recording ? "Stop" : "Record";
    btn.title = recording ? "Stop recording" : "Record voice";
  }

  // ─── AI Prompt Handling ───────────────────────────────────────────────────────
  async function handleSend() {
    const promptEl = document.getElementById("aia-prompt");
    if (!promptEl) return;

    const userPrompt = promptEl.value.trim();
    if (!userPrompt) {
      showStatus("Please enter a prompt first.", "error");
      return;
    }

    // Get any existing text in the target input to provide context
    const existingText = getInputValue(targetInput);
    const fullPrompt = existingText
      ? `The user is filling a text field that already contains:\n"${existingText}"\n\nUser's request: ${userPrompt}\n\nRespond with only the complete new text that should fill that input field. Do not add any explanation, preamble, or quotes. Just the text.`
      : `${userPrompt}\n\nRespond with only the text content. No preamble, no explanation, no quotes around the answer.`;

    setThinking(true);
    showStatus("⚡ Connecting to Gemini Nano…", "info");

    try {
      // Check if the Chrome built-in AI API is available
      if (typeof LanguageModel === "undefined") {
        throw new Error(
          "Chrome Built-in AI (LanguageModel) is not available. " +
            "Enable chrome://flags/#optimization-guide-on-device-model and " +
            "chrome://flags/#prompt-api-for-gemini-nano",
        );
      }

      const availability = await LanguageModel.availability({
        expectedInputs: [{ type: "text" }],
      });

      if (availability === "unavailable") {
        throw new Error(
          "Gemini Nano is not available on this device. " +
            "Check hardware requirements: 4GB+ VRAM or 16GB+ RAM, 22GB+ free storage.",
        );
      }

      showStatus("⬇ Preparing model…", "info");

      const session = await LanguageModel.create({
        expectedInputs: [{ type: "text" }],
        monitor(m) {
          m.addEventListener("downloadprogress", (e) => {
            const pct = Math.round(e.loaded * 100);
            showStatus(`⬇ Downloading model: ${pct}%`, "info");
          });
        },
      });

      showStatus("✦ Generating response…", "info");

      // Stream the response for better UX
      const stream = session.promptStreaming(fullPrompt);
      let fullResponse = "";

      for await (const chunk of stream) {
        fullResponse += chunk;

        // Optionally show a live preview in the target field
        if (targetInput) {
          setInputValue(targetInput, fullResponse);
        }
      }

      session.destroy();

      // Final clean result
      const cleaned = fullResponse.trim();
      if (targetInput) setInputValue(targetInput, cleaned);

      showStatus("✓ Done! Your input has been filled.", "success");
      setTimeout(closeDialog, 1200);
    } catch (err) {
      console.error("[AI Assistant]", err);
      showStatus(`Error: ${err.message}`, "error");
    } finally {
      setThinking(false);
    }
  }

  // ─── Input value helpers (handles input, textarea, contenteditable) ───────────
  function getInputValue(el) {
    if (!el) return "";
    if (el.isContentEditable) return el.innerText || el.textContent || "";
    return el.value || "";
  }

  function setInputValue(el, value) {
    if (!el) return;

    if (el.isContentEditable) {
      el.focus();
      el.innerText = value;
      // Dispatch input event so React/Vue/etc pick it up
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }

    // Use native input setter to work with React's synthetic events
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      el.tagName === "TEXTAREA"
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype,
      "value",
    )?.set;

    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(el, value);
    } else {
      el.value = value;
    }

    el.focus();
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }
})();
