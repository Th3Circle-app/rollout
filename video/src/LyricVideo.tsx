import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export const FPS = 30;

export type Word = { word: string; start: number; end: number };

export type LyricProps = {
  title: string;
  artist: string;
  durationSec: number;
  audioFile: string;
  coverFile: string;
  words: Word[];
};

// Group aligned words into display lines (max 4 words / ~18 chars)
function toLines(words: Word[]): Word[][] {
  const lines: Word[][] = [];
  let cur: Word[] = [];
  let chars = 0;
  for (const w of words) {
    const gap = cur.length > 0 ? w.start - cur[cur.length - 1].end : 0;
    if (cur.length > 0 && (cur.length >= 4 || chars + w.word.length > 18 || gap > 1.2)) {
      lines.push(cur);
      cur = [];
      chars = 0;
    }
    cur.push(w);
    chars += w.word.length;
  }
  if (cur.length) lines.push(cur);
  return lines;
}

const GOLD = "#F0A45B";

export const LyricVideo: React.FC<LyricProps> = ({
  title,
  artist,
  durationSec,
  audioFile,
  coverFile,
  words,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;

  const lines = toLines(words);
  // active line = last line whose first word has started
  let active = 0;
  for (let i = 0; i < lines.length; i++) {
    if (t >= lines[i][0].start - 0.12) active = i;
  }
  const line = lines[active] ?? [];
  const lineStart = line[0]?.start ?? 0;

  // line entrance spring
  const lineIn = spring({
    frame: frame - Math.round((lineStart - 0.12) * fps),
    fps,
    config: { damping: 14, mass: 0.6, stiffness: 120 },
  });

  // background: slow zoom + drift
  const zoom = interpolate(t, [0, durationSec], [1.12, 1.28]);
  const drift = interpolate(t, [0, durationSec], [0, -40]);

  // ambient glow pulse behind the text
  const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 1.4);

  const progress = Math.min(1, t / durationSec);

  return (
    <AbsoluteFill style={{ backgroundColor: "#08080C" }}>
      <Audio src={staticFile(audioFile)} />

      {/* cover background, blurred + darkened */}
      <AbsoluteFill style={{ overflow: "hidden" }}>
        <Img
          src={staticFile(coverFile)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: `scale(${zoom}) translateY(${drift}px)`,
            filter: "blur(46px) brightness(0.38) saturate(1.25)",
          }}
        />
      </AbsoluteFill>

      {/* vignette */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse 90% 70% at 50% 46%, rgba(0,0,0,0) 40%, rgba(4,4,8,0.85) 100%)",
        }}
      />

      {/* ambient glow behind lyrics */}
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <div
          style={{
            width: 900,
            height: 900,
            borderRadius: "50%",
            background: `radial-gradient(circle, rgba(139,92,246,${
              0.16 + 0.1 * pulse
            }) 0%, rgba(139,92,246,0) 62%)`,
            filter: "blur(30px)",
          }}
        />
      </AbsoluteFill>

      {/* sharp cover card up top */}
      <AbsoluteFill style={{ alignItems: "center" }}>
        <div
          style={{
            marginTop: 200,
            width: 340,
            height: 340,
            borderRadius: 36,
            overflow: "hidden",
            boxShadow:
              "0 40px 90px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.10)",
            transform: `translateY(${interpolate(lineIn, [0, 1], [0, -6])}px)`,
          }}
        >
          <Img
            src={staticFile(coverFile)}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </div>
      </AbsoluteFill>

      {/* lyrics — karaoke word sync */}
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          padding: "0 90px",
          top: 160,
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: "0 26px",
            maxWidth: 900,
            transform: `translateY(${interpolate(lineIn, [0, 1], [46, 0])}px)`,
            opacity: lineIn,
          }}
        >
          {line.map((w, i) => {
            const wIn = spring({
              frame: frame - Math.round(w.start * fps),
              fps,
              config: { damping: 12, mass: 0.5, stiffness: 160 },
            });
            const sung = t >= w.start;
            const singing = t >= w.start && t <= w.end + 0.15;
            return (
              <span
                key={`${active}-${i}`}
                style={{
                  fontFamily:
                    "'Arial Black', 'Helvetica Neue', Arial, sans-serif",
                  fontWeight: 900,
                  fontSize: 104,
                  lineHeight: 1.22,
                  letterSpacing: "-0.02em",
                  textTransform: "uppercase",
                  color: sung ? "#FFFFFF" : "rgba(255,255,255,0.28)",
                  transform: `scale(${
                    0.8 + 0.2 * Math.min(1, wIn)
                  }) translateY(${interpolate(
                    Math.min(1, wIn),
                    [0, 1],
                    [18, 0]
                  )}px)`,
                  textShadow: singing
                    ? `0 0 46px rgba(240,164,91,0.85), 0 0 120px rgba(240,164,91,0.4), 0 4px 18px rgba(0,0,0,0.6)`
                    : "0 4px 18px rgba(0,0,0,0.6)",
                  transition: "color 0.12s",
                }}
              >
                {w.word}
              </span>
            );
          })}
        </div>
      </AbsoluteFill>

      {/* bottom: title / artist / progress */}
      <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center" }}>
        <div
          style={{
            marginBottom: 150,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 14,
          }}
        >
          <div
            style={{
              fontFamily: "'Helvetica Neue', Arial, sans-serif",
              fontWeight: 700,
              fontSize: 40,
              letterSpacing: "0.32em",
              color: "rgba(255,255,255,0.92)",
              textTransform: "uppercase",
            }}
          >
            {title}
          </div>
          <div
            style={{
              fontFamily: "'Helvetica Neue', Arial, sans-serif",
              fontWeight: 500,
              fontSize: 28,
              letterSpacing: "0.5em",
              color: GOLD,
              textTransform: "uppercase",
            }}
          >
            {artist}
          </div>
          <div
            style={{
              marginTop: 22,
              width: 520,
              height: 5,
              borderRadius: 3,
              background: "rgba(255,255,255,0.14)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${progress * 100}%`,
                height: "100%",
                borderRadius: 3,
                background: `linear-gradient(90deg, #8B5CF6, ${GOLD})`,
              }}
            />
          </div>
        </div>
      </AbsoluteFill>

      {/* film grain */}
      <AbsoluteFill
        style={{
          opacity: 0.05,
          mixBlendMode: "overlay",
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 ${width} ${height}' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' seed='${
            frame % 7
          }'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />
    </AbsoluteFill>
  );
};
