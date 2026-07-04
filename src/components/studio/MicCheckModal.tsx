"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, X, Check, RefreshCw, AlertTriangle, Play, Square, Sparkles } from "lucide-react";
import VUMeter from "@/components/studio/VUMeter";

// A guided, plain-language mic setup for non-technical narrators, as a 4-step wizard:
//   1. Welcome        — friendly intro
//   2. Is This Thing On?  — grant permission, live meter, auto-detect voice
//   3. Checking Levels    — countdown → record the phrase (auto-stops on silence),
//                           play it back, redo or continue
//   4. Options        — auto-set level + tune evenness/noise with a live preview
//
// Layout: the body is a FIXED height so the floating window never resizes between
// steps, and in step 3 the sample phrase is rendered once in a pinned position
// with fixed-height slots above (status) and below (meter/controls) — only those
// swap, so the phrase never jumps as the countdown/recording states change.

const SAMPLE_SENTENCE = "The quick brown fox jumps over the lazy dog, and the story begins.";
const PREP_SECONDS = 3;
const TARGET_RMS_DBFS = -20; // healthy speaking level
const MIN_GAIN = 0.5;
const MAX_GAIN = 8; // ~+18 dB — beyond this, guide the user to raise their system mic level

// Voice detection / auto-stop tuning (rms of float time-domain data, 0..1)
const DETECT_RMS = 0.03;       // step 2: "we heard you" — clear speech
const VOICE_RMS = 0.012;       // step 3: voice present — low enough that soft word-tails still count (so it doesn't clip the last word)
const SILENCE_HOLD_MS = 2500;  // clear silence after speech before we stop — long enough to allow expressive pauses mid-phrase
const MIN_RECORD_MS = 2500;    // never auto-stop before this
const MAX_RECORD_MS = 20000;   // hard cap

// Fixed body height — sized to the tallest step (tuning) so every step is identical.
const BODY_HEIGHT = 380;
const PHRASE_STYLE: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  color: "var(--text-primary)",
  fontFamily: "var(--font-serif, Georgia, serif)",
  fontStyle: "italic",
  lineHeight: 1.5,
};

type Compression = "gentle" | "recommended" | "strong";
type Step = "welcome" | "permission" | "levels" | "tune";
type LevelsPhase = "ready" | "countdown" | "recording" | "recorded";

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
  const [step, setStep] = useState<Step>("welcome");
  const [phase, setPhase] = useState<LevelsPhase>("ready");
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null); // live mic → VU meter
  const [voiceDetected, setVoiceDetected] = useState(false);       // step 2 latch
  const [prepLeft, setPrepLeft] = useState(PREP_SECONDS);
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
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Auto-stop bookkeeping (refs so the per-frame level callback stays cheap/current)
  const hasSpokenRef = useRef(false);
  const lastLoudRef = useRef(0);
  const recStartRef = useRef(0);

  useEffect(() => {
    if (!open) reset();
    return () => stopPlayback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function clearTimers() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (maxRef.current) { clearTimeout(maxRef.current); maxRef.current = null; }
  }

  function reset() {
    stopPlayback();
    stopMic();
    clearTimers();
    setStep("welcome");
    setPhase("ready");
    setError(null);
    setVoiceDetected(false);
    setPrepLeft(PREP_SECONDS);
    setGain(1);
    setTooQuiet(false);
    setCompression("recommended");
    setDenoise(true);
  }

  // Release the microphone (stops the OS "recording" indicator) and clear the
  // stream so the VU meter tears down.
  function stopMic() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);
  }

  // ── Step 2: request microphone permission ────────────────────────────────
  async function requestMic() {
    setError(null);
    setVoiceDetected(false);
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        // AGC off so we measure the true mic level and set a fixed gain.
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, sampleRate: 48000 },
      });
      streamRef.current = s;
      setStream(s);
    } catch {
      setError("We couldn't access your microphone. Please allow microphone access, then try again.");
    }
  }

  function goToPermission() {
    setStep("permission");
    requestMic();
  }

  // ── Per-frame level callback from the VU meter ───────────────────────────
  function handleLevel(rms: number) {
    if (step === "permission") {
      if (rms > DETECT_RMS && !voiceDetected) setVoiceDetected(true);
      return;
    }
    if (step === "levels" && phase === "recording") {
      const now = performance.now();
      if (rms > VOICE_RMS) { hasSpokenRef.current = true; lastLoudRef.current = now; }
      const elapsed = now - recStartRef.current;
      // Auto-stop once they've spoken and then gone quiet for a beat.
      if (hasSpokenRef.current && elapsed > MIN_RECORD_MS && now - lastLoudRef.current > SILENCE_HOLD_MS) {
        stopRecorder();
      }
    }
  }

  // ── Step 3: countdown → record ───────────────────────────────────────────
  function startCountdown() {
    setError(null);
    setPhase("countdown");
    setPrepLeft(PREP_SECONDS);
    let left = PREP_SECONDS;
    timerRef.current = setInterval(() => {
      left -= 1;
      setPrepLeft(left);
      if (left <= 0) {
        clearTimers();
        beginRecording();
      }
    }, 1000);
  }

  function beginRecording() {
    const s = streamRef.current;
    if (!s) { setError("Your microphone isn't connected. Let's redo the check."); setStep("permission"); return; }
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
    const recorder = new MediaRecorder(s, { mimeType });
    recorderRef.current = recorder;
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = async () => {
      clearTimers();
      await analyze(new Blob(chunks, { type: mimeType }));
      setPhase("recorded"); // stay on this screen for playback / redo / next
    };
    hasSpokenRef.current = false;
    recStartRef.current = performance.now();
    lastLoudRef.current = performance.now();
    recorder.start();
    setPhase("recording");
    // Hard cap so a noisy room can't record forever if silence is never detected.
    maxRef.current = setTimeout(stopRecorder, MAX_RECORD_MS);
  }

  function stopRecorder() {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  async function analyze(blob: Blob) {
    try {
      const arrayBuf = await blob.arrayBuffer();
      const ctx = ctxRef.current ?? new AudioContext({ sampleRate: 48000 });
      ctxRef.current = ctx;
      const buffer = await ctx.decodeAudioData(arrayBuf);
      bufferRef.current = buffer;

      // RMS over the recorded sample (channel 0).
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
    } catch {
      setError("We couldn't read that recording. Let's try again.");
      setPhase("ready");
    }
  }

  // Redo the recording (stream is still open from step 2).
  function retryRecording() {
    stopPlayback();
    setPhase("ready");
  }

  // Advance to tuning — we have the buffer now, so release the mic.
  function goToTune() {
    stopPlayback();
    stopMic();
    setStep("tune");
  }

  // Redo the whole check from the recording step (re-acquire the mic).
  async function redoFromTune() {
    stopPlayback();
    setStep("levels");
    setPhase("ready");
    await requestMic();
  }

  // ── Playback ─────────────────────────────────────────────────────────────
  // Raw playback (step 3): hear exactly what was captured.
  function playRaw() {
    if (playing) { stopPlayback(); return; }
    if (!bufferRef.current || !ctxRef.current) return;
    ctxRef.current.resume();
    const src = ctxRef.current.createBufferSource();
    src.buffer = bufferRef.current;
    src.connect(ctxRef.current.destination);
    src.onended = () => setPlaying(false);
    srcRef.current = src;
    src.start();
    setPlaying(true);
  }

  // Processed playback (step 4): gain + compressor preview of how it'll sound.
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
    gainNodeRef.current = null;
    compRef.current = null;
    setPlaying(false);
  }

  // Live-update the processed preview when the tuning changes.
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
    stopMic();
    onClose();
  }

  if (!open) return null;

  const stepLabel: Record<Step, string> = {
    welcome: "Mic Check",
    permission: "Is this thing on?",
    levels: "Checking levels",
    tune: "Make it sound great",
  };
  const stepIndex: Record<Step, number> = { welcome: 0, permission: 1, levels: 2, tune: 3 };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }} onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden"
        style={{ background: "var(--surface, #141416)", border: "1px solid var(--border-subtle, rgba(255,255,255,0.08))" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header + step dots */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-2">
            <Mic className="w-4 h-4" style={{ color: "var(--accent)" }} />
            <span className="text-sm font-semibold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-sans)" }}>{stepLabel[step]}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              {(["welcome", "permission", "levels", "tune"] as Step[]).map((s) => (
                <span key={s} className="rounded-full transition-all" style={{
                  width: stepIndex[step] === stepIndex[s] ? 16 : 6,
                  height: 6,
                  background: stepIndex[s] <= stepIndex[step] ? "var(--accent)" : "rgba(255,255,255,0.15)",
                }} />
              ))}
            </div>
            <button onClick={onClose} style={{ color: "var(--text-tertiary)" }}><X className="w-4 h-4" /></button>
          </div>
        </div>

        {/* Fixed-height body — every step is the same size, so the window never resizes. */}
        <div className="px-5 py-5 flex flex-col" style={{ height: BODY_HEIGHT }}>
          {error && (
            <p className="text-xs px-3 py-2 rounded mb-3 flex-shrink-0" style={{ background: "rgba(220,38,38,0.12)", color: "#ef4444", fontFamily: "var(--font-sans)" }}>{error}</p>
          )}

          {/* ── Step 1: Welcome ─────────────────────────────────────────── */}
          {step === "welcome" && (
            <div className="flex-1 flex flex-col">
              <div className="flex-1 flex flex-col items-center justify-center text-center gap-3">
                <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: "rgba(107,21,21,0.25)" }}>
                  <Sparkles className="w-7 h-7" style={{ color: "var(--accent)" }} />
                </div>
                <h3 className="text-lg font-semibold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-sans)" }}>
                  Let&apos;s make you sound great
                </h3>
                <p className="text-sm" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-sans)", lineHeight: 1.5 }}>
                  A quick 30-second setup: we&apos;ll check your microphone, listen to a short phrase, and tune everything so your recordings sound warm and clear. No audio knowledge required.
                </p>
              </div>
              <button onClick={goToPermission} className="w-full py-3 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 flex-shrink-0"
                style={{ background: "var(--accent)", color: "white", fontFamily: "var(--font-sans)" }}>
                <Mic className="w-4 h-4" /> Start Mic Check
              </button>
            </div>
          )}

          {/* ── Step 2: Is This Thing On? ───────────────────────────────── */}
          {step === "permission" && (
            <div className="flex-1 flex flex-col">
              <p className="text-sm text-center" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-sans)", lineHeight: 1.5 }}>
                {stream
                  ? "Microphone connected! Say a few words — you should see the bars below jump."
                  : "Your browser will ask to use your microphone — please click Allow. (Look for the prompt near the top of the window.)"}
              </p>

              {/* Big meter, vertically centered in the remaining space */}
              <div className="flex-1 flex flex-col items-center justify-center gap-4">
                <div className="w-full px-1">
                  <VUMeter stream={stream} isRecording={!!stream} onLevel={handleLevel} height={48} />
                </div>
                <div className="h-5 flex items-center justify-center text-sm" style={{ fontFamily: "var(--font-sans)" }}>
                  {stream && (voiceDetected ? (
                    <span className="flex items-center gap-1.5" style={{ color: "#30d158" }}>
                      <Check className="w-4 h-4" /> We can hear you loud and clear
                    </span>
                  ) : (
                    <span style={{ color: "var(--text-tertiary)" }}>Waiting to hear your voice…</span>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 flex-shrink-0">
                {stream ? (
                  <>
                    <button onClick={() => setStep("welcome")} className="px-4 py-2.5 rounded-lg text-sm" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-sans)" }}>
                      Back
                    </button>
                    <button onClick={() => setStep("levels")} className="flex-1 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2"
                      style={{ background: voiceDetected ? "var(--accent)" : "rgba(255,255,255,0.08)", color: voiceDetected ? "white" : "var(--text-secondary)", fontFamily: "var(--font-sans)" }}>
                      Next
                    </button>
                  </>
                ) : (
                  <button onClick={requestMic} className="flex-1 py-2.5 rounded-lg text-sm font-semibold"
                    style={{ background: "var(--accent)", color: "white", fontFamily: "var(--font-sans)" }}>
                    {error ? "Try Again" : "Waiting for microphone…"}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── Step 3: Checking Levels — phrase pinned, only the slots swap ─ */}
          {step === "levels" && (
            <div className="flex-1 flex flex-col">
              {/* Status slot — fixed height so the phrase below never moves */}
              <div className="flex flex-col items-center justify-center text-center gap-1 flex-shrink-0" style={{ height: 76 }}>
                {phase === "ready" && (
                  <p className="text-sm" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-sans)", lineHeight: 1.5 }}>
                    After a short countdown, read the phrase below aloud in your normal speaking voice.
                  </p>
                )}
                {phase === "countdown" && (
                  <>
                    <span className="tabular-nums font-semibold" style={{ fontSize: "2.75rem", lineHeight: 1, color: "var(--accent)", fontFamily: "var(--font-sans)" }}>{prepLeft}</span>
                    <span className="text-xs uppercase tracking-widest" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-sans)" }}>Get ready to read…</span>
                  </>
                )}
                {phase === "recording" && (
                  <span className="flex items-center gap-2 text-sm font-semibold" style={{ color: "#ef4444", fontFamily: "var(--font-sans)" }}>
                    <span className="inline-block rounded-full animate-pulse" style={{ width: 9, height: 9, background: "#ef4444" }} />
                    Recording — read aloud now
                  </span>
                )}
                {phase === "recorded" && (
                  <span className="flex items-center gap-1.5 text-sm font-medium" style={{ color: "#30d158", fontFamily: "var(--font-sans)" }}>
                    <Check className="w-4 h-4" /> Got it! Have a listen below.
                  </span>
                )}
              </div>

              {/* The phrase — rendered ONCE, identical style/position across every phase */}
              <p className="text-base px-4 py-3 rounded-lg text-center flex-shrink-0" style={PHRASE_STYLE}>
                &ldquo;{SAMPLE_SENTENCE}&rdquo;
              </p>

              {/* Meter / action slot — fixed height */}
              <div className="flex items-center justify-center w-full px-1 mt-4 flex-shrink-0" style={{ height: 60 }}>
                {(phase === "countdown" || phase === "recording") && (
                  <VUMeter stream={stream} isRecording={!!stream} onLevel={handleLevel} height={36} />
                )}
                {phase === "recorded" && (
                  <button onClick={playRaw} className="w-full py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2"
                    style={{ background: "rgba(255,255,255,0.06)", color: "var(--text-primary)", fontFamily: "var(--font-sans)" }}>
                    {playing ? <><Square className="w-4 h-4" /> Stop</> : <><Play className="w-4 h-4" /> Play my recording</>}
                  </button>
                )}
              </div>

              {/* Spacer pushes controls to the bottom */}
              <div className="flex-1" />

              {/* Controls slot — bottom, fixed position */}
              <div className="flex items-center gap-2 flex-shrink-0" style={{ minHeight: 44 }}>
                {phase === "ready" && (
                  <>
                    <button onClick={() => setStep("permission")} className="px-4 py-2.5 rounded-lg text-sm" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-sans)" }}>Back</button>
                    <button onClick={startCountdown} className="flex-1 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2"
                      style={{ background: "var(--accent)", color: "white", fontFamily: "var(--font-sans)" }}>
                      <Mic className="w-4 h-4" /> Start
                    </button>
                  </>
                )}
                {phase === "recording" && (
                  <div className="w-full flex items-center justify-center gap-2">
                    <span className="text-xs" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-sans)" }}>We&apos;ll stop automatically when you finish.</span>
                    <button onClick={stopRecorder} className="text-xs px-2 py-1 rounded flex items-center gap-1" style={{ background: "rgba(255,255,255,0.06)", color: "var(--text-secondary)", fontFamily: "var(--font-sans)" }}>
                      <Square className="w-3 h-3" /> Stop
                    </button>
                  </div>
                )}
                {phase === "recorded" && (
                  <>
                    <button onClick={retryRecording} className="px-4 py-2.5 rounded-lg text-sm flex items-center gap-1.5" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-sans)" }}>
                      <RefreshCw className="w-3.5 h-3.5" /> Try again
                    </button>
                    <button onClick={goToTune} className="flex-1 py-2.5 rounded-lg text-sm font-semibold" style={{ background: "var(--accent)", color: "white", fontFamily: "var(--font-sans)" }}>Next</button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── Step 4: Options / tuning ────────────────────────────────── */}
          {step === "tune" && (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Scrollable content — the footer below stays pinned/visible. */}
              <div className="flex-1 flex flex-col gap-2 overflow-y-auto min-h-0 pr-0.5">
              {/* Achievement headline — feels like a finish line. */}
              <div className="flex flex-col items-center text-center gap-1 flex-shrink-0">
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "rgba(48,209,88,0.15)", border: "1px solid rgba(48,209,88,0.35)" }}>
                  <Check className="w-5 h-5" style={{ color: "#30d158" }} />
                </div>
                <h3 className="font-semibold" style={{ fontSize: "1.4rem", lineHeight: 1.1, color: "var(--text-primary)", fontFamily: "var(--font-sans)" }}>
                  You&apos;re all set!
                </h3>
                <p className="text-xs" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-sans)", lineHeight: 1.4 }}>
                  We set your level automatically{gain > 1.05 ? " (turned it up)" : gain < 0.95 ? " (turned it down)" : ""}. Fine-tune below, then press play.
                </p>
              </div>

              {tooQuiet && (
                <div className="flex items-start gap-2 px-3 py-2 rounded-lg flex-shrink-0" style={{ background: "rgba(255,149,0,0.12)" }}>
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "#ff9500" }} />
                  <p className="text-xs" style={{ color: "#ff9500", fontFamily: "var(--font-sans)", lineHeight: 1.5 }}>
                    Your microphone is quite quiet even at full boost. For the best sound, raise the microphone volume in your computer&apos;s sound settings, or move a little closer.
                  </p>
                </div>
              )}

              {/* Compact, secondary preview control so the headline can breathe. */}
              <button onClick={togglePlayback} className="self-center px-4 py-1.5 rounded-full text-xs font-medium flex items-center justify-center gap-1.5 flex-shrink-0"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-primary)", fontFamily: "var(--font-sans)" }}>
                {playing ? <><Square className="w-3.5 h-3.5" /> Stop</> : <><Play className="w-3.5 h-3.5" /> Hear how you sound</>}
              </button>

              {/* Voice evenness */}
              <div className="flex flex-col gap-2 flex-shrink-0">
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
              <div className="flex flex-col gap-2 flex-shrink-0">
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

              </div>{/* end scrollable content */}

              <div className="flex gap-2 flex-shrink-0 pt-3">
                <button onClick={redoFromTune} className="px-4 py-2.5 rounded-lg text-sm" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-sans)" }}>Redo</button>
                <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2"
                  style={{ background: "var(--accent)", color: "white", fontFamily: "var(--font-sans)", opacity: saving ? 0.6 : 1 }}>
                  {saving ? "Saving…" : "Save & Finish"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
