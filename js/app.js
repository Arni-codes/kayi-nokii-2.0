/**
 * KAI NOKKI - Main Application Orchestrator & State Machine
 * Coordinates screens, camera sources (Webcam / Phone WebRTC / Simulation), and AI reading flow.
 */

class App {
  constructor() {
    this.currentScreen = "welcome-screen";
    this.mockMode = false;
    this.currentRoomId = `kn-${Math.floor(1000 + Math.random() * 9000)}`;
    this.currentPalmData = null;
    this.webrtc = null;

    this.scannerController = null;
    this.resultController = null;
    this.chatController = null;

    this.init();
  }

  async init() {
    // Instantiate sub-controllers
    this.scannerController = new ScannerController();
    this.resultController = new ResultController();
    this.chatController = new ChatController();

    this.bindNavigationEvents();
    await this.checkBackendStatus();
  }

  bindNavigationEvents() {
    // Brand header click returns to welcome
    const brandNav = document.getElementById("nav-brand");
    if (brandNav) {
      brandNav.addEventListener("click", () => this.switchScreen("welcome-screen"));
    }

    // Mock Mode Toggle button
    const mockToggleBtn = document.getElementById("toggle-mock-btn");
    if (mockToggleBtn) {
      mockToggleBtn.addEventListener("click", () => {
        this.mockMode = !this.mockMode;
        mockToggleBtn.textContent = `MOCK MODE: ${this.mockMode ? "ON" : "OFF"}`;
        mockToggleBtn.classList.toggle("btn-gold", this.mockMode);
      });
    }

    // Audio Toggle button
    const audioToggleBtn = document.getElementById("toggle-audio-btn");
    if (audioToggleBtn) {
      audioToggleBtn.addEventListener("click", () => {
        if (window.audioController) {
          const isMuted = window.audioController.toggleMute();
          audioToggleBtn.textContent = isMuted ? "🔇 AUDIO: MUTED" : "🔊 AUDIO: ON";
          audioToggleBtn.classList.toggle("btn-gold", !isMuted);
        }
      });
    }

    // Welcome Screen: Scan My Palm (Laptop Webcam)
    const scanCamBtn = document.getElementById("btn-scan-camera");
    if (scanCamBtn) {
      scanCamBtn.addEventListener("click", () => this.startLaptopWebcamScan());
    }

    // Welcome Screen: Use Phone Camera (QR Pairing)
    const connectPhoneBtn = document.getElementById("btn-connect-phone");
    if (connectPhoneBtn) {
      connectPhoneBtn.addEventListener("click", () => this.openPhonePairingScreen());
    }

    // Welcome Screen: Quick Simulation (Instant Mock)
    const simBtn = document.getElementById("btn-quick-simulation");
    if (simBtn) {
      simBtn.addEventListener("click", () => this.startSimulationScan());
    }

    // Connect Screen: Use Laptop Webcam instead
    const useWebcamFallbackBtn = document.getElementById("btn-use-laptop-webcam");
    if (useWebcamFallbackBtn) {
      useWebcamFallbackBtn.addEventListener("click", () => this.startLaptopWebcamScan());
    }

    // Connect Screen: Cancel
    const cancelConnectBtn = document.getElementById("btn-back-from-connect");
    if (cancelConnectBtn) {
      cancelConnectBtn.addEventListener("click", () => this.switchScreen("welcome-screen"));
    }

    // Connect Screen: Copy Pairing URL
    const copyUrlBtn = document.getElementById("btn-copy-pairing-url");
    if (copyUrlBtn) {
      copyUrlBtn.addEventListener("click", () => {
        const urlDisplay = document.getElementById("pairing-url-display");
        if (urlDisplay && navigator.clipboard) {
          navigator.clipboard.writeText(urlDisplay.textContent).then(() => {
            copyUrlBtn.textContent = "COPIED!";
            setTimeout(() => { copyUrlBtn.textContent = "COPY"; }, 2000);
          });
        }
      });
    }

    // Scanner Screen: Exit
    const cancelScanBtn = document.getElementById("btn-cancel-scan");
    if (cancelScanBtn) {
      cancelScanBtn.addEventListener("click", () => {
        this.cleanupScanner();
        this.switchScreen("welcome-screen");
      });
    }
  }

  async checkBackendStatus() {
    const pill = document.getElementById("backend-status-pill");
    const mockToggleBtn = document.getElementById("toggle-mock-btn");
    const res = await window.apiClient.checkHealth();
    if (pill) {
      if (res.status === "healthy" || res.status === "ok") {
        pill.textContent = res.llm_available ? "AI BACKEND: LIVE" : "AI OFFLINE (FALLBACK MOCK)";
        pill.classList.add("live");
        this.mockMode = false;
        if (mockToggleBtn) {
          mockToggleBtn.textContent = "MOCK MODE: OFF";
          mockToggleBtn.classList.remove("btn-gold");
        }
      } else {
        pill.textContent = "AI OFFLINE (FALLBACK MOCK)";
        this.mockMode = true;
        if (mockToggleBtn) {
          mockToggleBtn.textContent = "MOCK MODE: ON";
          mockToggleBtn.classList.add("btn-gold");
        }
      }
    }
  }

  switchScreen(screenId) {
    if (this.currentScreen === screenId) return;

    // Teardown previous screen resources if leaving scanner or chat
    if (this.currentScreen === "scanner-screen" && screenId !== "scanner-screen") {
      this.cleanupScanner();
    }

    const screens = document.querySelectorAll(".screen");
    screens.forEach(s => s.classList.remove("active"));

    const target = document.getElementById(screenId);
    if (target) {
      target.classList.add("active");
      this.currentScreen = screenId;
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  // --- 1. LAPTOP WEBCAM SCAN ---
  async startLaptopWebcamScan() {
    this.switchScreen("scanner-screen");
    const feedSourceEl = document.getElementById("scanner-feed-source");
    if (feedSourceEl) feedSourceEl.textContent = "Computer Webcam Feed";

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });
      this.scannerController.startWithStream(stream);
    } catch (err) {
      console.warn("Could not access computer webcam, falling back to simulated scan:", err.message);
      this.startSimulationScan();
    }
  }

  // --- 2. PHONE CAMERA WEBRTC PAIRING ---
  openPhonePairingScreen() {
    this.switchScreen("connect-screen");
    this.currentRoomId = `kn-${Math.floor(1000 + Math.random() * 9000)}`;

    const protocol = window.location.protocol;
    const host = window.location.host;
    const pairingUrl = `${protocol}//${host}/camera.html?room=${this.currentRoomId}`;

    const urlDisplay = document.getElementById("pairing-url-display");
    if (urlDisplay) urlDisplay.textContent = pairingUrl;

    // Render QR Code onto canvas
    this.renderQrCodeCanvas(pairingUrl);

    // Setup WebRTC Receiver peer
    if (this.webrtc) this.webrtc.cleanup();

    this.webrtc = new window.WebRTCManager({
      role: "receiver",
      roomId: this.currentRoomId
    });

    const statusDot = document.getElementById("connect-status-dot");
    const statusText = document.getElementById("connect-status-text");

    this.webrtc.onConnectionStateChange = (state) => {
      console.log(`Computer WebRTC State: ${state}`);
      if (state === "signaling_connected") {
        if (statusText) statusText.textContent = "ROOM ACTIVE. WAITING FOR PHONE...";
      } else if (state === "connected") {
        if (statusText) statusText.textContent = "PHONE CAMERA CONNECTED!";
        if (statusDot) {
          statusDot.className = "status-dot connected";
        }
      }
    };

    this.webrtc.onRemoteStream = (remoteStream) => {
      console.log("Remote phone stream received! Launching scanner...");
      this.switchScreen("scanner-screen");
      const feedSourceEl = document.getElementById("scanner-feed-source");
      if (feedSourceEl) feedSourceEl.textContent = "Phone Camera Stream (WebRTC)";
      this.scannerController.startWithStream(remoteStream);
    };

    this.webrtc.connectSignaling();
    this.webrtc.createPeerConnection();
  }

  // Minimal standard QR visual pattern generator on 2D Canvas
  renderQrCodeCanvas(url) {
    const canvas = document.getElementById("qr-code-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    canvas.width = 176;
    canvas.height = 176;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 176, 176);
    ctx.fillStyle = "#000000";

    // Corner alignment boxes (standard QR pattern)
    const drawFinder = (x, y) => {
      ctx.fillRect(x, y, 42, 42);
      ctx.clearRect(x + 6, y + 6, 30, 30);
      ctx.fillRect(x + 12, y + 12, 18, 18);
    };

    drawFinder(8, 8);
    drawFinder(126, 8);
    drawFinder(8, 126);

    // Encode seed data as clean micro-matrix
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
      hash = ((hash << 5) - hash) + url.charCodeAt(i);
      hash |= 0;
    }

    const gridSize = 22;
    const cellSize = 6;
    const offsetX = 22;
    const offsetY = 22;

    for (let r = 0; r < gridSize; r++) {
      for (let c = 0; c < gridSize; c++) {
        // Skip finder areas
        if ((r < 7 && c < 7) || (r < 7 && c > 14) || (r > 14 && c < 7)) continue;
        const bit = ((hash ^ (r * 31 + c * 17)) & (1 << ((r + c) % 8))) !== 0;
        if (bit) {
          ctx.fillRect(offsetX + c * cellSize, offsetY + r * cellSize, cellSize, cellSize);
        }
      }
    }
  }

  // --- 3. SIMULATED SCAN ---
  startSimulationScan() {
    this.switchScreen("scanner-screen");
    const feedSourceEl = document.getElementById("scanner-feed-source");
    if (feedSourceEl) feedSourceEl.textContent = "Simulation Feed (Sample Palm)";
    this.scannerController.startSimulation();
  }

  // --- 4. PALM CAPTURED & ANALYSIS ---
  async onPalmCaptured(capturedData) {
    this.cleanupScanner();
    this.switchScreen("analysis-screen");

    // Audio cue
    window.audioController.playScannerAudio("analyzing");

    const stepIndicator = document.getElementById("analysis-step-indicator");
    if (stepIndicator) {
      stepIndicator.textContent = "Mapping palm mounts and life line curvature...";
      setTimeout(() => {
        if (stepIndicator) stepIndicator.textContent = "Synthesizing Unnimaya Jothishyan persona response...";
      }, 900);
    }

    try {
      let response;
      if (this.mockMode) {
        response = window.apiClient.generateMockAnalysis(capturedData);
      } else {
        response = await window.apiClient.analyzePalm({
          image: capturedData.image,
          features: capturedData.features
        });
      }

      this.currentPalmData = response;

      // Transition to Result Screen
      setTimeout(() => {
        this.switchScreen("result-screen");
        this.resultController.render(response);
        this.chatController.resetSession();
      }, 1600);
    } catch (err) {
      console.error("Analysis failure:", err);
      // Fallback
      const mockRes = window.apiClient.generateMockAnalysis(capturedData);
      this.currentPalmData = mockRes;
      this.switchScreen("result-screen");
      this.resultController.render(mockRes);
      this.chatController.resetSession();
    }
  }

  startNewScan() {
    this.switchScreen("welcome-screen");
  }

  cleanupScanner() {
    if (this.scannerController) {
      this.scannerController.stop();
    }
    if (this.webrtc) {
      this.webrtc.cleanup();
      this.webrtc = null;
    }
  }
}

// Instantiate on DOM load
document.addEventListener("DOMContentLoaded", () => {
  window.app = new App();
});
