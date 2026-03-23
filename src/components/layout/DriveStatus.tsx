"use client";
import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { CloudOff, RefreshCw } from "lucide-react";

type Status = "checking" | "ok" | "error";

export default function DriveStatus() {
  const [status, setStatus] = useState<Status>("checking");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  useEffect(() => {
    fetch("/api/drive/status")
      .then(r => r.json())
      .then(data => {
        if (data.driveTest?.ok) {
          setStatus("ok");
        } else {
          setStatus("error");
          setErrorMsg(data.driveTest?.error ?? "Drive unavailable");
        }
      })
      .catch(() => {
        setStatus("error");
        setErrorMsg("Could not reach Drive API");
      });
  }, []);

  // Nothing to show when connected
  if (status === "checking" || status === "ok") return null;

  const handleReconnect = async () => {
    setReconnecting(true);
    // Re-run Google OAuth without signing out — updates tokens in place
    await signIn("google", { callbackUrl: window.location.href });
  };

  return (
    <div className="relative">
      <button
        onClick={() => setShowTooltip(v => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all"
        style={{
          background: "rgba(255,149,0,0.12)",
          border: "1px solid rgba(255,149,0,0.35)",
          color: "#ff9500",
          fontFamily: "var(--font-sans)",
          fontSize: "0.75rem",
          fontWeight: 500,
        }}
        title="Google Drive disconnected">
        <CloudOff className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="hidden sm:inline">Drive disconnected</span>
      </button>

      {showTooltip && (
        <>
          {/* Backdrop to close */}
          <div className="fixed inset-0 z-40" onClick={() => setShowTooltip(false)} />

          <div
            className="absolute right-0 top-full mt-2 z-50 rounded-xl p-4 w-72"
            style={{
              background: "#111113",
              border: "1px solid rgba(255,149,0,0.25)",
              boxShadow: "0 16px 48px rgba(0,0,0,0.7)",
            }}>
            <div className="flex items-start gap-3 mb-3">
              <CloudOff className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "#ff9500" }} />
              <div>
                <p className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)", fontFamily: "var(--font-sans)" }}>
                  Google Drive disconnected
                </p>
                <p className="text-xs" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-sans)", lineHeight: 1.5 }}>
                  Your recordings are saving locally. Reconnect to resume syncing audio and exports to Drive.
                </p>
                {errorMsg && (
                  <p className="text-xs mt-1.5 font-mono" style={{ color: "rgba(255,149,0,0.7)", fontSize: "0.6rem" }}>
                    {errorMsg}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={handleReconnect}
              disabled={reconnecting}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all"
              style={{
                background: "rgba(255,149,0,0.15)",
                border: "1px solid rgba(255,149,0,0.4)",
                color: "#ff9500",
                fontFamily: "var(--font-sans)",
                opacity: reconnecting ? 0.6 : 1,
              }}>
              <RefreshCw className={`w-3.5 h-3.5 ${reconnecting ? "animate-spin" : ""}`} />
              {reconnecting ? "Redirecting to Google…" : "Reconnect Google Drive"}
            </button>
            <p className="text-center mt-2" style={{ fontSize: "0.6rem", color: "var(--text-tertiary)", fontFamily: "var(--font-sans)" }}>
              You won't be signed out — just re-authorise Drive access.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
