import React, { useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { BeadQualityResult, WeldingParameters } from '../../types';

interface R3FBeadVisualizerProps {
  result: BeadQualityResult;
  parameters: WeldingParameters;
}

const SceneContent: React.FC<{
  result: BeadQualityResult;
  parameters: WeldingParameters;
  showHAZ: boolean;
}> = ({ result, parameters, showHAZ }) => {
  const plateWidth = 140; // mm along seam (X)
  const plateDepth = 70;  // mm across seam (Z)
  const plateThickness = Math.max(3, parameters.materialThickness_mm * 2);

  const plateColor = useMemo(() => {
    switch (parameters.material) {
      case 'aluminum_4043':
        return '#d1d5db';
      case 'stainless_304':
        return '#94a3b8';
      default:
        return '#475569';
    }
  }, [parameters.material]);

  // Procedural Weld Bead Curve
  const { curve, beadRadius } = useMemo(() => {
    const beadSegments = result.beadSegments && result.beadSegments.length > 0
      ? result.beadSegments
      : [{ width_mm: 7, height_mm: 2.5, penetration_mm: 2, y_mm: 0 }];
    const length = plateWidth * 0.9;
    const numRipples = 100;
    const points: THREE.Vector3[] = [];

    for (let i = 0; i <= numRipples; i++) {
      const t = i / numRipples;
      const x = -length / 2 + t * length;
      const segIdx = Math.min(beadSegments.length - 1, Math.floor(t * beadSegments.length));
      const seg = beadSegments[segIdx];

      // Physical solidify ripples (MIG crown chevron pattern)
      const rippleHeight = Math.sin(i * 1.8) * (seg.height_mm * 0.12);
      const y = Math.max(0.2, seg.height_mm + rippleHeight);
      const z = (seg.y_mm || 0) * 0.5;

      points.push(new THREE.Vector3(x, y, z));
    }

    const path = new THREE.CatmullRomCurve3(points);
    const radius = Math.max(1.5, result.meanBeadWidth_mm * 0.45);
    return { curve: path, beadRadius: radius };
  }, [result, plateWidth]);

  // Procedural Spatter buffer attributes
  const spatterPositions = useMemo(() => {
    const hasSpatterDefect = result.defects.some((d) => d.id.includes('spatter'));
    const particleCount = hasSpatterDefect ? 150 : 30;
    const positions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * plateWidth * 0.8;
      positions[i * 3 + 1] = 0.5 + Math.random() * 1.5;
      positions[i * 3 + 2] = (Math.random() - 0.5) * plateDepth * 0.7;
    }
    return positions;
  }, [result, plateWidth, plateDepth]);

  const beadColor = useMemo(() => {
    if (result.overallScore >= 80) return '#d97706'; // Gold crown
    if (result.overallScore >= 60) return '#ca8a04'; // Medium amber
    return '#78716c'; // Cold/slag gray
  }, [result.overallScore]);

  return (
    <>
      <ambientLight intensity={1.5} />
      <directionalLight position={[50, 80, 50]} intensity={1.8} castShadow />
      <directionalLight position={[-50, 40, -50]} intensity={0.8} />

      {/* Plate Geometry */}
      {parameters.jointType === 't_fillet' ? (
        <>
          <mesh position={[0, -plateThickness / 2, 0]} receiveShadow castShadow>
            <boxGeometry args={[plateWidth, plateThickness, plateDepth]} />
            <meshStandardMaterial color={plateColor} metalness={0.85} roughness={0.35} />
          </mesh>
          <mesh position={[0, plateDepth / 4, -plateThickness / 2]} receiveShadow castShadow>
            <boxGeometry args={[plateWidth, plateDepth / 2, plateThickness]} />
            <meshStandardMaterial color={plateColor} metalness={0.85} roughness={0.35} />
          </mesh>
        </>
      ) : (
        <>
          <mesh position={[0, -plateThickness / 2, -(plateDepth / 4 + 1)]} receiveShadow castShadow>
            <boxGeometry args={[plateWidth, plateThickness, (plateDepth - 2) / 2]} />
            <meshStandardMaterial color={plateColor} metalness={0.85} roughness={0.35} />
          </mesh>
          <mesh position={[0, -plateThickness / 2, plateDepth / 4 + 1]} receiveShadow castShadow>
            <boxGeometry args={[plateWidth, plateThickness, (plateDepth - 2) / 2]} />
            <meshStandardMaterial color={plateColor} metalness={0.85} roughness={0.35} />
          </mesh>
        </>
      )}

      {/* Heat Affected Zone Thermal boundary */}
      {showHAZ && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.2, 0]}>
          <planeGeometry args={[plateWidth, result.meanBeadWidth_mm * 2.8]} />
          <meshBasicMaterial color="#9333ea" transparent opacity={0.35} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Solidified Weld Crown */}
      <mesh castShadow receiveShadow>
        <tubeGeometry args={[curve, 80, beadRadius, 12, false]} />
        <meshStandardMaterial color={beadColor} metalness={0.95} roughness={0.2} />
      </mesh>

      {/* Spatters */}
      <points>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[spatterPositions, 3]}
          />
        </bufferGeometry>
        <pointsMaterial color="#f59e0b" size={1.2} sizeAttenuation />
      </points>
    </>
  );
};

export const R3FBeadVisualizer: React.FC<R3FBeadVisualizerProps> = ({ result, parameters }) => {
  const [viewMode, setViewMode] = useState<'3d' | 'cross_section'>('3d');
  const [showHAZ, setShowHAZ] = useState(true);

  return (
    <div className="w-full bg-slate-900/90 rounded-2xl border border-slate-800 p-4 shadow-xl overflow-hidden flex flex-col">
      {/* Visualizer header metrics */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Procedural 3D Bead Analysis (R3F)
          </span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-cyan-950 border border-cyan-800 text-cyan-300">
            W: {result.meanBeadWidth_mm}mm | H: {result.meanBeadHeight_mm}mm | P: {result.meanPenetration_mm}mm
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setViewMode('3d')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
              viewMode === '3d' ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            3D View (R3F)
          </button>
          <button
            onClick={() => setViewMode('cross_section')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
              viewMode === 'cross_section' ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            2D Cross-Section Diagram
          </button>
        </div>
      </div>

      {viewMode === '3d' ? (
        <div className="relative w-full h-64 md:h-72 rounded-xl overflow-hidden bg-slate-950 border border-slate-800/80">
          <Canvas
            camera={{ position: [0, 70, 110], fov: 45 }}
            style={{ width: '100%', height: '100%' }}
          >
            <color attach="background" args={['#090d16']} />
            <SceneContent result={result} parameters={parameters} showHAZ={showHAZ} />
            <OrbitControls enableZoom={true} maxPolarAngle={Math.PI / 2 - 0.05} />
          </Canvas>

          <div className="absolute bottom-2 left-3 text-[10px] text-slate-400 bg-slate-900/80 px-2 py-1 rounded-md border border-slate-700/50 pointer-events-none z-10">
            Drag to Rotate &bull; Heat-Affected Zone (Purple Plane) &bull; Solidified Metal Crown (Gold)
          </div>

          <div className="absolute top-2 right-2 flex gap-1 z-10">
            <button
              onClick={() => setShowHAZ(!showHAZ)}
              className={`px-2 py-1 rounded-lg text-[11px] font-medium border transition ${
                showHAZ ? 'bg-purple-900/60 border-purple-500 text-purple-200' : 'bg-slate-800 border-slate-700 text-slate-400'
              }`}
              title="Toggle Heat Affected Zone visualization"
            >
              HAZ
            </button>
          </div>
        </div>
      ) : (
        <div className="w-full h-64 md:h-72 rounded-xl bg-slate-950 border border-slate-800/80 p-4 flex flex-col justify-center items-center">
          <svg viewBox="0 0 400 200" className="w-full max-w-md h-full">
            <defs>
              <linearGradient id="basePlateGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#475569" />
                <stop offset="100%" stopColor="#334155" />
              </linearGradient>
              <linearGradient id="weldCrownGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f59e0b" />
                <stop offset="100%" stopColor="#d97706" />
              </linearGradient>
              <linearGradient id="penetrationGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#b45309" />
                <stop offset="100%" stopColor="#78350f" />
              </linearGradient>
              <radialGradient id="hazGrad" cx="50%" cy="50%" r="50%">
                <stop offset="60%" stopColor="#a855f7" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
              </radialGradient>
            </defs>

            <rect x="20" y="100" width="170" height="70" fill="url(#basePlateGrad)" stroke="#64748b" strokeWidth="1.5" rx="2" />
            <rect x="210" y="100" width="170" height="70" fill="url(#basePlateGrad)" stroke="#64748b" strokeWidth="1.5" rx="2" />

            <ellipse cx="200" cy="100" rx={result.meanBeadWidth_mm * 9} ry={result.meanPenetration_mm * 11} fill="url(#hazGrad)" />

            <path
              d={`M ${200 - result.meanBeadWidth_mm * 5.5} 100 Q 200 ${100 + result.meanPenetration_mm * 8} ${200 + result.meanBeadWidth_mm * 5.5} 100 Z`}
              fill="url(#penetrationGrad)"
              stroke="#fbbf24"
              strokeWidth="1.2"
            />

            <path
              d={`M ${200 - result.meanBeadWidth_mm * 6} 100 Q 200 ${100 - result.meanBeadHeight_mm * 12} ${200 + result.meanBeadWidth_mm * 6} 100 Z`}
              fill="url(#weldCrownGrad)"
              stroke="#fef08a"
              strokeWidth="1.5"
            />

            <line x1={200 - result.meanBeadWidth_mm * 6} y1="45" x2={200 + result.meanBeadWidth_mm * 6} y2="45" stroke="#38bdf8" strokeWidth="1.5" />
            <line x1={200 - result.meanBeadWidth_mm * 6} y1="40" x2={200 - result.meanBeadWidth_mm * 6} y2="100" stroke="#38bdf8" strokeWidth="1" strokeDasharray="3,3" opacity="0.6" />
            <line x1={200 + result.meanBeadWidth_mm * 6} y1="40" x2={200 + result.meanBeadWidth_mm * 6} y2="100" stroke="#38bdf8" strokeWidth="1" strokeDasharray="3,3" opacity="0.6" />
            <text x="200" y="38" fill="#38bdf8" fontSize="11" textAnchor="middle" fontWeight="bold" fontFamily="monospace">
              Width: {result.meanBeadWidth_mm}mm
            </text>

            <line x1="310" y1="100" x2="310" y2={100 - result.meanBeadHeight_mm * 12} stroke="#f59e0b" strokeWidth="1.5" />
            <text x="318" y={100 - result.meanBeadHeight_mm * 6} fill="#f59e0b" fontSize="10" fontWeight="bold" fontFamily="monospace">
              H: {result.meanBeadHeight_mm}mm
            </text>

            <line x1="310" y1="100" x2="310" y2={100 + result.meanPenetration_mm * 8} stroke="#ef4444" strokeWidth="1.5" />
            <text x="318" y={105 + result.meanPenetration_mm * 4} fill="#ef4444" fontSize="10" fontWeight="bold" fontFamily="monospace">
              P: {result.meanPenetration_mm}mm
            </text>

            <text x="200" y="185" fill="#94a3b8" fontSize="10" textAnchor="middle">
              Base Plate: {parameters.material.replace('_', ' ').toUpperCase()} ({parameters.materialThickness_mm}mm) &bull; Deposition Area: {result.depositionArea_mm2} mm²
            </text>
          </svg>
        </div>
      )}
    </div>
  );
};
