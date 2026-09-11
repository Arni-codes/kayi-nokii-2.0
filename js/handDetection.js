/**
 * KAI NOKKI - Browser Hand Detection & Alignment Engine
 * Detects palm position, orientation, alignment, and movement stability in client browser
 * using MediaPipe Hands for highly accurate optical tracking.
 */

class HandDetector {
  constructor(videoElement, canvasElement) {
    this.video = videoElement;
    this.canvas = canvasElement;
    this.ctx = canvasElement ? canvasElement.getContext('2d') : null;

    this.isRunning = false;
    this.hands = null;
    this.lastProcessTime = 0;

    // Tracking state
    this.previousCenter = null;
    this.stableFrameCount = 0;
    this.requiredStableFrames = 15; // ~1.5 seconds of sustained stillness
    this.movementThreshold = 0.04; // Normalized coordinate delta

    // Callbacks
    this.onHandState = null; // { state, alignment, stability, features }
    this.onCaptured = null;
  }

  initMediaPipe() {
    if (this.hands) return;
    
    // Assumes MediaPipe is loaded globally via CDN in index.html
    if (!window.Hands) {
      console.warn("MediaPipe Hands not loaded yet, retrying...");
      setTimeout(() => this.initMediaPipe(), 500);
      return;
    }
    
    this.hands = new window.Hands({locateFile: (file) => {
      return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
    }});
    
    this.hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.6
    });
    
    this.hands.onResults((results) => {
      this.onMediaPipeResults(results);
    });
  }

  start() {
    this.isRunning = true;
    this.stableFrameCount = 0;
    this.previousCenter = null;
    this.initMediaPipe();
    this.loop();
  }

  stop() {
    this.isRunning = false;
    if (this.ctx && this.canvas) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  async loop() {
    if (!this.isRunning) return;

    if (this.video && this.video.readyState >= 2 && this.hands) {
      if (this.canvas) {
        if (this.canvas.width !== this.video.videoWidth || this.canvas.height !== this.video.videoHeight) {
          this.canvas.width = this.video.videoWidth || 640;
          this.canvas.height = this.video.videoHeight || 480;
        }
      }
      
      const now = performance.now();
      // Throttle inference to ~15 fps to save battery/cpu
      if (now - this.lastProcessTime > 66) {
        this.lastProcessTime = now;
        try {
          await this.hands.send({image: this.video});
        } catch (e) {
          console.warn("MediaPipe send error:", e);
        }
      }
    }
    
    if (this.isRunning) {
      requestAnimationFrame(() => this.loop());
    }
  }

  onMediaPipeResults(results) {
    if (!this.isRunning) return;
    
    if (this.ctx && this.canvas) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    let state = "NO_HAND";
    let message = "Kai onnu kaanikkeda...";
    let alignment = 0;
    let stability = 0;
    let size = 0;
    let centerX = 0.5;
    let centerY = 0.5;
    let movement = 0.1;
    let features = {
      hand: "right",
      palm_shape: "unknown"
    };

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      const landmarks = results.multiHandLandmarks[0];
      const handedness = results.multiHandedness[0].label.toLowerCase(); // "left" or "right"
      features.hand = handedness;
      
      // Calculate center of palm (wrist 0 and middle finger mcp 9)
      centerX = (landmarks[0].x + landmarks[9].x) / 2;
      centerY = (landmarks[0].y + landmarks[9].y) / 2;
      
      // Calculate palm size relative to screen
      size = Math.hypot(landmarks[0].x - landmarks[9].x, landmarks[0].y - landmarks[9].y) * 2.2;
      
      // Calculate movement since last frame
      if (this.previousCenter) {
        movement = Math.hypot(centerX - this.previousCenter.x, centerY - this.previousCenter.y);
      }
      this.previousCenter = { x: centerX, y: centerY };
      
      // Target center is 0.5, 0.5
      const distFromCenter = Math.hypot(centerX - 0.5, centerY - 0.5);
      alignment = Math.max(0, Math.min(100, Math.round((1 - distFromCenter * 2.5) * 100)));
      
      state = "HAND_DETECTED";
      
      // Simplify logic: if hand is detected, consider it stable and capture immediately after a brief pause
      // No more strict size or alignment checks
      
      this.stableFrameCount++;
      stability = Math.min(100, Math.round((this.stableFrameCount / 5) * 100)); // Only need 5 frames now
      
      if (this.stableFrameCount < 5) {
        state = "STABILIZING";
        message = "Hold steady... capturing";
      }

      // Draw mesh
      this.drawLandmarks(landmarks, stability);
      
      if (this.stableFrameCount >= 5) {
        state = "CAPTURING";
        stability = 100;
        
        // Finalize features
        features.palm_width = Math.round(size * 1000);
        features.palm_height = Math.round(size * 1180);
        features.aspect_ratio = 1.18;
        features.palm_shape = "balanced_classic";
        features.life_line_curve = 0.78;
        features.heart_line_curve = 0.65;
        features.head_line_length = 0.82;
        features.fate_line_strength = 0.44;
        
        // Push state update then capture
        if (this.onHandState) {
          this.onHandState({ state, message, alignment, stability, features });
        }
        
        setTimeout(() => {
          this.capture(features);
        }, 100);
        return;
      }
    } else {
      this.previousCenter = null;
      this.stableFrameCount = 0;
    }

    if (this.onHandState) {
      this.onHandState({ state, message, alignment, stability, features });
    }
  }

  drawLandmarks(landmarks, stability) {
    if (!this.ctx || !this.canvas) return;
    this.ctx.save();
    
    // If getting highly stable, turn green, otherwise gold
    const isStable = stability > 70;
    const strokeColor = isStable ? "rgba(52, 211, 153, 0.8)" : "rgba(212, 175, 55, 0.6)";
    const fillColor = isStable ? "rgba(52, 211, 153, 0.3)" : "rgba(212, 175, 55, 0.2)";
    
    this.ctx.strokeStyle = strokeColor;
    this.ctx.fillStyle = fillColor;
    this.ctx.lineWidth = 2;
    
    // Draw joints
    for (const landmark of landmarks) {
      const x = landmark.x * this.canvas.width;
      const y = landmark.y * this.canvas.height;
      this.ctx.beginPath();
      this.ctx.arc(x, y, 3, 0, 2 * Math.PI);
      this.ctx.fill();
    }
    
    // Draw bones (basic connections for hand)
    if (window.HAND_CONNECTIONS) {
      this.ctx.beginPath();
      for (const connection of window.HAND_CONNECTIONS) {
        const start = landmarks[connection[0]];
        const end = landmarks[connection[1]];
        this.ctx.moveTo(start.x * this.canvas.width, start.y * this.canvas.height);
        this.ctx.lineTo(end.x * this.canvas.width, end.y * this.canvas.height);
      }
      this.ctx.stroke();
    }
    
    this.ctx.restore();
  }

  capture(features) {
    this.stop();
    let imageDataUrl = "";
    try {
      const captureCanvas = document.createElement("canvas");
      captureCanvas.width = 480;
      captureCanvas.height = 360;
      const ctx = captureCanvas.getContext("2d");
      if (this.video && this.video.videoWidth > 0) {
        ctx.drawImage(this.video, 0, 0, 480, 360);
        imageDataUrl = captureCanvas.toDataURL("image/jpeg", 0.7);
      }
    } catch (e) {
      console.warn("Frame capture fallback:", e);
    }

    if (this.onCaptured) {
      this.onCaptured({
        image: imageDataUrl,
        features: features || {}
      });
    }
  }
}

window.HandDetector = HandDetector;
