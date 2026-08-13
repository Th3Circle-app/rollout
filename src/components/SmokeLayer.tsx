// Smoke now renders inside the single WebGL canvas (see Headphones3D → <Smoke/>)
// so it shares the one GPU context and can't be evicted + whited out the way a
// separate WebGL smoke canvas was. This stays as a no-op export so the landing's
// existing <SmokeLayer/> mount doesn't need to change.
export default function SmokeLayer(_props: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return null;
}
