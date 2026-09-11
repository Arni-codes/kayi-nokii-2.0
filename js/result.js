/**
 * KAI NOKKI - Result View Controller
 * Renders categorized reading cards, Jothishyan persona speech, and audio playback.
 */

class ResultController {
  constructor() {
    this.speechTextEl = document.getElementById("result-speech-text");
    this.loveTextEl = document.getElementById("cat-text-love");
    this.careerTextEl = document.getElementById("cat-text-career");
    this.moneyTextEl = document.getElementById("cat-text-money");
    this.personalityTextEl = document.getElementById("cat-text-personality");
    this.futureTextEl = document.getElementById("cat-text-future");
    this.playVoiceBtn = document.getElementById("btn-play-jothishyan-voice");
    this.waveformEl = document.getElementById("result-waveform");

    this.currentData = null;
    this.isPlaying = false;

    this.bindEvents();
  }

  bindEvents() {
    if (this.playVoiceBtn) {
      this.playVoiceBtn.addEventListener("click", () => this.toggleVoicePlayback());
    }

    const askBtn = document.getElementById("btn-ask-jothishyan");
    if (askBtn) {
      askBtn.addEventListener("click", () => {
        window.audioController.stopAudio();
        window.app.switchScreen("chat-screen");
      });
    }

    const scanAgainBtn = document.getElementById("btn-scan-again");
    if (scanAgainBtn) {
      scanAgainBtn.addEventListener("click", () => {
        window.audioController.stopAudio();
        window.app.startNewScan();
      });
    }
  }

  render(data) {
    this.currentData = data;
    const reading = data.reading || {};

    if (this.speechTextEl) {
      this.speechTextEl.textContent = data.summary || "Reading prepared.";
    }

    if (this.loveTextEl) this.loveTextEl.textContent = reading.love || "-";
    if (this.careerTextEl) this.careerTextEl.textContent = reading.career || "-";
    if (this.moneyTextEl) this.moneyTextEl.textContent = reading.money || "-";
    if (this.personalityTextEl) this.personalityTextEl.textContent = reading.personality || "-";
    if (this.futureTextEl) this.futureTextEl.textContent = reading.future || "-";

    // Auto-play Jothishyan audio if browser policy permits
    setTimeout(() => {
      this.playJothishyanAudio();
    }, 600);
  }

  async playJothishyanAudio() {
    if (!this.currentData) return;
    this.isPlaying = true;
    if (this.waveformEl) this.waveformEl.style.display = "flex";
    if (this.playVoiceBtn) this.playVoiceBtn.textContent = "⏹ STOP VOICE";

    const selectedVoice = window.app ? window.app.activeVoice : "male-astrologer";
    const audioUrl = this.currentData.audio_url || null;
    const speechText = this.currentData.summary || "";

    try {
      await window.audioController.playResultAudio(audioUrl, speechText, selectedVoice);
    } catch (e) {
      console.warn("Playback error:", e);
    } finally {
      this.isPlaying = false;
      if (this.waveformEl) this.waveformEl.style.display = "none";
      const btnText = window.app && window.app.activeVoice === "female-astrologer" ? "🔊 PLAY FEMALE VOICE" : "🔊 PLAY MALE VOICE";
      if (this.playVoiceBtn) this.playVoiceBtn.textContent = btnText;
    }
  }

  toggleVoicePlayback() {
    if (this.isPlaying) {
      window.audioController.stopAudio();
      this.isPlaying = false;
      if (this.waveformEl) this.waveformEl.style.display = "none";
      const btnText = window.app && window.app.activeVoice === "female-astrologer" ? "🔊 PLAY FEMALE VOICE" : "🔊 PLAY MALE VOICE";
      if (this.playVoiceBtn) this.playVoiceBtn.textContent = btnText;
    } else {
      window.audioController.unlockAudio();
      if ('speechSynthesis' in window) {
        window.speechSynthesis.resume();
      }
      this.playJothishyanAudio();
    }
  }
}

window.ResultController = ResultController;
