"use client";
import { useEffect, useRef, useState } from "react";
import { Play, Pause, RotateCcw, SkipBack, SkipForward } from "lucide-react";
import { formatDuration } from "@/lib/utils";

interface WaveformPlayerProps {
  audioUrl: string;
  fileName?: string;
  fileSizeBytes?: number;
  duration?: number | null;
}

export default function WaveformPlayer({ audioUrl, fileName, fileSizeBytes, duration }: WaveformPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(duration ?? 0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [zoom, setZoom] = useState(50);

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
        });

        wsRef.current = ws;
        ws.on("ready", () => { if (!destroyed) { setReady(true); setTotalDuration(ws.getDuration()); } });
        ws.on("audioprocess", () => { if (!destroyed) setCurrentTime(ws.getCurrentTime()); });
        ws.on("seek", () => { if (!destroyed) setCurrentTime(ws.getCurrentTime()); });
        ws.on("play", () => { if (!destroyed) setIsPlaying(true); });
        ws.on("pause", () => { if (!destroyed) setIsPlaying(false); });
        ws.on("finish", () => { if (!destroyed) setIsPlaying(false); });
        ws.on("error", () => { if (!destroyed) setError(true); });

        await ws.load(audioUrl);
      } catch { if (!destroyed) setError(true); }
    })();

    return () => { destroyed = true; ws?.destroy(); };
  }, [audioUrl]);

  // Apply zoom changes
  useEffect(() => {
    if (wsRef.current && ready) wsRef.current.zoom(zoom);
  }, [zoom, ready]);

  const skip = (secs: number) => {
    if (!wsRef.current || !ready) return;
    const t = Math.max(0, Math.min(wsRef.current.getCurrentTime() + secs, totalDuration));
    wsRef.current.seekTo(t / totalDuration);
  };

  const fileSizeMB = fileSizeBytes ? (fileSizeBytes / 1024 / 1024).toFixed(1) : null;

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
    <div className="rounded-xl overflow-hidden"
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
        <TimelineRuler duration={totalDuration} currentTime={currentTime} />
      )}

      {/* Waveform */}
      <div className="relative px-2 py-2"
        style={{ background: "linear-gradient(180deg, #0d0d0f 0%, #111116 100%)" }}>

        {/* Loading skeleton */}
        {!ready && (
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

        {/* Center line */}
        {ready && (
          <div className="absolute left-2 right-2 pointer-events-none"
            style={{ top: "calc(50% + 2px)", height: "1px", background: "rgba(255,255,255,0.04)" }} />
        )}

        <div ref={containerRef} style={{ display: ready ? "block" : "none" }} />
      </div>

      {/* Transport controls */}
      <div className="flex items-center gap-2 px-4 py-3 border-t"
        style={{ borderColor: "var(--border-subtle)", background: "#0a0a0c" }}>

        {/* Time display */}
        <div className="font-mono text-sm tabular-nums flex-shrink-0"
          style={{ color: "var(--text-primary)", minWidth: "90px" }}>
          {formatDuration(Math.floor(currentTime))}
          <span style={{ color: "var(--text-tertiary)" }}> / </span>
          <span style={{ color: "var(--text-tertiary)" }}>{formatDuration(Math.floor(totalDuration))}</span>
        </div>

        <div className="flex-1" />

        {/* Skip back 5s */}
        <button onClick={() => skip(-5)} disabled={!ready}
          className="p-1.5 rounded transition-colors disabled:opacity-30"
          style={{ color: "var(--text-tertiary)" }} title="Back 5s">
          <SkipBack className="w-4 h-4" />
        </button>

        {/* Play/Pause */}
        <button
          onClick={() => wsRef.current?.playPause()}
          disabled={!ready}
          className="w-10 h-10 rounded-full flex items-center justify-center transition-all disabled:opacity-30"
          style={{ background: "var(--accent)", boxShadow: ready ? "0 2px 12px rgba(58,123,213,0.5)" : "none" }}>
          {isPlaying
            ? <Pause className="w-4 h-4 text-white fill-white" />
            : <Play className="w-4 h-4 text-white fill-white" style={{ marginLeft: "2px" }} />}
        </button>

        {/* Skip forward 5s */}
        <button onClick={() => skip(5)} disabled={!ready}
          className="p-1.5 rounded transition-colors disabled:opacity-30"
          style={{ color: "var(--text-tertiary)" }} title="Forward 5s">
          <SkipForward className="w-4 h-4" />
        </button>

        {/* Back to start */}
        <button onClick={() => { wsRef.current?.seekTo(0); setCurrentTime(0); }}
          disabled={!ready}
          className="p-1.5 rounded transition-colors disabled:opacity-30"
          style={{ color: "var(--text-tertiary)" }} title="Return to start">
          <RotateCcw className="w-3.5 h-3.5" />
        </button>

        <div className="flex-1" />

        {/* Zoom slider */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Zoom</span>
          <input type="range" min="20" max="300" value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-20 accent-blue-500"
            style={{ accentColor: "var(--accent)" }} />
        </div>
      </div>
    </div>
  );
}

function TimelineRuler({ duration, currentTime }: { duration: number; currentTime: number }) {
  // Generate tick marks at sensible intervals
  const interval = duration < 60 ? 5 : duration < 300 ? 15 : duration < 900 ? 30 : 60;
  const ticks: number[] = [];
  for (let t = 0; t <= duration; t += interval) ticks.push(t);

  return (
    <div className="relative h-6 px-2 border-b select-none"
      style={{ borderColor: "var(--border-subtle)", background: "#0a0a0c" }}>
      {ticks.map((t) => (
        <div key={t} className="absolute flex flex-col items-center"
          style={{ left: `${(t / duration) * 100}%`, transform: "translateX(-50%)" }}>
          <span className="text-xs font-mono" style={{ color: "var(--text-tertiary)", fontSize: "0.6rem" }}>
            {formatDuration(t)}
          </span>
          <div className="w-px h-1.5" style={{ background: "var(--border-default)" }} />
        </div>
      ))}
      {/* Playhead indicator on ruler */}
      <div className="absolute top-0 bottom-0 w-px"
        style={{ left: `${(currentTime / duration) * 100}%`, background: "var(--accent)", opacity: 0.8 }} />
    </div>
  );
}
