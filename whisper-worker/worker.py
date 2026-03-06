"""
HeirloomAudio — Whisper Transcription Worker
Polls Redis for transcription jobs, runs faster-whisper, posts result back.
"""
import json
import os
import time
import logging
import requests
from pathlib import Path
import redis
from faster_whisper import WhisperModel

logging.basicConfig(level=logging.INFO, format="%(asctime)s [Whisper] %(message)s")
log = logging.getLogger(__name__)

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")
UPLOAD_PATH = os.environ.get("UPLOAD_PATH", "/data/uploads")
WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "small")
QUEUE_KEY = "heirloom:transcription:queue"
APP_CALLBACK = os.environ.get("APP_URL", "http://app:3000")

log.info(f"Loading Whisper model: {WHISPER_MODEL}")
model = WhisperModel(WHISPER_MODEL, device="cpu", compute_type="int8")
log.info("Whisper model loaded ✓")

r = redis.from_url(REDIS_URL, decode_responses=True)


def transcribe_file(file_path: str, language: str = "en") -> str:
    segments, info = model.transcribe(
        file_path,
        language=language,
        beam_size=5,
        vad_filter=True,
        vad_parameters=dict(min_silence_duration_ms=500),
    )
    text = " ".join(seg.text.strip() for seg in segments)
    return text.strip()


def process_job(job: dict):
    chapter_id = job.get("chapterId")
    file_path = job.get("filePath")
    language = job.get("language", "en")
    callback_secret = job.get("secret", "")

    if not chapter_id or not file_path:
        log.warning("Invalid job: missing chapterId or filePath")
        return

    full_path = os.path.join(UPLOAD_PATH, file_path) if not file_path.startswith("/") else file_path

    if not os.path.exists(full_path):
        log.error(f"File not found: {full_path}")
        notify_failure(chapter_id, "File not found", callback_secret)
        return

    log.info(f"Transcribing chapter {chapter_id}: {full_path}")
    try:
        text = transcribe_file(full_path, language)
        log.info(f"Transcription complete for {chapter_id}: {len(text)} chars")
        notify_success(chapter_id, text, callback_secret)
    except Exception as e:
        log.error(f"Transcription failed for {chapter_id}: {e}")
        notify_failure(chapter_id, str(e), callback_secret)


def notify_success(chapter_id: str, text: str, secret: str):
    try:
        requests.post(
            f"{APP_CALLBACK}/api/chapters/{chapter_id}/transcribe",
            json={"transcription": text, "status": "COMPLETE", "secret": secret},
            timeout=10,
        )
    except Exception as e:
        log.error(f"Failed to notify app: {e}")


def notify_failure(chapter_id: str, error: str, secret: str):
    try:
        requests.post(
            f"{APP_CALLBACK}/api/chapters/{chapter_id}/transcribe",
            json={"error": error, "status": "FAILED", "secret": secret},
            timeout=10,
        )
    except Exception as e:
        log.error(f"Failed to notify app of failure: {e}")


def main():
    log.info(f"Worker started, polling queue: {QUEUE_KEY}")
    while True:
        try:
            result = r.blpop(QUEUE_KEY, timeout=5)
            if result:
                _, raw = result
                job = json.loads(raw)
                process_job(job)
        except redis.RedisError as e:
            log.error(f"Redis error: {e}")
            time.sleep(5)
        except Exception as e:
            log.error(f"Unexpected error: {e}")
            time.sleep(1)


if __name__ == "__main__":
    main()
