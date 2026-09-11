/**
 * KAI NOKKI - Mobile Camera Client (Runs on Phone)
 * Captures camera stream and transmits to the computer over WebRTC peer connection.
 */

document.addEventListener("DOMContentLoaded", async () => {
  const videoEl = document.getElementById("phone-camera-video");
  const statusBadge = document.getElementById("phone-status-badge");
  const switchCameraBtn = document.getElementById("btn-switch-camera");

  // Parse room ID from query string or default
  const urlParams = new URLSearchParams(window.location.search);
  const roomId = urlParams.get("room") || "kai-nokki-default";

  let currentFacingMode = "environment"; // default to rear camera for palm capture
  let localStream = null;

  function updateStatus(text, isError = false) {
    if (statusBadge) {
      statusBadge.textContent = text;
      statusBadge.style.color = isError ? "var(--status-error)" : "var(--text-primary)";
    }
  }

  async function startCamera(facingMode) {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }

    updateStatus("REQUESTING CAMERA PERMISSION...");

    try {
      const constraints = {
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      };

      localStream = await navigator.mediaDevices.getUserMedia(constraints);
      if (videoEl) {
        videoEl.srcObject = localStream;
        await videoEl.play();
      }

      updateStatus("CAMERA ACTIVE. CONNECTING TO COMPUTER...");
      initWebRTC();
    } catch (err) {
      console.error("Camera access error:", err);
      updateStatus("CAMERA ACCESS DENIED OR NOT SUPPORTED", true);
    }
  }

  let webrtcManager = null;

  function initWebRTC() {
    if (!window.WebRTCManager) {
      console.warn("WebRTCManager script not loaded");
      return;
    }

    if (webrtcManager) {
      webrtcManager.cleanup();
    }

    webrtcManager = new window.WebRTCManager({
      role: "sender",
      roomId: roomId
    });

    webrtcManager.localStream = localStream;

    webrtcManager.onConnectionStateChange = (state) => {
      console.log(`WebRTC Phone state: ${state}`);
      if (state === "connected") {
        updateStatus("● STREAMING TO COMPUTER");
      } else if (state === "signaling_connected") {
        updateStatus("WAITING FOR COMPUTER PAIRING...");
      } else if (state === "disconnected" || state === "failed") {
        updateStatus("DISCONNECTED. RECONNECTING...");
      }
    };

    webrtcManager.connectSignaling();
    webrtcManager.createPeerConnection();
  }

  if (switchCameraBtn) {
    switchCameraBtn.addEventListener("click", () => {
      currentFacingMode = (currentFacingMode === "environment") ? "user" : "environment";
      startCamera(currentFacingMode);
    });
  }

  // Start rear camera immediately
  startCamera(currentFacingMode);
});
