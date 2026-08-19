import { useEffect, useState } from "react";

// Minimal cookie/local-storage consent notice. Shown once until acknowledged.
export default function CookieConsent() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try { if (!localStorage.getItem("rollout_cookie_consent")) setShow(true); } catch { /* ignore */ }
  }, []);
  if (!show) return null;
  const accept = () => {
    try { localStorage.setItem("rollout_cookie_consent", "1"); } catch { /* ignore */ }
    setShow(false);
  };
  return (
    <div className="fixed bottom-4 left-4 z-[95] max-w-sm rounded-2xl border border-white/12 bg-[#14141b]/95 p-4 shadow-2xl backdrop-blur-xl">
      <p className="text-[13px] leading-5 text-[#cfcbd9]">
        We use essential cookies and local storage to run Rollout and keep you signed in. See our{" "}
        <a href="/legal/privacy.html" className="text-violet-300 underline">Privacy Policy</a>.
      </p>
      <div className="mt-3 flex justify-end">
        <button onClick={accept} className="rounded-xl bg-violet-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#7c4dec]">
          Got it
        </button>
      </div>
    </div>
  );
}
