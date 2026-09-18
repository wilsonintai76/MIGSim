import React from 'react';
import {
  AlertTriangle,
  Compass,
  Gauge,
  HelpCircle,
  Layers,
  Move,
  Radio,
  RefreshCw,
  Smartphone,
  Vibrate,
  VibrateOff,
  Video,
} from 'lucide-react';
import { PhoneImuData } from '../../services/phoneImuTracker';
import { DeviationStatus, HapticEvent } from '../../services/hapticFeedback';
import { BLESensorState, TrackingMode } from '../../types';

interface PhoneImuControlBarProps {
  trackingMode: TrackingMode;
  onSelectMode: (mode: TrackingMode) => void;
  imuData: PhoneImuData;
  onCalibrateZero: () => void;
  onResetDisplacement: () => void;
  bleState: BLESensorState;
  onToggleTrigger: () => void;
  onOpenHardwareGuide: () => void;
  targetWorkAngle: number;
  hapticEnabled: boolean;
  hapticSupported: boolean;
  onToggleHaptic: () => void;
  onTestHaptic: () => void;
  recentHapticEvent?: HapticEvent | null;
  currentDeviation?: DeviationStatus | null;
}

export const PhoneImuControlBar: React.FC<PhoneImuControlBarProps> = ({
  trackingMode,
  onSelectMode,
  imuData,
  onCalibrateZero,
  onResetDisplacement,
  bleState,
  onToggleTrigger,
  onOpenHardwareGuide,
  targetWorkAngle,
  hapticEnabled,
  hapticSupported,
  onToggleHaptic,
  onTestHaptic,
  recentHapticEvent,
  currentDeviation,
}) => {
  const isImuActiveInMode = trackingMode === 'phone_imu' || trackingMode === 'fused_imu_camera';

  return (
    <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-3 sm:p-4 shadow-xl flex flex-col gap-3">
      {/* Top Header: Mode Selector & Hardware Guide Link */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
            Tracking Mode:
          </span>
          <div className="inline-flex flex-wrap bg-slate-950 p-1 rounded-xl border border-slate-800 gap-1">
            <button
              onClick={() => onSelectMode('fused_imu_camera')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                trackingMode === 'fused_imu_camera'
                  ? 'bg-cyan-600 text-white shadow-md ring-1 ring-cyan-400'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
              title="Best of both: Phone IMU handles high-rate pitch & roll, optical camera anchors 3D position and cancels drift"
            >
              <Layers className="w-3.5 h-3.5 text-cyan-300" />
              <span>Fused IMU + Camera</span>
              <span className="text-[10px] bg-cyan-900/80 text-cyan-200 px-1 rounded uppercase font-bold">PRO</span>
            </button>

            <button
              onClick={() => onSelectMode('phone_imu')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                trackingMode === 'phone_imu'
                  ? 'bg-cyan-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
              title="Standalone Phone IMU tracking without camera"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Phone IMU Only</span>
            </button>

            <button
              onClick={() => onSelectMode('optical_camera')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                trackingMode === 'optical_camera'
                  ? 'bg-cyan-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
              title="Camera marker tracking only (ArUco)"
            >
              <Video className="w-3.5 h-3.5" />
              <span>Camera (ArUco)</span>
            </button>

            <button
              onClick={() => onSelectMode('touch_simulator')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                trackingMode === 'touch_simulator'
                  ? 'bg-cyan-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
              title="Manual slider track"
            >
              <Move className="w-3.5 h-3.5" />
              <span>Manual Track</span>
            </button>
          </div>
        </div>

        {/* Haptic Toggle, ESP32 End Switch Status & Hardware Guide */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Haptic Feedback Toggle */}
          <div className="inline-flex items-center bg-slate-950 rounded-xl border border-slate-800 p-0.5">
            <button
              onClick={onToggleHaptic}
              title={
                hapticEnabled
                  ? 'Haptic coaching active: Subtle vibration pulses alert on travel angle or speed deviations. Click to turn OFF.'
                  : 'Haptic coaching disabled. Click to turn ON.'
              }
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                hapticEnabled
                  ? recentHapticEvent
                    ? 'bg-amber-950 border border-amber-500 text-amber-300 shadow-md animate-pulse'
                    : 'bg-cyan-950/70 border border-cyan-700/70 text-cyan-300 hover:bg-cyan-900/60'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {hapticEnabled ? (
                <Vibrate className={`w-3.5 h-3.5 ${recentHapticEvent ? 'animate-bounce text-amber-400' : 'text-cyan-400'}`} />
              ) : (
                <VibrateOff className="w-3.5 h-3.5 text-slate-500" />
              )}
              <span>{hapticEnabled ? 'Haptics ON' : 'Haptics OFF'}</span>
            </button>

            {hapticEnabled && (
              <button
                onClick={onTestHaptic}
                className="px-2 py-1.5 text-[10px] font-mono text-slate-400 hover:text-cyan-300 transition hover:bg-slate-900 rounded-r-lg border-l border-slate-800"
                title="Test subtle haptic vibration pulse on phone"
              >
                Test
              </button>
            )}
          </div>

          {/* End Switch Status Button */}
          <button
            onClick={onToggleTrigger}
            title="Toggle switch trigger armed state (also responds to ESP32 Pin D1 or Spacebar)"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider border transition shadow-md ${
              bleState.isArmed
                ? 'bg-amber-500/20 border-amber-500 text-amber-300 animate-pulse'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>
              End Switch: {bleState.isArmed ? 'ARMED' : 'RELEASED'}
            </span>
          </button>

          <button
            onClick={onOpenHardwareGuide}
            className="p-1.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-cyan-400 hover:border-cyan-700 transition"
            title="ESP32 Wiring & Hardware Guide"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Live Active Technique Haptic Alert Banner (if actively deviating) */}
      {hapticEnabled && currentDeviation?.hasDeviation && (
        <div className="bg-amber-950/60 border border-amber-500/60 rounded-xl px-3 py-2 flex items-center justify-between gap-2 text-xs text-amber-200 animate-fade-in">
          <div className="flex items-center gap-2">
            <Vibrate className="w-4 h-4 text-amber-400 animate-pulse shrink-0" />
            <span className="font-semibold text-amber-300">
              Haptic Coaching Alert:
            </span>
            <span className="font-mono text-amber-100">
              {currentDeviation.primaryReason}
            </span>
          </div>
          <span className="text-[10px] font-mono uppercase bg-amber-900/80 text-amber-200 px-2 py-0.5 rounded border border-amber-700 shrink-0">
            Pulsing Tactile Warning
          </span>
        </div>
      )}

      {/* When Phone IMU is active (in either standalone or fused mode): show live sensor readouts and Tare */}
      {isImuActiveInMode && (
        <div className="bg-slate-950/80 rounded-xl p-3 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 text-cyan-400 font-medium">
              <Compass className="w-4 h-4" />
              <span>Phone IMU Tilt:</span>
              <span className="font-mono text-white bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                Push: {imuData.travelAngle_deg > 0 ? `+${imuData.travelAngle_deg}` : imuData.travelAngle_deg}°
              </span>
              <span className="font-mono text-purple-300 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                Work: {imuData.workAngle_deg}°
              </span>
              <span className="font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                Roll: {imuData.rollAngle_deg}°
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-emerald-400 font-medium">
              <Gauge className="w-4 h-4" />
              <span>Speed:</span>
              <span className="font-mono text-white bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                {imuData.linearSpeed_mm_s.toFixed(1)} mm/s ({imuData.linearSpeed_ipm.toFixed(0)} IPM)
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onCalibrateZero}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-cyan-600/80 hover:bg-cyan-500 text-white text-xs font-semibold shadow transition"
              title="Tare current angle to match standard torch posture (12° push, target work angle)"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Tare / Zero Angles</span>
            </button>

            {trackingMode === 'phone_imu' && (
              <button
                onClick={onResetDisplacement}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
                title="Reset torch position to seam start (0mm)"
              >
                Reset 0mm
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
