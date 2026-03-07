"use client";
import { useEffect, useRef } from "react";
import { formatDuration } from "@/lib/utils";

interface RecordingTimelineProps {
  elapsed: number;       // seconds
  isRecording: boolean;
}

export default function RecordingTimeline({ elapsed, isRecording }: RecordingTimelineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Draw a scrolling timeline ruler
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (!isRecording && elapsed === 0) return;

    // Pixels per second — ruler scrolls so current time is at 75% across
    const pxPerSec = 80;
    const headX = w * 0.75;
    const startSec = elapsed - headX / pxPerSec;

    // Background
    ctx.fillStyle = "#0a0a0c";
    ctx.fillRect(0, 0, w, h);

    // Tick interval: every 5s below 5min, every 15s above
    const interval = elapsed < 300 ? 5 : 15;
    const firstTick = Math.ceil(startSec / interval) * interval;

    ctx.font = "10px monospace";
    ctx.textAlign = "center";

    for (let t = firstTick; t <= elapsed + w / pxPerSec; t += interval) {
      if (t < 0) continue;
      const x = headX + (t - elapsed) * pxPerSec;
      if (x < 0 || x > w) continue;

      const isMajor = t % (interval * 2) === 0;
      const tickH = isMajor ? 10 : 6;

      ctx.strokeStyle = isMajor ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.1)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.lineTo(x, h - tickH);
      ctx.stroke();

      if (isMajor) {
        ctx.fillStyle = "rgba(255,255,255,0.3)";
        ctx.fillText(formatDuration(t), x, h - 14);
      }
    }

    // Scrolled waveform ghost — just a subtle recorded region fill
    const recordedW = headX;
    const grad = ctx.createLinearGradient(0, 0, recordedW, 0);
    grad.addColorStop(0, "rgba(58,123,213,0)");
    grad.addColorStop(1, "rgba(58,123,213,0.08)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, recordedW, h);

    // Playhead line
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(headX, 0);
    ctx.lineTo(headX, h);
    ctx.stroke();

    // Playhead triangle cap
    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.moveTo(headX - 6, 0);
    ctx.lineTo(headX + 6, 0);
    ctx.lineTo(headX, 8);
    ctx.closePath();
    ctx.fill();

  }, [elapsed, isRecording]);

  // Format elapsed as HH:MM:SS for large display
  const hrs = Math.floor(elapsed / 3600);
  const mins = Math.floor((elapsed % 3600) / 60);
  const secs = elapsed % 60;
  const timeStr = hrs > 0
    ? `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
    : `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

  return (
    <div
      className="w-full rounded-xl overflow-hidden flex flex-col"
      style={{ background: "#0a0a0c", border: "1px solid rgba(255,255,255,0.06)" }}>

      {/* Large time display */}
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <div className="flex items-baseline gap-2">
          <span
            className="font-mono font-bold tabular-nums"
            style={{
              fontSize: "2.75rem",
              lineHeight: 1,
              color: isRecording ? "#ef4444" : "var(--text-tertiary)",
              letterSpacing: "-0.02em",
              fontFamily: "var(--font-mono, monospace)",
            }}>
            {timeStr}
          </span>
          {isRecording && (
            <span
              className="text-xs uppercase tracking-widest font-medium"
              style={{ color: "#ef4444", opacity: 0.8, fontFamily: "var(--font-sans)" }}>
              REC
            </span>
          )}
        </div>

        {/* Pulse dot */}
        {isRecording && (
          <div className="relative flex-shrink-0">
            <span
              className="absolute inset-0 rounded-full animate-ping"
              style={{ background: "rgba(239,68,68,0.4)" }}
            />
            <span
              className="relative block w-3 h-3 rounded-full"
              style={{ background: "#ef4444" }}
            />
          </div>
        )}
      </div>

      {/* Scrolling ruler canvas */}
      <canvas
        ref={canvasRef}
        width={640}
        height={40}
        className="w-full"
        style={{ height: "40px", display: "block" }}
      />
    </div>
  );
}
