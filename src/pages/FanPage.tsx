import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

// Public, unauthenticated release page served at /r/{slug}. Fans reach this from
// the artist's smart link — no login, no app shell, no desktop gate. It reads
// the published fan-page HTML straight from Supabase (public_read RLS allows
// SELECT only where published = true) and renders it full-screen in a sandboxed
// iframe. The stored HTML is artist-authored, so the iframe runs WITHOUT
// allow-scripts / allow-same-origin: links open, nothing else executes.
export default function FanPage({ slug }: { slug: string }) {
  const [state, setState] = useState<"loading" | "found" | "missing">("loading");
  const [html, setHtml] = useState("");

  useEffect(() => {
    let dead = false;
    (async () => {
      if (!supabase || !slug) { setState("missing"); return; }
      const { data, error } = await supabase
        .from("rollout_fan_pages")
        .select("html")
        .eq("slug", slug)
        .eq("published", true)
        .maybeSingle();
      if (dead) return;
      if (error || !data?.html) { setState("missing"); return; }
      setHtml(data.html);
      setState("found");
    })();
    return () => { dead = true; };
  }, [slug]);

  if (state === "loading") {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#0b0b0f", color: "#5E5A72", fontFamily: "monospace", fontSize: 13 }}>
        loading…
      </div>
    );
  }
  if (state === "missing") {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#0b0b0f", color: "#F2F0F7", fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif", textAlign: "center", padding: 24 }}>
        <div>
          <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-.02em" }}>Release not found</div>
          <p style={{ color: "#9A96AD", marginTop: 10, fontSize: 14 }}>This link isn't live yet, or it has moved.</p>
          <a href="https://th3circle.app" style={{ color: "#7C4DEC", marginTop: 16, display: "inline-block", fontSize: 13, textDecoration: "none" }}>
            Make your own with Rollout →
          </a>
        </div>
      </div>
    );
  }
  return (
    <iframe
      title="Release"
      srcDoc={html}
      sandbox="allow-popups allow-popups-to-escape-sandbox"
      style={{ position: "fixed", inset: 0, width: "100%", height: "100%", border: "none" }}
    />
  );
}
