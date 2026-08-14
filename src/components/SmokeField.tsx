import { useEffect, useRef } from "react";

// Standalone WebGL smoke for pages that DON'T have the 3D headphones canvas (the
// studio screens). Same drifting violet fbm wisps as the hero, additively
// blended. Safe as its own canvas here because these pages have no other WebGL
// context to compete with. Fixed behind content, pointer-events off, freezes for
// reduced-motion.
const FRAG = `
precision highp float;
uniform vec2 u_res; uniform float u_time;
float hash(vec2 p){ p=fract(p*vec2(123.34,345.45)); p+=dot(p,p+34.345); return fract(p.x*p.y); }
float noise(vec2 p){
  vec2 i=floor(p), f=fract(p);
  float a=hash(i), b=hash(i+vec2(1.,0.)), c=hash(i+vec2(0.,1.)), d=hash(i+vec2(1.,1.));
  vec2 u=f*f*(3.-2.*f);
  return mix(a,b,u.x)+(c-a)*u.y*(1.-u.x)+(d-b)*u.x*u.y;
}
float fbm(vec2 p){ float v=0.,a=0.5; for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.02; a*=0.5; } return v; }
void main(){
  vec2 uv=(gl_FragCoord.xy-0.5*u_res)/u_res.y;
  float t=u_time*0.05;
  vec2 q=vec2(fbm(uv*1.4+vec2(0.,t)), fbm(uv*1.4+vec2(5.2,-t)));
  vec2 r=vec2(fbm(uv*1.4+q*1.6+vec2(1.7,t*1.3)), fbm(uv*1.4+q*1.6+vec2(8.3,-t*1.1)));
  float d=fbm(uv*1.5+r*2.0);
  d=smoothstep(0.52,0.84,d);
  d*=smoothstep(1.25,0.02,abs(uv.y));
  vec3 smoke=mix(vec3(0.18,0.13,0.36), vec3(0.74,0.66,1.0), pow(d,0.8));
  gl_FragColor=vec4(smoke, d*0.24);
}
`;
const VERT = `attribute vec2 p; void main(){ gl_Position=vec4(p,0.,1.); }`;

export default function SmokeField({
  className = "",
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const opt = { alpha: true, premultipliedAlpha: false, antialias: false } as WebGLContextAttributes;
    const gl = (canvas.getContext("webgl", opt) ||
      canvas.getContext("experimental-webgl", opt)) as WebGLRenderingContext | null;
    if (!gl) return;

    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE); // additive glow

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uT = gl.getUniformLocation(prog, "u_time");
    const uR = gl.getUniformLocation(prog, "u_res");

    const scale = 0.6;
    const resize = () => {
      const w = Math.floor(window.innerWidth * scale);
      const h = Math.floor(window.innerHeight * scale);
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uR, w, h);
    };
    resize();
    window.addEventListener("resize", resize);

    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const start = performance.now();
    const render = (now: number) => {
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(uT, (now - start) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!reduce) raf = requestAnimationFrame(render);
    };
    gl.clearColor(0, 0, 0, 0);
    if (reduce) {
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(uT, 8);
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
      style={{ position: "fixed", inset: 0, width: "100%", height: "100%", zIndex: 0, pointerEvents: "none", ...style }}
    />
  );
}
