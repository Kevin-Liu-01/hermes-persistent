"use client";

import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import { Logo, type Mark } from "@/components/Logo";

type StationDef = {
	agent: string | null;
	mark: Mark;
	tone: "currentColor" | "native";
	theta: number;
	phi: number;
	hue: string;
};

const STATIONS: StationDef[] = [
	{ agent: "hermes", mark: "nous", tone: "currentColor", theta: 0, phi: 0.3, hue: "#7c8cf8" },
	{ agent: "openclaw", mark: "openclaw", tone: "currentColor", theta: (Math.PI * 2) / 5, phi: 0.5, hue: "#e5443b" },
	{ agent: "claude-code", mark: "anthropic", tone: "currentColor", theta: (Math.PI * 4) / 5, phi: 0.2, hue: "#d4a574" },
	{ agent: "codex", mark: "openai", tone: "currentColor", theta: (Math.PI * 6) / 5, phi: 0.4, hue: "#4ae0a0" },
	{ agent: null, mark: "cursor", tone: "currentColor", theta: (Math.PI * 8) / 5, phi: 0.35, hue: "#d2beff" },
];

const LOGO_ORBIT_R = 1.8;
const CAMERA_ORBIT_R = 4.2;
const LERP_SPEED = 3.0;

function stationLogoPos(s: StationDef): [number, number, number] {
	return [
		LOGO_ORBIT_R * Math.sin(s.theta),
		s.phi,
		LOGO_ORBIT_R * Math.cos(s.theta),
	];
}

function stationCameraPos(s: StationDef): THREE.Vector3 {
	return new THREE.Vector3(
		CAMERA_ORBIT_R * Math.sin(s.theta),
		s.phi * 0.6 + 0.2,
		CAMERA_ORBIT_R * Math.cos(s.theta),
	);
}

function readPurple(): string {
	if (typeof window === "undefined") return "#AAA5E6";
	const v = getComputedStyle(document.documentElement)
		.getPropertyValue("--ret-purple")
		.trim();
	return v || "#AAA5E6";
}

/* ── Dodecahedron + orbit rings center ── */

function GemCore() {
	const ref = useRef<THREE.Group>(null);
	const purple = useMemo(readPurple, []);
	const gem = useMemo(() => new THREE.DodecahedronGeometry(1.1, 0), []);
	const ring = useMemo(() => new THREE.TorusGeometry(1.4, 0.02, 6, 24), []);

	useFrame((_, delta) => {
		if (ref.current) {
			ref.current.rotation.y += delta * 0.06;
			ref.current.rotation.x += delta * 0.015;
		}
	});

	return (
		<group ref={ref}>
			<lineSegments>
				<wireframeGeometry args={[gem]} />
				<lineBasicMaterial color={purple} transparent opacity={0.5} />
			</lineSegments>
			<lineSegments rotation={[Math.PI / 2, 0, 0]}>
				<wireframeGeometry args={[ring]} />
				<lineBasicMaterial color={purple} transparent opacity={0.25} />
			</lineSegments>
			<lineSegments rotation={[Math.PI / 3, Math.PI / 4, 0]}>
				<wireframeGeometry args={[ring]} />
				<lineBasicMaterial color={purple} transparent opacity={0.18} />
			</lineSegments>
			<lineSegments rotation={[Math.PI / 6, -Math.PI / 3, Math.PI / 5]}>
				<wireframeGeometry args={[ring]} />
				<lineBasicMaterial color={purple} transparent opacity={0.12} />
			</lineSegments>
		</group>
	);
}

function CursorIcon({ size }: { size: number }) {
	return (
		<svg
			viewBox="80 60 360 400"
			fill="currentColor"
			width={size}
			height={size}
		>
			<path d="m415.035 156.35-151.503-87.4695c-4.865-2.8094-10.868-2.8094-15.733 0l-151.4969 87.4695c-4.0897 2.362-6.6146 6.729-6.6146 11.459v176.383c0 4.73 2.5249 9.097 6.6146 11.458l151.5039 87.47c4.865 2.809 10.868 2.809 15.733 0l151.504-87.47c4.089-2.361 6.614-6.728 6.614-11.458v-176.383c0-4.73-2.525-9.097-6.614-11.459zm-9.516 18.528-146.255 253.32c-.988 1.707-3.599 1.01-3.599-.967v-165.872c0-3.314-1.771-6.379-4.644-8.044l-143.645-82.932c-1.707-.988-1.01-3.599.968-3.599h292.509c4.154 0 6.75 4.503 4.673 8.101h-.007z" />
		</svg>
	);
}

/* ── Single logo station ── */

function LogoStation({
	station,
	active,
}: {
	station: StationDef;
	active: boolean;
}) {
	const pos = stationLogoPos(station);

	return (
		<group position={pos}>
			<Html
				center
				sprite
				distanceFactor={4}
				zIndexRange={active ? [100, 90] : [10, 0]}
			>
				<div
					style={{
						opacity: active ? 1 : 0.2,
						transition: "opacity 0.4s ease",
						pointerEvents: "none",
						zIndex: active ? 100 : 0,
					}}
				>
					<div
						style={{
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							width: 56,
							height: 56,
							borderRadius: 14,
							background: "#0a0a0c",
							boxShadow: active
								? `0 0 20px ${station.hue}, 0 0 40px ${station.hue}44`
								: "none",
							border: "1px solid rgba(255,255,255,0.08)",
							color: "#ededed",
							overflow: "hidden",
						}}
					>
						{station.mark === "cursor" ? (
							<CursorIcon size={32} />
						) : (
							<Logo mark={station.mark} size={32} tone="currentColor" />
						)}
					</div>
				</div>
			</Html>
			{active && (
				<pointLight
					color={station.hue}
					intensity={0.8}
					distance={3}
					decay={2}
				/>
			)}
		</group>
	);
}

/* ── Orbital camera controller ── */

const ZOOM_OUT_SCALE = 2.4;

function OrbitalCamera({
	targetIdx,
	introActive,
}: {
	targetIdx: number;
	introActive: boolean;
}) {
	const { camera } = useThree();
	const targetPos = useRef(stationCameraPos(STATIONS[0]));
	const lookAtTarget = useRef(new THREE.Vector3(...stationLogoPos(STATIONS[0])));
	const currentLook = useRef(new THREE.Vector3(...stationLogoPos(STATIONS[0])));
	const zoomFactor = useRef(introActive ? ZOOM_OUT_SCALE : 1);

	const introAngle = useRef(0);

	useEffect(() => {
		if (!introActive) {
			targetPos.current = stationCameraPos(STATIONS[targetIdx]);
			const [x, y, z] = stationLogoPos(STATIONS[targetIdx]);
			lookAtTarget.current.set(x, y, z);
		}
	}, [targetIdx, introActive]);

	useFrame((_, delta) => {
		if (introActive) {
			introAngle.current += delta * 2.5;
			const r = CAMERA_ORBIT_R * ZOOM_OUT_SCALE;
			camera.position.set(
				r * Math.sin(introAngle.current),
				1.2,
				r * Math.cos(introAngle.current),
			);
			camera.lookAt(0, 0, 0);
		} else {
			const t = 1 - Math.exp(-LERP_SPEED * delta);
			camera.position.lerp(targetPos.current, t);
			currentLook.current.lerp(lookAtTarget.current, t);
			camera.lookAt(currentLook.current);
		}
	});

	return null;
}

/* ── Faint connecting lines from center to each station ── */

function OrbitalRails() {
	const purple = useMemo(readPurple, []);
	const geom = useMemo(() => {
		const pts: THREE.Vector3[] = [];
		for (const s of STATIONS) {
			pts.push(new THREE.Vector3(0, 0, 0));
			const [x, y, z] = stationLogoPos(s);
			pts.push(new THREE.Vector3(x, y, z));
		}
		const g = new THREE.BufferGeometry();
		g.setFromPoints(pts);
		return g;
	}, []);

	return (
		<lineSegments geometry={geom}>
			<lineBasicMaterial color={purple} transparent opacity={0.12} />
		</lineSegments>
	);
}

/* ── Main exported scene ── */

type Props = {
	activeAgent: string | null;
};

export function HeroOrbitScene({ activeAgent }: Props) {
	const [introIdx, setIntroIdx] = useState<number | null>(0);
	const [introActive, setIntroActive] = useState(true);
	const spinCount = useRef(0);

	useEffect(() => {
		let timer: ReturnType<typeof setTimeout>;

		function tick() {
			spinCount.current += 1;
			setIntroIdx((prev) => {
				const next = ((prev ?? 0) + 1) % STATIONS.length;
				return next;
			});

			if (spinCount.current >= 15) {
				setIntroIdx(null);
				setIntroActive(false);
				return;
			}

			const delay = 100 + spinCount.current * 22;
			timer = setTimeout(tick, delay);
		}

		timer = setTimeout(tick, 300);
		return () => clearTimeout(timer);
	}, []);

	const activeIdx = useMemo(() => {
		if (introIdx !== null) return introIdx;
		const idx = STATIONS.findIndex((s) => s.agent === activeAgent);
		return idx >= 0 ? idx : 0;
	}, [introIdx, activeAgent]);

	return (
		<>
			<OrbitalCamera targetIdx={activeIdx} introActive={introActive} />
			<ambientLight intensity={0.3} />
			<GemCore />
			<OrbitalRails />
			{STATIONS.map((s, i) => (
				<LogoStation key={s.agent ?? "cursor"} station={s} active={i === activeIdx} />
			))}
		</>
	);
}
