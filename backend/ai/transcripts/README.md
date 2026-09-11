# Reference Transcripts for KAI NOKKI

Place your reference transcripts here as `.txt` files.

Example files:
- `transcript_01.txt`
- `transcript_02.txt`

## How it works:
1. `backend/ai/transcript_loader.py` automatically reads all `.txt` files in this directory.
2. It aggregates stylistic references, slang, vocabulary, nicknames, and speaking rhythms.
3. The AI persona uses these transcripts as STYLE REFERENCES to condition the LLM.
4. The system prompt instructs the AI never to copy passages verbatim, but to produce fresh, spontaneous Malayalam/Manglish palm readings in Unnimaya Kai Nokki's unique comedic voice.
