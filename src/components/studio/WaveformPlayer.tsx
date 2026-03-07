"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { Play, Pause, RotateCcw, SkipBack, SkipForward, Mic, Square, Loader2, X, MapPin } from "lucide-react";
import { formatDuration } from "@/lib/utils";
import VUMeter from "@/components/studio/VUMeter";

interface Take {
  id: string;
  label: string;
  audioFileUrl: string | null;
  audioDriveId: string | null;
  durationSeconds: number | null;
  regionStart: number | null;
  regionEnd: number | null;
  recordedAt: string;
  isActive: boolean;
}

interface WaveformPlayerProps {
  audioUrl: string;
  fileName?: string;
  fileSizeBytes?: number;
  duration?: number | null;
  chapterId: string;
  initialTakes?: Take[];
}

const TAKE_COLORS = [
  { bg: "rgba(58,123,213,0.12)",  border: "rgba(58,123,213,0.35)",  waveColor: "rgba(58,123,213,0.6)",  progressColor: "#3a7bd5" },
  { bg: "rgba(48,209,88,0.10)",   border: "rgba(48,209,88,0.30)",   waveColor: "rgba(48,209,88,0.6)",   progressColor: "#30d158" },
  { bg: "rgba(255,149,0,0.10)",   border: "rgba(255,149,0,0.30)",   waveColor: "rgba(255,149,0,0.6)",   progressColor: "#ff9500" },
  { bg: "rgba(191,90,242,0.10)",  border: "rgba(191,90,242,0.30)",  waveColor: "rgba(191,90,242,0.6)",  progressColor: "#bf5af2" },
  { bg: "rgba(255,55,95,0.10)",   border: "rgba(255,55,95,0.30)",   waveColor: "rgba(255,55,95,0.6)",   progressColor: "#ff375f" },
  { bg: "rgba(100,210,255,0.10)", border: "rgba(100,210,255,0.30)", waveColor: "rgba(100,210,255,0.6)", progressColor: "#64d2ff" },
];

type RecorderState = "idle" | "recording" | "uploading";

export default function WaveformPlayer({
  audioUrl,
  fileName,
  fileSizeBytes,
  duration,
  chapterId,
  initialTakes = [],
}: WaveformPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(duration ?? 0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [zoom, setZoom] = useState(50);

  const [takes, setTakes] = useState<Take[]>(initialTakes);
  const [pinTime, setPinTime] = useState<number | null>(null);
  const [recState, setRecState] = useState<RecorderState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [recError, setRecError] = useState<string | null>(null);

  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  const pinTimeRef = useRef<number | null>(null);
  const totalDurationRef = useRef<number>(duration ?? 0);

  useEffect(() => { totalDurationRef.current = totalDuration; }, [totalDuration]);

  // ── Main WaveSurfer ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    let ws: any;
    let destroyed = false;

    (async () => {
      try {
        const WaveSurfer = (await import("wavesurfer.js")).default;
        if (destroyed) return;

        ws = WaveSurfer.create({
          container: containerRef.current!,
          waveColor: "rgba(255,255,255,0.18)",
          progressColor: "#3a7bd5",
          cursorColor: "rgba(255,255,255,0.7)",
          cursorWidth: 2,
          barWidth: 2,
          barGap: 1,
          barRadius: 2,
          height: 96,
          normalize: true,
          backend: "WebAudio",
          minPxPerSec: zoom,
          fillParent: true,
          interact: true,
        });

        wsRef.current = ws;
        ws.on("ready", () => {
          if (!destroyed) {
            setReady(true);
            const d = ws.getDuration();
            setTotalDuration(d);
            totalDurationRef.current = d;
          }
        });
        ws.on("audioprocess", () => { if (!destroyed) setCurrentTime(ws.getCurrentTime()); });
        ws.on("seek", () => { if (!destroyed) setCurrentTime(ws.getCurrentTime()); });
        ws.on("play", () => { if (!destroyed) setIsPlaying(true); });
        ws.on("pause", () => { if (!destroyed) setIsPlaying(false); });
        ws.on("finish", () => { if (!destroyed) setIsPlaying(false); });
        ws.on("error", () => { if (!destroyed) setError(true); });
        ws.on("interaction", (newTime: number) => {
          if (!destroyed && recState === "idle") {
            setPinTime(newTime);
            pinTimeRef.current = newTime;
          }
        });

        await ws.load(audioUrl);
      } catch { if (!destroyed) setError(true); }
    })();

    return () => { destroyed = true; ws?.destroy(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrl]);

  useEffect(() => {
    if (wsRef.current && ready) wsRef.current.zoom(zoom);
  }, [zoom, ready]);

  const skip = (secs: number) => {
    if (!wsRef.current || !ready) return;
    const t = Math.max(0, Math.min(wsRef.current.getCurrentTime() + secs, totalDuration));
    wsRef.current.seekTo(t / totalDuration);
  };

  // ── Recording ────────────────────────────────────────────────────────────
  const startRecording = useCallback(async (startFromTime?: number) => {
    setRecError(null);
    const pinStart = startFromTime ?? pinTimeRef.current;
    pinTimeRef.current = pinStart;
    if (startFromTime !== undefined) setPinTime(startFromTime);

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, sampleRate: 48000 },
      });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus" : "audio/webm";

      const recorder = new MediaRecorder(mediaStream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };

      recorder.onstop = async () => {
        mediaStream.getTracks().forEach((t) => t.stop());
        setStream(null);
        const recordedDuration = (Date.now() - startTimeRef.current) / 1000;
        const regionStart = pinTimeRef.current;
        const regionEnd = regionStart !== null ? regionStart + recordedDuration : null;
        const blob = new Blob(chunksRef.current, { type: mimeType });

        setRecState("uploading");
        try {
          const fd = new FormData();
          const ext = mimeType.includes("ogg") ? "ogg" : "webm";
          fd.append("audio", new File([blob], `take.${ext}`, { type: mimeType }));
          fd.append("duration", String(recordedDuration));
          if (regionStart !== null) fd.append("regionStart", String(regionStart));
          if (regionEnd !== null) fd.append("regionEnd", String(regionEnd));
          const res = await fetch(`/api/chapters/${chapterId}/takes`, { method: "POST", body: fd });
          if (!res.ok) throw new Error((await res.json()).error ?? "Upload failed");
          const { take } = await res.json();
          setTakes((prev) => [...prev, take]);
          setPinTime(null);
          pinTimeRef.current = null;
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
      setRecState("recording");
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 500);
    } catch {
      setRecError("Microphone access denied. Please allow microphone access and try again.");
    }
  }, [chapterId]);

  const stopRecording = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    mediaRef.current?.stop();
  }, []);

  const deleteTake = async (takeId: string) => {
    setTakes((prev) => prev.filter((t) => t.id !== takeId));
    fetch(`/api/chapters/${chapterId}/takes/${takeId}`, { method: "DELETE" }).catch(() => {});
  };

  const fileSizeMB = fileSizeBytes ? (fileSizeBytes / 1024 / 1024).toFixed(1) : null;
  const pinPct = pinTime !== null && totalDuration > 0
    ? `${(pinTime / totalDuration) * 100}%` : null;

  if (error) {
    return (
      <div className="flex items-center justify-center h-24 rounded-lg"
        style={{ background: "var(--bg-raised)", border: "1px solid var(--border-subtle)" }}>
        <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
          Waveform preview unavailable — audio is saved to Drive
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0 rounded-xl overflow-hidden"
      style={{ background: "#0d0d0f", border: "1px solid var(--border-subtle)" }}>

      {/* File info bar */}
      {(fileName || fileSizeMB) && (
        <div className="flex items-center gap-3 px-4 pt-3 pb-2 border-b"
          style={{ borderColor: "var(--border-subtle)" }}>
          <div className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ background: "var(--green)", boxShadow: "0 0 6px rgba(48,209,88,0.6)" }} />
          <span className="text-xs font-mono flex-1 truncate" style={{ color: "var(--text-secondary)" }}>
            {fileName ?? "recording"}
          </span>
          {fileSizeMB && (
            <span className="text-xs flex-shrink-0" style={{ color: "var(--text-tertiary)" }}>
              {fileSizeMB} MB
            </span>
          )}
        </div>
      )}

      {/* Timeline ruler */}
      {ready && totalDuration > 0 && (
        <TimelineRuler duration={totalDuration} currentTime={currentTime} pinTime={pinTime} />
      )}

      {/* Main waveform */}
      <div className="relative px-2 py-2"
        style={{ background: "linear-gradient(180deg, #0d0d0f 0%, #111116 100%)", cursor: ready ? "crosshair" : "default" }}>
        {!ready && !error && (
          <div className="h-24 flex items-center justify-center gap-px px-2">
            {Array.from({ length: 80 }).map((_, i) => (
              <div key={i} className="flex-1 rounded-sm animate-pulse"
                style={{
                  height: `${20 + Math.abs(Math.sin(i * 0.3)) * 60}%`,
                  background: "rgba(255,255,255,0.06)",
                  animationDelay: `${(i % 8) * 60}ms`,
                }} />
            ))}
          </div>
        )}
        {ready && (
          <div className="absolute left-2 right-2 pointer-events-none"
            style={{ top: "calc(50% + 2px)", height: "1px", background: "rgba(255,255,255,0.04)" }} />
        )}
        <div ref={containerRef} style={{ display: ready ? "block" : "none" }} />

        {pinPct && ready && (
          <div className="absolute top-0 bottom-0 pointer-events-none"
            style={{ left: `calc(${pinPct} + 8px)`, width: "2px", background: "rgba(255,149,0,0.8)", boxShadow: "0 0 8px rgba(255,149,0,0.5)" }}>
            <div className="absolute -top-1 left-1/2 -translate-x-1/2">
              <MapPin className="w-3.5 h-3.5" style={{ color: "#ff9500", filter: "drop-shadow(0 0 4px rgba(255,149,0,0.8))" }} />
            </div>
          </div>
        )}
      </div>

      {/* Take rows */}
      {takes.map((take, idx) => (
        <TakeRow
          key={take.id}
          take={take}
          color={TAKE_COLORS[idx % TAKE_COLORS.length]}
          takeNumber={idx + 1}
          totalDuration={totalDuration}
          onDelete={() => deleteTake(take.id)}
        />
      ))}

      {/* Pin callout */}
      {pinTime !== null && recState === "idle" && (
        <div className="flex items-center gap-3 px-4 py-3 border-t"
          style={{ borderColor: "rgba(255,149,0,0.2)", background: "rgba(255,149,0,0.06)" }}>
          <MapPin className="w-4 h-4 flex-shrink-0" style={{ color: "#ff9500" }} />
          <span className="text-sm flex-1" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-sans)" }}>
            Pinned at <strong style={{ color: "var(--text-primary)" }}>{formatDuration(Math.floor(pinTime))}</strong>
          </span>
          <button onClick={() => { setPinTime(null); pinTimeRef.current = null; }}
            className="p-1 rounded" style={{ color: "var(--text-tertiary)" }}>
            <X className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => startRecording()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
            style={{ background: "linear-gradient(135deg, #dc2626, #991b1b)", color: "white", boxShadow: "0 0 16px rgba(220,38,38,0.5)", fontFamily: "var(--font-sans)" }}>
            <Mic className="w-4 h-4" />
            Record Take Here
          </button>
        </div>
      )}

      {/* Continue recording bar */}
      {ready && pinTime === null && recState === "idle" && (
        <div className="flex items-center gap-3 px-4 py-3 border-t"
          style={{ borderColor: "var(--border-subtle)", background: "rgba(255,255,255,0.01)" }}>
          <div className="flex items-center gap-2 flex-1">
            <MapPin className="w-3 h-3" style={{ color: "var(--text-tertiary)", opacity: 0.5 }} />
            <span className="text-xs" style={{ color: "var(--text-tertiary)", opacity: 0.6, fontFamily: "var(--font-sans)" }}>
              Click the waveform to pin a spot and record a fix, or continue from the end
            </span>
          </div>
          <button
            onClick={() => startRecording(totalDurationRef.current)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold flex-shrink-0"
            style={{ background: "linear-gradient(135deg, #dc2626, #991b1b)", color: "white", boxShadow: "0 0 12px rgba(220,38,38,0.4)", fontFamily: "var(--font-sans)" }}>
            <Mic className="w-4 h-4" />
            Continue Recording
          </button>
        </div>
      )}

      {/* Recording indicator */}
      {recState === "recording" && (
        <div className="flex flex-col gap-3 px-4 py-4 border-t"
          style={{ borderColor: "rgba(220,38,38,0.25)", background: "rgba(220,38,38,0.06)" }}>
          <div className="flex items-center gap-3">
            <div className="relative flex-shrink-0">
              <span className="absolute inset-0 rounded-full animate-ping" style={{ background: "rgba(220,38,38,0.3)" }} />
              <div className="relative w-3 h-3 rounded-full" style={{ background: "#dc2626" }} />
            </div>
            <span className="text-sm font-medium flex-1" style={{ color: "var(--text-primary)", fontFamily: "var(--font-sans)" }}>
              Recording — {formatDuration(elapsed)}
              {pinTimeRef.current !== null && (
                <span className="ml-2 text-xs font-normal" style={{ color: "var(--text-tertiary)" }}>
                  from {formatDuration(Math.floor(pinTimeRef.current))}
                </span>
              )}
            </span>
            <button onClick={stopRecording}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
              style={{ background: "linear-gradient(135deg, #dc2626, #991b1b)", color: "white", boxShadow: "0 0 16px rgba(220,38,38,0.4)", fontFamily: "var(--font-sans)" }}>
              <Square className="w-3.5 h-3.5 fill-white" />
              Stop
            </button>
          </div>
          <VUMeter stream={stream} isRecording />
        </div>
      )}

      {/* Uploading indicator */}
      {recState === "uploading" && (
        <div className="flex items-center gap-3 px-4 py-3 border-t"
          style={{ borderColor: "var(--border-subtle)", background: "rgba(58,123,213,0.06)" }}>
          <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" style={{ color: "var(--accent)" }} />
          <span className="text-sm" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-sans)" }}>Saving…</span>
        </div>
      )}

      {recError && (
        <div className="px-4 py-2 border-t" style={{ borderColor: "var(--border-subtle)" }}>
          <p className="text-xs" style={{ color: "var(--red)" }}>{recError}</p>
        </div>
      )}

      {/* Transport controls */}
      <div className="flex items-center gap-2 px-4 py-3 border-t"
        style={{ borderColor: "var(--border-subtle)", background: "#0a0a0c" }}>
        <div className="font-mono text-sm tabular-nums flex-shrink-0"
          style={{ color: "var(--text-primary)", minWidth: "90px" }}>
          {formatDuration(Math.floor(currentTime))}
          <span style={{ color: "var(--text-tertiary)" }}> / </span>
          <span style={{ color: "var(--text-tertiary)" }}>{formatDuration(Math.floor(totalDuration))}</span>
        </div>
        <div className="flex-1" />
        <button onClick={() => skip(-5)} disabled={!ready} className="p-1.5 rounded disabled:opacity-30" style={{ color: "var(--text-tertiary)" }} title="Back 5s">
          <SkipBack className="w-4 h-4" />
        </button>
        <button onClick={() => wsRef.current?.playPause()} disabled={!ready}
          className="w-10 h-10 rounded-full flex items-center justify-center transition-all disabled:opacity-30"
          style={{ background: "var(--accent)", boxShadow: ready ? "0 2px 12px rgba(58,123,213,0.5)" : "none" }}>
          {isPlaying ? <Pause className="w-4 h-4 text-white fill-white" /> : <Play className="w-4 h-4 text-white fill-white" style={{ marginLeft: "2px" }} />}
        </button>
        <button onClick={() => skip(5)} disabled={!ready} className="p-1.5 rounded disabled:opacity-30" style={{ color: "var(--text-tertiary)" }} title="Forward 5s">
          <SkipForward className="w-4 h-4" />
        </button>
        <button onClick={() => { wsRef.current?.seekTo(0); setCurrentTime(0); }} disabled={!ready}
          className="p-1.5 rounded disabled:opacity-30" style={{ color: "var(--text-tertiary)" }} title="Return to start">
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
        <div className="flex-1" />
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Zoom</span>
          <input type="range" min="20" max="300" value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-20" style={{ accentColor: "var(--accent)" }} />
        </div>
      </div>
    </div>
  );
}

// ── Take row ─────────────────────────────────────────────────────────────────
interface TakeRowProps {
  take: Take;
  color: typeof TAKE_COLORS[0];
  takeNumber: number;
  totalDuration: number;
  onDelete: () => void;
}

function TakeRow({ take, color, takeNumber, totalDuration, onDelete }: TakeRowProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const audioUrl = take.audioFileUrl ?? null;

  // If containerRef wasn't ready on first effect run, this state toggle re-triggers the effect
  const [containerReady, setContainerReady] = useState(false);
  const containerCallbackRef = useCallback((node: HTMLDivElement | null) => {
    (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    if (node) setContainerReady(true);
  }, []);

  useEffect(() => {
    if (!audioUrl || !containerRef.current) return;
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
          waveColor: color.waveColor,
          progressColor: color.progressColor,
          cursorColor: "rgba(255,255,255,0.5)",
          cursorWidth: 1,
          barWidth: 2,
          barGap: 1,
          barRadius: 2,
          height: 56,
          normalize: true,
          backend: "WebAudio",
          fillParent: true,
        });

        wsRef.current = ws;
        ws.on("ready", () => { if (active) setReady(true); });
        ws.on("play",  () => { if (active) setIsPlaying(true); });
        ws.on("pause", () => { if (active) setIsPlaying(false); });
        ws.on("finish",() => { if (active) setIsPlaying(false); });
        ws.on("error", (e: any) => { console.error('[TakeRow] WS error', e); if (active) setLoadError(true); });

        await ws.load(audioUrl);
      } catch (e) {
        console.error('[TakeRow] load failed', e);
        if (active) setLoadError(true);
      }
    })();

    return () => {
      active = false;
      ws?.destroy();
      wsRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrl, containerReady]);

  // Only apply offset alignment when the take is a mid-recording fix (regionStart < totalDuration).
  // "Continue Recording" takes have regionStart === totalDuration, so offsetPct would be 100%
  // which pushes the waveform completely off-screen. Show those full-width instead.
  const isContinuation = take.regionStart !== null && totalDuration > 0 && take.regionStart >= totalDuration;
  const offsetPct = (!isContinuation && take.regionStart !== null && totalDuration > 0)
    ? (take.regionStart / totalDuration) * 100 : 0;
  const widthPct = 100 - offsetPct;

  const regionLabel = take.regionStart !== null
    ? `${formatDuration(Math.floor(take.regionStart))} – ${formatDuration(Math.floor(take.regionStart + (take.durationSeconds ?? 0)))}`
    : null;

  return (
    <div className="border-t" style={{ borderColor: color.border, background: color.bg }}>
      <div className="flex items-center gap-3 px-4 pt-2 pb-1">
        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color.progressColor }} />
        <span className="text-xs font-semibold flex-1" style={{ color: color.progressColor, fontFamily: "var(--font-sans)" }}>
          Take {takeNumber}
          {regionLabel && <span className="ml-2 font-normal" style={{ color: "var(--text-tertiary)" }}>@ {regionLabel}</span>}
          {take.durationSeconds && (
            <span className="ml-2 font-mono font-normal" style={{ color: "var(--text-tertiary)" }}>
              ({formatDuration(Math.floor(take.durationSeconds))})
            </span>
          )}
        </span>
        <button onClick={() => wsRef.current?.playPause()} disabled={!ready}
          className="w-7 h-7 rounded-full flex items-center justify-center transition-all disabled:opacity-30 flex-shrink-0"
          style={{ background: color.progressColor, boxShadow: `0 2px 8px ${color.border}` }}>
          {isPlaying ? <Pause className="w-3 h-3 text-white fill-white" /> : <Play className="w-3 h-3 text-white fill-white" style={{ marginLeft: "1px" }} />}
        </button>
        {!confirmDelete ? (
          <button onClick={() => setConfirmDelete(true)}
            className="p-1 rounded flex-shrink-0" style={{ color: "var(--text-tertiary)" }}>
            <X className="w-3.5 h-3.5" />
          </button>
        ) : (
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-sans)" }}>Delete?</span>
            <button onClick={onDelete} className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: "var(--red)", color: "white" }}>Yes</button>
            <button onClick={() => setConfirmDelete(false)} className="px-2 py-0.5 rounded text-xs"
              style={{ color: "var(--text-tertiary)", border: "1px solid var(--border-default)" }}>No</button>
          </div>
        )}
      </div>

      {/* Waveform aligned to master timecode */}
      <div className="relative px-2 pb-2" style={{ height: "64px" }}>
        <div className="absolute top-0 bottom-0 left-2"
          style={{ width: `${offsetPct}%`, borderRight: offsetPct > 0 ? `1px dashed ${color.border}` : "none" }} />
        <div className="absolute top-0 bottom-0" style={{ left: `calc(8px + ${offsetPct}%)`, right: "8px" }}>
          {!ready && !loadError && audioUrl && (
            <div className="h-full flex items-center gap-px">
              {Array.from({ length: Math.max(10, Math.round(60 * widthPct / 100)) }).map((_, i) => (
                <div key={i} className="flex-1 rounded-sm animate-pulse"
                  style={{
                    height: `${20 + Math.abs(Math.sin(i * 0.4)) * 50}%`,
                    background: color.waveColor,
                    opacity: 0.3,
                    animationDelay: `${(i % 6) * 80}ms`,
                  }} />
              ))}
            </div>
          )}
          {loadError && (
            <div className="h-full flex items-center justify-center">
              <span className="text-xs" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-sans)" }}>
                Audio saved to Drive — waveform unavailable locally
              </span>
            </div>
          )}
          {/* Always in DOM and visible — skeleton overlays it until ready */}
          <div ref={containerCallbackRef} className="absolute inset-0" style={{ opacity: ready ? 1 : 0, transition: "opacity 0.2s" }} />
          {!audioUrl && (
            <div className="h-full flex items-center justify-center">
              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Processing…</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TimelineRuler({ duration, currentTime, pinTime }: { duration: number; currentTime: number; pinTime: number | null }) {
  const interval = duration < 60 ? 5 : duration < 300 ? 15 : duration < 900 ? 30 : 60;
  const ticks: number[] = [];
  for (let t = 0; t <= duration; t += interval) ticks.push(t);

  return (
    <div className="relative h-6 px-2 border-b select-none"
      style={{ borderColor: "var(--border-subtle)", background: "#0a0a0c" }}>
      {ticks.map((t) => (
        <div key={t} className="absolute flex flex-col items-center"
          style={{ left: `${(t / duration) * 100}%`, transform: "translateX(-50%)" }}>
          <span className="font-mono" style={{ color: "var(--text-tertiary)", fontSize: "0.6rem" }}>{formatDuration(t)}</span>
          <div className="w-px h-1.5" style={{ background: "var(--border-default)" }} />
        </div>
      ))}
      <div className="absolute top-0 bottom-0 w-px"
        style={{ left: `${(currentTime / duration) * 100}%`, background: "var(--accent)", opacity: 0.8 }} />
      {pinTime !== null && (
        <div className="absolute top-0 bottom-0 w-0.5"
          style={{ left: `${(pinTime / duration) * 100}%`, background: "#ff9500", opacity: 0.9 }} />
      )}
    </div>
  );
}
