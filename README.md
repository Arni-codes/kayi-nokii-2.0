# KAI NOKKI (കൈ നോക്കി)
*"Ninte kai onnu kaanikkeda..."*

An AI-powered humorous Kerala-style palm-reading and jothishyan entertainment experience. 

The website looks like a serious, minimalist, high-end AI product, while the humor comes from the AI's authentic Malayalam/Manglish personality, comedic timing, and absurd palm predictions.

---

## 1. Project Overview & Architecture

KAI NOKKI uses a decoupled dual-device paradigm:
- **Computer Browser**: Displays the main application, renders the camera feed, executes browser-side MediaPipe/optical palm detection, alignment and stability checks, captures one frame, queries the backend, displays the reading, and plays all audio and voice responses.
- **Phone Camera**: Used **ONLY** as a wireless camera peer over WebRTC. The phone never executes AI, never stores API keys, and never plays the jothishyan voice.

```
PHONE (Camera Peer)
  │ (camera feed only)
  ▼
WebRTC PeerConnection (Signaling via WebSocket /ws/signaling)
  │
  ▼
COMPUTER BROWSER (HTML5 + CSS3 + Vanilla JavaScript)
  ├── Live Camera Display & Palm Target Guide
  ├── Browser Hand Tracking (Alignment + Stability Tracking)
  ├── 1-Frame High-Resolution Capture
  │
  ▼ POST /api/analyze-palm
FASTAPI BACKEND / SERVER
  ├── Palm Feature Normalization (detector.py)
  ├── Entertainment Interpretations (analyzer.py)
  ├── Transcript Loader (transcript_loader.py)
  ├── Unnimaya Kai Nokki Persona (persona.py)
  ├── LLM Generation (chatbot.py - Gemini / Mock)
  └── TTS Voice Audio (tts.py, rvc.py)
  │
  ▼
COMPUTER SPEAKERS
  Plays Malayalam/Manglish Jothishyan Voice & Scanner Guidance
```

---

## 2. Folder Structure

```
ai-jothishyan/
├── index.html                  # Main computer interface (all screens)
├── camera.html                 # Minimal mobile camera peer
│
├── css/
│   └── style.css               # Minimalist styling (No Tailwind / Pure CSS3)
│
├── js/
│   ├── app.js                  # Central State Machine & screen transitions
│   ├── camera.js               # Phone camera capture & WebRTC client
│   ├── webrtc.js               # WebRTC peer connection & signaling helper
│   ├── scanner.js              # Scanner UI controller & alignment feedback
│   ├── handDetection.js        # Browser hand & palm stability tracking
│   ├── audio.js                # Scanner voice audio cues & queue manager
│   ├── api.js                  # Robust API client with offline mock fallbacks
│   ├── result.js               # Result view & category displays
│   └── chat.js                 # Interactive Q&A retaining palm session
│
├── public/
│   └── audio/                  # Predefined scanner voice audio files
│       ├── show_hand.mp3       # "Kai kaanikkeda mone..."
│       ├── detected.mp3        # "Aha... kai kitti."
│       ├── closer.mp3          # "Kurach closer aayi vekku..."
│       ├── farther.mp3         # "Onnu pinnottu maari vekku..."
│       ├── steady.mp3          # "Steady ayi vekka da..."
│       ├── analyzing.mp3       # "Hmmm... Onnu nokkatte..."
│       └── completed.mp3       # Reading complete chime
│
├── backend/
│   ├── main.py                 # FastAPI application & endpoints
│   ├── requirements.txt        # Lightweight Python dependencies
│   ├── .env.example            # Environment template
│   │
│   ├── palm/
│   │   ├── __init__.py
│   │   ├── detector.py         # Palm feature metrics normalizer
│   │   └── analyzer.py         # Humorous entertainment mappings
│   │
│   ├── ai/
│   │   ├── __init__.py
│   │   ├── persona.py          # Unnimaya persona & prompt builder
│   │   ├── chatbot.py          # LLM interface & mock response generator
│   │   └── transcript_loader.py# Reference transcript aggregator
│   │
│   ├── ai/transcripts/
│   │   ├── transcript_01.txt   # Reference slang & style sample 1
│   │   ├── transcript_02.txt   # Reference slang & style sample 2
│   │   └── README.md
│   │
│   ├── voice/
│   │   ├── __init__.py
│   │   ├── tts.py              # Text-to-speech engine abstraction
│   │   └── rvc.py              # Optional RVC/Applio voice conversion hook
│   │
│   └── websocket/
│       ├── __init__.py
│       └── signaling.py        # WebRTC room-based signaling router
│
├── persona_prompt.txt          # Unnimaya Kai Nokki system instructions
├── reference_vocabulary.json   # Malayalam nicknames, slang & vocabulary
└── README.md
```

---

## 3. Quick Start for Student Developers

### Running with Python & FastAPI Backend

1. **Clone or navigate into the project directory**:
   ```bash
   cd ai-jothishyan
   ```

2. **Create and activate a Python virtual environment**:
   ```bash
   python3 -m venv venv
   source venv/bin/activate    # On Windows: venv\Scripts\activate
   ```

3. **Install Python dependencies**:
   ```bash
   pip install -r backend/requirements.txt
   ```

4. **Setup Environment**:
   ```bash
   cp backend/.env.example backend/.env
   ```
   *(By default, `MOCK_MODE=true` allows running immediately without any API keys).*

5. **Start the FastAPI Server**:
   ```bash
   uvicorn backend.main:app --host 0.0.0.0 --port 3000 --reload
   ```

6. **Open in Browser**:
   Navigate to:
   ```
   http://localhost:3000
   ```

---

## 4. How Mock Mode Works

KAI NOKKI includes a 100% autonomous **Mock Mode**:
- You can click **"⚡ TEST WITH SIMULATION (INSTANT)"** directly on the welcome screen.
- Simulates hand alignment, palm stabilization, frame capture, analysis, and categorizes the reading (LOVE, CAREER, MONEY, PERSONALITY, FUTURE).
- Voice cues and fallback speech synthesis run on the browser without requiring external paid API keys.
- You can toggle Mock Mode on/off anytime from the top navigation bar.

---

## 5. Phone Camera Connection & WebRTC

To use a phone as a wireless camera:
1. Click **"USE PHONE CAMERA"** on the computer.
2. The computer generates a unique pairing session and displays a QR code and URL.
3. Open the URL or scan the QR code on your phone.
4. Your phone opens `camera.html` and streams its camera feed directly to the computer browser over peer-to-peer WebRTC.

### Important: Camera Security & HTTPS Requirement
Modern mobile browsers (Chrome, Safari) **strictly enforce** that `navigator.mediaDevices.getUserMedia()` only works in a **Secure Context**:
- `http://localhost` is treated as secure on the local computer.
- An ordinary LAN HTTP address (e.g. `http://192.168.1.5:3000`) accessed from a phone **will block camera access**.

**Solutions for testing phone camera over LAN:**
1. **Cloudflare Tunnel / ngrok (Recommended)**:
   ```bash
   ngrok http 3000
   ```
   Open the HTTPS URL on your computer and phone.
2. **Local SSL Certificate (`mkcert`)**:
   Generate trusted local certificates for your LAN IP.
3. **Computer Webcam or Mock Simulation**:
   Click **"USE COMPUTER WEBCAM INSTEAD"** or **"⚡ TEST WITH SIMULATION"**.

---

## 6. Transcripts & Persona Customization

### Adding Style Reference Transcripts
Place any additional `.txt` transcript files in:
```
backend/ai/transcripts/
```
The `transcript_loader.py` will automatically read and aggregate these files. The LLM persona uses them as style references to learn sentence structure, Malayalam slang, comedic timing, and dramatic pauses without copying lines verbatim.

### Reference Vocabulary
Edit `reference_vocabulary.json` to expand nicknames, addresses, and humorous Malayalam phrases (e.g., `ഉണ്ടം പാണ്ടി`, `മൺചട്ടി മലരേ`, `പുളകിതൻ പാവയ്ക്ക`).

---

## 7. Configuring Real AI Services

### LLM (Gemini / OpenAI)
In `backend/.env`:
```env
MOCK_MODE=false
LLM_API_KEY=your_gemini_api_key_here
LLM_MODEL=gemini-3.8-flash
```

### TTS (Text-To-Speech)
```env
TTS_PROVIDER=gemini
TTS_API_KEY=your_gemini_api_key_here
TTS_VOICE=Kore
```

### Optional Voice Conversion (RVC / Applio)
```env
ENABLE_RVC=true
RVC_MODEL_PATH=path/to/kerala_jothishyan.pth
RVC_SERVER_URL=http://localhost:5000
```
*(By default, `ENABLE_RVC=false`. The application runs with crystal clarity without RVC).*

---

## 8. Disclaimer
KAI NOKKI is strictly an AI-generated entertainment application. Palm readings and predictions are humorous fictions and should not be used as actual astrology, medical, legal, or financial advice.
