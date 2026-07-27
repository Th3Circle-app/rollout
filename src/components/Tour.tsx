import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, HelpCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStore } from "@/store";

// First-run product tour: walks the real lifecycle screen by screen.
// Standard SaaS furniture — skippable, replayable, never blocks the UI twice.

type Step = { page: string; title: string; body: string };

const STEPS: Step[] = [
  {
    page: "Import",
    title: "Drop one song",
    body: "Start here. Drag a finished track in and Rollout listens to it — key, BPM, mood, and the visual language of the record. Paste your lyrics too: they power the lyric video and captions.",
  },
  {
    page: "Dashboard",
    title: "Your release hub",
    body: "Everything for the drop lives here. The ring fills as your kit gets real — click any card to work on that piece.",
  },
  {
    page: "Cover",
    title: "Layered cover canvas",
    body: "AI generates concepts from your song's vibe, then you stack layers on top — subject cut-outs, color washes, texture, type — like Illustrator. Exports a real 3000×3000 PNG.",
  },
  {
    page: "Distribute",
    title: "Hand it to the distributor",
    body: "Pick a distributor, click-copy your metadata straight in, and mark it submitted. Rollout starts working the waiting period the second you do.",
  },
  {
    page: "Plan",
    title: "The dead zone, handled",
    body: "While the distributor processes, your calendar and captions are already written — quoting your actual lyrics. When your streaming link goes live, paste it once and it lands in every post.",
  },
  {
    page: "Lyrics",
    title: "Beat-synced lyric videos",
    body: "Rollout isolates your vocal, finds the hook, aligns your written lyrics to the actual singing, and renders a 15-second vertical clip you can post before the song is even out.",
  },
  {
    page: "Landing",
    title: "A fan page you own",
    body: "One link for the drop — hosted on your page, not an algorithm's. This is where ad traffic converts into fans you keep.",
  },
  {
    page: "Ship",
    title: "Ship it",
    body: "The live countdown, every checklist, one button. Set your date on the Release Plan and everything goes live together.",
  },
];

type TourCtx = { start: () => void };
const Ctx = createContext<TourCtx>({ start: () => {} });
export const useTour = () => useContext(Ctx);

const DONE_KEY = "rollout_tour_done";

export function TourProvider({ children }: { children: ReactNode }) {
  const { go } = useStore();
  const [step, setStep] = useState<number>(-1); // -1 = closed
  const open = step >= 0;

  // First run: open once, gently, after the app settles.
  useEffect(() => {
    if (window.location.search.includes("autotest")) return; // self-test runs
    try {
      if (localStorage.getItem(DONE_KEY)) return;
    } catch {
      /* ignore */
    }
    const t = setTimeout(() => setStep(0), 900);
    return () => clearTimeout(t);
  }, []);

  // Each step shows its screen for real.
  useEffect(() => {
    if (open) go(STEPS[step].page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const finish = () => {
    setStep(-1);
    try {
      localStorage.setItem(DONE_KEY, "1");
    } catch {
      /* ignore */
    }
  };
  const start = () => setStep(0);

  const s = open ? STEPS[step] : null;

  return (
    <Ctx.Provider value={{ start }}>
      {children}

      {/* persistent help affordance */}
      <button
        onClick={start}
        aria-label="Open the product tour"
        title="How Rollout works"
        className="fixed bottom-5 right-5 z-[60] flex size-9 items-center justify-center rounded-full bg-[#15151C] border-white/8 border-1 border-solid text-[#9A96AD] hover:text-[#F2F0F7] hover:border-white/20"
      >
        <HelpCircle className="size-4" />
      </button>

      {/* tour card */}
      {open && s && (
        <div className="fixed inset-x-0 bottom-8 z-[70] flex justify-center px-4 pointer-events-none">
          <div className="edge pointer-events-auto w-full max-w-md rounded-2xl bg-[#15151C] border-white/10 border-1 border-solid p-6">
            <div className="flex items-start justify-between gap-4">
              <span className="font-semibold uppercase text-violet-500 text-[11px] tracking-[3.2px]">
                Tour · {step + 1} of {STEPS.length}
              </span>
              <button onClick={finish} aria-label="Close tour" className="text-[#5E5A72] hover:text-[#F2F0F7]">
                <X className="size-4" />
              </button>
            </div>
            <h2 className="mt-2 font-bold text-[#F2F0F7] text-xl leading-7 tracking-tight">{s.title}</h2>
            <p className="mt-1.5 text-[#9A96AD] text-sm leading-5">{s.body}</p>

            <div className="mt-5 flex items-center justify-between">
              {/* progress dots */}
              <div className="flex items-center gap-1.5">
                {STEPS.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setStep(i)}
                    aria-label={`Go to tour step ${i + 1}`}
                    className={
                      "h-1.5 rounded-full transition-all " +
                      (i === step ? "w-5 bg-violet-500" : "w-1.5 bg-[#1E1E28] hover:bg-[#5E5A72]")
                    }
                  />
                ))}
              </div>
              <div className="flex items-center gap-2">
                {step > 0 && (
                  <Button variant="ghost" onClick={() => setStep(step - 1)} className="text-[#9A96AD] gap-1.5 h-9 px-3">
                    <ArrowLeft className="size-3.5" /> Back
                  </Button>
                )}
                {step < STEPS.length - 1 ? (
                  <Button onClick={() => setStep(step + 1)} className="rounded-xl gap-1.5 h-9 px-4">
                    Next <ArrowRight className="size-3.5" />
                  </Button>
                ) : (
                  <Button onClick={finish} className="rounded-xl h-9 px-4">
                    Start my release
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
