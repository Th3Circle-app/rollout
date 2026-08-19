import { Check } from "lucide-react";

/**
 * A "Mark as done" toggle the artist clicks when a release-kit item is finished.
 * The done state persists on the release and lights the item up as "Ready" on the
 * release dashboard — works whether or not the tool auto-detected completion.
 */
export default function DoneToggle({
  done,
  onToggle,
  label = "Mark as done",
}: {
  done: boolean;
  onToggle: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(!done)}
      className={
        "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors " +
        (done
          ? "bg-[#46E0A8]/15 text-[#46E0A8] ring-1 ring-[#46E0A8]/40"
          : "bg-white/[0.05] text-[#9A96AD] ring-1 ring-white/10 hover:text-white")
      }
    >
      <Check className="size-4" />
      {done ? "Done · showing Ready" : label}
    </button>
  );
}
