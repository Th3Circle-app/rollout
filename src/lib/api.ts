// Single source of truth for the Rollout Python engine base URL.
//
// Local dev defaults to the uvicorn server on :8000. Production reads
// VITE_API_BASE (baked in at build time, e.g. the hosted engine's HTTPS URL)
// so the deployed app points at the real backend instead of a developer's
// laptop. Trailing slashes are trimmed so `${API}/analyze` never doubles up.
const raw = (import.meta.env.VITE_API_BASE as string | undefined)?.trim();
export const API_BASE = (raw ? raw.replace(/\/+$/, "") : "") || "http://127.0.0.1:8000";

// Public origin the app is served from — used to build shareable /r/{slug}
// release-page links. Defaults to wherever the app is actually running (so the
// copied link is always correct in dev and prod), overridable via
// VITE_PUBLIC_BASE if the /r route is proxied under a different domain.
const pub = (import.meta.env.VITE_PUBLIC_BASE as string | undefined)?.trim();
export const PUBLIC_BASE =
  (pub ? pub.replace(/\/+$/, "") : "") ||
  (typeof window !== "undefined" ? window.location.origin : "");
