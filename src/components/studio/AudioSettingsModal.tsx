"use client";
import { useEffect, useRef, useState } from "react";
import { X, Mic, SlidersHorizontal } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// AudioSettingsModal
// A persistent modal accessible from the Navbar that lets the user adjust
// microphone gain (and potentially other audio settings in the future).
//
// Gain changes are:
//   1. Written to localStorage so they survive page reloads
//   2. Dispatched as a "heirloom:mic-gain" CustomEvent so any open
//      ChapterTimeline instances update their GainNode immediately
// ─────────────────────────────────────────────────────────────────────────────

const GAIN_MIN = 0.5;
const GAIN_MAX = 3.0;
const GAIN_STEP = 0.05;
const GAIN_DEFAULT = 1.0;

// VU meter constants
const METER_BARS = 36;
const METER_CLIP_FRAC = 0.88;
const METER_WARN_FRAC = 0.70;

interface AudioSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export default function AudioSettingsModal({ open, onClose }: AudioSettingsModalProps) {
  const [micGain, setMicGain] = useState<number>(() => {
    if (typeof window === "undefined") return GAIN_DEFAULT;
    return parseFloat(localStorage.getItem("heirloom-mic-gain") ?? String(GAIN_DEFAULT));
  });

  // Live mic test state
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const peakRef = useRef(0);
  const peakHoldRef = useRef(0);
  const clipRef = useRef(false);
  const clipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Stop test mic when modal closes
  useEffect(() => {
    if (!open) stopTest();
  }, [open]);

  // Update gain node live when slider moves
  useEffect(() => {
    if (gainNodeRef.current) gainNodeRef.current.gain.value = micGain;
  }, [micGain]);

  function handleGainChange(val: number) {
    setMicGain(val);
    localStorage.setItem("heirloom-mic-gain", String(val));
    // Notify any open ChapterTimeline instances
    window.dispatchEvent(new CustomEvent("heirloom:mic-gain", { detail: val }));
  }

  async function startTest() {
    setTestError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, sampleRate: 48000 },
      });
      streamRef.current = stream;
      const ctx = new AudioContext({ sampleRate: 48000 });
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const gainNode = ctx.createGain();
      gainNode.gain.value = micGain;
      gainNodeRef.current = gainNode;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.5;
      analyserRef.current = analyser;
      source.connect(gainNode);
      gainNode.connect(analyser);
      // Don't connect to destination — we only want to meter, not play back
      setTesting(true);
      startMeterLoop(analyser);
    } catch {
      setTestError("Microphone access denied.");
    }
  }

  function stopTest() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    analyserRef.current = null;
    gainNodeRef.current = null;
    peakRef.current = 0;
    peakHoldRef.current = 0;
    clipRef.current = false;
    if (clipTimeoutRef.current) clearTimeout(clipTimeoutRef.current);
    setTesting(false);
    // Draw empty meter
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx2d = canvas.getContext("2d");
      if (ctx2d) drawMeter(ctx2d, canvas.width, canvas.height, 0, 0, false);
    }
  }

  function startMeterLoop(analyser: AnalyserNode) {
    const data = new Float32Array(analyser.fftSize);
    const tick = () => {
      rafRef.current = requestAnimationFrame(tick);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx2d = canvas.getContext("2d");
      if (!ctx2d) return;

      analyser.getFloatTimeDomainData(data);

      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
      const rms = Math.sqrt(sum / data.length);

      let truePeak = 0;
      for (let i = 0; i < data.length; i++) truePeak = Math.max(truePeak, Math.abs(data[i]));

      if (truePeak >= 0.99) {
        clipRef.current = true;
        if (clipTimeoutRef.current) clearTimeout(clipTimeoutRef.current);
        clipTimeoutRef.current = setTimeout(() => { clipRef.current = false; }, 1500);
      }

      if (rms > peakRef.current) {
        peakRef.current = rms;
        peakHoldRef.current = 45;
      } else {
        peakHoldRef.current > 0
          ? peakHoldRef.current--
          : (peakRef.current = Math.max(0, peakRef.current - 0.005));
      }

      drawMeter(ctx2d, canvas.width, canvas.height, rms, peakRef.current, clipRef.current);
    };
    tick();
  }

  const gainLabel = () => {
    if (micGain === 1.0) return "1×";
    if (micGain > 1.0) return `+${Math.round((micGain - 1) * 100)}%`;
    return `${micGain.toFixed(2)}×`;
  };

  const gainColor = micGain > 2.0 ? "#ff9500" : micGain > 1.5 ? "#ffd60a" : "var(--accent)";
  const gainTextColor = micGain > 2.0 ? "#ff9500" : micGain > 1.5 ? "#ffd60a" : "var(--text-secondary)";

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50"
        style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full"
        style={{ maxWidth: 420 }}>
        <div
          className="mx-4 rounded-2xl overflow-hidden"
          style={{
            background: "#111113",
            border: "1px solid rgba(255,255,255,0.1)",
            boxShadow: "0 24px 80px rgba(0,0,0,0.7)",
          }}>

          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-4"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: "rgba(58,123,213,0.15)", border: "1px solid rgba(58,123,213,0.3)" }}>
                <SlidersHorizontal className="w-3.5 h-3.5" style={{ color: "var(--accent)" }} />
              </div>
              <div>
                <h2 className="text-sm font-semibold leading-none" style={{ color: "var(--text-primary)", fontFamily: "var(--font-sans)" }}>
                  Audio Settings
                </h2>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-sans)" }}>
                  Microphone &amp; recording preferences
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: "var(--text-tertiary)" }}>
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="px-5 py-5 flex flex-col gap-6">

            {/* ── Mic Gain ─────────────────────────────────────────────── */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Mic className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--text-tertiary)" }} />
                  <span className="text-xs font-medium" style={{ color: "var(--text-primary)", fontFamily: "var(--font-sans)" }}>
                    Microphone Gain
                  </span>
                </div>
                <span className="text-xs font-mono tabular-nums"
                  style={{ color: gainTextColor, fontFamily: "var(--font-mono)", minWidth: 48, textAlign: "right" }}>
                  {gainLabel()}
                </span>
              </div>

              {/* Slider */}
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono" style={{ color: "var(--text-tertiary)", fontSize: "0.6rem", minWidth: 20 }}>
                  {GAIN_MIN}×
                </span>
                <input
                  type="range"
                  min={GAIN_MIN}
                  max={GAIN_MAX}
                  step={GAIN_STEP}
                  value={micGain}
                  onChange={e => handleGainChange(parseFloat(e.target.value))}
                  className="flex-1"
                  style={{ accentColor: gainColor }}
                />
                <span className="text-xs font-mono" style={{ color: "var(--text-tertiary)", fontSize: "0.6rem", minWidth: 20 }}>
                  {GAIN_MAX}×
                </span>
              </div>

              {/* Preset buttons */}
              <div className="flex items-center gap-2">
                {[0.75, 1.0, 1.5, 2.0, 2.5].map(v => (
                  <button
                    key={v}
                    onClick={() => handleGainChange(v)}
                    className="flex-1 py-1.5 rounded text-xs font-mono transition-all"
                    style={{
                    fontSize: "0.8rem",
                      background: Math.abs(micGain - v) < 0.01 ? "rgba(58,123,213,0.25)" : "rgba(255,255,255,0.05)",
                      color: Math.abs(micGain - v) < 0.01 ? "var(--accent)" : "var(--text-tertiary)",
                      border: Math.abs(micGain - v) < 0.01 ? "1px solid rgba(58,123,213,0.4)" : "1px solid transparent",
                      fontFamily: "var(--font-mono)",
                    }}>
                    {`${v}×`}
                  </button>
                ))}
              </div>

              {micGain > 2.0 && (
                <p className="text-xs" style={{ color: "#ff9500", fontFamily: "var(--font-sans)", fontSize: "0.65rem" }}>
                  ⚠ High gain — watch the meter for clipping
                </p>
              )}
            </div>

            {/* ── Live Mic Test ─────────────────────────────────────────── */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium" style={{ color: "var(--text-primary)", fontFamily: "var(--font-sans)" }}>
                  Level Monitor
                </span>
                <button
                  onClick={testing ? stopTest : startTest}
                  className="text-xs px-2.5 py-1 rounded-lg transition-all font-medium"
                  style={{
                    background: testing ? "rgba(220,38,38,0.15)" : "rgba(255,255,255,0.07)",
                    color: testing ? "#ff375f" : "var(--text-secondary)",
                    border: testing ? "1px solid rgba(220,38,38,0.3)" : "1px solid rgba(255,255,255,0.08)",
                    fontFamily: "var(--font-sans)",
                    fontSize: "0.7rem",
                  }}>
                  {testing ? "Stop" : "Test Mic"}
                </button>
              </div>

              {/* VU Meter canvas */}
              <div className="rounded-lg overflow-hidden p-2"
                style={{ background: "#0a0a0c", border: "1px solid rgba(255,255,255,0.06)" }}>
                <canvas
                  ref={canvasRef}
                  width={480}
                  height={22}
                  className="w-full block rounded"
                  style={{ height: 22 }}
                />
                <div className="flex items-center justify-between mt-1.5 px-0.5">
                  <div className="flex items-center gap-3">
                    <span className="text-xs" style={{ color: "rgba(40,180,80,0.7)", fontSize: "0.55rem", fontFamily: "var(--font-mono)" }}>GOOD</span>
                    <span className="text-xs" style={{ color: "rgba(255,214,10,0.7)", fontSize: "0.55rem", fontFamily: "var(--font-mono)" }}>LOUD</span>
                    <span className="text-xs" style={{ color: "rgba(255,59,48,0.7)", fontSize: "0.55rem", fontFamily: "var(--font-mono)" }}>CLIP</span>
                  </div>
                  <span className="text-xs font-mono uppercase"
                    style={{ fontSize: "0.55rem", color: testing ? "#30d158" : "var(--text-tertiary)", fontFamily: "var(--font-mono)", letterSpacing: "0.05em" }}>
                    {testing ? "● LIVE" : "——"}
                  </span>
                </div>
              </div>

              {testError && (
                <p className="text-xs" style={{ color: "var(--red)", fontFamily: "var(--font-sans)" }}>{testError}</p>
              )}
              {!testing && (
                <p className="text-xs" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-sans)", fontSize: "0.65rem" }}>
                  Test your mic level before recording. Gain changes apply immediately to any active recording session.
                </p>
              )}
            </div>

          </div>

          {/* Footer */}
          <div className="px-5 pb-5">
            <button
              onClick={onClose}
              className="w-full py-2 rounded-xl text-sm font-medium transition-all"
              style={{
                background: "rgba(255,255,255,0.06)",
                color: "var(--text-secondary)",
                border: "1px solid rgba(255,255,255,0.08)",
                fontFamily: "var(--font-sans)",
              }}>
              Done
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Canvas VU meter draw function
// ─────────────────────────────────────────────────────────────────────────────

function drawMeter(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  rms: number, peak: number, clipping: boolean
) {
  ctx.clearRect(0, 0, w, h);
  const gap = 1.5;
  const barW = Math.floor((w - (METER_BARS - 1) * gap) / METER_BARS);
  const activeCount = Math.round(Math.min(rms * 10, 1) * METER_BARS);
  const peakBar = Math.min(Math.round(Math.min(peak * 10, 1) * (METER_BARS - 1)), METER_BARS - 1);

  for (let i = 0; i < METER_BARS; i++) {
    const x = i * (barW + gap);
    const frac = i / METER_BARS;
    const active = i < activeCount;
    const isPeak = i === peakBar && peak > 0.03;

    if (active || isPeak) {
      if (frac >= METER_CLIP_FRAC) {
        ctx.fillStyle = clipping ? "#ff3b30" : "rgba(255,59,48,0.9)";
      } else if (frac >= METER_WARN_FRAC) {
        ctx.fillStyle = "#ffd60a";
      } else {
        const g = Math.round(140 + frac * 80);
        ctx.fillStyle = `rgb(40,${g},80)`;
      }
    } else {
      ctx.fillStyle = "rgba(255,255,255,0.05)";
    }
    ctx.beginPath();
    ctx.roundRect(x, 0, barW, h, 2);
    ctx.fill();
  }

  if (clipping) {
    ctx.fillStyle = "#ff3b30";
    ctx.beginPath();
    ctx.arc(w - 5, h / 2, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}
