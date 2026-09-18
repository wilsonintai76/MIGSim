import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Award,
  CheckCircle2,
  ChevronRight,
  Eye,
  EyeOff,
  Flame,
  Gauge,
  Layers,
  Maximize2,
  Minimize2,
  Navigation,
  Play,
  RefreshCw,
  RotateCcw,
  Shield,
  Sparkles,
  Zap,
} from 'lucide-react';
import { TorchPose, WPSProcedure } from '../../types';

export interface TrajectorySample {
  x_mm: number;
  y_mm: number;
  speed_mm_s: number;
  travelAngle_deg: number;
  workAngle_deg: number;
  score: number; // 0 - 100
  quality: 'optimal' | 'good' | 'warning' | 'critical';
  defectHint?: string;
  timestamp: number;
}

interface WpsTrajectoryOverlayProps {
  activeWps: WPSProcedure;
  currentPose: TorchPose;
  currentSpeed_mm_s: number;
  isRecording: boolean;
  virtualTorchX: number;
  onSetVirtualTorchX?: (x: number) => void;
  className?: string;
}

export const WpsTrajectoryOverlay: React.FC<WpsTrajectoryOverlayProps> = ({
  activeWps,
  currentPose,
  currentSpeed_mm_s,
  isRecording,
  virtualTorchX,
  onSetVirtualTorchX,
  className = '',
}) => {
  // Overlay Toggles
  const [showShadowPacer, setShowShadowPacer] = useState<boolean>(true);
  const [showHeatMap, setShowHeatMap] = useState<boolean>(true);
  const [showToleranceRails, setShowToleranceRails] = useState<boolean>(true);
  const [pacerPaceMultiplier, setPacerPaceMultiplier] = useState<number>(1.0);
  const [isSimulatingPacer, setIsSimulatingPacer] = useState<boolean>(false);
  const [isExpanded, setIsExpanded] = useState<boolean>(true);

  // Simulated / Real-time Shadow Pacer State
  const [pacerX_mm, setPacerX_mm] = useState<number>(0);
  const pacerAnimRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(performance.now());

  // Historical Trajectory Samples along the 180mm seam
  const [trailSamples, setTrailSamples] = useState<TrajectorySample[]>([]);

  // Derived WPS targets
  const idealSpeed_mm_s =
    (activeWps.targetTravelSpeedMin_mm_s + activeWps.targetTravelSpeedMax_mm_s) / 2;
  const idealPushAngle =
    (activeWps.targetTravelAngleMin_deg + activeWps.targetTravelAngleMax_deg) / 2;
  const idealWorkAngle = activeWps.targetWorkAngle_deg;
  const seamLength_mm = 180;

  // Active torch X
  const activeX = virtualTorchX > 0 ? virtualTorchX : currentPose.x_mm;

  // Evaluate current instantaneous quality score based on WPS
  const evaluateQuality = (
    speed: number,
    travelAngle: number,
    workAngle: number
  ): { score: number; quality: 'optimal' | 'good' | 'warning' | 'critical'; hint?: string } => {
    let score = 100;
    let hint = undefined;

    // Speed check
    if (speed < activeWps.targetTravelSpeedMin_mm_s) {
      const diff = activeWps.targetTravelSpeedMin_mm_s - speed;
      score -= Math.min(45, diff * 15);
      hint = 'Sluggish speed: excess heat input & crown height';
    } else if (speed > activeWps.targetTravelSpeedMax_mm_s) {
      const diff = speed - activeWps.targetTravelSpeedMax_mm_s;
      score -= Math.min(45, diff * 15);
      hint = 'Excessive speed: lack of penetration & undercut';
    }

    // Travel Push Angle check (10° - 15°)
    if (travelAngle < activeWps.targetTravelAngleMin_deg) {
      const diff = activeWps.targetTravelAngleMin_deg - travelAngle;
      score -= Math.min(30, diff * 4);
      if (!hint) hint = 'Angle dragging: convex ropey bead';
    } else if (travelAngle > activeWps.targetTravelAngleMax_deg) {
      const diff = travelAngle - activeWps.targetTravelAngleMax_deg;
      score -= Math.min(35, diff * 4);
      if (!hint) hint = 'Excess push angle: air aspiration & spatter';
    }

    // Work Angle check
    const workDiff = Math.abs(workAngle - idealWorkAngle);
    if (workDiff > 8) {
      score -= Math.min(30, (workDiff - 8) * 3);
      if (!hint) hint = 'Work angle misalignment: unequal joint leg';
    }

    const finalScore = Math.max(0, Math.min(100, Math.round(score)));

    let quality: 'optimal' | 'good' | 'warning' | 'critical' = 'optimal';
    if (finalScore >= 88) quality = 'optimal';
    else if (finalScore >= 72) quality = 'good';
    else if (finalScore >= 52) quality = 'warning';
    else quality = 'critical';

    return { score: finalScore, quality, hint };
  };

  // Run Ghost Shadow Pacer loop
  useEffect(() => {
    const updatePacer = (now: number) => {
      const dt = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;

      if ((isRecording || isSimulatingPacer) && showShadowPacer) {
        setPacerX_mm((prev) => {
          const next = prev + idealSpeed_mm_s * pacerPaceMultiplier * dt;
          if (next > seamLength_mm) {
            // Loop back if simulating, or clamp at end
            return isSimulatingPacer ? 0 : seamLength_mm;
          }
          return next;
        });
      }

      pacerAnimRef.current = requestAnimationFrame(updatePacer);
    };

    lastTimeRef.current = performance.now();
    pacerAnimRef.current = requestAnimationFrame(updatePacer);

    return () => cancelAnimationFrame(pacerAnimRef.current);
  }, [isRecording, isSimulatingPacer, showShadowPacer, idealSpeed_mm_s, pacerPaceMultiplier]);

  // Record real-time heat map trail samples along the seam
  useEffect(() => {
    if (!showHeatMap) return;

    const currentX = Math.max(0, Math.min(seamLength_mm, activeX));
    const { score, quality, hint } = evaluateQuality(
      currentSpeed_mm_s,
      currentPose.travelAngle_deg,
      currentPose.workAngle_deg
    );

    const newSample: TrajectorySample = {
      x_mm: currentX,
      y_mm: currentPose.y_mm || 0,
      speed_mm_s: currentSpeed_mm_s,
      travelAngle_deg: currentPose.travelAngle_deg,
      workAngle_deg: currentPose.workAngle_deg,
      score,
      quality,
      defectHint: hint,
      timestamp: performance.now(),
    };

    setTrailSamples((prev) => {
      // Append if moved significantly or if recording
      const last = prev[prev.length - 1];
      if (!last || Math.abs(last.x_mm - currentX) > 1.2 || isRecording) {
        // Keep up to 200 points along the seam
        const filtered = prev.filter((p) => Math.abs(p.x_mm - currentX) > 0.8);
        return [...filtered, newSample].sort((a, b) => a.x_mm - b.x_mm);
      }
      return prev;
    });
  }, [activeX, currentSpeed_mm_s, currentPose.travelAngle_deg, currentPose.workAngle_deg, isRecording, showHeatMap]);

  // Reset trail
  const handleClearTrail = () => {
    setTrailSamples([]);
    setPacerX_mm(0);
    setIsSimulatingPacer(false);
  };

  // Trainee vs. Shadow Pacer delta
  const pacerDelta_mm = activeX - pacerX_mm;
  const isPacerAligned = Math.abs(pacerDelta_mm) <= 3.5;
  const currentQuality = evaluateQuality(
    currentSpeed_mm_s,
    currentPose.travelAngle_deg,
    currentPose.workAngle_deg
  );

  // Overall path compliance score
  const overallPathCompliance =
    trailSamples.length > 0
      ? Math.round(
          trailSamples.reduce((sum, s) => sum + s.score, 0) / trailSamples.length
        )
      : currentQuality.score;

  return (
    <div className={`w-full bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden flex flex-col gap-3 ${className}`}>
      {/* Header Bar */}
      <div className="bg-slate-950/80 px-3.5 py-2.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-cyan-600 to-emerald-500 flex items-center justify-center text-white shadow-md shadow-cyan-500/20">
            <Navigation className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                WPS Trajectory & Shadow Guide
              </h3>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold bg-cyan-950 text-cyan-300 border border-cyan-700">
                {activeWps.code}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 hidden sm:block">
              Ideal Pacing: {idealSpeed_mm_s.toFixed(1)} mm/s &bull; Push Angle: {activeWps.targetTravelAngleMin_deg}°-{activeWps.targetTravelAngleMax_deg}°
            </p>
          </div>
        </div>

        {/* Action Toggles */}
        <div className="flex items-center gap-1.5 text-xs">
          {/* Shadow Pacer Toggle */}
          <button
            onClick={() => setShowShadowPacer(!showShadowPacer)}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium border transition ${
              showShadowPacer
                ? 'bg-cyan-950 text-cyan-300 border-cyan-700'
                : 'bg-slate-900 text-slate-500 border-slate-800'
            }`}
            title="Toggle Ideal Shadow Pacer lead guide"
          >
            <Sparkles className="w-3 h-3 text-cyan-400" />
            <span className="hidden sm:inline">Shadow Pacer</span>
          </button>

          {/* Heat Map Toggle */}
          <button
            onClick={() => setShowHeatMap(!showHeatMap)}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium border transition ${
              showHeatMap
                ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                : 'bg-slate-900 text-slate-500 border-slate-800'
            }`}
            title="Toggle Real-Time Heat Map Trail"
          >
            <Flame className="w-3 h-3 text-emerald-400" />
            <span className="hidden sm:inline">Heat Map</span>
          </button>

          {/* Reset button */}
          <button
            onClick={handleClearTrail}
            className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
            title="Reset Trail & Pacer to Origin (0mm)"
          >
            <RotateCcw className="w-3 h-3" />
          </button>

          {/* Expand/Collapse */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
          >
            {isExpanded ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="p-3.5 flex flex-col gap-3 text-xs">
          {/* 1. Real-time Status Guidance Banner */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
            {/* Pacer Lead / Lag Status Card */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-2.5 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-mono block">
                  Shadow Pacer Delta
                </span>
                <div className="font-mono font-bold text-sm mt-0.5 flex items-center gap-1.5">
                  <span
                    className={
                      isPacerAligned
                        ? 'text-emerald-400'
                        : pacerDelta_mm > 0
                        ? 'text-amber-400'
                        : 'text-cyan-400'
                    }
                  >
                    {isPacerAligned
                      ? '✓ In The Pocket'
                      : pacerDelta_mm > 0
                      ? `+${pacerDelta_mm.toFixed(1)} mm (Fast)`
                      : `${pacerDelta_mm.toFixed(1)} mm (Lag)`}
                  </span>
                </div>
              </div>
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center font-mono text-xs font-black border ${
                  isPacerAligned
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                    : 'bg-slate-900 text-slate-400 border-slate-800'
                }`}
              >
                {Math.abs(pacerDelta_mm).toFixed(0)}m
              </div>
            </div>

            {/* Travel Speed vs WPS Target Card */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-2.5 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-mono block">
                  Speed vs. WPS Sweet Spot
                </span>
                <div className="font-mono font-bold text-sm mt-0.5">
                  <span
                    className={
                      currentSpeed_mm_s >= activeWps.targetTravelSpeedMin_mm_s &&
                      currentSpeed_mm_s <= activeWps.targetTravelSpeedMax_mm_s
                        ? 'text-emerald-400'
                        : 'text-amber-400'
                    }
                  >
                    {currentSpeed_mm_s.toFixed(1)} mm/s
                  </span>
                  <span className="text-slate-500 text-xs ml-1.5">
                    (Target: {activeWps.targetTravelSpeedMin_mm_s}-{activeWps.targetTravelSpeedMax_mm_s})
                  </span>
                </div>
              </div>
              <Gauge className="w-5 h-5 text-cyan-400" />
            </div>

            {/* Trajectory Compliance Score Card */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-2.5 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-mono block">
                  WPS Trajectory Quality
                </span>
                <div className="font-mono font-black text-sm mt-0.5 flex items-center gap-1.5">
                  <span
                    className={
                      overallPathCompliance >= 85
                        ? 'text-emerald-400'
                        : overallPathCompliance >= 70
                        ? 'text-cyan-400'
                        : 'text-amber-400'
                    }
                  >
                    {overallPathCompliance}% Score
                  </span>
                </div>
              </div>
              <div className="w-8 h-8 rounded-xl bg-cyan-950/60 border border-cyan-800 flex items-center justify-center text-cyan-400">
                <Award className="w-4 h-4" />
              </div>
            </div>
          </div>

          {/* 2. Interactive SVG Seam Stage with Heat Map & Shadow Path Corridor */}
          <div className="relative w-full bg-slate-950 rounded-2xl border border-slate-800 p-3 select-none overflow-hidden shadow-inner">
            {/* Millimeter Metric Scale Ruler */}
            <div className="flex justify-between text-[9px] font-mono text-slate-500 mb-1 px-2">
              <span>0 mm (Start)</span>
              <span>45 mm</span>
              <span>90 mm (Center)</span>
              <span>135 mm</span>
              <span>180 mm (Stop)</span>
            </div>

            {/* SVG Seam Visualizer */}
            <div className="relative w-full h-16 bg-slate-900 rounded-xl border border-slate-800 overflow-hidden flex items-center">
              {/* Joint Plate Seam Bevel */}
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-4 bg-slate-950 border-y border-slate-800">
                {/* Centerline Joint Gap */}
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-0.5 border-b border-dashed border-slate-700" />
              </div>

              {/* WPS Tolerance Corridor Rails (±2mm lateral safe zone) */}
              {showToleranceRails && (
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-8 pointer-events-none">
                  {/* Upper rail */}
                  <div className="absolute top-0 inset-x-0 border-b border-cyan-500/20 border-dashed" />
                  {/* Lower rail */}
                  <div className="absolute bottom-0 inset-x-0 border-t border-cyan-500/20 border-dashed" />
                  {/* Green-tinted Safe Corridor */}
                  <div className="w-full h-full bg-cyan-500/[0.03]" />
                </div>
              )}

              {/* Real-time Heat Map Trail (Segments along seam) */}
              {showHeatMap && (
                <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="heatOptimal" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#059669" stopOpacity="0.8" />
                      <stop offset="100%" stopColor="#10b981" stopOpacity="0.9" />
                    </linearGradient>
                    <linearGradient id="heatWarning" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#d97706" stopOpacity="0.8" />
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.9" />
                    </linearGradient>
                    <linearGradient id="heatCritical" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#dc2626" stopOpacity="0.8" />
                      <stop offset="100%" stopColor="#ef4444" stopOpacity="0.9" />
                    </linearGradient>
                  </defs>

                  {/* Draw each recorded sample as a heat point / bead segment */}
                  {trailSamples.map((sample, idx) => {
                    const cxPercent = (sample.x_mm / seamLength_mm) * 100;
                    const cyPercent = 50 + (sample.y_mm / 10) * 15; // lateral drift
                    const color =
                      sample.quality === 'optimal'
                        ? '#10b981'
                        : sample.quality === 'good'
                        ? '#06b6d4'
                        : sample.quality === 'warning'
                        ? '#f59e0b'
                        : '#ef4444';

                    return (
                      <g key={idx}>
                        <circle
                          cx={`${cxPercent}%`}
                          cy={`${cyPercent}%`}
                          r="4"
                          fill={color}
                          opacity="0.85"
                          className="transition-all"
                        />
                        {/* Glow halo */}
                        <circle
                          cx={`${cxPercent}%`}
                          cy={`${cyPercent}%`}
                          r="8"
                          fill={color}
                          opacity="0.25"
                        />
                      </g>
                    );
                  })}
                </svg>
              )}

              {/* Shadow Path: Translucent Ghost Torch Lead Guide */}
              {showShadowPacer && (
                <div
                  className="absolute top-0 bottom-0 pointer-events-none transition-all duration-75 z-20"
                  style={{
                    left: `${Math.max(0, Math.min(100, (pacerX_mm / seamLength_mm) * 100))}%`,
                    transform: 'translateX(-50%)',
                  }}
                >
                  {/* Ghost Guide Corridor Marker */}
                  <div className="relative h-full flex flex-col items-center justify-center">
                    {/* Glowing holographic pacer aura */}
                    <div className="w-10 h-10 rounded-full bg-cyan-400/20 border border-cyan-400/80 flex items-center justify-center shadow-[0_0_20px_#22d3ee] animate-pulse">
                      <div className="w-3 h-3 rounded-full bg-cyan-300 border border-white" />
                    </div>
                    <span className="absolute -top-1 px-1.5 py-0.5 rounded text-[8px] font-mono font-bold bg-cyan-950/90 text-cyan-300 border border-cyan-700 whitespace-nowrap shadow-sm">
                      GHOST PACER ({idealSpeed_mm_s.toFixed(1)} mm/s)
                    </span>
                  </div>
                </div>
              )}

              {/* Actual Welder Torch Tip Cursor */}
              <div
                className="absolute top-0 bottom-0 pointer-events-none transition-all duration-75 z-30"
                style={{
                  left: `${Math.max(0, Math.min(100, (activeX / seamLength_mm) * 100))}%`,
                  transform: 'translateX(-50%)',
                }}
              >
                <div className="relative h-full flex flex-col items-center justify-center">
                  <div className="w-9 h-9 rounded-xl bg-amber-500 border-2 border-white flex items-center justify-center text-slate-950 font-bold shadow-[0_0_25px_#f59e0b]">
                    <Flame className="w-5 h-5 fill-current text-white" />
                  </div>
                  <span className="absolute -bottom-1 px-1.5 py-0.5 rounded text-[8px] font-mono font-bold bg-amber-950/90 text-amber-300 border border-amber-600 whitespace-nowrap shadow-sm">
                    YOU ({activeX.toFixed(0)}mm)
                  </span>
                </div>
              </div>
            </div>

            {/* Heat Map Legend */}
            <div className="flex flex-wrap items-center justify-between gap-2 mt-2 pt-2 border-t border-slate-800/80 text-[10px] text-slate-400">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 font-mono">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Optimal (90-100%)
                </span>
                <span className="flex items-center gap-1 font-mono">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-500" /> Good (72-89%)
                </span>
                <span className="flex items-center gap-1 font-mono">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Warning (52-71%)
                </span>
                <span className="flex items-center gap-1 font-mono">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Defect Risk (&lt;52%)
                </span>
              </div>

              {/* Simulation Play/Pause for practice */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsSimulatingPacer(!isSimulatingPacer)}
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border transition ${
                    isSimulatingPacer
                      ? 'bg-amber-950 text-amber-300 border-amber-600'
                      : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
                  }`}
                >
                  <Play className="w-3 h-3" />
                  <span>{isSimulatingPacer ? 'Pause Pacer' : 'Practice Pacer Run'}</span>
                </button>

                {/* Pace multiplier */}
                <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg px-1.5 py-0.5">
                  <span className="text-[9px] text-slate-500">Pace:</span>
                  {[0.8, 1.0, 1.2].map((m) => (
                    <button
                      key={m}
                      onClick={() => setPacerPaceMultiplier(m)}
                      className={`px-1 rounded text-[9px] font-mono ${
                        pacerPaceMultiplier === m
                          ? 'bg-cyan-600 text-white font-bold'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {m}x
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 3. Live Active Defect Prevention Tip */}
          {currentQuality.hint ? (
            <div className="bg-amber-950/40 border border-amber-800/80 text-amber-200 text-xs px-3 py-2 rounded-xl flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong>Technique Correction:</strong> {currentQuality.hint}
              </span>
            </div>
          ) : (
            <div className="bg-emerald-950/40 border border-emerald-800/80 text-emerald-200 text-xs px-3 py-2 rounded-xl flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                <strong>Flawless Technique:</strong> Travel speed and push angle match AWS D1.1 prequalified requirements for {activeWps.code}.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
