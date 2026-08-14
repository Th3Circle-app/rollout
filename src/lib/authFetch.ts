// Attaches the signed-in user's Supabase access token to every call to the
// Rollout engine, so the engine can require auth (it does heavy ML compute and
// must not be an open endpoint). Centralized here by wrapping window.fetch once,
// so the individual `fetch(`${API}/...`)` call sites don't each need changing.
//
// Only requests to API_BASE get the header; Supabase's own client uses its own
// fetch and is untouched. In local mode (no supabase client) this is a no-op, so
// a dev engine with no auth env keeps working.
import { supabase } from "@/lib/supabase";
import { API_BASE } from "@/lib/api";

export function installAuthFetch() {
  if (!supabase || !API_BASE || typeof window === "undefined") return;

  // Keep the latest access token in a local ref so the wrapper stays sync-fast;
  // Supabase refreshes it and fires onAuthStateChange, which we mirror here.
  let token: string | null = null;
  supabase.auth.getSession().then(({ data }) => { token = data.session?.access_token ?? null; });
  supabase.auth.onAuthStateChange((_e, session) => { token = session?.access_token ?? null; });

  const origFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url =
      typeof input === "string" ? input
      : input instanceof URL ? input.href
      : input instanceof Request ? input.url
      : String(input);
    if (token && url.startsWith(API_BASE)) {
      const headers = new Headers(
        init.headers ?? (input instanceof Request ? input.headers : undefined)
      );
      if (!headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
      return origFetch(input, { ...init, headers });
    }
    return origFetch(input, init);
  };
}
