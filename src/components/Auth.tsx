import { useState } from "react";
import { ArrowRight, Loader2, Mail, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

// Multi-tenant sign-in. Email + password AND magic links cover EVERY email
// provider on earth (Titan, Hotmail, private domains...). Google OAuth on
// top; more providers are dashboard toggles.

type Mode = "signin" | "signup" | "magic";

export default function Auth() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [artistName, setArtistName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "err" | "ok"; text: string } | null>(null);

  const submit = async () => {
    if (!supabase || !email.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      if (mode === "magic") {
        const { error } = await supabase.auth.signInWithOtp({
          email: email.trim(),
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        setMsg({ kind: "ok", text: "Magic link sent — check your inbox." });
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { artist_name: artistName.trim() } },
        });
        if (error) throw error;
        setMsg({ kind: "ok", text: "Account created — confirm via the email we just sent." });
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
      }
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Something went wrong" });
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    if (!supabase) return;
    setMsg(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) setMsg({ kind: "err", text: "Google sign-in isn't enabled yet — use email for now." });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0B0B0F] px-6">
      <div className="edge w-full max-w-md rounded-3xl bg-[#15151C] border-white/8 border-1 border-solid p-8">
        <div className="mb-7 flex flex-col items-center gap-3 text-center">
          <div className="size-10 rounded-xl bg-violet-500 flex items-center justify-center">
            <Zap className="size-5 text-[#0B0B0F]" fill="#0B0B0F" />
          </div>
          <div>
            <h1 className="font-bold text-[#F2F0F7] text-2xl tracking-tight">
              {mode === "signup" ? "Start your rollout." : "Welcome back."}
            </h1>
            <p className="mt-1 text-[#9A96AD] text-sm">
              Drop one song, get a whole release.
            </p>
          </div>
        </div>

        {/* the deal, visible before the wall */}
        <div className="mb-6 grid grid-cols-3 gap-2">
          {[
            { name: "Free", price: "$0", note: "first song" },
            { name: "Artist", price: "$15", note: "per month" },
            { name: "Studio", price: "$20", note: "per month" },
          ].map((t) => (
            <div key={t.name} className="edge rounded-xl border border-white/8 bg-[#0B0B0F] px-3 py-2.5 text-center">
              <div className="font-mono text-[10px] uppercase tracking-wider text-[#5E5A72]">{t.name}</div>
              <div className="mt-0.5 font-bold text-[#F2F0F7] text-lg leading-6">{t.price}</div>
              <div className="font-mono text-[9px] text-[#5E5A72]">{t.note}</div>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3">
          {mode === "signup" && (
            <input
              value={artistName}
              onChange={(e) => setArtistName(e.target.value)}
              placeholder="Artist name"
              className="rounded-xl bg-[#1E1E28] border border-white/10 px-4 py-3 text-sm text-neutral-50 placeholder:text-[#5E5A72] focus:outline-none focus:ring-2 focus:ring-violet-500/40"
            />
          )}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email — any provider works"
            className="rounded-xl bg-[#1E1E28] border border-white/10 px-4 py-3 text-sm text-neutral-50 placeholder:text-[#5E5A72] focus:outline-none focus:ring-2 focus:ring-violet-500/40"
          />
          {mode !== "magic" && (
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="Password"
              className="rounded-xl bg-[#1E1E28] border border-white/10 px-4 py-3 text-sm text-neutral-50 placeholder:text-[#5E5A72] focus:outline-none focus:ring-2 focus:ring-violet-500/40"
            />
          )}

          <Button
            onClick={submit}
            disabled={busy || !email.trim() || (mode !== "magic" && !password)}
            className="rounded-xl py-6 font-semibold gap-2 disabled:opacity-40"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {mode === "signup" ? "Create account" : mode === "magic" ? "Email me a magic link" : "Sign in"}
            {!busy && <ArrowRight className="size-4" />}
          </Button>

          {msg && (
            <p className={"text-center text-sm " + (msg.kind === "ok" ? "text-[#46E0A8]" : "text-red-400")}>
              {msg.text}
            </p>
          )}

          <div className="my-1 flex items-center gap-3">
            <div className="h-px flex-1 bg-white/8" />
            <span className="font-mono text-[10px] uppercase tracking-wider text-[#5E5A72]">or</span>
            <div className="h-px flex-1 bg-white/8" />
          </div>

          <Button variant="ghost" onClick={google}
            className="rounded-xl border border-white/10 py-6 text-[#F2F0F7] gap-2 hover:border-white/20">
            <svg className="size-4" viewBox="0 0 24 24" aria-hidden>
              <path fill="#EA4335" d="M12 5.04c1.94 0 3.28.84 4.04 1.54l2.95-2.88C17.2 2.02 14.83 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.44 2.67C6.47 7.17 9 5.04 12 5.04z"/>
              <path fill="#4285F4" d="M23.49 12.27c0-.9-.08-1.57-.26-2.27H12v4.3h6.47c-.13 1.08-.83 2.71-2.4 3.81l3.35 2.6c2.01-1.86 3.07-4.6 3.07-8.44z"/>
              <path fill="#FBBC05" d="M5.62 14.26A6.9 6.9 0 0 1 5.24 12c0-.79.14-1.55.37-2.26L2.18 7.07A11.02 11.02 0 0 0 1 12c0 1.77.43 3.45 1.18 4.93l3.44-2.67z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.35-2.6c-.92.62-2.15 1.06-3.93 1.06-3 0-5.53-2.13-6.38-4.87l-3.44 2.67C3.99 20.53 7.7 23 12 23z"/>
            </svg>
            Continue with Google
          </Button>

          {mode !== "magic" ? (
            <button onClick={() => { setMode("magic"); setMsg(null); }}
              className="mx-auto mt-1 flex items-center gap-1.5 font-mono text-[11px] text-[#9A96AD] hover:text-[#F2F0F7]">
              <Mail className="size-3" /> no password? get a magic link
            </button>
          ) : (
            <button onClick={() => { setMode("signin"); setMsg(null); }}
              className="mx-auto mt-1 font-mono text-[11px] text-[#9A96AD] hover:text-[#F2F0F7]">
              back to password sign-in
            </button>
          )}
        </div>

        <div className="mt-6 border-t border-white/8 pt-5 text-center">
          {mode === "signup" ? (
            <button onClick={() => { setMode("signin"); setMsg(null); }} className="text-sm text-[#9A96AD] hover:text-[#F2F0F7]">
              Already have an account? <span className="text-violet-500 font-medium">Sign in</span>
            </button>
          ) : (
            <button onClick={() => { setMode("signup"); setMsg(null); }} className="text-sm text-[#9A96AD] hover:text-[#F2F0F7]">
              New here? <span className="text-violet-500 font-medium">Create your account</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
