/**
 * KAI NOKKI - Chat Controller
 * Interactive session Q&A with the jothishyan character, retaining active palm reading context.
 */

class ChatController {
  constructor() {
    this.messagesFeedEl = document.getElementById("chat-messages-feed");
    this.chatFormEl = document.getElementById("chat-form");
    this.chatInputEl = document.getElementById("chat-input");
    this.quickPromptsEl = document.getElementById("quick-prompts-container");

    this.chatHistory = [];
    this.isSubmitting = false;

    this.bindEvents();
  }

  bindEvents() {
    if (this.chatFormEl) {
      this.chatFormEl.addEventListener("submit", (e) => {
        e.preventDefault();
        this.handleSubmit();
      });
    }

    if (this.quickPromptsEl) {
      this.quickPromptsEl.addEventListener("click", (e) => {
        const chip = e.target.closest(".prompt-chip");
        if (chip) {
          const prompt = chip.getAttribute("data-prompt") || chip.textContent;
          if (this.chatInputEl) {
            this.chatInputEl.value = prompt;
            this.handleSubmit();
          }
        }
      });
    }

    const backBtn = document.getElementById("btn-chat-back-reading");
    if (backBtn) {
      backBtn.addEventListener("click", () => {
        window.audioController.stopAudio();
        window.app.switchScreen("result-screen");
      });
    }
  }

  resetSession() {
    this.chatHistory = [];
    if (this.messagesFeedEl) {
      this.messagesFeedEl.innerHTML = "";
    }
    // Add introductory greeting
    this.appendMessage({
      role: "jothishyan",
      text: "എടാ ഉണ്ടം പാണ്ടി... കൈ ഞാൻ നോക്കിക്കഴിഞ്ഞു. ഇനി നിനക്ക് എന്താ അറിയേണ്ടത്? ചോദിക്ക് മോനേ!"
    });
  }

  async handleSubmit() {
    if (this.isSubmitting) return;
    const text = (this.chatInputEl.value || "").trim();
    if (!text) return;

    this.chatInputEl.value = "";
    this.isSubmitting = true;

    // Append user message
    this.appendMessage({ role: "user", text });
    this.chatHistory.push({ role: "user", text });

    // Show typing placeholder
    const typingIndicatorId = this.showTypingIndicator();

    try {
      const palmContext = (window.app && window.app.currentPalmData) ? window.app.currentPalmData.features : {};
      const activeVoice = "Fenrir";
      const res = await window.apiClient.sendChatMessage({
        message: text,
        palm_context: palmContext,
        chat_history: this.chatHistory,
        voice: "Fenrir"
      });

      this.removeTypingIndicator(typingIndicatorId);

      const replyText = res.text || "എടാ... കണക്ഷൻ ചെറിയൊരു പ്രശ്നത്തിലായി!";
      this.appendMessage({
        role: "jothishyan",
        text: replyText,
        audio_url: res.audio_url,
        voice: "Fenrir"
      });

      this.chatHistory.push({ role: "jothishyan", text: replyText });

      // Automatically play response Malayalam AI voice (Fenrir Deep Astrologer)
      window.audioController.playResultAudio(res.audio_url, replyText, "Fenrir");
    } catch (err) {
      this.removeTypingIndicator(typingIndicatorId);
      this.appendMessage({
        role: "jothishyan",
        text: "എടാ മൺചട്ടി മലരേ... ഇന്റർനെറ്റ് എന്തോ ഉടക്കി നിൽക്കുകയാണ്! ഒന്നുകൂടി ചോദിക്കെടാ."
      });
    } finally {
      this.isSubmitting = false;
    }
  }

  appendMessage(msg) {
    if (!this.messagesFeedEl) return;

    const msgEl = document.createElement("div");
    msgEl.className = `chat-message ${msg.role}`;

    const senderName = msg.role === "user" ? "YOU" : "FENRIR KAI NOKKI";

    msgEl.innerHTML = `
      <span class="message-sender">${senderName}</span>
      <div class="message-bubble">${this.escapeHtml(msg.text)}</div>
    `;

    // If audio URL available, add playback button
    if (msg.role === "jothishyan" && msg.text) {
      const audioBtn = document.createElement("button");
      audioBtn.className = "btn btn-secondary btn-sm message-audio-btn";
      audioBtn.style.fontSize = "11px";
      audioBtn.style.padding = "4px 8px";
      audioBtn.innerHTML = "▶ 🔊 PLAY MALE VOICE";
      audioBtn.onclick = () => {
        window.audioController.unlockAudio();
        if ('speechSynthesis' in window) {
          window.speechSynthesis.resume();
        }
        window.audioController.playResultAudio(msg.audio_url, msg.text, "Fenrir");
      };
      msgEl.appendChild(audioBtn);
    }

    this.messagesFeedEl.appendChild(msgEl);
    this.scrollToBottom();
  }

  showTypingIndicator() {
    const id = `typing-${Date.now()}`;
    const el = document.createElement("div");
    el.id = id;
    el.className = "chat-message jothishyan";
    el.innerHTML = `
      <span class="message-sender">UNNIMAYA KAI NOKKI</span>
      <div class="message-bubble" style="font-style: italic; color: var(--accent-gold);">
        Onnu nokkatte... Hmmm...
      </div>
    `;
    this.messagesFeedEl.appendChild(el);
    this.scrollToBottom();
    return id;
  }

  removeTypingIndicator(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
  }

  scrollToBottom() {
    if (this.messagesFeedEl) {
      this.messagesFeedEl.scrollTop = this.messagesFeedEl.scrollHeight;
    }
  }

  escapeHtml(str) {
    return (str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}

window.ChatController = ChatController;
