import React from 'react';
import { Compass, Gauge, RotateCw, Vibrate, Zap } from 'lucide-react';
import { TorchPose } from '../../types';
import { DeviationStatus } from '../../services/hapticFeedback';

interface TelemetryGaugesProps {
  currentSpeed_mm_s: number;
  currentPose: TorchPose;
  targetWorkAngle: number;
  tofDistance_mm: number;
  hapticEnabled?: boolean;
  activeDeviation?: DeviationStatus | null;
}

export const TelemetryGauges: React.FC<TelemetryGaugesProps> = React.memo(
  ({
    currentSpeed_mm_s,
    currentPose,
    targetWorkAngle,
    tofDistance_mm,
    hapticEnabled = true,
    activeDeviation,
  }) => {
    const isSpeedDeviating = hapticEnabled && !!activeDeviation?.speedDeviation;
    const isTravelAngleDeviating =
      hapticEnabled && !!activeDeviation?.details?.travelAngleIssue;
    const isWorkAngleDeviating =
      hapticEnabled && !!activeDeviation?.details?.workAngleIssue;

    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* 1. Travel Speed Gauge */}
        <div
          className={`bg-slate-900/90 rounded-xl p-3 shadow-lg flex flex-col justify-between transition-all duration-200 border ${
            isSpeedDeviating
              ? 'border-amber-500 shadow-amber-500/10 ring-1 ring-amber-400/60'
              : 'border-slate-800'
          }`}
        >
          <div className="flex justify-between items-center text-xs text-slate-400">
            <span className="flex items-center gap-1.5 font-medium">
              <Gauge className="w-3.5 h-3.5 text-cyan-400" /> Travel Speed
            </span>
            {isSpeedDeviating ? (
              <span className="flex items-center gap-1 text-[10px] font-mono text-amber-400 font-bold animate-pulse">
                <Vibrate className="w-3 h-3" /> HAPTIC
              </span>
            ) : (
              <span className="font-mono text-[10px] text-slate-500">Target: 4-8 mm/s</span>
            )}
          </div>
          <div className="my-2 flex items-baseline gap-1.5">
            <span
              className={`text-2xl font-black font-mono ${
                currentSpeed_mm_s >= 4.0 && currentSpeed_mm_s <= 8.5
                  ? 'text-emerald-400'
                  : 'text-amber-400'
              }`}
            >
              {currentSpeed_mm_s.toFixed(1)}
            </span>
            <span className="text-xs text-slate-400 font-mono">mm/s</span>
            <span className="text-[10px] text-slate-500 font-mono">
              ({(currentSpeed_mm_s * 2.36).toFixed(0)} IPM)
            </span>
          </div>
          <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden relative">
            <div className="absolute left-[33%] right-[30%] top-0 bottom-0 bg-emerald-500/30" />
            <div
              className={`h-full transition-all duration-100 ${
                isSpeedDeviating ? 'bg-amber-500' : 'bg-cyan-500'
              }`}
              style={{ width: `${Math.min(100, (currentSpeed_mm_s / 12) * 100)}%` }}
            />
          </div>
        </div>

        {/* 2. Push / Drag Travel Angle Gauge */}
        <div
          className={`bg-slate-900/90 rounded-xl p-3 shadow-lg flex flex-col justify-between transition-all duration-200 border ${
            isTravelAngleDeviating
              ? 'border-amber-500 shadow-amber-500/10 ring-1 ring-amber-400/60'
              : 'border-slate-800'
          }`}
        >
          <div className="flex justify-between items-center text-xs text-slate-400">
            <span className="flex items-center gap-1.5 font-medium">
              <Compass className="w-3.5 h-3.5 text-amber-400" /> Travel Angle
            </span>
            {isTravelAngleDeviating ? (
              <span className="flex items-center gap-1 text-[10px] font-mono text-amber-400 font-bold animate-pulse">
                <Vibrate className="w-3 h-3" /> HAPTIC
              </span>
            ) : (
              <span className="font-mono text-[10px] text-slate-500">10° - 15° Push</span>
            )}
          </div>
          <div className="my-2 flex items-baseline gap-1.5">
            <span
              className={`text-2xl font-black font-mono ${
                currentPose.travelAngle_deg >= 8 && currentPose.travelAngle_deg <= 18
                  ? 'text-emerald-400'
                  : 'text-amber-400'
              }`}
            >
              {currentPose.travelAngle_deg > 0 ? `+${currentPose.travelAngle_deg}` : currentPose.travelAngle_deg}°
            </span>
            <span className="text-xs text-slate-400 font-mono">
              {currentPose.travelAngle_deg >= 0 ? 'Push (Forehand)' : 'Drag (Backhand)'}
            </span>
          </div>
          <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden relative">
            <div className="absolute left-[55%] right-[25%] top-0 bottom-0 bg-emerald-500/30" />
            <div
              className="h-full bg-amber-500 transition-all duration-100"
              style={{ width: `${Math.max(0, Math.min(100, (currentPose.travelAngle_deg + 30) * 1.6))}%` }}
            />
          </div>
        </div>

        {/* 3. Work Angle Gauge */}
        <div
          className={`bg-slate-900/90 rounded-xl p-3 shadow-lg flex flex-col justify-between transition-all duration-200 border ${
            isWorkAngleDeviating
              ? 'border-purple-400 shadow-purple-500/10 ring-1 ring-purple-400/60'
              : 'border-slate-800'
          }`}
        >
          <div className="flex justify-between items-center text-xs text-slate-400">
            <span className="flex items-center gap-1.5 font-medium">
              <RotateCw className="w-3.5 h-3.5 text-purple-400" /> Work Angle
            </span>
            {isWorkAngleDeviating ? (
              <span className="flex items-center gap-1 text-[10px] font-mono text-purple-300 font-bold animate-pulse">
                <Vibrate className="w-3 h-3" /> HAPTIC
              </span>
            ) : (
              <span className="font-mono text-[10px] text-slate-500">Target: {targetWorkAngle}°</span>
            )}
          </div>
          <div className="my-2 flex items-baseline gap-1.5">
            <span
              className={`text-2xl font-black font-mono ${
                Math.abs(currentPose.workAngle_deg - targetWorkAngle) <= 10
                  ? 'text-emerald-400'
                  : 'text-amber-400'
              }`}
            >
              {currentPose.workAngle_deg}°
            </span>
            <span className="text-xs text-slate-400 font-mono">Surface Bisector</span>
          </div>
          <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden relative">
            <div
              className="h-full bg-purple-500 transition-all duration-100"
              style={{ width: `${Math.max(0, Math.min(100, (currentPose.workAngle_deg / 180) * 100))}%` }}
            />
          </div>
        </div>

        {/* 4. Standoff Distance (CTWD) */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 shadow-lg flex flex-col justify-between">
          <div className="flex justify-between items-center text-xs text-slate-400">
            <span className="flex items-center gap-1.5 font-medium">
              <Zap className="w-3.5 h-3.5 text-emerald-400" /> CTWD Standoff
            </span>
            <span className="font-mono text-[10px] text-slate-500">Target: 10-14mm</span>
          </div>
          <div className="my-2 flex items-baseline gap-1.5">
            <span
              className={`text-2xl font-black font-mono ${
                tofDistance_mm >= 9 && tofDistance_mm <= 15
                  ? 'text-emerald-400'
                  : 'text-amber-400'
              }`}
            >
              {tofDistance_mm.toFixed(1)}
            </span>
            <span className="text-xs text-slate-400 font-mono">mm (ToF)</span>
          </div>
          <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden relative">
            <div className="absolute left-[35%] right-[35%] top-0 bottom-0 bg-emerald-500/30" />
            <div
              className="h-full bg-emerald-500 transition-all duration-100"
              style={{ width: `${Math.max(0, Math.min(100, (tofDistance_mm / 25) * 100))}%` }}
            />
          </div>
        </div>
      </div>
    );
  }
);

TelemetryGauges.displayName = 'TelemetryGauges';
