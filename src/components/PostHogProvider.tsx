"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { useEffect } from "react";

// PostHog *project* API key (phc_…). Unlike a personal/secret key, a project key
// is write-only and designed to ship in client code — it can capture events and
// read feature flags but cannot read analytics data or access the account, so
// exposing it in the browser bundle is expected, not a leaked secret. It's
// overridable at build time via NEXT_PUBLIC_POSTHOG_KEY (NEXT_PUBLIC_* vars are
// inlined at build), and falls back to the project's key so it works with no config.
const POSTHOG_KEY =
  process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "phc_TrRglikF9TaHnWhNykuChurmEv9a0YT19WQyGXBVfMy";
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!POSTHOG_KEY) return; // no key configured (e.g. blanked via env) → skip init
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      capture_pageview: "history_change",
    });
  }, []);

  return <PHProvider client={posthog}>{children}</PHProvider>;
}
