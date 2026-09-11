"""
Transcript loader for KAI NOKKI.
Loads and aggregates reference transcripts from backend/ai/transcripts/
"""
from pathlib import Path
from typing import List, Dict

TRANSCRIPTS_DIR = Path(__file__).resolve().parent / "transcripts"
MAX_CONTEXT_CHARS = 4000


def load_transcript_references() -> str:
    """
    Reads all .txt files from the transcripts directory, safely concatenates them,
    and returns a bounded reference context block for prompt conditioning.
    """
    if not TRANSCRIPTS_DIR.exists():
        return "No external transcripts loaded."

    texts: List[str] = []
    total_length = 0

    for file_path in sorted(TRANSCRIPTS_DIR.glob("*.txt")):
        try:
            content = file_path.read_text(encoding="utf-8").strip()
            if not content:
                continue
            
            # Check length limit
            if total_length + len(content) > MAX_CONTEXT_CHARS:
                remaining = MAX_CONTEXT_CHARS - total_length
                if remaining > 100:
                    texts.append(content[:remaining] + "... [truncated]")
                break
            
            texts.append(f"--- {file_path.name} ---\n{content}")
            total_length += len(content)
        except Exception as err:
            print(f"Error reading transcript {file_path}: {err}")

    if not texts:
        return "Default reference styles loaded."

    return "\n\n".join(texts)
