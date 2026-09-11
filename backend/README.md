# KAI NOKKI - FastAPI Backend

Humorous Kerala AI Jothishyan Python backend.

## Local Execution:
```bash
# 1. Create virtualenv
python3 -m venv venv
source venv/bin/activate

# 2. Install requirements
pip install -r requirements.txt

# 3. Copy env
cp .env.example .env

# 4. Start server
uvicorn backend.main:app --host 0.0.0.0 --port 3000 --reload
```

## Structure
- `palm/`: Palm feature detector and humorous entertainment line analyzer.
- `ai/`: Unnimaya Kai Nokki persona prompt, transcript loader, and LLM chatbot generator.
- `voice/`: Provider-independent TTS abstraction and optional RVC voice transformation.
- `websocket/`: WebRTC room-based signaling router.
- `transcripts/`: Folder for developer reference `.txt` transcripts.
