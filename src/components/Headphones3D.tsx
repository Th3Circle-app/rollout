import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Environment, Lightformer, ContactShadows, useGLTF } from "@react-three/drei";
import { EffectComposer, Bloom, Noise } from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
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
        gl={{ antialias: true, alpha: true }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.15;
        }}
      >
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

        <EffectComposer>
          <Bloom luminanceThreshold={0.6} luminanceSmoothing={0.9} intensity={0.55} mipmapBlur />
          <Noise premultiply blendFunction={BlendFunction.OVERLAY} opacity={0.03} />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
