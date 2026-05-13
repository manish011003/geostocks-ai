"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import gsap from "gsap";
import type { GeoEvent } from "@/types";
import { latLonToVec3 } from "@/lib/geo";
import { solarPosition } from "@/lib/sun";
import { EXCHANGES, type ExchangeKey } from "@/lib/exchanges";

interface Props {
  events: GeoEvent[];
  theme?: "dark" | "light";
  focusEvent?: GeoEvent | null;
  /** v2: when set, the globe rotates so the exchange's country is centred
   *  and a coloured halo pulses there. Cleared by setting to null. */
  focusExchange?: ExchangeKey | null;
  onMarkerClick?: (event: GeoEvent) => void;
  /** Settings — read on next render and applied on a best-effort basis. */
  autoRotate?: boolean;
  autoRotateSpeed?: number;
  showMarkers?: boolean;
  markerPulse?: boolean;
}

const SEVERITY_COLOR: Record<string, number> = {
  HIGH: 0xff5252,
  MEDIUM: 0xffb74d,
  LOW: 0x00e676,
};

const TEX = {
  day: "https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg",
  night: "https://unpkg.com/three-globe/example/img/earth-night.jpg",
};

interface HoveredEvent {
  ev: GeoEvent;
  x: number;
  y: number;
}

const earthVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldNormal;

  void main() {
    vUv = uv;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const earthFragment = /* glsl */ `
  uniform sampler2D dayTex;
  uniform sampler2D nightTex;
  uniform vec3 sunDir;
  uniform float dayBoost;
  uniform float nightAmbient;
  uniform float cityLightBoost;
  uniform vec3 atmosphereColor;
  uniform vec3 nightTint;     // RGB multiplier for the dark hemisphere
  uniform float terminatorMix; // strength of the warm sunset terminator
  uniform float rimStrength;  // strength of the lit-limb atmosphere bleed

  varying vec2 vUv;
  varying vec3 vWorldNormal;

  void main() {
    vec3 n = normalize(vWorldNormal);
    vec3 s = normalize(sunDir);

    float intensity = dot(n, s);
    float dayMix = smoothstep(-0.15, 0.25, intensity);

    vec3 dayRaw = texture2D(dayTex, vUv).rgb;
    vec3 nightRaw = texture2D(nightTex, vUv).rgb;

    // Night-side continents = day texture × tint × ambient.
    // In light mode we bias tint→neutral and ambient→1.0 so the dark
    // hemisphere fades into the bright page instead of standing out.
    vec3 nightContinents = dayRaw * nightTint * nightAmbient;
    vec3 cityLights = nightRaw * cityLightBoost;
    vec3 night = nightContinents + cityLights;

    vec3 day = dayRaw * dayBoost;

    vec3 color = mix(night, day, dayMix);

    float term = 1.0 - abs(intensity * 5.0);
    term = clamp(term, 0.0, 1.0) * dayMix * (1.0 - dayMix) * 4.0;
    color += vec3(1.0, 0.5, 0.25) * term * terminatorMix;

    float rim = pow(1.0 - max(0.0, intensity), 3.0) * dayMix * rimStrength;
    color += atmosphereColor * rim;

    gl_FragColor = vec4(color, 1.0);
  }
`;

const atmosVertex = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldNormal;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const atmosFragment = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldNormal;
  uniform vec3 glowColor;
  uniform vec3 sunDir;
  uniform float strength;

  void main() {
    float fresnel = pow(0.7 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
    float lit = clamp(dot(normalize(vWorldNormal), normalize(sunDir)), -0.4, 1.0);
    float side = smoothstep(-0.4, 0.6, lit);
    float a = fresnel * (0.35 + 0.9 * side) * strength;
    gl_FragColor = vec4(glowColor, 1.0) * a;
  }
`;

interface SceneRefs {
  camera: THREE.PerspectiveCamera;
  scene: THREE.Scene;
  controls: OrbitControls;
  markersByEventId: Map<string, THREE.Mesh>;
}

export default function Globe({
  events,
  theme = "dark",
  focusEvent,
  focusExchange,
  onMarkerClick,
  autoRotate = true,
  autoRotateSpeed = 0.4,
  showMarkers = true,
  markerPulse = true,
}: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRefs = useRef<SceneRefs | null>(null);
  const onMarkerClickRef = useRef(onMarkerClick);
  const settingsRef = useRef({
    autoRotate,
    autoRotateSpeed,
    showMarkers,
    markerPulse,
  });
  const [hovered, setHovered] = useState<HoveredEvent | null>(null);

  // Keep refs current without remounting the scene
  useEffect(() => {
    onMarkerClickRef.current = onMarkerClick;
  }, [onMarkerClick]);
  useEffect(() => {
    settingsRef.current = {
      autoRotate,
      autoRotateSpeed,
      showMarkers,
      markerPulse,
    };
    const refs = sceneRefs.current;
    if (refs) {
      refs.controls.autoRotate = autoRotate;
      refs.controls.autoRotateSpeed = autoRotateSpeed;
    }
  }, [autoRotate, autoRotateSpeed, showMarkers, markerPulse]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);

    {
      const { lat, lon } = solarPosition(new Date());
      const sub = latLonToVec3(lat, lon, 1);
      const r = 2.6;
      const v = new THREE.Vector3(sub.x, sub.y * 0.4, sub.z)
        .normalize()
        .multiplyScalar(r);
      camera.position.copy(v);
      camera.lookAt(0, 0, 0);
    }

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const loader = new THREE.TextureLoader();
    loader.crossOrigin = "anonymous";
    const dayTex = loader.load(TEX.day);
    const nightTex = loader.load(TEX.night);
    const sRGB = (THREE as unknown as { SRGBColorSpace?: string })
      .SRGBColorSpace;
    if (sRGB) {
      (dayTex as unknown as { colorSpace: string }).colorSpace = sRGB;
      (nightTex as unknown as { colorSpace: string }).colorSpace = sRGB;
    }
    dayTex.anisotropy = 4;
    nightTex.anisotropy = 4;

    const sunDirUniform = { value: new THREE.Vector3(1, 0, 0) };

    const isLight = theme === "light";
    const earthMat = new THREE.ShaderMaterial({
      uniforms: {
        dayTex: { value: dayTex },
        nightTex: { value: nightTex },
        sunDir: sunDirUniform,
        // Day side intensity. Don't push too hard in light mode or oceans
        // saturate to white.
        dayBoost: { value: isLight ? 1.45 : 1.55 },
        // Night-side ambient. In light mode we want the night side almost as
        // bright as the day side so the globe doesn't have a stark dark half.
        nightAmbient: { value: isLight ? 0.95 : 0.45 },
        // City lights are great on a dark background but distracting on white.
        cityLightBoost: { value: isLight ? 0.35 : 2.6 },
        // Cool-blue tint at night in dark mode; neutral/warm on light bg.
        nightTint: {
          value: isLight
            ? new THREE.Color(0.95, 0.92, 0.88)
            : new THREE.Color(0.55, 0.7, 1.0),
        },
        terminatorMix: { value: isLight ? 0.18 : 0.45 },
        rimStrength: { value: isLight ? 0.08 : 0.2 },
        atmosphereColor: {
          value: new THREE.Color(isLight ? 0x2596e1 : 0x4fc3f7),
        },
      },
      vertexShader: earthVertex,
      fragmentShader: earthFragment,
    });

    const earthGeo = new THREE.SphereGeometry(1, 96, 96);
    const earth = new THREE.Mesh(earthGeo, earthMat);
    scene.add(earth);

    const atmosGeo = new THREE.SphereGeometry(1.06, 64, 64);
    const atmosMat = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.BackSide,
      depthWrite: false,
      // Additive blending eats the halo against a white page; switch to
      // normal blend in light mode and dial the strength way down.
      blending: isLight ? THREE.NormalBlending : THREE.AdditiveBlending,
      uniforms: {
        glowColor: {
          value: new THREE.Color(isLight ? 0x6fa8d6 : 0x4fc3f7),
        },
        sunDir: sunDirUniform,
        strength: { value: isLight ? 0.55 : 1.0 },
      },
      vertexShader: atmosVertex,
      fragmentShader: atmosFragment,
    });
    scene.add(new THREE.Mesh(atmosGeo, atmosMat));

    const markers: THREE.Mesh[] = [];
    const halos: THREE.Mesh[] = [];
    const markersByEventId = new Map<string, THREE.Mesh>();
    const markerGroup = new THREE.Group();
    scene.add(markerGroup);

    events.forEach((ev) => {
      const { x, y, z } = latLonToVec3(ev.lat, ev.lon, 1.005);
      const color = SEVERITY_COLOR[ev.severity] ?? SEVERITY_COLOR.LOW;

      const markerGeo = new THREE.SphereGeometry(0.018, 16, 16);
      const markerMat = new THREE.MeshBasicMaterial({ color });
      const marker = new THREE.Mesh(markerGeo, markerMat);
      marker.position.set(x, y, z);
      marker.userData = { event: ev };
      markerGroup.add(marker);
      markers.push(marker);
      markersByEventId.set(ev.id, marker);

      const haloGeo = new THREE.SphereGeometry(0.04, 16, 16);
      const haloMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
      });
      const halo = new THREE.Mesh(haloGeo, haloMat);
      halo.position.set(x, y, z);
      halo.userData = { event: ev };
      markerGroup.add(halo);
      halos.push(halo);
    });

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.autoRotate = settingsRef.current.autoRotate;
    controls.autoRotateSpeed = settingsRef.current.autoRotateSpeed;
    controls.rotateSpeed = 0.5;

    let userInteracted = false;
    let resumeTimer = 0;
    const onStart = () => {
      controls.autoRotate = false;
      userInteracted = true;
      window.clearTimeout(resumeTimer);
    };
    const onEnd = () => {
      window.clearTimeout(resumeTimer);
      resumeTimer = window.setTimeout(() => {
        if (userInteracted && settingsRef.current.autoRotate) {
          controls.autoRotate = true;
          userInteracted = false;
        }
      }, 6000);
    };
    controls.addEventListener("start", onStart);
    controls.addEventListener("end", onEnd);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerInsideCanvas = false;
    let pointerClient = { x: 0, y: 0 };

    const updatePointerFromEvent = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      pointerClient = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const onPointerMove = (e: PointerEvent) => {
      pointerInsideCanvas = true;
      updatePointerFromEvent(e);
    };
    const onPointerLeave = () => {
      pointerInsideCanvas = false;
      setHovered(null);
    };
    const onClick = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(markers, false);
      if (hits.length > 0) {
        const ev = (hits[0].object.userData as { event: GeoEvent }).event;
        setHovered({
          ev,
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        });
        onMarkerClickRef.current?.(ev);
      }
    };

    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerleave", onPointerLeave);
    renderer.domElement.addEventListener("click", onClick);
    renderer.domElement.style.cursor = "grab";
    renderer.domElement.addEventListener("pointerdown", () => {
      renderer.domElement.style.cursor = "grabbing";
    });
    renderer.domElement.addEventListener("pointerup", () => {
      renderer.domElement.style.cursor = "grab";
    });

    const sizeCanvas = () => {
      const w = mount.clientWidth || 320;
      const h = mount.clientHeight || w;
      const s = Math.min(w, h);
      renderer.setSize(s, s, false);
      camera.aspect = 1;
      camera.updateProjectionMatrix();
    };
    sizeCanvas();
    const ro = new ResizeObserver(sizeCanvas);
    ro.observe(mount);

    const updateSun = () => {
      const { lat, lon } = solarPosition(new Date());
      const v = latLonToVec3(lat, lon, 1);
      sunDirUniform.value.set(v.x, v.y, v.z);
    };
    updateSun();
    const sunInterval = window.setInterval(updateSun, 30_000);

    const startTime = performance.now();
    let animId = 0;
    let lastHoverId: string | null = null;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const t = (performance.now() - startTime) / 1000;

      const visible = settingsRef.current.showMarkers;
      markerGroup.visible = visible;

      if (settingsRef.current.markerPulse) {
        markers.forEach((m, i) => {
          const s = 1 + 0.4 * Math.sin(t * 2 + i * 0.6);
          m.scale.setScalar(s);
        });
        halos.forEach((h, i) => {
          const s = 1 + 0.6 * Math.sin(t * 1.2 + i * 0.6);
          h.scale.setScalar(s);
          const mat = h.material as THREE.MeshBasicMaterial;
          mat.opacity = 0.18 + 0.18 * Math.abs(Math.sin(t * 1.2 + i));
        });
      }

      if (visible && pointerInsideCanvas && markers.length) {
        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObjects(markers, false);
        if (hits.length > 0) {
          const ev = (hits[0].object.userData as { event: GeoEvent }).event;
          renderer.domElement.style.cursor = "pointer";
          if (ev.id !== lastHoverId) {
            lastHoverId = ev.id;
            setHovered({ ev, x: pointerClient.x, y: pointerClient.y });
          } else {
            setHovered((prev) =>
              prev ? { ...prev, x: pointerClient.x, y: pointerClient.y } : prev
            );
          }
        } else if (lastHoverId) {
          lastHoverId = null;
          renderer.domElement.style.cursor = "grab";
          setHovered(null);
        }
      }

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    sceneRefs.current = { camera, scene, controls, markersByEventId };

    return () => {
      cancelAnimationFrame(animId);
      window.clearInterval(sunInterval);
      window.clearTimeout(resumeTimer);
      ro.disconnect();
      controls.removeEventListener("start", onStart);
      controls.removeEventListener("end", onEnd);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerleave", onPointerLeave);
      renderer.domElement.removeEventListener("click", onClick);
      controls.dispose();
      earthGeo.dispose();
      earthMat.dispose();
      atmosGeo.dispose();
      atmosMat.dispose();
      dayTex.dispose();
      nightTex.dispose();
      markers.forEach((m) => {
        (m.geometry as THREE.BufferGeometry).dispose();
        (m.material as THREE.Material).dispose();
      });
      halos.forEach((h) => {
        (h.geometry as THREE.BufferGeometry).dispose();
        (h.material as THREE.Material).dispose();
      });
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }
      sceneRefs.current = null;
    };
  }, [events, theme]);

  // ----- Focus animation -----
  useEffect(() => {
    if (!focusEvent) return;
    const refs = sceneRefs.current;
    if (!refs) return;
    const { camera, controls, scene, markersByEventId } = refs;

    // Disable autorotate while focused
    controls.autoRotate = false;

    const dest = latLonToVec3(focusEvent.lat, focusEvent.lon, 1);
    const r = camera.position.length();
    const target = new THREE.Vector3(dest.x, dest.y, dest.z)
      .normalize()
      .multiplyScalar(r);

    const tween = gsap.to(camera.position, {
      x: target.x,
      y: target.y,
      z: target.z,
      duration: 1.2,
      ease: "power2.inOut",
      onUpdate: () => camera.lookAt(0, 0, 0),
    });

    // Pulsing ring at the marker
    const marker = markersByEventId.get(focusEvent.id);
    let ring: THREE.Mesh | null = null;
    let ringMat: THREE.MeshBasicMaterial | null = null;
    if (marker) {
      const color =
        SEVERITY_COLOR[focusEvent.severity] ?? SEVERITY_COLOR.LOW;
      const ringGeo = new THREE.RingGeometry(0.04, 0.07, 32);
      ringMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.copy(marker.position);
      ring.lookAt(new THREE.Vector3(0, 0, 0));
      // Flip so the ring opens away from the globe surface
      ring.rotateY(Math.PI);
      scene.add(ring);

      gsap.fromTo(
        ring.scale,
        { x: 0.6, y: 0.6, z: 0.6 },
        { x: 4, y: 4, z: 4, duration: 1, ease: "power1.out", repeat: 2 }
      );
      gsap.fromTo(
        ringMat,
        { opacity: 0.85 },
        { opacity: 0, duration: 1, ease: "power1.out", repeat: 2 }
      );
    }

    return () => {
      tween.kill();
      if (ring) {
        gsap.killTweensOf(ring.scale);
        if (ringMat) gsap.killTweensOf(ringMat);
        scene.remove(ring);
        ring.geometry.dispose();
        (ring.material as THREE.Material).dispose();
      }
      // Allow autorotate to come back via the prop, the parent decides.
    };
  }, [focusEvent]);

  // ----- Exchange focus animation -----
  useEffect(() => {
    if (!focusExchange) return;
    const refs = sceneRefs.current;
    if (!refs) return;
    const { camera, controls, scene } = refs;
    const ex = EXCHANGES[focusExchange];
    if (!ex) return;

    controls.autoRotate = false;

    const dest = latLonToVec3(ex.globe.lat, ex.globe.lon, 1);
    const r = camera.position.length();
    const target = new THREE.Vector3(dest.x, dest.y, dest.z)
      .normalize()
      .multiplyScalar(r);

    const tween = gsap.to(camera.position, {
      x: target.x,
      y: target.y,
      z: target.z,
      duration: 1.4,
      ease: "power2.inOut",
      onUpdate: () => camera.lookAt(0, 0, 0),
    });

    // Pulsing halo at the exchange's home city
    const surface = latLonToVec3(ex.globe.lat, ex.globe.lon, 1.01);
    const haloGeo = new THREE.RingGeometry(0.05, 0.085, 48);
    const haloMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(ex.color),
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.position.set(surface.x, surface.y, surface.z);
    halo.lookAt(new THREE.Vector3(0, 0, 0));
    halo.rotateY(Math.PI);
    scene.add(halo);

    gsap.fromTo(
      halo.scale,
      { x: 0.6, y: 0.6, z: 0.6 },
      { x: 5, y: 5, z: 5, duration: 1.4, ease: "power1.out", repeat: 2 }
    );
    gsap.fromTo(
      haloMat,
      { opacity: 0.85 },
      { opacity: 0, duration: 1.4, ease: "power1.out", repeat: 2 }
    );

    return () => {
      tween.kill();
      gsap.killTweensOf(halo.scale);
      gsap.killTweensOf(haloMat);
      scene.remove(halo);
      halo.geometry.dispose();
      (halo.material as THREE.Material).dispose();
    };
  }, [focusExchange]);

  return (
    <div
      className="globe-mount"
      ref={mountRef}
      style={{ position: "relative" }}
    >
      {hovered ? (
        <div
          className="globe-tooltip"
          style={{ left: hovered.x, top: hovered.y }}
        >
          <div className="title">{hovered.ev.title}</div>
          <div className="meta">
            <span>{hovered.ev.region}</span>
            <span className={`severity ${hovered.ev.severity}`}>
              {hovered.ev.severity}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
