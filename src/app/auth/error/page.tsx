import Link from "next/link";
import { AlertCircle } from "lucide-react";

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  const errorMessages: Record<string, string> = {
    AccessDenied: "Your email address is not authorized to access this application. Please contact the administrator.",
    Configuration: "There is a problem with the server configuration.",
    Verification: "The verification link has expired or has already been used.",
    Default: "An unexpected authentication error occurred.",
  };

  const message = errorMessages[error ?? "Default"] ?? errorMessages.Default;

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-base)" }}>
      <div className="ha-card p-8 max-w-md w-full mx-6 text-center">
        <AlertCircle className="w-12 h-12 mx-auto mb-4" style={{ color: "var(--red)" }} />
        <h1 className="text-2xl font-display mb-3" style={{ color: "var(--text-primary)" }}>
          Sign In Failed
        </h1>
        <p className="text-sm mb-6" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-sans)" }}>
          {message}
        </p>
        <Link href="/auth/signin" className="ha-btn-primary inline-flex">
          Try Again
        </Link>
      </div>
    </div>
  );
}
