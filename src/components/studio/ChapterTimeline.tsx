"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import {
  Play, Pause, RotateCcw, Mic, Square, Loader2, X, ZoomIn, ZoomOut, Upload,
} from "lucide-react";
import { formatDuration, formatTimecode } from "@/lib/utils";
import VUMeter from "@/components/studio/VUMeter";
import ClipList from "@/components/studio/ClipList";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Clip {
  id: string;
  label: string;
  audioFileUrl: string | null;
  audioDriveId: string | null;
  durationSeconds: number | null;  // total file duration (never changes)
  regionStart: number;   // timeline position in seconds
  regionEnd: number;     // regionStart + visible duration
  fileOffset: number;    // seconds into file where visible region starts (left trim)
  fileSizeBytes: number | null;
  transcript: string | null;
  transcriptStatus: string;  // pending | processing | done | error
  processedFileUrl: string | null;  // local path to FFmpeg-processed audio (null until processed)
  recordedAt: string;
  isActive: boolean;
}

interface ChapterTimelineProps {
  chapterId: string;
  initialClips?: Clip[];
  locked?: boolean;  // true when chapter is marked complete — disables recording/editing
  onTakeAdded?: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const CLIP_COLORS = [
  { wave: "rgba(107,21,21,0.7)",  progress: "#6B1515", bg: "rgba(107,21,21,0.15)",  border: "#6B1515" },
  { wave: "rgba(48,209,88,0.7)",   progress: "#30d158", bg: "rgba(48,209,88,0.12)",   border: "#30d158" },
  { wave: "rgba(255,149,0,0.7)",   progress: "#ff9500", bg: "rgba(255,149,0,0.12)",   border: "#ff9500" },
  { wave: "rgba(191,90,242,0.7)",  progress: "#bf5af2", bg: "rgba(191,90,242,0.12)",  border: "#bf5af2" },
  { wave: "rgba(255,55,95,0.7)",   progress: "#ff375f", bg: "rgba(255,55,95,0.12)",   border: "#ff375f" },
  { wave: "rgba(100,210,255,0.7)", progress: "#64d2ff", bg: "rgba(100,210,255,0.12)", border: "#64d2ff" },
];

const RULER_HEIGHT = 28;       // px
const TRACK_HEIGHT = 120;      // px — height of the single waveform track
const MIN_PX_PER_SEC = 20;
const MAX_PX_PER_SEC = 400;
const DEFAULT_PX_PER_SEC = 80;
const FUTURE_PAD_SECS = 30;    // empty space after last clip

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function ChapterTimeline({
  chapterId,
  initialClips = [],
  locked = false,
  onTakeAdded,
}: ChapterTimelineProps) {
  // ── State ──────────────────────────────────────────────────────────────
  const [clips, setClips] = useState<Clip[]>(
    // Sort by start time; ensure regionStart is always a number
    initialClips
      .map(c => ({
      ...c,
      regionStart: c.regionStart ?? 0,
      regionEnd: c.regionEnd ?? (c.regionStart ?? 0) + (c.durationSeconds ?? 0),
      fileOffset: c.fileOffset ?? 0,
      fileSizeBytes: c.fileSizeBytes ?? null,
      transcript: c.transcript ?? null,
      transcriptStatus: c.transcriptStatus ?? "pending",
      processedFileUrl: c.processedFileUrl ?? null,
      }))
      .sort((a, b) => a.regionStart - b.regionStart)
  );
  const [pxPerSec, setPxPerSec] = useState(DEFAULT_PX_PER_SEC);
  const [playheadSec, setPlayheadSec] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [cursorSec, setCursorSec] = useState<number | null>(null); // hover position
  const [pendingStartSec, setPendingStartSec] = useState<number | null>(null); // click-to-record marker
  const [recState, setRecState] = useState<"idle" | "recording" | "uploading">("idle");
  const [hoveredClipId, setHoveredClipId] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [recError, setRecError] = useState<string | null>(null);
  const [liveEndSec, setLiveEndSec] = useState<number | null>(null); // right edge of clip being recorded
  const [micGain, setMicGain] = useState<number>(() => {
    if (typeof window === "undefined") return 1.0;
    return parseFloat(localStorage.getItem("heirloom-mic-gain") ?? "1.0");
  });

  // ── Refs ───────────────────────────────────────────────────────────────
  const scrollRef = useRef<HTMLDivElement>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const playTimerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  const pendingStartRef = useRef<number | null>(null);
  const playheadRef = useRef<number>(0);
  const pxPerSecRef = useRef(pxPerSec);
  useEffect(() => { pxPerSecRef.current = pxPerSec; }, [pxPerSec]);
  const gainNodeRef = useRef<GainNode | null>(null); // live mic gain during recording
  const gainAnalyserRef = useRef<AnalyserNode | null>(null); // tapped after gain node for inline meter
  const uploadInputRef = useRef<HTMLInputElement>(null);

  // Audio nodes for multi-clip playback
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodesRef = useRef<AudioBufferSourceNode[]>([]);

  // ── Derived ────────────────────────────────────────────────────────────
  const timelineEndSec = clips.length > 0
    ? Math.max(...clips.map(c => c.regionEnd)) + FUTURE_PAD_SECS
    : FUTURE_PAD_SECS * 2;
  const timelineWidthPx = timelineEndSec * pxPerSec;

  // ── Ruler tick marks ───────────────────────────────────────────────────
  const tickInterval = pxPerSec >= 160 ? 1
    : pxPerSec >= 60  ? 5
    : pxPerSec >= 20  ? 15
    : 30;

  const ticks: number[] = [];
  for (let t = 0; t <= timelineEndSec; t += tickInterval) ticks.push(t);

  // Sub-ticks: 1-second marks, only when main ticks aren't already every second
  // and zoom is high enough that 1s = at least 12px
  const subTickInterval = 1;
  const showSubTicks = tickInterval > 1 && pxPerSec >= 12;
  const subTicks: number[] = [];
  if (showSubTicks) {
    for (let t = 0; t <= timelineEndSec; t += subTickInterval) {
      if (t % tickInterval !== 0) subTicks.push(t); // skip positions already covered by main ticks
    }
  }

  // ── Clip color assignment (stable by index in sorted order) ────────────
  function clipColor(idx: number) { return CLIP_COLORS[idx % CLIP_COLORS.length]; }

  // ── Overlap detection ──────────────────────────────────────────────────
  function wouldOverlap(startSec: number): boolean {
    return clips.some(c => startSec < c.regionEnd && startSec >= c.regionStart);
  }

  // Returns the next safe recording start: end of the last clip (or 0)
  function nextSafeStart(): number {
    if (clips.length === 0) return 0;
    return Math.max(...clips.map(c => c.regionEnd));
  }

  // ── Timeline click → set pending record position ───────────────────────
  function handleTimelineClick(e: React.MouseEvent<HTMLDivElement>) {
    if (recState !== "idle") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left + (scrollRef.current?.scrollLeft ?? 0);
    const clickedSec = x / pxPerSec;

    // If clicking inside an existing clip, ignore
    if (clips.some(c => clickedSec >= c.regionStart && clickedSec < c.regionEnd)) return;

    // Snap: if within 0.5s of a clip end, snap to that clip end
    const nearest = clips.reduce<number | null>((best, c) => {
      const dist = Math.abs(clickedSec - c.regionEnd);
      if (dist < 0.5 && (best === null || dist < Math.abs(clickedSec - best))) return c.regionEnd;
      return best;
    }, null);

    const finalSec = nearest ?? clickedSec;
    setPendingStartSec(finalSec);
    pendingStartRef.current = finalSec;
  }

  function handleTimelineMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left + (scrollRef.current?.scrollLeft ?? 0);
    setCursorSec(x / pxPerSec);
  }

  // ── Recording ──────────────────────────────────────────────────────────
  const startRecording = useCallback(async (startSec?: number) => {
    setRecError(null);
    const start = startSec ?? pendingStartRef.current ?? nextSafeStart();
    pendingStartRef.current = start;
    setPendingStartSec(start);

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, sampleRate: 48000 },
      });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus" : "audio/webm";

      // Route through a GainNode so micGain slider applies to recorded audio
      const recCtx = new AudioContext({ sampleRate: 48000 });
      const source = recCtx.createMediaStreamSource(mediaStream);
      const gainNode = recCtx.createGain();
      gainNode.gain.value = micGain;
      gainNodeRef.current = gainNode;
      const analyser = recCtx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.5;
      gainAnalyserRef.current = analyser;
      const dest = recCtx.createMediaStreamDestination();
      source.connect(gainNode);
      gainNode.connect(analyser); // tap post-gain for meter
      gainNode.connect(dest);
      const processedStream = dest.stream;

      const recorder = new MediaRecorder(processedStream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };

      recorder.onstop = async () => {
        mediaStream.getTracks().forEach(t => t.stop());
        gainNodeRef.current = null;
        gainAnalyserRef.current = null;
        recCtx.close();
        setStream(null);
        setLiveEndSec(null);
        if (timerRef.current) clearInterval(timerRef.current);

        const recordedDuration = (Date.now() - startTimeRef.current) / 1000;
        const regionStart = pendingStartRef.current ?? 0;
        const regionEnd = regionStart + recordedDuration;
        const blob = new Blob(chunksRef.current, { type: mimeType });

        setRecState("uploading");
        try {
          const fd = new FormData();
          const ext = mimeType.includes("ogg") ? "ogg" : "webm";
          fd.append("audio", new File([blob], `take.${ext}`, { type: mimeType }));
          fd.append("duration", String(recordedDuration));
          fd.append("regionStart", String(regionStart));
          fd.append("regionEnd", String(regionEnd));

          const res = await fetch(`/api/chapters/${chapterId}/takes`, { method: "POST", body: fd });
          if (!res.ok) throw new Error((await res.json()).error ?? "Upload failed");
          const { take } = await res.json();

          const newClip: Clip = {
            ...take,
            regionStart: take.regionStart ?? regionStart,
            regionEnd: take.regionEnd ?? regionEnd,
            fileOffset: take.fileOffset ?? 0,
            fileSizeBytes: take.fileSizeBytes ?? null,
            transcript: take.transcript ?? null,
            transcriptStatus: take.transcriptStatus ?? "pending",
          };

          // Fire transcription in background — don't await
          fetch(`/api/takes/${take.id}/transcribe`, { method: "POST" })
            .then(() => startPollingTranscript(take.id))
            .catch(() => {});
          setClips(prev => [...prev, newClip].sort((a, b) => a.regionStart - b.regionStart));
          onTakeAdded?.();
          setPendingStartSec(null);
          pendingStartRef.current = null;
        } catch (err) {
          setRecError(err instanceof Error ? err.message : "Upload failed");
        } finally {
          setRecState("idle");
          setElapsed(0);
        }
      };

      recorder.start(250);
      mediaRef.current = recorder;
      startTimeRef.current = Date.now();
      setStream(mediaStream);
      setElapsed(0);
      setLiveEndSec(start);
      setRecState("recording");

      timerRef.current = setInterval(() => {
        const secs = (Date.now() - startTimeRef.current) / 1000;
        setElapsed(secs); // fractional — display handles rounding
        setLiveEndSec((pendingStartRef.current ?? 0) + secs);
      }, 50);
    } catch {
      setRecError("Microphone access denied.");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterId]);

  const stopRecording = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    mediaRef.current?.stop();
  }, []);

  // ── Playback (Web Audio, plays clips in sequence with gaps as silence) ──
  const stopPlayback = useCallback(() => {
    sourceNodesRef.current.forEach(n => { try { n.stop(); } catch {} });
    sourceNodesRef.current = [];
    if (playTimerRef.current) clearInterval(playTimerRef.current);
    setIsPlaying(false);
  }, []);

  const startPlayback = useCallback(async () => {
    stopPlayback();
    if (clips.length === 0) return;

    const ctx = new AudioContext();
    audioCtxRef.current = ctx;

    const startWallTime = ctx.currentTime;
    const startSec = playheadRef.current;

    // Load all clips that start after playhead
    const relevant = clips.filter(c => c.regionEnd > startSec && c.audioFileUrl);

    await Promise.all(relevant.map(async (clip) => {
      try {
        // Prefer processed audio if available (post-EQ/compression/noise reduction)
        const playUrl = clip.processedFileUrl ?? clip.audioFileUrl!;
        const buf = await fetch(playUrl).then(r => r.arrayBuffer());
        const decoded = await ctx.decodeAudioData(buf);
        const src = ctx.createBufferSource();
        src.buffer = decoded;
        src.connect(ctx.destination);

        // When does this clip start on the timeline, relative to playhead?
        // fileOffset = how far into the audio file the visible region starts (left trim)
        // clipOffsetInFile = fileOffset + how far past the clip's regionStart the playhead is
        const playheadOffsetIntoClip = Math.max(0, startSec - clip.regionStart);
        const clipOffsetInFile = clip.fileOffset + playheadOffsetIntoClip;
        const delayFromNow = Math.max(0, clip.regionStart - startSec);
        // Duration to play = visible region only (don't play into trimmed-off tail)
        const visibleDuration = clip.regionEnd - clip.regionStart;
        const durationFromOffset = visibleDuration - playheadOffsetIntoClip;

        src.start(startWallTime + delayFromNow, clipOffsetInFile, durationFromOffset);
        sourceNodesRef.current.push(src);
      } catch { /* skip unloadable clips */ }
    }));

    setIsPlaying(true);
    playTimerRef.current = setInterval(() => {
      const newPos = startSec + (ctx.currentTime - startWallTime);
      const totalEnd = clips.length > 0 ? Math.max(...clips.map(c => c.regionEnd)) : 0;
      if (newPos >= totalEnd) {
        stopPlayback();
        setPlayheadSec(0);
        playheadRef.current = 0;
      } else {
        setPlayheadSec(newPos);
        playheadRef.current = newPos;
      }
    }, 50);
  }, [clips, stopPlayback]);

  const togglePlayback = useCallback(() => {
    if (isPlaying) stopPlayback();
    else startPlayback();
  }, [isPlaying, startPlayback, stopPlayback]);

  // Cleanup on unmount
  useEffect(() => () => {
    stopPlayback();
    audioCtxRef.current?.close();
  }, [stopPlayback]);

  // ── Transcript polling — checks every 3s until done/error ──────────────
  const pollTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const startPollingTranscript = useCallback((takeId: string) => {
    // Clear any existing poll for this take
    const existing = pollTimersRef.current.get(takeId);
    if (existing) clearInterval(existing);

    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/chapters/${chapterId}/takes/${takeId}/transcript`);
        if (!res.ok) return;
        const { take } = await res.json();
        if (take.transcriptStatus === "done" || take.transcriptStatus === "error") {
          clearInterval(timer);
          pollTimersRef.current.delete(takeId);
          setClips(prev => prev.map(c =>
            c.id === takeId
              ? { ...c, transcript: take.transcript, transcriptStatus: take.transcriptStatus }
              : c
          ));
        } else if (take.transcriptStatus === "processing") {
          // Still going — update status indicator
          setClips(prev => prev.map(c =>
            c.id === takeId ? { ...c, transcriptStatus: "processing" } : c
          ));
        }
      } catch { /* ignore */ }
    }, 3000);

    pollTimersRef.current.set(takeId, timer);
  }, [chapterId]);

  // Cleanup poll timers on unmount
  useEffect(() => () => {
    pollTimersRef.current.forEach(t => clearInterval(t));
  }, []);

  // ── Upload audio file ───────────────────────────────────────────────────
  const uploadAudioFile = useCallback(async (file: File) => {
    setRecError(null);
    const start = pendingStartRef.current ?? (clips.length > 0 ? Math.max(...clips.map(c => c.regionEnd)) : 0);

    // Resolve duration from file metadata before uploading.
    // WebM files from MediaRecorder often report Infinity for duration — fall back to decodeAudioData.
    let duration: number;
    try {
      duration = await new Promise<number>((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const audio = new Audio();
        audio.addEventListener("loadedmetadata", () => {
          URL.revokeObjectURL(url);
          if (isFinite(audio.duration) && audio.duration > 0) {
            resolve(audio.duration);
          } else {
            // Duration not in container headers — decode the full buffer to measure it
            file.arrayBuffer().then(buf => {
              const ctx = new AudioContext();
              ctx.decodeAudioData(buf,
                (decoded) => { ctx.close(); resolve(decoded.duration); },
                (err) => { ctx.close(); reject(err); }
              );
            }).catch(reject);
          }
        });
        audio.addEventListener("error", () => { URL.revokeObjectURL(url); reject(new Error("Could not read file duration")); });
        audio.src = url;
      });
    } catch {
      setRecError("Could not read audio file duration.");
      return;
    }

    const regionEnd = start + duration;
    setRecState("uploading");
    try {
      const fd = new FormData();
      fd.append("audio", file);
      fd.append("duration", String(duration));
      fd.append("regionStart", String(start));
      fd.append("regionEnd", String(regionEnd));

      const res = await fetch(`/api/chapters/${chapterId}/takes`, { method: "POST", body: fd });
      if (!res.ok) throw new Error((await res.json()).error ?? "Upload failed");
      const { take } = await res.json();

      const newClip: Clip = {
        ...take,
        regionStart: take.regionStart ?? start,
        regionEnd: take.regionEnd ?? regionEnd,
        fileOffset: take.fileOffset ?? 0,
        fileSizeBytes: take.fileSizeBytes ?? null,
        transcript: take.transcript ?? null,
        transcriptStatus: take.transcriptStatus ?? "pending",
        processedFileUrl: take.processedFileUrl ?? null,
      };

      fetch(`/api/takes/${take.id}/transcribe`, { method: "POST" })
        .then(() => startPollingTranscript(take.id))
        .catch(() => {});
      setClips(prev => [...prev, newClip].sort((a, b) => a.regionStart - b.regionStart));
      onTakeAdded?.();
      setPendingStartSec(null);
      pendingStartRef.current = null;
    } catch (err) {
      setRecError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setRecState("idle");
    }
  }, [chapterId, clips, startPollingTranscript, onTakeAdded]);

  // ── Delete clip ────────────────────────────────────────────────────────
  const deleteClip = (clipId: string) => {
    setClips(prev => prev.filter(c => c.id !== clipId));
    fetch(`/api/chapters/${chapterId}/takes/${clipId}`, { method: "DELETE" }).catch(() => {});
  };

  // ── Move clip (drag) — returns true if accepted ──────────────────────
  const moveClip = useCallback((id: string, newStart: number): boolean => {
    setClips(prev => {
      const clip = prev.find(c => c.id === id);
      if (!clip) return prev;
      // Use visible (trimmed) duration, not full file duration
      const visibleDur = clip.regionEnd - clip.regionStart;
      const newEnd = newStart + visibleDur;
      const blocked = prev.some(c =>
        c.id !== id &&
        newStart < c.regionEnd - 0.01 &&
        newEnd > c.regionStart + 0.01
      );
      if (blocked) return prev; // no change — ClipBlock will snap back
      fetch(`/api/chapters/${chapterId}/takes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regionStart: newStart, regionEnd: newEnd }),
      }).catch(() => {});
      return prev.map(c =>
        c.id === id ? { ...c, regionStart: newStart, regionEnd: newEnd } : c
      ).sort((a, b) => a.regionStart - b.regionStart);
    });
    // We can't know if blocked inside setClips, so check synchronously too
    const clip = clips.find(c => c.id === id);
    if (!clip) return false;
    const visibleDur = clip.regionEnd - clip.regionStart;
    const newEnd = newStart + visibleDur;
    return !clips.some(c =>
      c.id !== id &&
      newStart < c.regionEnd - 0.01 &&
      newEnd > c.regionStart + 0.01
    );
  }, [clips, chapterId]);

  // ── Trim clip — returns true if accepted ──────────────────────────────
  // trimClip receives newStart (timeline), newDuration (visible window), newFileOffset (into file)
  const trimClip = useCallback((id: string, newStart: number, newDuration: number, newFileOffset: number): boolean => {
    const clip = clips.find(c => c.id === id);
    if (!clip) return false;
    const newEnd = newStart + newDuration;
    const blocked = clips.some(c =>
      c.id !== id &&
      newStart < c.regionEnd - 0.01 &&
      newEnd > c.regionStart + 0.01
    );
    if (blocked) return false;
    setClips(prev => prev.map(c =>
      c.id === id
        ? { ...c, regionStart: newStart, regionEnd: newEnd, fileOffset: newFileOffset }
        : c
    ).sort((a, b) => a.regionStart - b.regionStart));
    fetch(`/api/chapters/${chapterId}/takes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ regionStart: newStart, regionEnd: newEnd, fileOffset: newFileOffset }),
    }).catch(() => {});
    return true;
  }, [clips, chapterId]);


  // Listen for gain changes dispatched by the AudioSettings modal
  useEffect(() => {
    const handler = (e: Event) => {
      const val = (e as CustomEvent<number>).detail;
      setMicGain(val);
      if (gainNodeRef.current) gainNodeRef.current.gain.value = val;
    };
    window.addEventListener("heirloom:mic-gain", handler);
    return () => window.removeEventListener("heirloom:mic-gain", handler);
  }, []);

  // ── Zoom ───────────────────────────────────────────────────────────────
  function zoom(delta: number) {
    setPxPerSec(prev => Math.max(MIN_PX_PER_SEC, Math.min(MAX_PX_PER_SEC, prev * delta)));
  }

  // Auto-scroll playhead into view while playing
  useEffect(() => {
    if (!isPlaying || !scrollRef.current) return;
    const x = playheadSec * pxPerSec;
    const { scrollLeft, clientWidth } = scrollRef.current;
    if (x > scrollLeft + clientWidth * 0.8) {
      scrollRef.current.scrollLeft = x - clientWidth * 0.2;
    }
  }, [playheadSec, isPlaying, pxPerSec]);

  // ── Playhead click on ruler ────────────────────────────────────────────
  function handleRulerClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left + (scrollRef.current?.scrollLeft ?? 0);
    const sec = Math.max(0, x / pxPerSec);
    setPlayheadSec(sec);
    playheadRef.current = sec;
    if (isPlaying) {
      stopPlayback();
      setTimeout(() => startPlayback(), 10);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────
  const totalRecordedEnd = clips.length > 0 ? Math.max(...clips.map(c => c.regionEnd)) : 0;

  return (
    <div className="flex flex-col rounded-xl overflow-hidden select-none"
      style={{ background: "#0c0c0e", border: "1px solid var(--border-subtle)" }}>

      {/* ── Transport bar ─────────────────────────────────────────────── */}
      {(() => {
        const isProcessed = locked && clips.length > 0 && clips.every(c => c.processedFileUrl);
        const isActive = isPlaying || recState === "recording";
        const playBtnColor = isProcessed ? "#30d158" : "var(--accent)";
        const playBtnShadow = isProcessed
          ? "0 2px 10px rgba(48,209,88,0.5)"
          : "0 2px 10px rgba(107,21,21,0.5)";
        return (
          <div className="flex items-center gap-3 px-4 border-b flex-shrink-0 relative"
            style={{ borderColor: "var(--border-subtle)", background: "#0a0a0c", minHeight: 60 }}>

            {/* Left: play controls */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Play/Pause */}
              <button
                onClick={togglePlayback}
                disabled={clips.length === 0}
                className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 disabled:opacity-30 transition-all"
                title={isProcessed ? "Playing processed audio" : "Play"}
                style={{ background: playBtnColor, boxShadow: clips.length > 0 ? playBtnShadow : "none", transition: "background 0.3s, box-shadow 0.3s" }}>
                {isPlaying
                  ? <Pause className="w-4 h-4 text-white fill-white" />
                  : <Play className="w-4 h-4 text-white fill-white" style={{ marginLeft: "2px" }} />}
              </button>

              {/* Return to start */}
              <button
                onClick={() => { stopPlayback(); setPlayheadSec(0); playheadRef.current = 0; }}
                className="p-1.5 rounded transition-colors"
                style={{ color: "var(--text-tertiary)" }} title="Return to start">
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Centre: large time display — prominent during playback or recording */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-none">
              <div className="flex items-baseline gap-0 font-mono tabular-nums leading-none"
                style={{
                  color: recState === "recording"
                    ? "#dc2626"
                    : isPlaying
                    ? "var(--text-primary)"
                    : "var(--text-secondary)",
                  transition: "color 0.2s",
                }}>
                {/* Main timecode — MM:SS */}
                <span style={{ fontSize: "1.65rem", fontWeight: 600, letterSpacing: "-0.03em" }}>
                  {recState === "recording"
                    ? formatTimecode(elapsed).split(".")[0]
                    : formatTimecode(playheadSec).split(".")[0]}
                </span>
                {/* Centiseconds — smaller, dimmer */}
                <span style={{ fontSize: "1rem", fontWeight: 400, opacity: 0.55, letterSpacing: "-0.01em" }}>
                  .{recState === "recording"
                    ? formatTimecode(elapsed).split(".")[1]
                    : formatTimecode(playheadSec).split(".")[1]}
                </span>
                {/* Total duration */}
                <span style={{ fontSize: "0.75rem", fontWeight: 400, color: "var(--text-tertiary)", marginLeft: "0.4em" }}>
                  / {formatTimecode(totalRecordedEnd).split(".")[0]}
                </span>
              </div>
              {isProcessed && !isActive && (
                <span className="text-xs mt-0.5" style={{ color: "#30d158", fontFamily: "var(--font-sans)", fontSize: "0.6rem", letterSpacing: "0.05em" }}>
                  ✦ processed
                </span>
              )}
            </div>

            <div className="flex-1" />

            {/* Right: zoom controls */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <button onClick={() => zoom(0.7)} className="p-1.5 rounded" style={{ color: "var(--text-tertiary)" }} title="Zoom out">
                <ZoomOut className="w-4 h-4" />
              </button>
              <div className="text-xs font-mono w-14 text-center flex-shrink-0" style={{ color: "var(--text-tertiary)" }}>
                {Math.round(pxPerSec)}px/s
              </div>
              <button onClick={() => zoom(1.4)} className="p-1.5 rounded" style={{ color: "var(--text-tertiary)" }} title="Zoom in">
                <ZoomIn className="w-4 h-4" />
              </button>
            </div>
          </div>
        );
      })()}

      {/* ── Scrollable timeline canvas ─────────────────────────────────── */}
      <div
        ref={scrollRef}
        className="overflow-x-auto overflow-y-hidden relative"
        style={{ height: RULER_HEIGHT + TRACK_HEIGHT + 20 + "px", cursor: locked ? "default" : recState === "idle" ? "crosshair" : "default" }}
        onClick={locked ? undefined : handleTimelineClick}
        onMouseMove={locked ? undefined : handleTimelineMouseMove}
        onMouseLeave={() => setCursorSec(null)}>

        {/* Inner canvas — full timeline width */}
        <div className="relative" style={{ width: timelineWidthPx + "px", height: "100%" }}>

          {/* ── Time ruler ──────────────────────────────────────────────── */}
          <div
            className="absolute top-0 left-0 right-0 flex-shrink-0"
            style={{ height: RULER_HEIGHT + "px", background: "#080809", borderBottom: "1px solid rgba(255,255,255,0.06)", zIndex: 10 }}
            onClick={(e) => { e.stopPropagation(); handleRulerClick(e); }}>
            {/* Sub-ticks — 1-second marks, no label, shorter line */}
            {subTicks.map(t => (
              <div key={t} className="absolute bottom-0"
                style={{ left: t * pxPerSec, transform: "translateX(-50%)", pointerEvents: "none" }}>
                <div style={{ width: 1, height: 4, background: "rgba(255,255,255,0.09)" }} />
              </div>
            ))}
            {/* Main ticks — labeled */}
            {ticks.map(t => (
              <div key={t} className="absolute top-0 flex flex-col items-center"
                style={{ left: t * pxPerSec, transform: "translateX(-50%)" }}>
                <span style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.6rem", fontFamily: "var(--font-mono, monospace)", marginTop: 4 }}>
                  {formatDuration(t)}
                </span>
                <div style={{ width: 1, height: 6, background: "rgba(255,255,255,0.15)", marginTop: 2 }} />
              </div>
            ))}
          </div>

          {/* ── Track area ──────────────────────────────────────────────── */}
          <div className="absolute left-0 right-0"
            style={{ top: RULER_HEIGHT, height: TRACK_HEIGHT, background: "rgba(255,255,255,0.015)" }}>

            {/* Sub-tick grid lines — even fainter */}
            {subTicks.map(t => (
              <div key={t} className="absolute top-0 bottom-0"
                style={{ left: t * pxPerSec, width: 1, background: "rgba(255,255,255,0.02)" }} />
            ))}
            {/* Main tick grid lines */}
            {ticks.map(t => (
              <div key={t} className="absolute top-0 bottom-0"
                style={{ left: t * pxPerSec, width: 1, background: "rgba(255,255,255,0.04)" }} />
            ))}

            {/* ── Clips ─────────────────────────────────────────────────── */}
            {clips.map((clip, idx) => (
              <ClipBlock
                key={clip.id}
                clip={clip}
                color={clipColor(idx)}
                pxPerSec={pxPerSec}
                trackHeight={TRACK_HEIGHT}
                onDelete={() => deleteClip(clip.id)}
                onMove={moveClip}
                onTrim={trimClip}
                locked={locked}
                externalHighlight={hoveredClipId === clip.id}
              />
            ))}

            {/* ── Live recording ghost clip ─────────────────────────────── */}
            {recState === "recording" && pendingStartSec !== null && liveEndSec !== null && (
              <div
                className="absolute top-1 bottom-1 rounded overflow-hidden flex items-center"
                style={{
                  left: pendingStartSec * pxPerSec + 1,
                  width: Math.max(0, (liveEndSec - pendingStartSec) * pxPerSec - 2),
                  background: "rgba(220,38,38,0.15)",
                  border: "1px solid rgba(220,38,38,0.6)",
                  boxShadow: "0 0 12px rgba(220,38,38,0.3)",
                  pointerEvents: "none",
                }}>
                {/* Animated recording bars */}
                <div className="flex items-center gap-px px-2 h-full w-full overflow-hidden">
                  {Array.from({ length: Math.max(4, Math.floor((liveEndSec - pendingStartSec) * pxPerSec / 6)) }).map((_, i) => (
                    <div key={i} className="flex-shrink-0 rounded-sm"
                      style={{
                        width: 2,
                        height: `${25 + Math.abs(Math.sin(Date.now() / 200 + i)) * 60}%`,
                        background: "rgba(220,38,38,0.7)",
                        animation: "none",
                      }} />
                  ))}
                </div>
              </div>
            )}

            {/* ── Pending record marker (click position) ─────────────────── */}
            {pendingStartSec !== null && recState === "idle" && (
              <div className="absolute top-0 bottom-0" style={{ left: pendingStartSec * pxPerSec, pointerEvents: "none" }}>
                <div className="absolute top-0 bottom-0 w-0.5" style={{ background: "rgba(220,38,38,0.8)", boxShadow: "0 0 6px rgba(220,38,38,0.5)" }} />
                <div className="absolute -top-0 left-1 px-1.5 py-0.5 rounded text-xs font-mono"
                  style={{ background: "rgba(220,38,38,0.9)", color: "white", fontSize: "0.6rem", whiteSpace: "nowrap" }}>
                  {formatDuration(Math.floor(pendingStartSec))}
                </div>
              </div>
            )}
          </div>

          {/* ── Playhead ──────────────────────────────────────────────────── */}
          <div
            className="absolute top-0 bottom-0 pointer-events-none"
            style={{ left: playheadSec * pxPerSec, width: 1, background: "rgba(107,21,21,0.9)", boxShadow: "0 0 6px rgba(107,21,21,0.6)", zIndex: 20 }}>
            <div className="absolute top-0 w-2.5 h-2.5 rounded-full -translate-x-1/2"
              style={{ background: "#6B1515", boxShadow: "0 0 6px rgba(107,21,21,0.8)" }} />
          </div>

          {/* ── Hover cursor ──────────────────────────────────────────────── */}
          {cursorSec !== null && recState === "idle" && (
            <div className="absolute top-0 bottom-0 pointer-events-none"
              style={{ left: cursorSec * pxPerSec, width: 1, background: "rgba(255,255,255,0.12)", zIndex: 15 }} />
          )}
        </div>
      </div>

      {/* ── Record controls ───────────────────────────────────────────────── */}
      <div className="border-t flex-shrink-0" style={{ borderColor: "var(--border-subtle)", opacity: locked ? 0.4 : 1, pointerEvents: locked ? "none" : "auto" }}>

        {/* Idle — show record button */}
        {recState === "idle" && (
          <div className="flex items-center gap-3 px-4 py-3">
            {pendingStartSec !== null ? (
              // User clicked a position — offer to record there
              <>
                <span className="text-xs flex-1" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-sans)" }}>
                  Record from <span className="font-mono" style={{ color: "var(--text-secondary)" }}>{formatDuration(Math.floor(pendingStartSec))}</span>
                  {wouldOverlap(pendingStartSec) && (
                    <span className="ml-2" style={{ color: "var(--red)" }}>⚠ overlaps existing clip</span>
                  )}
                </span>
                <button onClick={() => { setPendingStartSec(null); pendingStartRef.current = null; }}
                  className="p-1 rounded" style={{ color: "var(--text-tertiary)" }}>
                  <X className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => !wouldOverlap(pendingStartSec) && uploadInputRef.current?.click()}
                  disabled={wouldOverlap(pendingStartSec)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold flex-shrink-0 disabled:opacity-40"
                  style={{ background: "var(--bg-raised)", border: "1px solid var(--border-default)", color: "var(--text-secondary)", fontFamily: "var(--font-sans)" }}>
                  <Upload className="w-4 h-4" />
                  Upload Here
                </button>
                <button
                  onClick={() => !wouldOverlap(pendingStartSec) && startRecording(pendingStartSec)}
                  disabled={wouldOverlap(pendingStartSec)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
                  style={{ background: "linear-gradient(135deg,#dc2626,#991b1b)", color: "white", boxShadow: "0 0 14px rgba(220,38,38,0.5)", fontFamily: "var(--font-sans)" }}>
                  <Mic className="w-4 h-4" />
                  Record Here
                </button>
              </>
            ) : (
              // No position selected — offer to continue from end
              <>
                <span className="text-xs flex-1" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-sans)", opacity: 0.6 }}>
                  {clips.length === 0
                    ? "Click anywhere on the timeline or press Record to start"
                    : `Click the timeline to choose a start point, or continue from ${formatDuration(Math.floor(totalRecordedEnd))}`}
                </span>
                <button
                  onClick={() => uploadInputRef.current?.click()}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold flex-shrink-0"
                  style={{ background: "var(--bg-raised)", border: "1px solid var(--border-default)", color: "var(--text-secondary)", fontFamily: "var(--font-sans)" }}>
                  <Upload className="w-4 h-4" />
                  Upload Audio
                </button>
                <button
                  onClick={() => startRecording(totalRecordedEnd)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold flex-shrink-0"
                  style={{ background: "linear-gradient(135deg,#dc2626,#991b1b)", color: "white", boxShadow: "0 0 12px rgba(220,38,38,0.4)", fontFamily: "var(--font-sans)" }}>
                  <Mic className="w-4 h-4" />
                  {clips.length === 0 ? "Record" : "Continue Recording"}
                </button>
              </>
            )}
          </div>
        )}

        {/* Recording */}
        {recState === "recording" && (
          <div className="flex flex-col gap-2 px-4 py-3"
            style={{ background: "rgba(220,38,38,0.05)", borderTop: "1px solid rgba(220,38,38,0.2)" }}>
            <div className="flex items-center gap-3">
              <div className="relative flex-shrink-0">
                <span className="absolute inset-0 rounded-full animate-ping" style={{ background: "rgba(220,38,38,0.3)" }} />
                <div className="relative w-3 h-3 rounded-full" style={{ background: "#dc2626" }} />
              </div>
              <span className="text-sm font-medium flex-1" style={{ color: "var(--text-primary)", fontFamily: "var(--font-sans)" }}>
                Recording — {formatTimecode(elapsed).split(".")[0]}<span className="opacity-50">.{formatTimecode(elapsed).split(".")[1]}</span>
                <span className="ml-2 text-xs font-normal" style={{ color: "var(--text-tertiary)" }}>
                  from {formatDuration(Math.floor(pendingStartSec ?? 0))}
                </span>
              </span>
              <button
                onClick={stopRecording}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
                style={{ background: "linear-gradient(135deg,#dc2626,#991b1b)", color: "white", fontFamily: "var(--font-sans)" }}>
                <Square className="w-3.5 h-3.5 fill-white" />
                Stop
              </button>
            </div>
            <VUMeter stream={stream} isRecording />
          </div>
        )}

        {/* Uploading */}
        {recState === "uploading" && (
          <div className="flex items-center gap-3 px-4 py-3"
            style={{ background: "rgba(107,21,21,0.05)" }}>
            <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" style={{ color: "var(--accent)" }} />
            <span className="text-sm" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-sans)" }}>Saving…</span>
          </div>
        )}

        {recError && (
          <div className="px-4 py-2">
            <p className="text-xs" style={{ color: "var(--red)" }}>{recError}</p>
          </div>
        )}

        {/* Hidden file input for audio upload */}
        <input
          ref={uploadInputRef}
          type="file"
          accept="audio/wav,audio/mpeg,audio/mp4,audio/x-m4a,audio/ogg,audio/webm,audio/aac"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) { e.target.value = ""; uploadAudioFile(f); }
          }}
        />
      </div>

      {/* ── Clip list with transcripts ────────────────────────────────── */}
      <ClipList clips={clips} onDelete={deleteClip} onHoverClip={setHoveredClipId} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ClipBlock — a single clip rendered on the timeline
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
interface ClipBlockProps {
  clip: Clip;
  color: typeof CLIP_COLORS[0];
  pxPerSec: number;
  trackHeight: number;
  onDelete: () => void;
  onMove: (id: string, newStart: number) => boolean;   // returns false if blocked
  onTrim: (id: string, newStart: number, newDuration: number, newFileOffset: number) => boolean;
  locked?: boolean;
  externalHighlight?: boolean;
}

const CLIP_INSET = 6;
const EDGE_ZONE = 8; // px — width of trim handle on each edge

function ClipBlock({ clip, color, pxPerSec, trackHeight, onDelete, onMove, onTrim, locked = false, externalHighlight = false }: ClipBlockProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wsRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [containerMounted, setContainerMounted] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [dragCursor, setDragCursor] = useState<'grab' | 'grabbing' | 'ew-resize' | null>(null);

  // Live drag/trim visual state (null = not dragging)
  const [liveLeft, setLiveLeft] = useState<number | null>(null);
  const [liveWidth, setLiveWidth] = useState<number | null>(null);
  const [liveFileOffset, setLiveFileOffset] = useState<number | null>(null);

  const dragRef = useRef<{
    mode: 'move' | 'trim-left' | 'trim-right';
    startX: number;
    origStart: number;
    origDuration: number;
  } | null>(null);

  const audioUrl = clip.audioFileUrl ?? null;

  const callbackRef = useCallback((node: HTMLDivElement | null) => {
    (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    if (node) setContainerMounted(true);
  }, []);

  useEffect(() => {
    if (!audioUrl || !containerRef.current) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let ws: any;
    let active = true;
    setLoadError(false);
    setReady(false);

    (async () => {
      try {
        const WaveSurfer = (await import("wavesurfer.js")).default;
        if (!active || !containerRef.current) return;
        ws = WaveSurfer.create({
          container: containerRef.current,
          waveColor: color.wave,
          progressColor: color.progress,
          cursorWidth: 0,
          barWidth: 2,
          barGap: 1,
          barRadius: 2,
          height: trackHeight - CLIP_INSET * 2,
          normalize: true,
          backend: "WebAudio",
          fillParent: false,
          minPxPerSec: pxPerSec,
          interact: false,
        });
        wsRef.current = ws;
        ws.on("ready", () => { if (active) setReady(true); });
        ws.on("error", () => { if (active) setLoadError(true); });
        await ws.load(audioUrl);
      } catch { if (active) setLoadError(true); }
    })();

    return () => { active = false; ws?.destroy(); wsRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrl, containerMounted]);

  const clipH = trackHeight - CLIP_INSET * 2;
  const origLeftPx = clip.regionStart * pxPerSec;
  // Visible duration = regionEnd - regionStart (the window, not the full file)
  const visibleDur = clip.regionEnd - clip.regionStart;
  const origWidthPx = Math.max(4, visibleDur * pxPerSec);
  const leftPx = liveLeft ?? origLeftPx;
  const widthPx = liveWidth ?? origWidthPx;
  // fileOffset: how far into the audio file the visible window starts
  const fileOffset = liveFileOffset ?? clip.fileOffset;
  // Full audio file width at current zoom — waveform is always this wide, clipped by overflow:hidden
  const fullFileDur = clip.durationSeconds ?? visibleDur;
  const fullFileWidthPx = fullFileDur * pxPerSec;
  // Offset the waveform container left by fileOffset so correct portion shows through the clip window
  const waveOffsetPx = -(fileOffset * pxPerSec);

  function getCursorForX(localX: number, width: number): 'grab' | 'ew-resize' {
    if (localX <= EDGE_ZONE || localX >= width - EDGE_ZONE) return 'ew-resize';
    return 'grab';
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const localX = e.clientX - rect.left;
    const w = rect.width;
    const mode: 'move' | 'trim-left' | 'trim-right' =
      localX <= EDGE_ZONE ? 'trim-left' :
      localX >= w - EDGE_ZONE ? 'trim-right' : 'move';
    dragRef.current = {
      mode,
      startX: e.clientX,
      origStart: clip.regionStart,
      origDuration: clip.durationSeconds ?? 0,
    };
    setDragCursor('grabbing');
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) {
      // Just hovering — update cursor
      const rect = e.currentTarget.getBoundingClientRect();
      setDragCursor(getCursorForX(e.clientX - rect.left, rect.width));
      return;
    }
    const { mode, startX, origStart } = dragRef.current;
    const deltaPx = e.clientX - startX;
    const deltaSec = deltaPx / pxPerSec;

    if (mode === 'move') {
      const newStart = Math.max(0, origStart + deltaSec);
      setLiveLeft(newStart * pxPerSec + 1);
    } else if (mode === 'trim-left') {
      const newStart = Math.max(0, origStart + deltaSec);
      const trimmed = newStart - origStart; // how many secs we trimmed from the left
      const newFileOff = Math.max(0, clip.fileOffset + trimmed);
      const newVisibleDur = Math.max(0.1, (clip.regionEnd - clip.regionStart) - trimmed);
      setLiveLeft(newStart * pxPerSec + 1);
      setLiveWidth(Math.max(4, newVisibleDur * pxPerSec - 2));
      setLiveFileOffset(newFileOff);
    } else if (mode === 'trim-right') {
      const newVisibleDur = Math.max(0.1, (clip.regionEnd - clip.regionStart) + deltaSec);
      setLiveWidth(Math.max(4, newVisibleDur * pxPerSec - 2));
    }
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    const { mode, startX, origStart } = dragRef.current;
    const deltaSec = (e.clientX - startX) / pxPerSec;
    dragRef.current = null;
    setDragCursor('grab');

    let accepted = false;
    if (mode === 'move') {
      const newStart = Math.max(0, origStart + deltaSec);
      accepted = onMove(clip.id, newStart);
    } else if (mode === 'trim-left') {
      const newStart = Math.max(0, origStart + deltaSec);
      const trimmed = newStart - origStart;
      const newFileOff = Math.max(0, clip.fileOffset + trimmed);
      const newVisibleDur = Math.max(0.1, (clip.regionEnd - clip.regionStart) - trimmed);
      accepted = onTrim(clip.id, newStart, newVisibleDur, newFileOff);
    } else if (mode === 'trim-right') {
      const newVisibleDur = Math.max(0.1, (clip.regionEnd - clip.regionStart) + deltaSec);
      accepted = onTrim(clip.id, origStart, newVisibleDur, clip.fileOffset);
    }
    // If rejected (overlap), snap back
    if (!accepted) {
      setLiveLeft(null);
      setLiveWidth(null);
      setLiveFileOffset(null);
    }
  }

  function handlePointerLeave() {
    if (!dragRef.current) setDragCursor(null);
  }

  const cursor = dragCursor ?? 'grab';

  return (
    <div
      className="absolute rounded overflow-hidden"
      style={{
        left: leftPx,
        width: widthPx,
        top: CLIP_INSET,
        height: clipH,
        background: color.bg,
        border: `1px solid ${(isHovered || externalHighlight) ? color.border : color.border + "88"}`,
        boxShadow: (isHovered || externalHighlight) ? `0 0 12px ${color.border}44` : "none",
        transition: dragRef.current ? 'none' : 'border-color 0.15s, box-shadow 0.15s',
        cursor: locked ? 'default' : cursor,
        zIndex: dragRef.current ? 10 : 5,
        userSelect: 'none',
      }}
      onMouseEnter={locked ? undefined : (e) => { e.stopPropagation(); setIsHovered(true); }}
      onMouseLeave={locked ? undefined : () => { setIsHovered(false); handlePointerLeave(); }}
      onPointerDown={locked ? undefined : handlePointerDown}
      onPointerMove={locked ? undefined : handlePointerMove}
      onPointerUp={locked ? undefined : handlePointerUp}
      onClick={(e) => e.stopPropagation()}>

      {/* Label overlay — floats over waveform, doesn't affect layout */}
      <div className="absolute top-0 left-0 right-0 flex items-center gap-1 px-1.5 pointer-events-none"
        style={{ height: 18, zIndex: 2, background: `linear-gradient(to bottom, ${color.bg}ee, transparent)` }}>
        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color.border }} />
        <span className="text-xs truncate flex-1" style={{ color: color.border, fontFamily: "var(--font-mono, monospace)", fontSize: "0.6rem" }}>
          {clip.durationSeconds ? formatDuration(Math.round(clip.durationSeconds)) : "…"}
        </span>
      </div>

      {/* Delete button overlay — top-right corner (hidden when locked) */}
      {!locked && isHovered && !confirmDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
          className="absolute top-1 right-1 rounded opacity-70 hover:opacity-100"
          style={{ color: "rgba(255,255,255,0.8)", zIndex: 3, lineHeight: 1 }}>
          <X style={{ width: 10, height: 10 }} />
        </button>
      )}
      {confirmDelete && (
        <div className="absolute top-1 right-1 flex items-center gap-1" style={{ zIndex: 3 }}>
          <button onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="px-1 rounded text-white" style={{ background: "var(--red)", fontSize: "0.55rem" }}>✕</button>
          <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(false); }}
            className="px-1 rounded" style={{ color: "var(--text-tertiary)", fontSize: "0.55rem", background: "rgba(0,0,0,0.5)" }}>cancel</button>
        </div>
      )}

      {/* Waveform — fixed scale, offset by fileOffset so trimming reveals the right portion */}
      <div className="absolute inset-0" style={{ overflow: 'hidden' }}>
        {/* Loading skeleton */}
        {!ready && !loadError && audioUrl && (
          <div className="h-full flex items-center gap-px px-1"
            style={{ width: fullFileWidthPx, marginLeft: waveOffsetPx }}>
            {Array.from({ length: Math.max(4, Math.floor(fullFileWidthPx / 6)) }).map((_, i) => (
              <div key={i} className="flex-shrink-0 rounded-sm animate-pulse"
                style={{
                  width: 3,
                  height: `${20 + [40,60,30,70,50,35,65,45,55,25][i % 10]}%`,
                  background: color.wave,
                  opacity: 0.25,
                  animationDelay: `${(i % 5) * 70}ms`,
                }} />
            ))}
          </div>
        )}
        {loadError && (
          <div className="h-full flex items-center justify-center">
            <span style={{ color: "rgba(255,255,255,0.25)", fontSize: "0.6rem" }}>no preview</span>
          </div>
        )}
        {/* WaveSurfer container — full file width, shifted left by fileOffset */}
        <div ref={callbackRef}
          style={{
            width: fullFileWidthPx,
            marginLeft: waveOffsetPx,
            opacity: ready ? 1 : 0,
            transition: 'opacity 0.2s',
          }} />
      </div>
    </div>
  );
}
