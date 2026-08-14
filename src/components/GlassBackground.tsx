// Solid near-black backdrop. The violet glass blob now renders INSIDE the 3D
// headphones' WebGL canvas (see Headphones3D → <Blob/>) so there is only ONE
// WebGL context on the page — a second standalone WebGL canvas gets evicted by
// three.js and paints white on this machine. This just guarantees a dark base
// under the stars + smoke.
export default function GlassBackground({
  className = "",
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      aria-hidden
      className={className}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        background: "#0B0B0F",
        ...style,
      }}
    />
  );
}
