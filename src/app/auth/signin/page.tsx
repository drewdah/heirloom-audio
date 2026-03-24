import { signIn } from "@/lib/auth";

export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center"
      style={{ background: "var(--bg-base)" }}>

      {/* Subtle gradient background */}
      <div style={{
        position: "fixed", inset: 0,
        background: "radial-gradient(ellipse at 50% 0%, rgba(107,21,21,0.08) 0%, transparent 60%)",
        pointerEvents: "none",
      }} />

      <div className="relative z-10 w-full max-w-sm mx-6">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-5"
            style={{ boxShadow: "0 8px 32px rgba(107,21,21,0.4)" }}>
            <img src="/images/logo-simplified.png" alt="Heirloom Audio" className="w-16 h-16 rounded-full" />
          </div>
          <h1 className="text-2xl font-display mb-1" style={{ color: "var(--text-primary)" }}>
            HeirloomAudio
          </h1>
          <p className="text-sm" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-sans)" }}>
            Record stories that last forever
          </p>
        </div>

        {/* Card */}
        <div className="ha-card p-8">
          <h2 className="text-base font-semibold mb-1" style={{ color: "var(--text-primary)", fontFamily: "var(--font-sans)" }}>
            Sign in
          </h2>
          <p className="text-sm mb-6" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-sans)" }}>
            Use your Google account to continue
          </p>

          <form action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/shelf" });
          }}>
            <button type="submit"
              className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-lg transition-all font-medium text-sm"
              style={{
                background: "var(--bg-raised)",
                border: "1px solid var(--border-default)",
                color: "var(--text-primary)",
                fontFamily: "var(--font-sans)",
              }}>
              {/* Google icon */}
              <svg width="18" height="18" viewBox="0 0 18 18">
                <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"/>
                <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2.04a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17z"/>
                <path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 0 1 0-3.04V5.41H1.83a8 8 0 0 0 0 7.18z"/>
                <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 1.83 5.4L4.5 7.49a4.77 4.77 0 0 1 4.48-3.3z"/>
              </svg>
              Continue with Google
            </button>
          </form>
        </div>

        <p className="text-center text-xs mt-6" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-sans)" }}>
          Private family use only
        </p>
      </div>
    </div>
  );
}
