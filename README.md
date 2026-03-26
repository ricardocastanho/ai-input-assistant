# ✦ AI Input Assistant — Chrome Extension

Right-click any text input on any webpage to open an AI-powered dialog. Type or speak your prompt, press **Send**, and Chrome's built-in Gemini Nano fills the field with the AI's response — entirely on-device, no API keys needed.

---

## Installation

### Step 1 — Enable Chrome Built-in AI flags

Open Chrome and visit each URL below, set each to **Enabled**, then click **Relaunch**:

1. `chrome://flags/#optimization-guide-on-device-model`
2. `chrome://flags/#prompt-api-for-gemini-nano`

Then open DevTools Console and run:
```js
await LanguageModel.availability();
// Should eventually return "available"
```

> **Note:** The first run downloads Gemini Nano (~1.7 GB). Requires 22 GB free storage, 4 GB+ VRAM or 16 GB+ RAM.

### Step 2 — Load the extension

1. Open `chrome://extensions/`
2. Enable **Developer mode** (toggle in the top-right)
3. Click **Load unpacked**
4. Select this folder (`ai-input-assistant/`)

The ✦ icon will appear in your toolbar — you're ready!

---

## How to Use

1. **Right-click** any text input or textarea on any webpage
2. Select **✨ AI Input Assistant** from the context menu
3. A floating dialog appears near your cursor
4. **Type** your prompt, or click **Record** to speak it
5. Press **Send** (or `Ctrl+Enter` / `Cmd+Enter`)
6. The AI response fills the input field automatically

---

## Features

- 🎙 **Voice input** via Web Speech API
- ⚡ **Streaming responses** — see text fill in real time
- 🔒 **100% on-device** — Gemini Nano runs locally, no data sent anywhere
- 🌐 **Works on any site** — inputs, textareas, and contenteditable elements
- ⚛️ **React/Vue compatible** — fires native input events so frameworks pick up changes

---

## Hardware Requirements

| Requirement | Minimum |
|-------------|---------|
| OS | Windows 10/11, macOS 13+, Linux |
| Free storage | 22 GB |
| GPU VRAM | > 4 GB |
| RAM (CPU mode) | 16 GB |

---

## Troubleshooting

**"LanguageModel is not available"**  
→ Make sure both Chrome flags are enabled and Chrome is restarted.

**"unavailable" from availability()**  
→ Check hardware requirements above.

**Model downloading slowly**  
→ The first download is ~1.7 GB. Wait and retry — Chrome downloads it in the background.

**Speech recognition not working**  
→ Allow microphone permission when prompted. Works in Chrome only.
