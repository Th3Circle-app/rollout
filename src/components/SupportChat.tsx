import { useState } from "react";
import { Loader2, MessageCircle, Send, X } from "lucide-react";
import { useStore } from "@/store";

type Msg = { from: "bot" | "you"; text: string };

// Crisis-language safeguard: if a message signals self-harm, respond with
// resources rather than routing it as a support ticket (we're not a crisis line).
const SELF_HARM_RE = /\b(suicid\w*|kill (myself|me)|end (my|it all)|self[-\s]?harm|hurt (myself|me)|want to die|don'?t want to (live|be here)|take my (own )?life)\b/i;
const CRISIS_MSG =
  "It sounds like you may be going through something really hard, and you're not alone. If you're in crisis, please reach out right now: in the US call or text 988 (Suicide & Crisis Lifeline), or text HOME to 741741. If you're in immediate danger, call 911 or your local emergency number.";

// Floating support chat. Messages email support@xkaii.com via the Netlify
// function (Resend), with the user's address as reply-to so we can answer them.
export default function SupportChat() {
  const { session } = useStore();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(session?.user?.email || "");
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([
    { from: "bot", text: "Hey 👋 Ask us anything about Rollout, or leave a message and we'll email you back." },
  ]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    if (SELF_HARM_RE.test(text)) {
      setMsgs((m) => [...m, { from: "you", text }, { from: "bot", text: CRISIS_MSG }]);
      setInput("");
      return;
    }
    if (!email.trim()) {
      setMsgs((m) => [...m, { from: "bot", text: "What's the best email to reach you at? Add it above and resend." }]);
      return;
    }
    setMsgs((m) => [...m, { from: "you", text }]);
    setInput("");
    setSending(true);
    try {
      const res = await fetch("/.netlify/functions/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, email: email.trim() }),
      });
      if (!res.ok) throw new Error();
      setMsgs((m) => [...m, { from: "bot", text: `Got it — we'll reply to ${email.trim()} soon. Thanks!` }]);
    } catch {
      setMsgs((m) => [...m, { from: "bot", text: "That didn't send. You can email us directly at support@xkaii.com." }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Support chat"
        className="fixed bottom-5 right-5 z-[90] flex size-14 items-center justify-center rounded-full bg-violet-500 text-white shadow-2xl transition-transform hover:scale-105"
        style={{ boxShadow: "0 12px 30px -8px rgba(139,92,246,0.6)" }}
      >
        {open ? <X className="size-5" /> : <MessageCircle className="size-5" />}
      </button>

      {open && (
        <div className="fixed bottom-24 right-5 z-[90] flex h-[460px] w-[360px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-white/12 bg-[#14141b]/95 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center gap-3 border-b border-white/8 px-4 py-3">
            <div className="flex size-8 items-center justify-center rounded-full bg-violet-500">
              <MessageCircle className="size-4 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-white">Rollout Support</span>
              <span className="text-[11px] text-[#8b879a]">We usually reply within a day</span>
            </div>
          </div>

          <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-4">
            {msgs.map((m, i) => (
              <div
                key={i}
                className={
                  "max-w-[82%] rounded-2xl px-3.5 py-2 text-[13px] leading-5 " +
                  (m.from === "bot" ? "self-start bg-white/[0.06] text-[#e4e2ea]" : "self-end bg-violet-500 text-white")
                }
              >
                {m.text}
              </div>
            ))}
          </div>

          {!session?.user?.email && (
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Your email"
              className="mx-3 mb-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-[#5E5A72] focus:outline-none focus:ring-2 focus:ring-violet-500/40"
            />
          )}

          <div className="flex items-center gap-2 border-t border-white/8 p-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") send(); }}
              placeholder="Type a message…"
              className="flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-[#5E5A72] focus:outline-none focus:ring-2 focus:ring-violet-500/40"
            />
            <button
              onClick={send}
              disabled={sending}
              aria-label="Send"
              className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-violet-500 text-white transition-colors hover:bg-[#7c4dec] disabled:opacity-50"
            >
              {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
