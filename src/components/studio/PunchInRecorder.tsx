"use client";
import { useState, useRef, useCallback } from "react";
import { Mic, Square, Loader2, Scissors, X, Check } from "lucide-react";
import VUMeter from "@/components/studio/VUMeter";
import RecordingTimeline from "@/components/studio/RecordingTimeline";
import { formatDuration } from "@/lib/utils";

interface Region {
  start: number;
  end: number;
}

interface Take {
  id: string;
  label: string;
  audioFileUrl: string | null;
  durationSeconds: number | null;
  regionStart: number | null;
  regionEnd: number | null;
  recordedAt: string;
  isActive: boolean;
}

interface PunchInRecorderProps {
  chapterId: string;
  totalDuration: number; // seconds of the master recording
  existingTakes: Take[];
  onTakeAdded: (take: Take) => void;
}

type RecorderState = "idle" | "recording" | "uploading";

export default function PunchInRecorder({
  chapterId,
  totalDuration,
  existingTakes,
  onTakeAdded,
}: PunchInRecorderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [region, setRegion] = useState<Region | null>(null);
  const [recState, setRecState] = useState<RecorderState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Region drag state on the mini-ruler
  const rulerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<number | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);

  // ── Region selection on ruler ────────────────────────────────────────────
  const getRulerFrac = (clientX: number): number => {
    const ruler = rulerRef.current;
    if (!ruler) return 0;
    const rect = ruler.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  };

  const handleRulerMouseDown = (e: React.MouseEvent) => {
    if (recState !== "idle") return;
    const frac = getRulerFrac(e.clientX);
    const t = frac * totalDuration;
    dragStartRef.current = t;
    setRegion({ start: t, end: t });
  };

  const handleRulerMouseMove = (e: React.MouseEvent) => {
    if (dragStartRef.current == null || recState !== "idle") return;
    const frac = getRulerFrac(e.clientX);
    const t = frac * totalDuration;
    const start = Math.min(dragStartRef.current, t);
    const end = Math.max(dragStartRef.current, t);
    setRegion({ start, end });
  };

  const handleRulerMouseUp = () => {
    dragStartRef.current = null;
    // Snap: if region is too small (<0.5s), clear it
    if (region && region.end - region.start < 0.5) setRegion(null);
  };

  // ── Recording ─────────────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    setError(null);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, sampleRate: 48000 },
      });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const recorder = new MediaRecorder(mediaStream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };

      recorder.onstop = async () => {
        mediaStream.getTracks().forEach((t) => t.stop());
        setStream(null);
        const duration = (Date.now() - startTimeRef.current) / 1000;
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setRecState("uploading");
        try {
          const fd = new FormData();
          const ext = mimeType.includes("ogg") ? "ogg" : "webm";
          fd.append("audio", new File([blob], `take.${ext}`, { type: mimeType }));
          fd.append("duration", String(duration));
          if (region) {
            fd.append("regionStart", String(region.start));
            fd.append("regionEnd", String(region.end));
          }
          const res = await fetch(`/api/chapters/${chapterId}/takes`, { method: "POST", body: fd });
          if (!res.ok) throw new Error((await res.json()).error ?? "Upload failed");
          const { take } = await res.json();
          onTakeAdded(take);
          setRegion(null);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Upload failed");
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
      setRecState("recording");
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 500);
    } catch {
      setError("Microphone access denied.");
    }
  }, [chapterId, region, onTakeAdded]);

  const stopRecording = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    mediaRef.current?.stop();
  }, []);

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
        style={{
          background: "var(--bg-raised)",
          border: "1px solid var(--border-default)",
          color: "var(--text-secondary)",
          fontFamily: "var(--font-sans)",
        }}>
        <Scissors className="w-3.5 h-3.5" />
        Punch-In / Fix a Mistake
      </button>
    );
  }

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: "#0d0d10", border: "1px solid var(--border-subtle)" }}>

      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: "var(--border-subtle)" }}>
        <div className="flex items-center gap-2">
          <Scissors className="w-4 h-4" style={{ color: "var(--accent)" }} />
          <span className="text-sm font-medium" style={{ color: "var(--text-primary)", fontFamily: "var(--font-sans)" }}>
            Punch-In Recording
          </span>
        </div>
        <button onClick={() => { setIsOpen(false); setRegion(null); }}
          className="p-1 rounded" style={{ color: "var(--text-tertiary)" }}>
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 flex flex-col gap-4">

        {/* Instructions */}
        <p className="text-xs" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-sans)" }}>
          {region
            ? `Region selected: ${formatDuration(Math.floor(region.start))} – ${formatDuration(Math.floor(region.end))} (${(region.end - region.start).toFixed(1)}s)`
            : "Drag on the timeline below to select a region to re-record, or record without a region to replace everything."}
        </p>

        {/* Mini ruler for region selection */}
        {totalDuration > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wider" style={{ color: "var(--text-tertiary)", fontSize: "0.6rem", fontFamily: "var(--font-sans)" }}>
              Select region (drag to mark)
            </span>
            <div
              ref={rulerRef}
              className="relative h-8 rounded-lg cursor-crosshair select-none"
              style={{ background: "#0a0a0c", border: "1px solid rgba(255,255,255,0.06)" }}
              onMouseDown={handleRulerMouseDown}
              onMouseMove={handleRulerMouseMove}
              onMouseUp={handleRulerMouseUp}
              onMouseLeave={handleRulerMouseUp}>

              {/* Existing takes markers */}
              {existingTakes.filter(t => t.regionStart != null).map((t) => (
                <div
                  key={t.id}
                  className="absolute top-0 bottom-0 opacity-30"
                  style={{
                    left: `${(t.regionStart! / totalDuration) * 100}%`,
                    width: `${((t.regionEnd! - t.regionStart!) / totalDuration) * 100}%`,
                    background: "var(--accent)",
                  }}
                />
              ))}

              {/* Selected region highlight */}
              {region && (
                <div
                  className="absolute top-0 bottom-0"
                  style={{
                    left: `${(region.start / totalDuration) * 100}%`,
                    width: `${((region.end - region.start) / totalDuration) * 100}%`,
                    background: "rgba(239,68,68,0.35)",
                    border: "1px solid rgba(239,68,68,0.6)",
                    borderRadius: "2px",
                  }}
                />
              )}

              {/* Tick labels */}
              {[0, 0.25, 0.5, 0.75, 1].map((frac) => (
                <span
                  key={frac}
                  className="absolute font-mono pointer-events-none"
                  style={{
                    left: `${frac * 100}%`,
                    bottom: 2,
                    transform: frac === 1 ? "translateX(-100%)" : frac === 0 ? "none" : "translateX(-50%)",
                    color: "rgba(255,255,255,0.2)",
                    fontSize: "0.55rem",
                  }}>
                  {formatDuration(Math.floor(frac * totalDuration))}
                </span>
              ))}
            </div>

            {region && (
              <button
                onClick={() => setRegion(null)}
                className="self-end text-xs"
                style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-sans)" }}>
                Clear selection
              </button>
            )}
          </div>
        )}

        {/* Timeline + VU when recording */}
        {recState === "recording" && (
          <div className="flex flex-col gap-3">
            <RecordingTimeline elapsed={elapsed} isRecording />
            <VUMeter stream={stream} isRecording />
          </div>
        )}

        {/* Record button */}
        <div className="flex items-center gap-4">
          <div className="relative">
            {recState === "recording" && (
              <span className="absolute inset-0 rounded-full animate-ping"
                style={{ background: "rgba(239,68,68,0.3)" }} />
            )}
            <button
              onClick={recState === "recording" ? stopRecording : startRecording}
              disabled={recState === "uploading"}
              className="relative w-14 h-14 rounded-full flex items-center justify-center transition-all disabled:opacity-40"
              style={{
                background: recState === "recording" ? "linear-gradient(135deg,#dc2626,#991b1b)" : "var(--bg-raised)",
                border: recState === "recording" ? "2px solid rgba(239,68,68,0.6)" : "2px solid var(--border-default)",
                boxShadow: recState === "recording" ? "0 0 20px rgba(239,68,68,0.4)" : "0 2px 8px rgba(0,0,0,0.3)",
              }}>
              {recState === "uploading"
                ? <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--accent)" }} />
                : recState === "recording"
                ? <Square className="w-5 h-5 fill-white text-white" />
                : <Mic className="w-5 h-5" style={{ color: "var(--text-secondary)" }} />}
            </button>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium" style={{ color: "var(--text-primary)", fontFamily: "var(--font-sans)" }}>
              {recState === "uploading" ? "Saving take…"
                : recState === "recording" ? "Recording — click to stop"
                : region ? "Record replacement for selected region"
                : "Record new take (full replacement)"}
            </span>
            <span className="text-xs" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-sans)" }}>
              Takes are saved to Drive and assembled at export
            </span>
          </div>
        </div>

        {error && <p className="text-xs" style={{ color: "var(--red)" }}>{error}</p>}

        {/* Existing takes list */}
        {existingTakes.length > 0 && (
          <div className="flex flex-col gap-1 pt-1 border-t" style={{ borderColor: "var(--border-subtle)" }}>
            <span className="text-xs uppercase tracking-wider pt-2" style={{ color: "var(--text-tertiary)", fontSize: "0.6rem", fontFamily: "var(--font-sans)" }}>
              Saved takes
            </span>
            {existingTakes.map((t) => (
              <div key={t.id} className="flex items-center gap-3 py-1.5 px-2 rounded-lg"
                style={{ background: t.isActive ? "rgba(58,123,213,0.08)" : "transparent" }}>
                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ background: t.isActive ? "var(--accent)" : "rgba(255,255,255,0.15)" }} />
                <span className="text-xs flex-1" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-sans)" }}>
                  {t.label}
                </span>
                {t.durationSeconds && (
                  <span className="text-xs font-mono" style={{ color: "var(--text-tertiary)" }}>
                    {formatDuration(Math.floor(t.durationSeconds))}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
