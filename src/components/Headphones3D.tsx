import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Float, Environment, Lightformer, ContactShadows, useGLTF } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

// Rollout's cinematic hero: a real high-poly headphones GLB re-skinned in a
// premium physical material, lit three-point, graded with ACES film tone
// mapping + bloom + grain, grounded by a soft contact shadow, and given a
// cinematic settle-in. Follows the pointer, idles with a slow float.
//
// Model: "Premium 3D Headphone Model" by marukanha31 (sketchfab.com/marukanha31),
// CC-BY-4.0 — commercial use allowed, credited in the site footer. Meshopt-
// compressed (36MB -> ~3.9MB) via gltfpack; drei's useGLTF decodes meshopt.
const MODEL = "/models/headphones-premium.glb";
useGLTF.preload(MODEL);

const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);

// Respect the OS "reduce motion" setting: no idle spin, no cursor lean, no float
// — the hero settles to a still pose instead of animating continuously.
const PREFERS_REDUCED =
  typeof window !== "undefined" &&
  !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// The violet glass blob — the raymarched metaball from the Handshake "Mimetic"
// artifact, rendered as a fullscreen background INSIDE this same 3D canvas so it
// shares the ONE WebGL context (a separate WebGL canvas gets evicted by three.js
// and paints white on Harrison's machine). Transparent except the orb, so the
// stars + smoke behind this canvas show through. Reacts to cursor + scroll.
const BLOB_FRAG = `
precision highp float;
uniform float uT; uniform vec2 uR; uniform float uScroll; uniform vec2 uMouse;
mat3 rotX(float a){float s=sin(a),c=cos(a);return mat3(1.,0.,0.,0.,c,-s,0.,s,c);}
mat3 rotY(float a){float s=sin(a),c=cos(a);return mat3(c,0.,s,0.,1.,0.,-s,0.,c);}
float smin(float a,float b,float k){float h=clamp(0.5+0.5*(b-a)/k,0.,1.);return mix(b,a,h)-k*h*(1.-h);}
float sph(vec3 p,float r){return length(p)-r;}
float map(vec3 p){
  float t=uT*0.12+uScroll*3.14159;
  p=rotY(t)*rotX(t*0.55)*p;
  float d=sph(p,0.92);
  d=smin(d,sph(p-vec3(0.70*sin(uT*0.30),0.60*cos(uT*0.40),0.30),0.55),0.55);
  d=smin(d,sph(p-vec3(-0.60,0.50*sin(uT*0.50),0.40*cos(uT*0.30)),0.50),0.55);
  d=smin(d,sph(p-vec3(0.20,-0.70,0.60*sin(uT*0.35)),0.50),0.55);
  return d;
}
vec3 nrm(vec3 p){vec2 e=vec2(0.0013,0.);return normalize(vec3(map(p+e.xyy)-map(p-e.xyy),map(p+e.yxy)-map(p-e.yxy),map(p+e.yyx)-map(p-e.yyx)));}
void main(){
  vec2 uv=(gl_FragCoord.xy-0.5*uR)/uR.y;
  // INDEPENDENT of the headphones: the blob drifts toward the cursor most when
  // it's out in the background, and settles when the cursor is over the centred
  // headphones — so the two never move in lockstep.
  float eng=clamp(length(uMouse-0.5)/0.34,0.0,1.0);
  vec3 ro=vec3((uMouse.x-0.5)*1.3*eng,(uMouse.y-0.5)*1.0*eng,3.3);
  vec3 rd=normalize(vec3(uv,-1.7));
  float t=0.;vec3 p=ro;bool hit=false;
  for(int i=0;i<52;i++){p=ro+rd*t;float d=map(p);if(d<0.0015){hit=true;break;}t+=d*0.9;if(t>9.)break;}
  if(!hit){gl_FragColor=vec4(0.);return;}
  vec3 n=nrm(p);
  vec3 ld=normalize(vec3(0.5,0.85,0.6));
  float diff=clamp(dot(n,ld),0.,1.);
  float fres=pow(1.-clamp(dot(n,-rd),0.,1.),3.0);
  vec3 violet=vec3(0.55,0.36,0.97);
  vec3 magenta=vec3(0.80,0.42,0.98);
  vec3 base=mix(vec3(0.07,0.04,0.14),vec3(0.20,0.12,0.38),diff);
  vec3 col=base + mix(violet,magenta,fres*0.5)*fres*1.6 + violet*diff*0.14;
  float alpha=clamp(0.34+fres*0.55,0.,0.86);
  gl_FragColor=vec4(col, alpha);
}
`;
const BLOB_VERT = `void main(){ gl_Position=vec4(position.xy, 0.999, 1.0); }`;

function Blob() {
  const mat = useRef<THREE.ShaderMaterial>(null);
  const { gl } = useThree();
  const target = useRef({ x: 0.5, y: 0.5 });
  const cur = useRef({ x: 0.5, y: 0.5 });
  const uniforms = useMemo(
    () => ({
      uT: { value: 0 },
      uR: { value: new THREE.Vector2(1, 1) },
      uMouse: { value: new THREE.Vector2(0.5, 0.5) },
      uScroll: { value: 0 },
    }),
    []
  );
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    return g;
  }, []);
  useEffect(() => {
    if (PREFERS_REDUCED) return;
    const onMove = (e: PointerEvent) => {
      target.current.x = e.clientX / window.innerWidth;
      target.current.y = 1 - e.clientY / window.innerHeight;
    };
    const onLeave = () => {
      target.current.x = 0.5;
      target.current.y = 0.5;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
    };
  }, []);
  const tmp = useMemo(() => new THREE.Vector2(), []);
  useFrame((state) => {
    // update the MATERIAL's own uniforms (not the local object) so the clock,
    // mouse, and scroll actually reach the shader every frame — this is what
    // drives the continuous rotate + metaball morph.
    const u = mat.current?.uniforms;
    if (!u) return;
    cur.current.x += (target.current.x - cur.current.x) * 0.06;
    cur.current.y += (target.current.y - cur.current.y) * 0.06;
    gl.getDrawingBufferSize(tmp);
    u.uT.value = PREFERS_REDUCED ? 4 : state.clock.elapsedTime;
    u.uR.value.set(tmp.x, tmp.y);
    u.uMouse.value.set(cur.current.x, cur.current.y);
    u.uScroll.value = Math.min(1, window.scrollY / window.innerHeight);
  });
  return (
    <mesh geometry={geo} renderOrder={-10} frustumCulled={false}>
      <shaderMaterial
        ref={mat}
        vertexShader={BLOB_VERT}
        fragmentShader={BLOB_FRAG}
        uniforms={uniforms}
        transparent
        depthTest={true}
        depthWrite={false}
      />
    </mesh>
  );
}

// The original drifting smoke — domain-warped fbm wisps that shift from deep
// violet to bright lavender as they curl (the "white to purple" smoke). Rendered
// in the SAME WebGL context as the blob + headphones (renderOrder between them),
// additively blended so it glows against the dark. This is the shader version;
// the CSS haze was a stopgap while the separate WebGL canvas kept whiting out.
const SMOKE_FRAG = `
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
  gl_FragColor=vec4(smoke, d*0.26);
}
`;

function Smoke() {
  const mat = useRef<THREE.ShaderMaterial>(null);
  const { gl } = useThree();
  const uniforms = useMemo(
    () => ({ u_time: { value: 0 }, u_res: { value: new THREE.Vector2(1, 1) } }),
    []
  );
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    return g;
  }, []);
  const tmp = useMemo(() => new THREE.Vector2(), []);
  useFrame((state) => {
    const u = mat.current?.uniforms;
    if (!u) return;
    gl.getDrawingBufferSize(tmp);
    u.u_time.value = PREFERS_REDUCED ? 8 : state.clock.elapsedTime;
    u.u_res.value.set(tmp.x, tmp.y);
  });
  return (
    <mesh geometry={geo} renderOrder={-5} frustumCulled={false}>
      <shaderMaterial
        ref={mat}
        vertexShader={BLOB_VERT}
        fragmentShader={SMOKE_FRAG}
        uniforms={uniforms}
        transparent
        depthTest={true}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

function Headphones({ scaleMul = 1, offsetY = 0 }: { scaleMul?: number; offsetY?: number }) {
  const group = useRef<THREE.Group>(null);
  const target = useRef({ x: 0, y: 0 });
  const intro = useRef(0);
  const { scene } = useGLTF(MODEL);

  const { object, scale, center } = useMemo(() => {
    const s = scene.clone(true);
    const mat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color("#16161d"),
      metalness: 0.72,
      roughness: 0.38,
      clearcoat: 1,
      clearcoatRoughness: 0.28,
      envMapIntensity: 1.45,
      reflectivity: 0.6,
    });
    s.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.material = mat;
        m.castShadow = true;
      }
    });
    const box = new THREE.Box3().setFromObject(s);
    const size = new THREE.Vector3();
    const c = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(c);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    return { object: s, scale: 2.7 / maxDim, center: c };
  }, [scene]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      target.current.x = e.clientX / window.innerWidth - 0.5;
      target.current.y = e.clientY / window.innerHeight - 0.5;
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    // cinematic settle-in over ~1.6s: rise in scale, unwind an initial rotation.
    // With reduced-motion the settle snaps to done so nothing animates over time.
    intro.current = PREFERS_REDUCED ? 1 : Math.min(1, intro.current + delta / 1.6);
    const p = easeOutCubic(intro.current);
    g.scale.setScalar(0.82 + 0.18 * p);
    const spin = PREFERS_REDUCED ? 0 : state.clock.elapsedTime * 0.1;
    const introSpin = (1 - p) * -1.5;
    // INDEPENDENT reaction: the headphones only lean toward the cursor when it's
    // over them (near screen centre). Out in the blob's field they ignore the
    // cursor and just idle-float — so they're no longer linked to the blob.
    // Reduced-motion disables the lean entirely (engage=0 -> a still pose).
    const dist = Math.hypot(target.current.x, target.current.y);
    const engage = PREFERS_REDUCED ? 0 : THREE.MathUtils.clamp(1 - dist / 0.4, 0, 1);
    g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, target.current.x * 0.95 * engage + spin + introSpin, 0.09);
    g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, target.current.y * 0.5 * engage, 0.09);
  });

  return (
    <group ref={group} position={[0, offsetY, 0]}>
      <group scale={scale * scaleMul}>
        <group position={[-center.x, -center.y, -center.z]}>
          <primitive object={object} />
        </group>
      </group>
    </group>
  );
}

export default function Headphones3D({ className, style, scaleMul = 1, offsetY = 0 }: { className?: string; style?: React.CSSProperties; scaleMul?: number; offsetY?: number }) {
  const [supported, setSupported] = useState(true);
  useEffect(() => {
    try {
      const c = document.createElement("canvas");
      if (!c.getContext("webgl") && !c.getContext("experimental-webgl")) setSupported(false);
    } catch {
      setSupported(false);
    }
  }, []);
  if (!supported) return null;

  return (
    <div
      className={className}
      style={{ position: "fixed", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 1, ...style }}
      aria-hidden
    >
      <Canvas
        camera={{ position: [0, 0.2, 4.3], fov: 40 }}
        dpr={[1, 1.6]}
        // Transparent canvas so the blob / stars / smoke behind it show through.
        // Keep premultipliedAlpha at its DEFAULT (true): with `false`, a fully
        // transparent clear divides by zero when compositing and renders WHITE.
        gl={{ antialias: true, alpha: true }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.15;
          gl.setClearColor(0x000000, 0); // transparent
        }}
      >
        {/* atmosphere in the SAME WebGL context — blob (back), smoke (mid) */}
        <Blob />
        <Smoke />
        {/* three-point lighting for drama */}
        <ambientLight intensity={0.35} />
        <directionalLight position={[4, 6, 4]} intensity={3.2} />
        <directionalLight position={[-5, 2, -3]} intensity={2.2} color="#8b5cf6" />
        <spotLight position={[0, 6, 3]} angle={0.5} penumbra={1} intensity={5} color="#c8bcff" />
        <pointLight position={[0, -3, 2]} intensity={5} color="#4b2fa0" />

        <Suspense fallback={null}>
          <Float
            speed={PREFERS_REDUCED ? 0 : 1.1}
            rotationIntensity={PREFERS_REDUCED ? 0 : 0.12}
            floatIntensity={PREFERS_REDUCED ? 0 : 0.7}
          >
            <Headphones scaleMul={scaleMul} offsetY={offsetY} />
          </Float>
          <ContactShadows position={[0, -1.7, 0]} opacity={0.55} scale={9} blur={2.8} far={4.5} color="#05010f" />
          <Environment resolution={256}>
            <Lightformer intensity={2.8} position={[0, 3, 2]} scale={[7, 7, 1]} color="#c8bcff" />
            <Lightformer intensity={1.7} position={[-4, 1, 1]} scale={[3, 3, 1]} color="#8b5cf6" />
            <Lightformer intensity={1.3} position={[4, -1, 1]} scale={[3, 3, 1]} color="#ffffff" />
            <Lightformer intensity={1} position={[0, -3, -2]} scale={[6, 3, 1]} color="#3a1f7a" />
          </Environment>
        </Suspense>
      </Canvas>
    </div>
  );
}
