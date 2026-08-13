import { useEffect, useRef } from "react";

// A drifting volumetric-ish smoke haze, hand-written in a fragment shader:
// domain-warped fractal Brownian motion (curling wisps) in dark violet, slowly
// rising. Sits between the 3D layer and the content to add atmospheric depth.
// Rendered at reduced resolution (smoke is soft, so it costs almost nothing) and
// freezes for reduced-motion. Alpha-composited, pointer-events off.
const FRAG = `
precision highp float;
uniform vec2 u_res;
uniform float u_time;

float hash(vec2 p){ p = fract(p*vec2(123.34,345.45)); p += dot(p, p+34.345); return fract(p.x*p.y); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  float a = hash(i), b = hash(i+vec2(1.0,0.0)), c = hash(i+vec2(0.0,1.0)), d = hash(i+vec2(1.0,1.0));
  vec2 u = f*f*(3.0-2.0*f);
  return mix(a,b,u.x) + (c-a)*u.y*(1.0-u.x) + (d-b)*u.x*u.y;
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for(int i=0;i<5;i++){ v += a*noise(p); p *= 2.02; a *= 0.5; }
  return v;
}
void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5*u_res) / u_res.y;
  float t = u_time * 0.05;
  // two-stage domain warp -> curling smoke
  vec2 q = vec2(fbm(uv*1.4 + vec2(0.0, t)), fbm(uv*1.4 + vec2(5.2, -t)));
  vec2 r = vec2(fbm(uv*1.4 + q*1.6 + vec2(1.7, t*1.3)), fbm(uv*1.4 + q*1.6 + vec2(8.3, -t*1.1)));
  float d = fbm(uv*1.5 + r*2.0);
  d = smoothstep(0.42, 0.78, d);            // tighter band -> defined curling wisps
  d *= smoothstep(1.25, 0.02, abs(uv.y));   // spread across most of the height
  // bright cool lavender smoke — distinct from the warm violet blob so it reads
  vec3 smoke = mix(vec3(0.18,0.13,0.36), vec3(0.74,0.66,1.0), pow(d, 0.8));
  gl_FragColor = vec4(smoke, d*0.9);
}
`;

const VERT = `
attribute vec2 a_pos;
void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

export default function SmokeLayer({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { antialias: false, alpha: true, premultipliedAlpha: false, powerPreference: "low-power" });
    if (!gl) return;

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
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE); // additive — smoke glows against the dark

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, "u_res");
    const uTime = gl.getUniformLocation(prog, "u_time");

    // smoke is soft — render at ~60% resolution, CSS scales it up for free
    const scale = 0.6;
    const resize = () => {
      const w = Math.floor(window.innerWidth * scale);
      const h = Math.floor(window.innerHeight * scale);
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uRes, w, h);
    };
    resize();
    window.addEventListener("resize", resize);

    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const start = performance.now();
    const render = (now: number) => {
      gl.uniform1f(uTime, (now - start) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!reduce) raf = requestAnimationFrame(render);
    };
    if (reduce) {
      gl.uniform1f(uTime, 8.0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    } else {
      raf = requestAnimationFrame(render);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={className}
      style={{ position: "fixed", inset: 0, width: "100%", height: "100%", zIndex: 2, pointerEvents: "none", ...style }}
    />
  );
}
