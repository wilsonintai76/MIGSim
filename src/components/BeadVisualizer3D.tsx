import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Eye, Layers, RotateCcw, ZoomIn } from 'lucide-react';
import { BeadQualityResult, WeldingParameters } from '../types';

interface BeadVisualizerProps {
  result: BeadQualityResult;
  parameters: WeldingParameters;
}

export const BeadVisualizer3D: React.FC<BeadVisualizerProps> = ({ result, parameters }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<'3d' | 'cross_section'>('3d');
  const [showHAZ, setShowHAZ] = useState(true);
  const [showCutaway, setShowCutaway] = useState(false);

  useEffect(() => {
    if (viewMode !== '3d' || !containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth || 480;
    const height = container.clientHeight || 280;

    // 1. Scene, Camera, Renderer
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x090d16);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 70, 110);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // 2. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffeedd, 1.2);
    dirLight1.position.set(50, 80, 50);
    dirLight1.castShadow = true;
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x38bdf8, 0.6);
    dirLight2.position.set(-50, 40, -50);
    scene.add(dirLight2);

    // 3. Base Metal Plates
    const plateWidth = 140; // mm along seam (X)
    const plateDepth = 70;  // mm across seam (Z)
    const plateThickness = Math.max(3, parameters.materialThickness_mm * 2);

    const plateMaterial = new THREE.MeshStandardMaterial({
      color: parameters.material === 'aluminum_4043' ? 0xd1d5db : (parameters.material === 'stainless_304' ? 0x94a3b8 : 0x475569),
      metalness: 0.85,
      roughness: 0.35,
    });

    if (parameters.jointType === 't_fillet') {
      // Horizontal bottom plate
      const botPlateGeo = new THREE.BoxGeometry(plateWidth, plateThickness, plateDepth);
      const botPlate = new THREE.Mesh(botPlateGeo, plateMaterial);
      botPlate.position.set(0, -plateThickness / 2, 0);
      scene.add(botPlate);

      // Vertical standing plate
      const vertPlateGeo = new THREE.BoxGeometry(plateWidth, plateDepth, plateThickness);
      const vertPlate = new THREE.Mesh(vertPlateGeo, plateMaterial);
      vertPlate.position.set(0, plateDepth / 2, -plateThickness / 2);
      scene.add(vertPlate);
    } else {
      // Butt joint (2 plates with central seam)
      const leftPlateGeo = new THREE.BoxGeometry(plateWidth, plateThickness, (plateDepth - 2) / 2);
      const leftPlate = new THREE.Mesh(leftPlateGeo, plateMaterial);
      leftPlate.position.set(0, -plateThickness / 2, -(plateDepth / 4 + 1));
      scene.add(leftPlate);

      const rightPlateGeo = new THREE.BoxGeometry(plateWidth, plateThickness, (plateDepth - 2) / 2);
      const rightPlate = new THREE.Mesh(rightPlateGeo, plateMaterial);
      rightPlate.position.set(0, -plateThickness / 2, plateDepth / 4 + 1);
      scene.add(rightPlate);
    }

    // 4. Heat-Affected Zone (HAZ) Gradient Strip
    if (showHAZ) {
      const hazGeo = new THREE.PlaneGeometry(plateWidth, result.meanBeadWidth_mm * 2.8);
      const hazMat = new THREE.MeshBasicMaterial({
        color: 0x9333ea,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
      });
      const hazMesh = new THREE.Mesh(hazGeo, hazMat);
      hazMesh.rotation.x = -Math.PI / 2;
      hazMesh.position.set(0, 0.2, 0);
      scene.add(hazMesh);
    }

    // 5. Procedural 3D Weld Bead Geometry (Rippled Extrusion)
    const beadSegments = result.beadSegments.length > 0 ? result.beadSegments : [{ width_mm: 7, height_mm: 2.5, penetration_mm: 2, y_mm: 0 }];
    const length = plateWidth * 0.9;
    const numRipples = 60;
    const beadCurvePoints: THREE.Vector3[] = [];

    for (let i = 0; i <= numRipples; i++) {
      const t = i / numRipples;
      const x = -length / 2 + t * length;
      const segIdx = Math.min(beadSegments.length - 1, Math.floor(t * beadSegments.length));
      const seg = beadSegments[segIdx];

      // Add characteristic GMAW solidification chevron / ripple texture
      const rippleHeight = Math.sin(i * 1.8) * (seg.height_mm * 0.12);
      const y = Math.max(0.2, seg.height_mm + rippleHeight);
      const z = ((seg as any).y_mm || 0) * 0.5;

      beadCurvePoints.push(new THREE.Vector3(x, y, z));
    }

    const beadColor = result.overallScore >= 80 ? 0xd97706 : (result.overallScore >= 60 ? 0xca8a04 : 0x78716c);
    const beadMaterial = new THREE.MeshStandardMaterial({
      color: beadColor,
      metalness: 0.9,
      roughness: 0.25,
      wireframe: false,
    });

    const beadRadius = Math.max(1.5, result.meanBeadWidth_mm * 0.45);
    const beadGeo = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(beadCurvePoints),
      64,
      beadRadius,
      12,
      false
    );

    const beadMesh = new THREE.Mesh(beadGeo, beadMaterial);
    scene.add(beadMesh);

    // 6. Spatter Particles if high voltage or spatter defect detected
    const hasSpatterDefect = result.defects.some((d) => d.id.includes('spatter'));
    const particleCount = hasSpatterDefect ? 120 : 25;
    const particleGeo = new THREE.BufferGeometry();
    const particlePositions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      particlePositions[i * 3] = (Math.random() - 0.5) * plateWidth * 0.8;
      particlePositions[i * 3 + 1] = 0.5;
      particlePositions[i * 3 + 2] = (Math.random() - 0.5) * plateDepth * 0.7;
    }
    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0xf59e0b,
      size: 1.5,
    });
    const spatterPoints = new THREE.Points(particleGeo, particleMat);
    scene.add(spatterPoints);

    // 7. Interactive Mouse / Touch Orbit Controls
    let isDragging = false;
    let prevMouseX = 0;
    let prevMouseY = 0;
    let sphericalTheta = 0;
    let sphericalPhi = Math.PI / 4;
    const radius = 120;

    const onPointerDown = (e: PointerEvent) => {
      isDragging = true;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - prevMouseX;
      const dy = e.clientY - prevMouseY;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;

      sphericalTheta += dx * 0.01;
      sphericalPhi = Math.max(0.1, Math.min(Math.PI / 2 - 0.05, sphericalPhi + dy * 0.01));

      camera.position.x = radius * Math.sin(sphericalPhi) * Math.sin(sphericalTheta);
      camera.position.y = radius * Math.cos(sphericalPhi);
      camera.position.z = radius * Math.sin(sphericalPhi) * Math.cos(sphericalTheta);
      camera.lookAt(0, 0, 0);
    };

    const onPointerUp = () => {
      isDragging = false;
    };

    container.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    // Animation Loop
    let animId = 0;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      if (!isDragging) {
        // Slow gentle idle pan
        sphericalTheta += 0.002;
        camera.position.x = radius * Math.sin(sphericalPhi) * Math.sin(sphericalTheta);
        camera.position.y = radius * Math.cos(sphericalPhi);
        camera.position.z = radius * Math.sin(sphericalPhi) * Math.cos(sphericalTheta);
        camera.lookAt(0, 0, 0);
      }
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      container.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      beadGeo.dispose();
      beadMaterial.dispose();
    };
  }, [viewMode, showHAZ, showCutaway, result, parameters]);

  return (
    <div className="w-full bg-slate-900/90 rounded-2xl border border-slate-800 p-4 shadow-xl overflow-hidden flex flex-col">
      {/* Controls Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Bead Geometry Analysis</span>
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
            3D Interactive
          </button>
          <button
            onClick={() => setViewMode('cross_section')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
              viewMode === 'cross_section' ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            2D Macroetch Cross-Section
          </button>
        </div>
      </div>

      {/* 3D WebGL Canvas */}
      {viewMode === '3d' ? (
        <div className="relative w-full h-64 md:h-72 rounded-xl overflow-hidden bg-slate-950 border border-slate-800/80">
          <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />
          <div className="absolute bottom-2 left-3 text-[10px] text-slate-400 bg-slate-900/80 px-2 py-1 rounded-md border border-slate-700/50 pointer-events-none">
            Drag to Orbit &bull; Heat-Affected Zone (Purple) &bull; Solidified Crown (Gold)
          </div>
          <div className="absolute top-2 right-2 flex gap-1">
            <button
              onClick={() => setShowHAZ(!showHAZ)}
              className={`p-1.5 rounded-lg text-[11px] font-medium border ${
                showHAZ ? 'bg-purple-900/60 border-purple-500 text-purple-200' : 'bg-slate-800 border-slate-700 text-slate-400'
              }`}
              title="Toggle Heat Affected Zone"
            >
              HAZ
            </button>
          </div>
        </div>
      ) : (
        /* 2D Cross-Section Macroetch Diagram */
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

            {/* Base Metal Plates */}
            <rect x="20" y="100" width="170" height="70" fill="url(#basePlateGrad)" stroke="#64748b" strokeWidth="1.5" rx="2" />
            <rect x="210" y="100" width="170" height="70" fill="url(#basePlateGrad)" stroke="#64748b" strokeWidth="1.5" rx="2" />

            {/* HAZ Thermal Envelope */}
            <ellipse cx="200" cy="100" rx={result.meanBeadWidth_mm * 9} ry={result.meanPenetration_mm * 11} fill="url(#hazGrad)" />

            {/* Penetration Nugget into Root */}
            <path
              d={`M ${200 - result.meanBeadWidth_mm * 5.5} 100 Q 200 ${100 + result.meanPenetration_mm * 8} ${200 + result.meanBeadWidth_mm * 5.5} 100 Z`}
              fill="url(#penetrationGrad)"
              stroke="#fbbf24"
              strokeWidth="1.2"
            />

            {/* Weld Reinforcement Crown */}
            <path
              d={`M ${200 - result.meanBeadWidth_mm * 6} 100 Q 200 ${100 - result.meanBeadHeight_mm * 12} ${200 + result.meanBeadWidth_mm * 6} 100 Z`}
              fill="url(#weldCrownGrad)"
              stroke="#fef08a"
              strokeWidth="1.5"
            />

            {/* Dimension Lines & Callouts */}
            {/* Width Dimension */}
            <line x1={200 - result.meanBeadWidth_mm * 6} y1="45" x2={200 + result.meanBeadWidth_mm * 6} y2="45" stroke="#38bdf8" strokeWidth="1.5" markerEnd="url(#arrow)" />
            <line x1={200 - result.meanBeadWidth_mm * 6} y1="40" x2={200 - result.meanBeadWidth_mm * 6} y2="100" stroke="#38bdf8" strokeWidth="1" strokeDasharray="3,3" opacity="0.6" />
            <line x1={200 + result.meanBeadWidth_mm * 6} y1="40" x2={200 + result.meanBeadWidth_mm * 6} y2="100" stroke="#38bdf8" strokeWidth="1" strokeDasharray="3,3" opacity="0.6" />
            <text x="200" y="38" fill="#38bdf8" fontSize="11" textAnchor="middle" fontWeight="bold" fontFamily="monospace">
              Width: {result.meanBeadWidth_mm}mm
            </text>

            {/* Height Callout */}
            <line x1="310" y1="100" x2="310" y2={100 - result.meanBeadHeight_mm * 12} stroke="#f59e0b" strokeWidth="1.5" />
            <text x="318" y={100 - result.meanBeadHeight_mm * 6} fill="#f59e0b" fontSize="10" fontWeight="bold" fontFamily="monospace">
              H: {result.meanBeadHeight_mm}mm
            </text>

            {/* Penetration Callout */}
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
