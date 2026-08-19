import { useEffect, useState } from "react";
import { Pencil, ExternalLink, Upload, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useStore, type Release } from "@/store";
import { supabase } from "@/lib/supabase";

type Row = {
  id: string;
  title: string;
  artist_name: string;
  filename: string;
  file_id?: string;
  key_sig?: string;
  bpm?: number;
  duration?: string;
  moods?: string[];
  keywords?: string[];
  genre?: string;
  lyrics?: string;
  cover_url?: string;
  release_date?: string | null;
  streaming_link?: string;
  slug?: string;
  updated_at?: string;
};

function fmtDate(d?: string) {
  if (!d) return "";
  const dt = new Date(d);
  return isNaN(dt.getTime())
    ? ""
    : dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// A release is "ready" on the same real flags the Dashboard uses.
function readiness(r: Row) {
  const flags = [Boolean(r.cover_url), Boolean(r.lyrics), Boolean(r.release_date), Boolean(r.streaming_link)];
  return Math.round((flags.filter(Boolean).length / flags.length) * 100);
}

export default function Library() {
  const { go, setRelease, setReleaseDate, setStreamingLink, session, cloud, release } = useStore();
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      // Local-only mode has no releases table — surface the current working one.
      if (!cloud || !supabase || !session) {
        setRows(release ? [{
          id: release.id || "local", title: release.title, artist_name: release.artist,
          filename: release.filename, cover_url: release.coverUrl, lyrics: release.lyrics,
        }] : []);
        return;
      }
      const { data } = await supabase
        .from("rollout_releases")
        .select("*")
        .eq("artist_id", session.user.id)
        .order("updated_at", { ascending: false });
      if (alive) setRows((data as Row[]) || []);
    })();
    return () => { alive = false; };
  }, [cloud, session, release]);

  // Load a saved release back into the working state and open the release hub.
  const edit = (r: Row) => {
    const rel: Release = {
      id: r.id, filename: r.filename, title: r.title, artist: r.artist_name,
      key: r.key_sig || "", bpm: r.bpm || 0, duration: r.duration || "",
      moods: r.moods || [], keywords: r.keywords || [], genre: r.genre || "",
      lyrics: r.lyrics || "", coverUrl: r.cover_url || "", file_id: r.file_id || "",
    };
    setRelease(rel);
    setReleaseDate(r.release_date ? String(r.release_date) : "");
    setStreamingLink(r.streaming_link || "");
    go("Dashboard");
  };

  const [confirmId, setConfirmId] = useState<string | null>(null);
  const remove = async (id: string) => {
    if (confirmId !== id) { setConfirmId(id); return; } // click once to confirm
    setRows((rs) => (rs ? rs.filter((x) => x.id !== id) : rs));
    setConfirmId(null);
    if (cloud && supabase) {
      try { await supabase.from("rollout_releases").delete().eq("id", id); } catch { /* ignore */ }
    }
  };

  const loading = rows === null;
  const empty = !loading && rows.length === 0;

  return (
    <div className="min-h-screen flex flex-col flex-1">
      <div className="flex px-6 xl:px-12 pt-8 pb-4 items-end justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="page-title text-[40px]">Library</h1>
          <p className="text-[#9A96AD] text-sm leading-5">
            Every release you've built. Pick one up where you left off.
          </p>
        </div>
        <Button onClick={() => go("Import")} className="btn-primary rounded-xl text-white h-11 gap-2">
          <Upload className="size-4" /> New release
        </Button>
      </div>

      <div className="flex px-6 xl:px-12 pb-12 flex-1">
        {loading && (
          <div className="flex flex-1 items-center justify-center text-[#9A96AD] gap-2">
            <Loader2 className="size-4 animate-spin" /> Loading your library…
          </div>
        )}

        {empty && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <div className="size-14 rounded-xl panel-inset flex items-center justify-center">
              <Upload className="size-6 text-[#5E5A72]" />
            </div>
            <div className="flex flex-col gap-1">
              <h2 className="font-bold text-[#F2F0F7] text-xl">Nothing here yet</h2>
              <p className="max-w-xs text-[#9A96AD] text-sm leading-6">
                Import a finished song and Rollout builds the whole release. It shows up here so you can come back and edit anytime.
              </p>
            </div>
            <Button onClick={() => go("Import")} className="btn-primary rounded-xl text-white h-11 gap-2">
              <Upload className="size-4" /> Import your first track
            </Button>
          </div>
        )}

        {!loading && !empty && (
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-4 w-full content-start">
            {rows!.map((r) => {
              const pct = readiness(r);
              return (
                <Card key={r.id} className="rounded-2xl panel card-premium p-4 gap-3 flex flex-col">
                  <div
                    onClick={() => edit(r)}
                    className="rounded-xl panel-inset h-40 overflow-hidden cursor-pointer group relative"
                  >
                    {r.cover_url ? (
                      <img src={r.cover_url} alt={`${r.title} cover art`} referrerPolicy="no-referrer" className="object-cover w-full h-full transition-transform group-hover:scale-[1.03]" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center font-mono text-[10px] text-[#5E5A72]">no art yet</div>
                    )}
                    <span className="absolute top-2 right-2 font-mono rounded-full bg-black/55 backdrop-blur text-[#F2F0F7] text-[10px] px-2 py-0.5">
                      {pct}% ready
                    </span>
                  </div>

                  <CardContent className="flex p-0 flex-col gap-3 flex-1">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-semibold text-[#F2F0F7] text-sm leading-5 truncate">{r.title || "Untitled"}</span>
                      <span className="text-[#9A96AD] text-xs leading-4 truncate">{r.artist_name || "—"}</span>
                      {r.updated_at && (
                        <span className="font-mono text-[#5E5A72] text-[10px] mt-1">Edited {fmtDate(r.updated_at)}</span>
                      )}
                    </div>

                    <div className="mt-auto flex items-center gap-2">
                      <Button onClick={() => edit(r)} className="btn-primary rounded-xl text-white h-9 gap-1.5 flex-1">
                        <Pencil className="size-3.5" /> Edit
                      </Button>
                      {r.slug && r.streaming_link && (
                        <a
                          href={`/r/${r.slug}`}
                          target="_blank"
                          rel="noreferrer"
                          aria-label="Open fan page"
                          className="size-9 shrink-0 rounded-lg border border-white/10 flex items-center justify-center text-[#9A96AD] hover:text-[#F2F0F7] hover:border-white/20"
                        >
                          <ExternalLink className="size-4" />
                        </a>
                      )}
                      <button
                        onClick={() => remove(r.id)}
                        onMouseLeave={() => confirmId === r.id && setConfirmId(null)}
                        aria-label={confirmId === r.id ? "Confirm delete" : "Delete release"}
                        className={
                          "shrink-0 rounded-lg border flex items-center justify-center transition-colors h-9 " +
                          (confirmId === r.id
                            ? "px-2.5 gap-1.5 border-red-400/50 text-red-400 text-xs font-medium"
                            : "size-9 border-white/10 text-[#9A96AD] hover:text-red-400 hover:border-red-400/40")
                        }
                      >
                        <Trash2 className="size-4" />
                        {confirmId === r.id && "Delete?"}
                      </button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
