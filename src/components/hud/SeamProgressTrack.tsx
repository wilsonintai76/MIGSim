import React from 'react';
import { Radio } from 'lucide-react';
import { bleManager } from '../../services/bluetoothManager';
import { BLESensorState, TorchPose, WeldingParameters, LiveTorchSample } from '../../types';

interface SeamProgressTrackProps {
  virtualTorchX: number;
  seamTrackRef: React.RefObject<HTMLDivElement | null>;
  onSeamTrackInteraction: (
    e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>
  ) => void;
  bleState: BLESensorState;
  currentPose: TorchPose;
  onAngleChange: (angle: number) => void;
  recordedSamples?: LiveTorchSample[];
  parameters: WeldingParameters;
}

export const SeamProgressTrack: React.FC<SeamProgressTrackProps> = React.memo(
  ({
    virtualTorchX,
    seamTrackRef,
    onSeamTrackInteraction,
    bleState,
    currentPose,
    onAngleChange,
    recordedSamples = [],
    parameters,
  }) => {
    return (
      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-4 shadow-xl flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            Seam Progress Track (200mm Coupon)
          </span>
          <span className="text-xs font-mono text-cyan-400">
            Position X: {virtualTorchX.toFixed(0)} mm / 200 mm
          </span>
        </div>

        {/* Drag-able Seam Bar */}
        <div
          ref={seamTrackRef}
          onClick={onSeamTrackInteraction}
          onTouchMove={onSeamTrackInteraction}
          onMouseMove={(e) => {
            if (e.buttons === 1) onSeamTrackInteraction(e);
          }}
          className="relative w-full h-12 bg-slate-950 rounded-xl border border-slate-700/80 cursor-crosshair flex items-center px-2 select-none overflow-hidden"
        >
          {/* Seam centerline groove */}
          <div className="w-full h-1 bg-slate-800 relative">
            <div className="absolute inset-0 border-b border-dashed border-amber-500/40" />
          </div>

          {/* Live Thermal Heat Map Trail behind Welder Torch */}
          <div className="absolute inset-x-0 h-4 pointer-events-none rounded-full overflow-hidden opacity-90">
            <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none">
              {(() => {
                const maxLen = 200; // Coupon length is 200mm
                const current_A = parameters?.current_A || 130;
                const voltage_V = parameters?.voltage_V || 18.5;

                // Fallback: draw single colored block up to the active torch position
                if (!recordedSamples || recordedSamples.length < 2) {
                  const activeWidthPercent = Math.max(0, Math.min(100, (virtualTorchX / maxLen) * 100));
                  return (
                    <line
                      x1="0%"
                      y1="50%"
                      x2={`${activeWidthPercent}%`}
                      y2="50%"
                      stroke="#f59e0b"
                      strokeWidth={14}
                      strokeLinecap="round"
                    />
                  );
                }

                const lines: React.ReactNode[] = [];
                for (let i = 1; i < recordedSamples.length; i++) {
                  const s1 = recordedSamples[i - 1];
                  const s2 = recordedSamples[i];

                  const x1Percent = (s1.pose.x_mm / maxLen) * 100;
                  const x2Percent = (s2.pose.x_mm / maxLen) * 100;

                  // Calculate local segment heat input
                  const speed = Math.max(0.5, s2.computedSpeed_mm_s);
                  const heatInput = (0.8 * voltage_V * current_A) / (speed * 1000);

                  let strokeColor = '#10b981'; // Target (emerald green)
                  if (heatInput < 0.45) {
                    strokeColor = '#3b82f6'; // Too Cold (blue)
                  } else if (heatInput < 0.65) {
                    strokeColor = '#06b6d4'; // Cool (cyan)
                  } else if (heatInput <= 1.10) {
                    strokeColor = '#10b981'; // Optimal (emerald)
                  } else if (heatInput <= 1.45) {
                    strokeColor = '#f59e0b'; // Warm (amber)
                  } else {
                    strokeColor = '#ef4444'; // Too Hot (red)
                  }

                  lines.push(
                    <line
                      key={i}
                      x1={`${x1Percent}%`}
                      y1="50%"
                      x2={`${x2Percent}%`}
                      y2="50%"
                      stroke={strokeColor}
                      strokeWidth={14}
                      strokeLinecap="round"
                    />
                  );
                }
                return lines;
              })()}
            </svg>
          </div>

          {/* Torch Indicator Cursor */}
          <div
            className="absolute top-1 bottom-1 w-7 rounded-lg bg-cyan-500 border-2 border-white shadow-[0_0_15px_#38bdf8] flex items-center justify-center text-slate-950 font-black text-xs transition-all duration-75"
            style={{
              left: `calc(${Math.max(0, Math.min(100, (virtualTorchX / 200) * 100))}% - 14px)`,
            }}
          >
            🔥
          </div>
        </div>

        {/* Dynamic Thermal Scale Legend */}
        <div className="flex flex-wrap items-center justify-between text-[10px] text-slate-400 font-mono gap-y-1 bg-slate-950/40 p-2 rounded-xl border border-slate-800/60">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-500 shadow" /> Cold (&lt;0.45 kJ/mm)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-cyan-500 shadow" /> Cool (0.45-0.65)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shadow" /> Ideal (0.65-1.10)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500 shadow" /> Warm (1.10-1.45)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-500 shadow" /> Hot (&gt;1.45)
            </span>
          </div>
          <span className="text-slate-500 text-[9px]">GMAW Physics Grounded</span>
        </div>

        <p className="text-[11px] text-slate-400">
          Tip: Click or drag across the seam bar above to simulate steady torch travel progression.
        </p>

        {/* Virtual Hardware Controls (Angle adjustments & Simulated Trigger) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-800">
          {/* Simulated Trigger Switch */}
          <button
            id="btn-virtual-trigger"
            onClick={() => bleManager.toggleSimulatedTrigger()}
            className={`py-2.5 px-4 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg transition ${
              bleState.isArmed
                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
            }`}
          >
            <Radio className="w-4 h-4" />
            {bleState.isArmed ? 'Release Trigger (Stop)' : 'Press Trigger (Arm Torch)'}
          </button>

          {/* Push Angle Adjuster */}
          <div className="flex items-center gap-2 bg-slate-950/60 px-3 py-1.5 rounded-xl border border-slate-800">
            <span className="text-xs text-slate-400 shrink-0">Angle:</span>
            <input
              type="range"
              min={-25}
              max={35}
              step={1}
              value={currentPose.travelAngle_deg}
              onChange={(e) => onAngleChange(parseFloat(e.target.value))}
              className="w-full accent-amber-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
            />
            <span className="text-xs font-mono text-amber-400 shrink-0 w-8 text-right">
              {currentPose.travelAngle_deg}°
            </span>
          </div>

          {/* Standoff Adjuster (VL6180X simulation) */}
          <div className="flex items-center gap-2 bg-slate-950/60 px-3 py-1.5 rounded-xl border border-slate-800">
            <span className="text-xs text-slate-400 shrink-0">ToF Dist:</span>
            <input
              type="range"
              min={0}
              max={24}
              step={0.5}
              value={bleState.tofDistance_mm}
              onChange={(e) => bleManager.setSimulatedDistance(parseFloat(e.target.value))}
              className="w-full accent-emerald-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
            />
            <span className="text-xs font-mono text-emerald-400 shrink-0 w-10 text-right">
              {bleState.tofDistance_mm}mm
            </span>
          </div>
        </div>
      </div>
    );
  }
);

SeamProgressTrack.displayName = 'SeamProgressTrack';
