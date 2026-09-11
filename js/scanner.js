/**
 * KAI NOKKI - Scanner UI Controller
 * Coordinates live camera stream, palm guidance visual feedback, and audio cues.
 */

class ScannerController {
  constructor() {
    this.videoEl = document.getElementById("scanner-video");
    this.canvasEl = document.getElementById("scanner-canvas");
    this.guideOverlay = document.getElementById("palm-guide-overlay");
    this.alignmentValEl = document.getElementById("alignment-val");
    this.alignmentBarEl = document.getElementById("alignment-bar-fill");
    this.alignmentDescEl = document.getElementById("alignment-status-desc");
    this.stabilityValEl = document.getElementById("stability-val");
    this.stabilityBarEl = document.getElementById("stability-bar-fill");
    this.stabilityDescEl = document.getElementById("stability-status-desc");
    this.statePillText = document.getElementById("scanner-state-text");
    this.stateDot = document.getElementById("scanner-state-dot");
    this.guidanceQuoteEl = document.getElementById("jothishyan-guidance-quote");
    this.audioAnimEl = document.getElementById("scanner-audio-anim");

    this.detector = null;
    this.activeStream = null;
    this.isCapturing = false;
    this.simulationInterval = null;

    this.bindEvents();
  }

  bindEvents() {
    const manualCaptureBtn = document.getElementById("btn-manual-capture");
    if (manualCaptureBtn) {
      manualCaptureBtn.addEventListener("click", () => this.forceCapture());
    }

    if (window.audioController) {
      window.audioController.onPlayStateChange = (isPlaying, phrase) => {
        if (this.audioAnimEl) {
          this.audioAnimEl.style.display = isPlaying ? "inline-flex" : "none";
        }
        if (phrase && this.guidanceQuoteEl) {
          this.guidanceQuoteEl.textContent = `"${phrase}"`;
        }
      };
    }
  }

  startWithStream(stream) {
    this.activeStream = stream;
    this.isCapturing = false;

    if (this.videoEl) {
      this.videoEl.srcObject = stream;
      this.videoEl.play().catch(e => console.warn("Video play error:", e));
    }

    // Initialize detector
    this.detector = new HandDetector(this.videoEl, this.canvasEl);
    this.detector.onHandState = (metrics) => this.updateMetrics(metrics);
    this.detector.onCaptured = (data) => this.onPalmCaptured(data);

    this.detector.start();
    window.audioController.playScannerAudio("show_hand");
  }

  startSimulation() {
    this.isCapturing = false;
    // Simulate optical feed on canvas
    if (this.canvasEl) {
      this.canvasEl.width = 640;
      this.canvasEl.height = 480;
    }

    let progress = 0;
    window.audioController.playScannerAudio("show_hand");

    this.simulationInterval = setInterval(() => {
      progress += 4;
      let state = "HAND_DETECTED";
      let message = "Aha... kai kitti.";
      let alignment = Math.min(92, 40 + progress);
      let stability = Math.min(100, Math.max(0, (progress - 40) * 2));

      if (progress < 25) {
        state = "ALIGNING";
        message = "Kai correct ayi vekku da...";
        if (progress === 16) window.audioController.playScannerAudio("closer");
      } else if (progress < 50) {
        state = "STABILIZING";
        message = "Steady ayi vekka da...";
        if (progress === 36) window.audioController.playScannerAudio("steady");
      } else if (progress >= 95) {
        state = "CAPTURING";
        message = "Hold steady... capturing!";
        clearInterval(this.simulationInterval);
        this.simulationInterval = null;
        this.forceCapture();
        return;
      }

      this.updateMetrics({
        state,
        message,
        alignment,
        stability,
        features: {
          hand: "right",
          palm_width: 530,
          palm_height: 620,
          aspect_ratio: 1.17,
          palm_shape: "balanced_classic"
        }
      });
    }, 150);
  }

  updateMetrics(metrics) {
    if (this.isCapturing) return;

    if (this.alignmentValEl) this.alignmentValEl.textContent = `${metrics.alignment}%`;
    if (this.alignmentBarEl) this.alignmentBarEl.style.width = `${metrics.alignment}%`;
    if (this.alignmentDescEl) this.alignmentDescEl.textContent = metrics.message || "Aligning";

    if (this.stabilityValEl) this.stabilityValEl.textContent = `${metrics.stability}%`;
    if (this.stabilityBarEl) {
      this.stabilityBarEl.style.width = `${metrics.stability}%`;
      if (metrics.stability > 70) {
        this.stabilityBarEl.classList.add("stable");
      } else {
        this.stabilityBarEl.classList.remove("stable");
      }
    }

    if (this.statePillText) this.statePillText.textContent = metrics.state.replace("_", " ");
    if (this.guidanceQuoteEl && metrics.message) {
      this.guidanceQuoteEl.textContent = `"${metrics.message}"`;
    }

    if (this.guideOverlay) {
      if (metrics.alignment > 65) {
        this.guideOverlay.classList.add("active");
      } else {
        this.guideOverlay.classList.remove("active");
      }
      if (metrics.stability > 75) {
        this.guideOverlay.classList.add("stable");
      } else {
        this.guideOverlay.classList.remove("stable");
      }
    }

    // Audio triggers based on state
    if (metrics.state === "TOO_FAR") window.audioController.playScannerAudio("closer");
    else if (metrics.state === "TOO_CLOSE") window.audioController.playScannerAudio("farther");
    else if (metrics.state === "STABILIZING" && metrics.stability > 50) window.audioController.playScannerAudio("steady");
  }

  forceCapture() {
    if (this.isCapturing) return;
    this.isCapturing = true;

    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
    }
    if (this.detector) {
      this.detector.stop();
    }

    window.audioController.playScannerAudio("completed");
    
    // Dispatch to app state machine
    window.app.onPalmCaptured({
      features: {
        hand: "right",
        palm_width: 524,
        palm_height: 615,
        aspect_ratio: 1.17,
        palm_shape: "balanced_classic",
        life_line_curve: 0.82,
        heart_line_curve: 0.68,
        head_line_length: 0.88,
        fate_line_strength: 0.35
      }
    });
  }

  onPalmCaptured(captureData) {
    if (this.isCapturing) return;
    this.isCapturing = true;
    window.audioController.playScannerAudio("completed");
    window.app.onPalmCaptured(captureData);
  }

  stop() {
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
    }
    if (this.detector) {
      this.detector.stop();
      this.detector = null;
    }
    if (this.videoEl) {
      this.videoEl.srcObject = null;
    }
    if (this.activeStream) {
      this.activeStream.getTracks().forEach(track => track.stop());
      this.activeStream = null;
    }
    this.isCapturing = false;
  }
}

window.ScannerController = ScannerController;
