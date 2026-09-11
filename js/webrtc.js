/**
 * KAI NOKKI - WebRTC & Signaling Handler
 * Peer-to-peer camera streaming from phone to computer browser with WebSocket signaling.
 */

class WebRTCManager {
  constructor(options = {}) {
    this.role = options.role || "receiver"; // 'receiver' (computer) or 'sender' (phone)
    this.roomId = options.roomId || "kai-nokki-room";
    this.peerConnection = null;
    this.signalingSocket = null;
    this.localStream = null;
    this.remoteStream = null;
    this.iceServers = [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" }
    ];

    this.onRemoteStream = null;
    this.onConnectionStateChange = null;
    this.isConnected = false;
  }

  /**
   * Initializes the WebSocket signaling channel.
   */
  connectSignaling() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host || "localhost:3000";
    const signalingUrl = `${protocol}//${host}/ws/signaling?room=${encodeURIComponent(this.roomId)}`;

    try {
      this.signalingSocket = new WebSocket(signalingUrl);

      this.signalingSocket.onopen = () => {
        console.log(`WebRTC signaling connected [Role: ${this.role}, Room: ${this.roomId}]`);
        if (this.onConnectionStateChange) {
          this.onConnectionStateChange("signaling_connected");
        }
        if (this.role === "sender") {
          this.initiateOffer();
        }
      };

      this.signalingSocket.onmessage = async (event) => {
        try {
          const message = JSON.parse(event.data);
          await this.handleSignalingMessage(message);
        } catch (e) {
          console.error("Signaling message handling error:", e);
        }
      };

      this.signalingSocket.onclose = () => {
        console.log("Signaling socket closed. Reconnecting in 3s...");
        this.isConnected = false;
        if (this.onConnectionStateChange) this.onConnectionStateChange("disconnected");
        setTimeout(() => {
          if (!this.isConnected && this.peerConnection) {
            this.connectSignaling();
          }
        }, 3000);
      };

      this.signalingSocket.onerror = (err) => {
        console.warn("Signaling socket error:", err);
      };
    } catch (err) {
      console.warn("Could not establish signaling socket:", err);
    }
  }

  createPeerConnection() {
    if (this.peerConnection) {
      this.cleanupPeerConnection();
    }

    this.peerConnection = new RTCPeerConnection({ iceServers: this.iceServers });

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.signalingSocket && this.signalingSocket.readyState === WebSocket.OPEN) {
        this.signalingSocket.send(JSON.stringify({
          type: "ice-candidate",
          candidate: event.candidate,
          role: this.role
        }));
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection.connectionState;
      console.log(`WebRTC PeerConnection state: ${state}`);
      if (state === "connected") {
        this.isConnected = true;
      } else if (state === "disconnected" || state === "failed" || state === "closed") {
        this.isConnected = false;
      }
      if (this.onConnectionStateChange) {
        this.onConnectionStateChange(state);
      }
    };

    if (this.role === "receiver") {
      this.peerConnection.ontrack = (event) => {
        console.log("Received remote track from phone camera!");
        if (event.streams && event.streams[0]) {
          this.remoteStream = event.streams[0];
          if (this.onRemoteStream) {
            this.onRemoteStream(this.remoteStream);
          }
        }
      };
    }

    if (this.localStream && this.role === "sender") {
      this.localStream.getTracks().forEach((track) => {
        this.peerConnection.addTrack(track, this.localStream);
      });
    }
  }

  async initiateOffer() {
    if (!this.peerConnection) {
      this.createPeerConnection();
    }
    try {
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);
      if (this.signalingSocket && this.signalingSocket.readyState === WebSocket.OPEN) {
        this.signalingSocket.send(JSON.stringify({
          type: "offer",
          sdp: offer,
          role: this.role
        }));
      }
    } catch (e) {
      console.error("Failed to create offer:", e);
    }
  }

  async handleSignalingMessage(message) {
    if (!message || !message.type) return;

    if (message.type === "peer-joined") {
      console.log("Remote peer joined the room.");
      if (this.role === "sender") {
        await this.initiateOffer();
      }
      return;
    }

    if (message.type === "offer" && this.role === "receiver") {
      if (!this.peerConnection) {
        this.createPeerConnection();
      }
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(message.sdp));
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);

      if (this.signalingSocket && this.signalingSocket.readyState === WebSocket.OPEN) {
        this.signalingSocket.send(JSON.stringify({
          type: "answer",
          sdp: answer,
          role: this.role
        }));
      }
    } else if (message.type === "answer" && this.role === "sender") {
      if (this.peerConnection) {
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(message.sdp));
      }
    } else if (message.type === "ice-candidate") {
      if (this.peerConnection && message.candidate) {
        try {
          await this.peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate));
        } catch (err) {
          console.warn("Error adding ICE candidate:", err);
        }
      }
    }
  }

  cleanupPeerConnection() {
    if (this.peerConnection) {
      this.peerConnection.ontrack = null;
      this.peerConnection.onicecandidate = null;
      this.peerConnection.onconnectionstatechange = null;
      this.peerConnection.close();
      this.peerConnection = null;
    }
    this.isConnected = false;
  }

  cleanup() {
    this.cleanupPeerConnection();
    if (this.signalingSocket) {
      this.signalingSocket.close();
      this.signalingSocket = null;
    }
  }
}

window.WebRTCManager = WebRTCManager;
