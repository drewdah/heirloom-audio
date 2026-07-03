"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, X, Check, RefreshCw, AlertTriangle } from "lucide-react";

// A guided, plain-language mic setup for non-technical narrators:
// record a phrase → measure the level → set a fixed gain (AGC off, no ramp) →
// pick voice evenness / noise with a live preview → save.

const SAMPLE_SENTENCE = "The quick brown fox jumps over the lazy dog, and the story begins.";
const RECORD_SECONDS = 6;
const TARGET_RMS_DBFS = -20; // healthy speaking level
const MIN_GAIN = 0.5;
const MAX_GAIN = 8; // ~+18 dB — beyond this, guide the user to raise their system mic level

type Compression = "gentle" | "recommended" | "strong";
type Step = "intro" | "recording" | "analyzing" | "tune";

const COMPRESSOR: Record<Compression, { threshold: number; ratio: number; knee: number; attack: number; release: number }> = {
  gentle: { threshold: -24, ratio: 2, knee: 30, attack: 0.01, release: 0.15 },
  recommended: { threshold: -20, ratio: 3, knee: 25, attack: 0.005, release: 0.1 },
  strong: { threshold: -18, ratio: 5, knee: 20, attack: 0.003, release: 0.08 },
};

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function MicCheckModal({ open, onClose }: Props) {
  const [step, setStep] = useState<Step>("intro");
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(RECORD_SECONDS);
  const [gain, setGain] = useState(1);
  const [tooQuiet, setTooQuiet] = useState(false);
  const [compression, setCompression] = useState<Compression>("recommended");
  const [denoise, setDenoise] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [saving, setSaving] = useState(false);

  const bufferRef = useRef<AudioBuffer | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const compRef = useRef<DynamicsCompressorNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!open) reset();
    return () => stopPlayback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function reset() {
    stopPlayback();
    setStep("intro");
    setError(null);
    setCountdown(RECORD_SECONDS);
    setGain(1);
    setTooQuiet(false);
    setCompression("recommended");
    setDenoise(true);
  }

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        // AGC off so we measure the true mic level and set a fixed gain.
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, sampleRate: 48000 },
      });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        await analyze(new Blob(chunks, { type: mimeType }));
      };
      recorder.start();
      setStep("recording");
      setCountdown(RECORD_SECONDS);
      let left = RECORD_SECONDS;
      const timer = setInterval(() => {
        left -= 1;
        setCountdown(left);
        if (left <= 0) {
          clearInterval(timer);
          if (recorderRef.current?.state === "recording") recorderRef.current.stop();
        }
      }, 1000);
    } catch {
      setError("We couldn't access your microphone. Please allow microphone access and try again.");
      setStep("intro");
    }
  }

  async function analyze(blob: Blob) {
    setStep("analyzing");
    try {
      const arrayBuf = await blob.arrayBuffer();
      const ctx = new AudioContext({ sampleRate: 48000 });
      ctxRef.current = ctx;
      const buffer = await ctx.decodeAudioData(arrayBuf);
      bufferRef.current = buffer;

      // Compute RMS over the recorded sample (channel 0).
      const data = buffer.getChannelData(0);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
      const rms = Math.sqrt(sum / data.length);
      const rmsDb = 20 * Math.log10(rms || 1e-9);

      // Fixed gain to bring the sample to a healthy level, clamped.
      const gainDb = TARGET_RMS_DBFS - rmsDb;
      const g = Math.min(MAX_GAIN, Math.max(MIN_GAIN, Math.pow(10, gainDb / 20)));
      setGain(g);
      // Even at max boost it's still well below target → hardware level is too low.
      setTooQuiet(rmsDb + 20 * Math.log10(g) < TARGET_RMS_DBFS - 8);
      setStep("tune");
    } catch {
      setError("We couldn't read that recording. Let's try again.");
      setStep("intro");
    }
  }

  function buildGraph() {
    const ctx = ctxRef.current!;
    const src = ctx.createBufferSource();
    src.buffer = bufferRef.current!;
    src.loop = true;
    const g = ctx.createGain();
    g.gain.value = gain;
    const comp = ctx.createDynamicsCompressor();
    applyCompressor(comp, compression);
    src.connect(g);
    g.connect(comp);
    comp.connect(ctx.destination);
    srcRef.current = src;
    gainNodeRef.current = g;
    compRef.current = comp;
    return src;
  }

  function applyCompressor(comp: DynamicsCompressorNode, c: Compression) {
    const p = COMPRESSOR[c];
    comp.threshold.value = p.threshold;
    comp.ratio.value = p.ratio;
    comp.knee.value = p.knee;
    comp.attack.value = p.attack;
    comp.release.value = p.release;
  }

  function togglePlayback() {
    if (playing) { stopPlayback(); return; }
    if (!bufferRef.current || !ctxRef.current) return;
    ctxRef.current.resume();
    const src = buildGraph();
    src.onended = () => setPlaying(false);
    src.start();
    setPlaying(true);
  }

  function stopPlayback() {
    try { srcRef.current?.stop(); } catch { /* already stopped */ }
    srcRef.current = null;
    setPlaying(false);
  }

  // Live-update the preview graph when the tuning changes.
  useEffect(() => { if (gainNodeRef.current) gainNodeRef.current.gain.value = gain; }, [gain]);
  useEffect(() => { if (compRef.current) applyCompressor(compRef.current, compression); }, [compression]);

  async function save() {
    setSaving(true);
    try {
      // Capture gain is client-side; AGC off (fixed gain, no ramp).
      localStorage.setItem("heirloom-mic-gain", String(gain));
      localStorage.setItem("heirloom-agc", "false");
      localStorage.setItem("heirloom-mic-calibrated", "true");
      window.dispatchEvent(new CustomEvent("heirloom:mic-gain", { detail: gain }));
      window.dispatchEvent(new CustomEvent("heirloom:agc", { detail: false }));
      // Processing prefs are server-side (worker applies them).
      await fetch("/api/user/audio-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ compression, denoise }),
      });
    } catch { /* non-fatal — local capture settings still applied */ }
    setSaving(false);
    stopPlayback();
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }} onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden"
        style={{ background: "var(--surface, #141416)", border: "1px solid var(--border-subtle, rgba(255,255,255,0.08))" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-2">
            <Mic className="w-4 h-4" style={{ color: "var(--accent)" }} />
            <span className="text-sm font-semibold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-sans)" }}>Mic Check</span>
          </div>
          <button onClick={onClose} style={{ color: "var(--text-tertiary)" }}><X className="w-4 h-4" /></button>
        </div>

        <div className="px-5 py-5 flex flex-col gap-4">
          {error && (
            <p className="text-xs px-3 py-2 rounded" style={{ background: "rgba(220,38,38,0.12)", color: "#ef4444", fontFamily: "var(--font-sans)" }}>{error}</p>
          )}

          {step === "intro" && (
            <>
              <p className="text-sm" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-sans)", lineHeight: 1.5 }}>
                Let&apos;s make sure your microphone sounds great. Press the button, then read this out loud in your normal speaking voice:
              </p>
              <p className="text-base px-4 py-3 rounded-lg" style={{ background: "rgba(255,255,255,0.04)", color: "var(--text-primary)", fontFamily: "var(--font-serif, Georgia, serif)", fontStyle: "italic" }}>
                &ldquo;{SAMPLE_SENTENCE}&rdquo;
              </p>
              <button onClick={startRecording} className="w-full py-3 rounded-lg text-sm font-semibold flex items-center justify-center gap-2"
                style={{ background: "var(--accent)", color: "white", fontFamily: "var(--font-sans)" }}>
                <Mic className="w-4 h-4" /> Start Recording
              </button>
            </>
          )}

          {step === "recording" && (
            <div className="flex flex-col items-center gap-4 py-2">
              <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: "#ef4444", fontFamily: "var(--font-sans)" }}>
                <span className="inline-block rounded-full animate-pulse" style={{ width: 9, height: 9, background: "#ef4444" }} />
                Recording… {countdown}s
              </div>
              {/* Keep the phrase on screen so the narrator has something to read. */}
              <p className="text-lg px-4 py-4 rounded-lg text-center" style={{ background: "rgba(255,255,255,0.04)", color: "var(--text-primary)", fontFamily: "var(--font-serif, Georgia, serif)", fontStyle: "italic", lineHeight: 1.5 }}>
                &ldquo;{SAMPLE_SENTENCE}&rdquo;
              </p>
              <p className="text-sm text-center" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-sans)" }}>
                Read this out loud in your normal speaking voice.
              </p>
            </div>
          )}

          {step === "analyzing" && (
            <div className="flex flex-col items-center gap-3 py-6">
              <RefreshCw className="w-6 h-6 animate-spin" style={{ color: "var(--accent)" }} />
              <p className="text-sm" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-sans)" }}>Checking your microphone…</p>
            </div>
          )}

          {step === "tune" && (
            <>
              <div className="flex items-start gap-2 px-3 py-2 rounded-lg" style={{ background: "rgba(48,209,88,0.1)" }}>
                <Check className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "#30d158" }} />
                <p className="text-xs" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-sans)", lineHeight: 1.5 }}>
                  All set — we adjusted your microphone level automatically{gain > 1.05 ? " (turned it up)" : gain < 0.95 ? " (turned it down)" : ""}.
                </p>
              </div>

              {tooQuiet && (
                <div className="flex items-start gap-2 px-3 py-2 rounded-lg" style={{ background: "rgba(255,149,0,0.12)" }}>
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "#ff9500" }} />
                  <p className="text-xs" style={{ color: "#ff9500", fontFamily: "var(--font-sans)", lineHeight: 1.5 }}>
                    Your microphone is quite quiet even at full boost. For the best sound, raise the microphone volume in your computer&apos;s sound settings, or move a little closer.
                  </p>
                </div>
              )}

              <button onClick={togglePlayback} className="w-full py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2"
                style={{ background: "rgba(255,255,255,0.06)", color: "var(--text-primary)", fontFamily: "var(--font-sans)" }}>
                {playing ? "■ Stop" : "▶ Hear how you sound"}
              </button>

              {/* Voice evenness */}
              <div className="flex flex-col gap-2">
                <span className="text-xs font-medium" style={{ color: "var(--text-primary)", fontFamily: "var(--font-sans)" }}>Voice evenness</span>
                <div className="flex gap-2">
                  {(["gentle", "recommended", "strong"] as Compression[]).map((c) => (
                    <button key={c} onClick={() => setCompression(c)}
                      className="flex-1 py-2 rounded-lg text-xs font-medium capitalize transition-colors"
                      style={{
                        background: compression === c ? "rgba(107,21,21,0.3)" : "rgba(255,255,255,0.05)",
                        color: compression === c ? "var(--accent)" : "var(--text-tertiary)",
                        border: compression === c ? "1px solid rgba(107,21,21,0.5)" : "1px solid transparent",
                        fontFamily: "var(--font-sans)",
                      }}>
                      {c === "recommended" ? "Recommended" : c}
                    </button>
                  ))}
                </div>
              </div>

              {/* Background noise */}
              <div className="flex flex-col gap-2">
                <span className="text-xs font-medium" style={{ color: "var(--text-primary)", fontFamily: "var(--font-sans)" }}>Background noise reduction</span>
                <div className="flex gap-2">
                  {[{ v: true, label: "Recommended" }, { v: false, label: "Off" }].map(({ v, label }) => (
                    <button key={label} onClick={() => setDenoise(v)}
                      className="flex-1 py-2 rounded-lg text-xs font-medium transition-colors"
                      style={{
                        background: denoise === v ? "rgba(107,21,21,0.3)" : "rgba(255,255,255,0.05)",
                        color: denoise === v ? "var(--accent)" : "var(--text-tertiary)",
                        border: denoise === v ? "1px solid rgba(107,21,21,0.5)" : "1px solid transparent",
                        fontFamily: "var(--font-sans)",
                      }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button onClick={() => { stopPlayback(); setStep("intro"); }} className="px-4 py-2.5 rounded-lg text-sm"
                  style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-sans)" }}>
                  Redo
                </button>
                <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2"
                  style={{ background: "var(--accent)", color: "white", fontFamily: "var(--font-sans)", opacity: saving ? 0.6 : 1 }}>
                  {saving ? "Saving…" : "Save & Finish"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
