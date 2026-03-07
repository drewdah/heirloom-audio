"""
HeirloomAudio — Audio Worker
Handles two job types:
  1. transcribe  — runs faster-whisper on a take, posts transcript back
  2. process_chapter — runs FFmpeg filter chain on all takes in a chapter
"""
import json
import os
import time
import logging
import subprocess
import tempfile
import requests
from pathlib import Path
import redis
from faster_whisper import WhisperModel

logging.basicConfig(level=logging.INFO, format="%(asctime)s [Whisper] %(message)s")
log = logging.getLogger(__name__)

REDIS_URL   = os.environ.get("REDIS_URL", "redis://localhost:6379")
UPLOAD_PATH = os.environ.get("UPLOAD_PATH", "/data/uploads")
WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "small")
QUEUE_KEY   = "heirloom:transcription:queue"
APP_CALLBACK = os.environ.get("APP_URL", "http://app:3000")

log.info(f"Loading Whisper model: {WHISPER_MODEL}")
model = WhisperModel(WHISPER_MODEL, device="cpu", compute_type="int8")
log.info("Whisper model loaded ✓")

r = redis.from_url(REDIS_URL, decode_responses=True)


# ─────────────────────────────────────────────────────────────────────────────
# Transcription
# ─────────────────────────────────────────────────────────────────────────────

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


def handle_transcribe(job: dict):
    take_id    = job.get("takeId")
    chapter_id = job.get("chapterId")
    file_path  = job.get("filePath")
    language   = job.get("language", "en")
    secret     = job.get("secret", "")

    if not file_path or not (take_id or chapter_id):
        log.warning("Invalid transcribe job: missing filePath or id")
        return

    full_path = file_path if file_path.startswith("/") else os.path.join(UPLOAD_PATH, file_path)

    if not os.path.exists(full_path):
        log.error(f"File not found: {full_path}")
        _notify_transcribe(take_id, chapter_id, None, "File not found", secret)
        return

    label = take_id or chapter_id
    log.info(f"Transcribing {label}: {full_path}")
    try:
        text = transcribe_file(full_path, language)
        log.info(f"Transcription complete for {label}: {len(text)} chars")
        _notify_transcribe(take_id, chapter_id, text, None, secret)
    except Exception as e:
        log.error(f"Transcription failed for {label}: {e}")
        _notify_transcribe(take_id, chapter_id, None, str(e), secret)


def _notify_transcribe(take_id, chapter_id, text, error, secret):
    if take_id:
        url = f"{APP_CALLBACK}/api/takes/{take_id}/transcribe/callback"
    else:
        url = f"{APP_CALLBACK}/api/chapters/{chapter_id}/transcribe"

    payload = {"secret": secret}
    if text is not None:
        payload["transcription"] = text
        payload["status"] = "done" if take_id else "COMPLETE"
    else:
        payload["error"] = error
        payload["status"] = "error" if take_id else "FAILED"

    try:
        requests.post(url, json=payload, timeout=10)
    except Exception as e:
        log.error(f"Failed to notify app: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# FFmpeg audio processing
# ─────────────────────────────────────────────────────────────────────────────

# Simple linear filter chain (no named pads — safe for -af):
#   1. highpass     — roll off below 80 Hz (rumble, handling noise)
#   2. lowpass      — roll off above 16 kHz (hiss)
#   3. equalizer x2 — cut 300 Hz muddiness, boost 2.5 kHz presence
#   4. acompressor  — gentle voice compression (3:1, tame peaks)
#   5. loudnorm     — per-take level pass; true cross-book normalization at M4B export
#
# De-esser is implemented separately via -filter_complex because it requires
# named pads (asplit → sidechain → sidechaincompress) which can't be used in -af.
SIMPLE_FILTER_NO_NORM = (
    "highpass=f=80,"
    "lowpass=f=16000,"
    "equalizer=f=300:t=o:w=200:g=-3,"
    "equalizer=f=2500:t=o:w=1500:g=2,"
    "acompressor=threshold=-18dB:ratio=3:attack=5:release=100"
    # no makeup gain — avoids pushing peaks toward clip before loudnorm
)

# De-esser filter_complex graph — tames sibilance using a sidechain compressor
# driven by a narrow boost on the 7.5 kHz band.
DEESSER_FILTER_COMPLEX = (
    "[0:a]asplit=2[main][sc];"
    "[sc]equalizer=f=7500:t=o:w=3000:g=10[sc_boosted];"
    "[main][sc_boosted]sidechaincompress=threshold=0.02:ratio=4:attack=1:release=50:level_sc=0.5[deessed]"
)


def measure_loudnorm(input_path: str) -> dict:
    """Run loudnorm in analysis mode and return measured stats for pass 2."""
    cmd = [
        "ffmpeg", "-y",
        "-i", input_path,
        "-af", "loudnorm=I=-20:TP=-1.5:LRA=11:print_format=json",
        "-f", "null", "-",
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    # loudnorm prints JSON to stderr
    stderr = result.stderr
    # Find the JSON block in stderr
    start = stderr.rfind("{")
    end   = stderr.rfind("}") + 1
    if start == -1 or end == 0:
        raise RuntimeError(f"loudnorm analysis produced no JSON.\n{stderr[-2000:]}")
    return json.loads(stderr[start:end])


def process_take(input_path: str, output_path: str) -> None:
    """Run the full FFmpeg filter chain on a single take file.

    Pass order:
      1. Noise reduction  — RNNoise (neural) + anlmdn (steady-state residual)
      2. De-esser         — sidechain compressor on 7.5 kHz band (filter_complex)
      3. EQ + dynamics    — highpass, lowpass, EQ, acompressor
      4. loudnorm pass 1  — measure integrated loudness, true peak, LRA
      5. loudnorm pass 2  — apply linear gain correction using measured stats
    """
    with tempfile.NamedTemporaryFile(suffix="_denoised.wav", delete=False) as t1, \
         tempfile.NamedTemporaryFile(suffix="_deessed.wav",  delete=False) as t2:
        denoised_path = t1.name
        deessed_path  = t2.name

    try:
        # Pass 1 — noise reduction
        # arnndn: neural noise suppressor (needs a model; fall back to anlmdn only if unavailable)
        # anlmdn: non-local means denoising for residual steady-state noise
        noise_filter = "anlmdn=s=7:p=0.002:r=0.002:m=15"
        try:
            cmd_nr = [
                "ffmpeg", "-y",
                "-i", input_path,
                "-af", f"arnndn,{noise_filter}",
                "-ar", "48000",
                "-ac", "1",
                "-c:a", "pcm_s16le",
                denoised_path,
            ]
            log.info(f"FFmpeg pass 1 (noise reduction + anlmdn): {input_path}")
            r0 = subprocess.run(cmd_nr, capture_output=True, text=True)
            if r0.returncode != 0:
                # arnndn may not be available in this FFmpeg build — fall back to anlmdn only
                log.warning("arnndn unavailable, falling back to anlmdn only")
                cmd_nr[cmd_nr.index(f"arnndn,{noise_filter}")] = noise_filter
                r0 = subprocess.run(cmd_nr, capture_output=True, text=True)
                if r0.returncode != 0:
                    raise RuntimeError(f"Noise reduction failed:\n{r0.stderr[-2000:]}")
        except Exception as e:
            log.warning(f"Noise reduction skipped: {e}")
            denoised_path = input_path  # skip this pass gracefully

        # Pass 2 — de-esser (requires filter_complex for named pads)
        cmd_de = [
            "ffmpeg", "-y",
            "-i", denoised_path,
            "-filter_complex", DEESSER_FILTER_COMPLEX,
            "-map", "[deessed]",
            "-ar", "48000",
            "-ac", "1",
            "-c:a", "pcm_s16le",
            deessed_path,
        ]
        log.info(f"FFmpeg pass 2 (de-esser): {denoised_path}")
        r1 = subprocess.run(cmd_de, capture_output=True, text=True)
        if r1.returncode != 0:
            raise RuntimeError(f"De-esser pass failed:\n{r1.stderr[-2000:]}")

        # Pass 3 — EQ + compression (no loudnorm yet)
        with tempfile.NamedTemporaryFile(suffix="_eq.wav", delete=False) as t3:
            eq_path = t3.name

        try:
            cmd_eq = [
                "ffmpeg", "-y",
                "-i", deessed_path,
                "-af", SIMPLE_FILTER_NO_NORM,
                "-ar", "48000",
                "-ac", "1",
                "-c:a", "pcm_s16le",
                eq_path,
            ]
            log.info(f"FFmpeg pass 3 (EQ+compress): {deessed_path}")
            r2 = subprocess.run(cmd_eq, capture_output=True, text=True)
            if r2.returncode != 0:
                raise RuntimeError(f"EQ pass failed:\n{r2.stderr[-2000:]}")

            # Pass 4 — loudnorm analysis (measure integrated loudness)
            log.info(f"FFmpeg pass 4 (loudnorm analysis): {eq_path}")
            stats = measure_loudnorm(eq_path)
            log.info(f"loudnorm stats: I={stats.get('input_i')} TP={stats.get('input_tp')} LRA={stats.get('input_lra')}")

            # Pass 5 — loudnorm correction using measured values (linear mode = no distortion)
            measured_filter = (
                f"loudnorm=I=-20:TP=-1.5:LRA=11"
                f":measured_I={stats['input_i']}"
                f":measured_TP={stats['input_tp']}"
                f":measured_LRA={stats['input_lra']}"
                f":measured_thresh={stats['input_thresh']}"
                f":offset={stats['target_offset']}"
                f":linear=true"
            )
            cmd_norm = [
                "ffmpeg", "-y",
                "-i", eq_path,
                "-af", measured_filter,
                "-ar", "44100",
                "-ac", "1",
                "-c:a", "pcm_s16le",
                output_path,
            ]
            log.info(f"FFmpeg pass 5 (loudnorm apply): {output_path}")
            r3 = subprocess.run(cmd_norm, capture_output=True, text=True)
            if r3.returncode != 0:
                raise RuntimeError(f"loudnorm apply pass failed:\n{r3.stderr[-2000:]}")
        finally:
            try:
                os.unlink(eq_path)
            except Exception:
                pass

    finally:
        for p in (denoised_path, deessed_path):
            if p != input_path:  # don't delete original if we skipped a pass
                try:
                    os.unlink(p)
                except Exception:
                    pass





def handle_process_chapter(job: dict):
    chapter_id = job.get("chapterId")
    takes      = job.get("takes", [])   # [{takeId, filePath, regionStart, regionEnd, fileOffset, durationSeconds}]
    secret     = job.get("secret", "")

    if not chapter_id or not takes:
        log.warning("Invalid process_chapter job")
        return

    log.info(f"Processing chapter {chapter_id}: {len(takes)} takes")

    processed = []
    errors = []

    for take in takes:
        take_id   = take["takeId"]
        file_path = take["filePath"]
        file_offset    = float(take.get("fileOffset", 0))
        region_start   = float(take.get("regionStart", 0))
        region_end     = float(take.get("regionEnd", 0))
        visible_dur    = region_end - region_start

        # Resolve absolute path
        full_path = file_path if file_path.startswith("/") else os.path.join(UPLOAD_PATH, file_path)

        if not os.path.exists(full_path):
            log.error(f"Take file not found: {full_path}")
            errors.append(f"Take {take_id}: file not found")
            continue

        # Output path: same directory as input, with _processed.wav suffix
        input_p = Path(full_path)
        output_filename = f"{input_p.stem}_processed.wav"
        output_path = str(input_p.parent / output_filename)
        output_url  = f"/takes/{output_filename}"  # URL served by Next.js

        try:
            # If the take has been trimmed, extract just the visible region first,
            # then apply the filter chain to that excerpt
            if file_offset > 0 or visible_dur > 0:
                with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                    tmp_path = tmp.name

                try:
                    # Step 1: extract trimmed region to a temp file
                    trim_cmd = [
                        "ffmpeg", "-y",
                        "-i", full_path,
                        "-ss", str(file_offset),
                        "-t",  str(visible_dur),
                        "-c:a", "pcm_s16le",
                        tmp_path,
                    ]
                    r2 = subprocess.run(trim_cmd, capture_output=True, text=True)
                    if r2.returncode != 0:
                        raise RuntimeError(f"Trim failed:\n{r2.stderr[-1000:]}")

                    # Step 2: apply filter chain to the trimmed excerpt
                    process_take(tmp_path, output_path)
                finally:
                    try:
                        os.unlink(tmp_path)
                    except Exception:
                        pass
            else:
                process_take(full_path, output_path)

            log.info(f"Processed take {take_id} → {output_path}")
            processed.append({"takeId": take_id, "processedFileUrl": output_url})

        except Exception as e:
            log.error(f"Failed to process take {take_id}: {e}")
            errors.append(f"Take {take_id}: {e}")

    # Notify app
    if errors and not processed:
        # Total failure
        _notify_process(chapter_id, None, "; ".join(errors), secret)
    else:
        if errors:
            log.warning(f"Chapter {chapter_id}: {len(errors)} take(s) failed, {len(processed)} succeeded")
        _notify_process(chapter_id, processed, None, secret)


def _notify_process(chapter_id, processed_takes, error, secret):
    url = f"{APP_CALLBACK}/api/chapters/{chapter_id}/process/callback"
    payload = {"secret": secret}
    if error:
        payload["status"] = "error"
        payload["error"] = error
    else:
        payload["status"] = "done"
        payload["takes"] = processed_takes

    try:
        requests.post(url, json=payload, timeout=30)
    except Exception as e:
        log.error(f"Failed to notify app of processing result: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# M4B Export
# ─────────────────────────────────────────────────────────────────────────────

def concat_chapter_takes(takes: list, output_path: str) -> None:
    """Concatenate all takes for a chapter into a single WAV using FFmpeg concat demuxer."""
    if len(takes) == 1:
        # Single take — just copy it
        cmd = ["ffmpeg", "-y", "-i", takes[0]["filePath"], "-c:a", "pcm_s16le", output_path]
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode != 0:
            raise RuntimeError(f"Single-take copy failed:\n{r.stderr[-1000:]}")
        return

    # Write concat list file
    with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
        list_path = f.name
        for take in takes:
            f.write(f"file '{take['filePath']}'\n")

    try:
        cmd = [
            "ffmpeg", "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", list_path,
            "-c:a", "pcm_s16le",
            output_path,
        ]
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode != 0:
            raise RuntimeError(f"Concat failed:\n{r.stderr[-1000:]}")
    finally:
        try:
            os.unlink(list_path)
        except Exception:
            pass


def handle_export_book(job: dict):
    export_id  = job.get("exportId")
    book_id    = job.get("bookId")
    version_tag = job.get("versionTag", "v1")
    metadata   = job.get("metadata", {})
    chapters   = job.get("chapters", [])
    secret     = job.get("secret", "")

    if not export_id or not book_id or not chapters:
        log.warning("Invalid export_book job")
        return

    log.info(f"Exporting book {book_id} as M4B ({len(chapters)} chapters)")

    # Output paths
    exports_dir = "/app/public/exports"
    os.makedirs(exports_dir, exist_ok=True)
    safe_title  = "".join(c if c.isalnum() or c in "_-" else "_" for c in metadata.get("title", "book"))
    m4b_filename = f"{safe_title}_{version_tag}.m4b"
    m4b_path     = os.path.join(exports_dir, m4b_filename)
    m4b_url      = f"/exports/{m4b_filename}"

    chapter_wavs = []  # (title, wav_path)
    tmp_files    = []

    try:
        # Step 1: Concatenate takes for each chapter into a per-chapter WAV
        for ch in chapters:
            ch_title = ch["title"]
            ch_takes = ch["takes"]

            if not ch_takes:
                log.warning(f"Chapter '{ch_title}' has no takes, skipping")
                continue

            with tempfile.NamedTemporaryFile(suffix=f"_ch{ch['order']}.wav", delete=False) as f:
                ch_wav = f.name
            tmp_files.append(ch_wav)

            log.info(f"Concatenating {len(ch_takes)} take(s) for chapter '{ch_title}'")
            concat_chapter_takes(ch_takes, ch_wav)
            chapter_wavs.append((ch_title, ch_wav))

        if not chapter_wavs:
            raise RuntimeError("No chapters with audio to export")

        # Step 2: Concatenate all chapter WAVs into one master WAV
        with tempfile.NamedTemporaryFile(suffix="_master.wav", delete=False) as f:
            master_wav = f.name
        tmp_files.append(master_wav)

        log.info(f"Concatenating {len(chapter_wavs)} chapters into master WAV")
        concat_chapter_takes([{"filePath": p} for _, p in chapter_wavs], master_wav)

        # Step 3: Cross-book loudnorm — measure then apply
        log.info("Running cross-book loudnorm analysis")
        stats = measure_loudnorm(master_wav)

        with tempfile.NamedTemporaryFile(suffix="_normalized.wav", delete=False) as f:
            normalized_wav = f.name
        tmp_files.append(normalized_wav)

        measured_filter = (
            f"loudnorm=I=-18:TP=-1.5:LRA=11"
            f":measured_I={stats['input_i']}"
            f":measured_TP={stats['input_tp']}"
            f":measured_LRA={stats['input_lra']}"
            f":measured_thresh={stats['input_thresh']}"
            f":offset={stats['target_offset']}"
            f":linear=true"
        )
        cmd_norm = [
            "ffmpeg", "-y",
            "-i", master_wav,
            "-af", measured_filter,
            "-ar", "44100", "-ac", "1", "-c:a", "pcm_s16le",
            normalized_wav,
        ]
        r = subprocess.run(cmd_norm, capture_output=True, text=True)
        if r.returncode != 0:
            raise RuntimeError(f"Master loudnorm failed:\n{r.stderr[-1000:]}")

        # Step 4: Build ffmetadata with book + chapter markers
        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False, encoding="utf-8") as f:
            meta_path = f.name
            f.write(";FFMETADATA1\n")
            f.write(f"title={metadata.get('title', '')}\n")
            f.write(f"artist={metadata.get('author', '')}\n")
            f.write(f"album_artist={metadata.get('narrator', metadata.get('author', ''))}\n")
            f.write(f"album={metadata.get('title', '')}\n")
            f.write(f"comment={metadata.get('description', '')}\n")
            f.write(f"genre={metadata.get('genre', 'Audiobook')}\n")
            f.write(f"date={metadata.get('year', '')}\n")
            f.write(f"language={metadata.get('language', 'en')}\n")
            f.write(f"publisher={metadata.get('publisher', '')}\n")
            f.write(f"copyright={metadata.get('year', '')} {metadata.get('author', '')}\n")

            # Probe normalized WAV for sample rate to compute chapter timestamps in ms
            probe = subprocess.run(
                ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams", normalized_wav],
                capture_output=True, text=True
            )
            probe_data = json.loads(probe.stdout)
            sample_rate = int(probe_data["streams"][0]["sample_rate"])

            # Probe each chapter WAV for duration to build chapter start/end times
            cursor_ms = 0
            for ch_title, ch_wav in chapter_wavs:
                dur_probe = subprocess.run(
                    ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams", ch_wav],
                    capture_output=True, text=True
                )
                dur_data   = json.loads(dur_probe.stdout)
                dur_sec    = float(dur_data["streams"][0].get("duration", 0))
                dur_ms     = int(dur_sec * 1000)

                f.write("\n[CHAPTER]\n")
                f.write("TIMEBASE=1/1000\n")
                f.write(f"START={cursor_ms}\n")
                f.write(f"END={cursor_ms + dur_ms}\n")
                f.write(f"title={ch_title}\n")
                cursor_ms += dur_ms
        tmp_files.append(meta_path)

        # Step 5: Mux WAV + metadata into M4B (AAC in MP4 container)
        log.info(f"Muxing M4B: {m4b_path}")

        # Download cover art if available
        cover_path = None
        cover_url  = metadata.get("coverImageUrl")
        if cover_url:
            # Resolve relative URLs (e.g. /covers/foo.jpg) against the app base URL
            if cover_url.startswith("/"):
                cover_url = f"{APP_CALLBACK}{cover_url}"
            try:
                resp = requests.get(cover_url, timeout=10)
                if resp.status_code == 200:
                    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as cf:
                        cf.write(resp.content)
                        cover_path = cf.name
                    tmp_files.append(cover_path)
            except Exception as e:
                log.warning(f"Could not download cover art: {e}")

        mux_cmd = ["ffmpeg", "-y",
            "-i", normalized_wav,
            "-i", meta_path,
        ]
        if cover_path:
            mux_cmd += ["-i", cover_path,
                "-map", "0:a", "-map", "2:v",
                "-c:v", "mjpeg", "-disposition:v", "attached_pic",
            ]
        else:
            mux_cmd += ["-map", "0:a"]

        mux_cmd += [
            "-map_metadata", "1",
            "-map_chapters", "1",
            "-c:a", "aac",
            "-b:a", "64k",
            "-ar", "44100",
            "-ac", "1",
            "-f", "mp4",
            "-movflags", "+faststart",
            m4b_path,
        ]
        r = subprocess.run(mux_cmd, capture_output=True, text=True)
        if r.returncode != 0:
            raise RuntimeError(f"M4B mux failed:\n{r.stderr[-2000:]}")

        file_size = os.path.getsize(m4b_path)
        log.info(f"M4B export complete: {m4b_path} ({file_size} bytes)")

        _notify_export(book_id, export_id, "done", m4b_url, None, file_size, secret)

    except Exception as e:
        log.error(f"Export failed for book {book_id}: {e}")
        _notify_export(book_id, export_id, "error", None, str(e), None, secret)

    finally:
        for p in tmp_files:
            try:
                os.unlink(p)
            except Exception:
                pass


def _notify_export(book_id, export_id, status, export_file_url, error, file_size, secret):
    url = f"{APP_CALLBACK}/api/books/{book_id}/export/callback"
    payload = {"secret": secret, "exportId": export_id, "status": status}
    if status == "done":
        payload["exportFileUrl"] = export_file_url
        payload["fileSizeBytes"] = file_size
    else:
        payload["error"] = error
    try:
        requests.post(url, json=payload, timeout=30)
    except Exception as e:
        log.error(f"Failed to notify app of export result: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# Main loop
# ─────────────────────────────────────────────────────────────────────────────

def process_job(job: dict):
    job_type = job.get("type", "transcribe")
    if job_type == "process_chapter":
        handle_process_chapter(job)
    elif job_type == "export_book":
        handle_export_book(job)
    else:
        handle_transcribe(job)


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
