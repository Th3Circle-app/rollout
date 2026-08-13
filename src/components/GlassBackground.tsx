import { useEffect, useRef } from "react";

// Hand-written WebGL background: a slow, refractive violet glass blob raymarched
// in a fragment shader over near-black, now MOUSE-REACTIVE — the camera
// parallaxes with the cursor, the key light follows it, and a soft violet glow
// drifts toward it. Fixed behind all content, pointer-events off. Falls back to
// a static CSS wash if WebGL is unavailable and freezes for reduced-motion.
const FRAG = `
precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform vec2 u_mouse;

float smin(float a, float b, float k){
  float h = clamp(0.5 + 0.5*(b-a)/k, 0.0, 1.0);
  return mix(b, a, h) - k*h*(1.0-h);
}
float sdSphere(vec3 p, float r){ return length(p) - r; }

float map(vec3 p){
  float t = u_time * 0.35;
  float br = 1.0 + 0.075*sin(u_time*0.85);   // slow pulsating breath
  vec3 a = p - vec3(sin(t)*0.65, cos(t*0.8)*0.42, sin(t*0.5)*0.2);
  vec3 b = p - vec3(cos(t*0.7)*0.72, sin(t*1.1)*0.5, sin(t)*0.3);
  vec3 c = p - vec3(sin(t*1.3)*0.5, cos(t)*0.6, cos(t*0.6)*0.35);
  float d = sdSphere(a, 0.72*br);
  d = smin(d, sdSphere(b, 0.56*br), 0.62);
  d = smin(d, sdSphere(c, 0.5*br), 0.62);
  return d;
}
vec3 calcNormal(vec3 p){
  vec2 e = vec2(0.0012, 0.0);
  return normalize(vec3(
    map(p+e.xyy) - map(p-e.xyy),
    map(p+e.yxy) - map(p-e.yxy),
    map(p+e.yyx) - map(p-e.yyx)));
}
void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5*u_res) / u_res.y;
  vec2 m = u_mouse;

  vec3 ro = vec3(m.x*0.6, -m.y*0.6, 3.0);   // camera parallax
  vec3 rd = normalize(vec3(uv, -1.6));

  float t = 0.0; bool hit = false; vec3 p = ro;
  for(int i=0; i<72; i++){
    p = ro + rd*t;
    float d = map(p);
    if(d < 0.0015){ hit = true; break; }
    if(t > 8.0) break;
    t += d*0.9;
  }

  float pulse = 0.5 + 0.5*sin(u_time*0.85);   // 0..1 breathing, in sync with the blob
  vec3 bg = mix(vec3(0.045,0.045,0.065), vec3(0.015,0.015,0.026), clamp(length(uv)*0.8, 0.0, 1.0));
  float glow = smoothstep(0.95, 0.0, length(uv - m*1.2));   // glow drifts to cursor
  bg += vec3(0.15,0.09,0.34) * glow * (0.30 + 0.24*pulse);  // ...and pulses brighter/dimmer
  vec3 col = bg;

  if(hit){
    vec3 n = calcNormal(p);
    vec3 ld = normalize(vec3(0.5 + m.x, 0.85 - m.y, 0.6));   // light follows cursor
    float diff = clamp(dot(n, ld), 0.0, 1.0);
    float fres = pow(1.0 - clamp(dot(n, -rd), 0.0, 1.0), 3.0);
    vec3 violet  = vec3(0.545, 0.361, 0.965);
    vec3 magenta = vec3(0.78, 0.35, 0.95);
    vec3 deep    = vec3(0.22, 0.12, 0.42);
    vec3 base = mix(deep, mix(violet, magenta, fres*0.6), diff);
    vec3 h = normalize(ld - rd);
    float spec = pow(clamp(dot(n, h), 0.0, 1.0), 56.0);
    col = base + fres*violet*(0.9 + 0.55*pulse) + spec*vec3(1.0)*0.6;
    col = mix(col, bg, 0.16);
  }

  col *= 1.0 - 0.28*length(uv);
  float g = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898,78.233)) + u_time) * 43758.5453);
  col += (g - 0.5) * 0.026;
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
`;

const VERT = `
attribute vec2 a_pos;
void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

export default function GlassBackground({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const wash = () => {
      canvas.style.background =
        "radial-gradient(60% 60% at 50% 40%, rgba(139,92,246,0.16), rgba(11,11,15,1) 70%)";
    };
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" });
    if (!gl) { wash(); return; }

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { wash(); return; }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, "u_res");
    const uTime = gl.getUniformLocation(prog, "u_time");
    const uMouse = gl.getUniformLocation(prog, "u_mouse");

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const resize = () => {
      const w = Math.floor(window.innerWidth * dpr);
      const h = Math.floor(window.innerHeight * dpr);
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uRes, w, h);
    };
    resize();
    window.addEventListener("resize", resize);

    const mouse = { x: 0, y: 0 };
    const targetM = { x: 0, y: 0 };
    const onMove = (e: PointerEvent) => {
      targetM.x = e.clientX / window.innerWidth - 0.5;
      targetM.y = e.clientY / window.innerHeight - 0.5;
    };
    window.addEventListener("pointermove", onMove);

    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const start = performance.now();
    const render = (now: number) => {
      // floatier damping than the headphones (0.045 vs 0.09) so the two never
      // move in sync
      mouse.x += (targetM.x - mouse.x) * 0.045;
      mouse.y += (targetM.y - mouse.y) * 0.045;
      // INDEPENDENT reaction: the blob leans into the cursor most when it's out
      // in the background (away from the centred headphones) and settles when the
      // cursor is over the headphones — unlinking the two.
      const dist = Math.hypot(mouse.x, mouse.y);
      const engage = Math.min(1, Math.max(0.12, dist / 0.4));
      gl.uniform1f(uTime, (now - start) / 1000);
      gl.uniform2f(uMouse, mouse.x * engage, mouse.y * engage);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!reduce) raf = requestAnimationFrame(render);
    };
    if (reduce) {
      gl.uniform1f(uTime, 6.0);
      gl.uniform2f(uMouse, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    } else {
      raf = requestAnimationFrame(render);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={className}
      style={{ position: "fixed", inset: 0, width: "100%", height: "100%", zIndex: 0, pointerEvents: "none", ...style }}
    />
  );
}
