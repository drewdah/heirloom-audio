#!/usr/bin/env python3
"""
transcribe.py — Transcribe an audio file using faster-whisper (small model).
Usage: python scripts/transcribe.py <audio_file_path>
Output: JSON to stdout: { "text": "...", "segments": [...] }

Install deps once:
  pip install faster-whisper
"""

import sys
import json

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No audio file path provided"}))
        sys.exit(1)

    audio_path = sys.argv[1]

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print(json.dumps({"error": "faster-whisper not installed. Run: pip install faster-whisper"}))
        sys.exit(1)

    try:
        # Load small model — downloads on first run (~250MB), cached afterwards
        # device="cpu", compute_type="int8" works on any machine with no GPU
        model = WhisperModel("small", device="cpu", compute_type="int8")
        segments, info = model.transcribe(audio_path, beam_size=5)

        result_segments = []
        full_text_parts = []

        for seg in segments:
            result_segments.append({
                "start": round(seg.start, 2),
                "end": round(seg.end, 2),
                "text": seg.text.strip(),
            })
            full_text_parts.append(seg.text.strip())

        output = {
            "text": " ".join(full_text_parts),
            "language": info.language,
            "segments": result_segments,
        }
        print(json.dumps(output))

    except FileNotFoundError:
        print(json.dumps({"error": f"Audio file not found: {audio_path}"}))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
