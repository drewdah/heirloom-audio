"use client";
import { useEffect, useRef } from "react";

interface VUMeterProps {
  stream: MediaStream | null;
  isRecording: boolean;
}

const BAR_COUNT = 24;
const CLIP_THRESHOLD = 0.92;
const WARN_THRESHOLD = 0.75;

function drawMeter(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  rms: number,
  peak: number,
  clipping: boolean
) {
  ctx.clearRect(0, 0, w, h);

  const barW = Math.floor((w - (BAR_COUNT - 1) * 2) / BAR_COUNT);
  const toLevel = (v: number) => v > 0 ? Math.max(0, Math.min(1, (20 * Math.log10(v) + 60) / 60)) : 0;
  const activeCount = Math.round(toLevel(rms) * BAR_COUNT);
  const peakBar = Math.round(toLevel(peak) * (BAR_COUNT - 1));

  for (let i = 0; i < BAR_COUNT; i++) {
    const x = i * (barW + 2);
    const active = i < activeCount;
    const isPeak = i === peakBar && peak > 0.04;

    const frac = i / BAR_COUNT;
    let color: string;
    if (active || isPeak) {
      if (frac >= CLIP_THRESHOLD) {
        color = clipping ? "#ff3b30" : "rgba(255,59,48,0.9)";
      } else if (frac >= WARN_THRESHOLD) {
        color = "#ffd60a";
      } else {
        // Green gradient: dark green → bright green
        const g = Math.round(160 + frac * 60);
        color = `rgb(48,${g},88)`;
      }
      if (isPeak && !active) color = color.replace("0.9", "1");
    } else {
      if (frac >= CLIP_THRESHOLD) color = "rgba(255,59,48,0.15)";
      else if (frac >= WARN_THRESHOLD) color = "rgba(255,214,10,0.12)";
      else color = "rgba(255,255,255,0.07)";
    }

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, 0, barW, h, 2);
    ctx.fill();
  }

  if (clipping) {
    ctx.fillStyle = "#ff3b30";
    ctx.beginPath();
    ctx.arc(w - 4, 4, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

export default function VUMeter({ stream, isRecording }: VUMeterProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const peakRef = useRef<number>(0);
  const peakHoldRef = useRef<number>(0); // frame counter for peak hold
  const clipRef = useRef<boolean>(false);
  const clipTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!stream || !isRecording) {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      // Draw empty meter
      const emptyCanvas = canvasRef.current;
      if (emptyCanvas) {
        const emptyCtx = emptyCanvas.getContext("2d");
        if (emptyCtx) drawMeter(emptyCtx, emptyCanvas.width, emptyCanvas.height, 0, 0, false);
      }
      return;
    }

    const audioCtx = new AudioContext();
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.6;

    const source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);

    audioCtxRef.current = audioCtx;
    analyserRef.current = analyser;
    peakRef.current = 0;
    peakHoldRef.current = 0;
    clipRef.current = false;

    const dataArray = new Float32Array(analyser.fftSize);

    const draw = () => {
      animRef.current = requestAnimationFrame(draw);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      analyser.getFloatTimeDomainData(dataArray);

      // RMS level
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) sum += dataArray[i] * dataArray[i];
      const rms = Math.sqrt(sum / dataArray.length);
      // Peak
      let peak = 0;
      for (let i = 0; i < dataArray.length; i++) peak = Math.max(peak, Math.abs(dataArray[i]));

      // Clip detection
      if (peak >= 0.99) {
        clipRef.current = true;
        if (clipTimeoutRef.current) clearTimeout(clipTimeoutRef.current);
        clipTimeoutRef.current = setTimeout(() => { clipRef.current = false; }, 1500);
      }

      // Peak hold (decay after 40 frames)
      if (rms > peakRef.current) {
        peakRef.current = rms;
        peakHoldRef.current = 40;
      } else {
        if (peakHoldRef.current > 0) {
          peakHoldRef.current--;
        } else {
          peakRef.current = Math.max(0, peakRef.current - 0.008);
        }
      }

      drawMeter(ctx, canvas.width, canvas.height, rms, peakRef.current, clipRef.current);
    };

    draw();

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      if (clipTimeoutRef.current) clearTimeout(clipTimeoutRef.current);
      source.disconnect();
      audioCtx.close();
    };
  }, [stream, isRecording]);

  return (
    <div className="flex flex-col gap-1.5 w-full">
      <canvas
        ref={canvasRef}
        width={320}
        height={20}
        className="w-full rounded"
        style={{ height: "20px" }}
      />
      <div className="flex justify-end">
        <span
          className="text-xs font-mono uppercase tracking-wider"
          style={{
            fontSize: "0.6rem",
            color: clipRef.current ? "#ff3b30" : "var(--text-tertiary)",
            fontFamily: "var(--font-sans)",
          }}>
          {isRecording ? "LIVE" : "——"}
        </span>
      </div>
    </div>
  );
}
