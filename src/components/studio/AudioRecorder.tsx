"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, Square, Loader2 } from "lucide-react";
import VUMeter from "@/components/studio/VUMeter";
import RecordingTimeline from "@/components/studio/RecordingTimeline";

export type RecorderState = "idle" | "recording" | "uploading";

interface AudioRecorderProps {
  onRecordingComplete: (blob: Blob, duration: number) => Promise<void>;
  disabled?: boolean;
}

export default function AudioRecorder({ onRecordingComplete, disabled }: AudioRecorderProps) {
  const [state, setState] = useState<RecorderState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    stream?.getTracks().forEach((t) => t.stop());
  }, [stream]);

  const startRecording = useCallback(async () => {
    setError(null);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,  // off for voice recording — narrator controls their own environment
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 48000,
        },
      });

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/ogg";

      const recorder = new MediaRecorder(mediaStream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };

      recorder.onstop = async () => {
        mediaStream.getTracks().forEach((t) => t.stop());
        setStream(null);
        const duration = (Date.now() - startTimeRef.current) / 1000;
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setState("uploading");
        try {
          await onRecordingComplete(blob, duration);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Upload failed");
        } finally {
          setState("idle");
          setElapsed(0);
        }
      };

      recorder.start(250);
      mediaRef.current = recorder;
      startTimeRef.current = Date.now();
      setStream(mediaStream);
      setElapsed(0);
      setState("recording");

      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 500);
    } catch {
      setError("Microphone access denied. Please allow microphone access and try again.");
    }
  }, [onRecordingComplete]);

  const stopRecording = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    mediaRef.current?.stop();
  }, []);

  return (
    <div className="flex flex-col gap-5">

      {/* Timeline — always shown, animates when recording */}
      <RecordingTimeline elapsed={elapsed} isRecording={state === "recording"} />

      {/* VU Meter */}
      <VUMeter stream={stream} isRecording={state === "recording"} />

      {/* Record button row */}
      <div className="flex flex-col items-center gap-3 pt-1">
        <div className="relative">
          {state === "recording" && (
            <span
              className="absolute inset-0 rounded-full animate-ping"
              style={{ background: "rgba(239,68,68,0.3)" }}
            />
          )}
          <button
            onClick={state === "recording" ? stopRecording : startRecording}
            disabled={disabled || state === "uploading"}
            className="relative w-20 h-20 rounded-full flex items-center justify-center transition-all duration-200 disabled:opacity-40"
            style={{
              background: state === "recording"
                ? "linear-gradient(135deg, #dc2626, #991b1b)"
                : "var(--bg-raised)",
              border: state === "recording"
                ? "2px solid rgba(239,68,68,0.6)"
                : "2px solid var(--border-default)",
              boxShadow: state === "recording"
                ? "0 0 24px rgba(239,68,68,0.4), 0 4px 16px rgba(0,0,0,0.4)"
                : "0 4px 16px rgba(0,0,0,0.3)",
            }}>
            {state === "uploading"
              ? <Loader2 className="w-8 h-8 animate-spin" style={{ color: "var(--accent)" }} />
              : state === "recording"
              ? <Square className="w-7 h-7 fill-white text-white" />
              : <Mic className="w-8 h-8" style={{ color: "var(--text-secondary)" }} />}
          </button>
        </div>

        <p className="text-xs" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-sans)" }}>
          {disabled
            ? "Delete existing recording to re-record"
            : state === "uploading"
            ? "Saving to Drive…"
            : state === "recording"
            ? "Click to stop recording"
            : "Click to start recording"}
        </p>
      </div>

      {error && (
        <p className="text-xs text-center" style={{ color: "var(--red)" }}>{error}</p>
      )}
    </div>
  );
}
