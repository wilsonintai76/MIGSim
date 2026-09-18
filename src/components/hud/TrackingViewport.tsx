import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Battery,
  BatteryCharging,
  Bluetooth,
  Camera,
  Compass,
  Crosshair,
  Flame,
  Gauge,
  Navigation,
  Radio,
  Smartphone,
  Sparkles,
  Vibrate,
  VibrateOff,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { BLESensorState, TorchPose, TrackingMode, WPSProcedure, WeldingParameters, LiveTorchSample } from '../../types';
import { HapticEvent } from '../../services/hapticFeedback';

interface TrackingViewportProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  cameraActive: boolean;
  cameraError: string | null;
  onStartCamera: () => void;
  isArcActive: boolean;
  voltage_V: number;
  bleState: BLESensorState;
  onConnectBLE: () => void;
  soundMuted: boolean;
  onToggleSound: () => void;
  activeDefects: string[];
  trackingMode?: TrackingMode;
  currentPose?: TorchPose;
  currentSpeed_mm_s?: number;
  onToggleTrigger?: () => void;
  hapticEnabled?: boolean;
  onToggleHaptic?: () => void;
  recentHapticEvent?: HapticEvent | null;
  activeWps?: WPSProcedure;
  showTrajectoryOverlay?: boolean;
  onToggleTrajectoryOverlay?: () => void;
  onOpenCalibration?: () => void;
  isCalibrated?: boolean;
  calibrationAccuracy?: number;
  recordedSamples?: LiveTorchSample[];
  parameters?: WeldingParameters;
  focusDistance?: number;
  onFocusDistanceChange?: (value: number) => void;
  focusMode?: 'auto' | 'manual';
  onFocusModeChange?: (mode: 'auto' | 'manual') => void;
}

export const TrackingViewport: React.FC<TrackingViewportProps> = React.memo(
  ({
    videoRef,
    canvasRef,
    cameraActive,
    cameraError,
    onStartCamera,
    isArcActive,
    voltage_V,
    bleState,
    onConnectBLE,
    soundMuted,
    onToggleSound,
    activeDefects,
    trackingMode = 'phone_imu',
    currentPose = {
      travelAngle_deg: 12,
      workAngle_deg: 90,
      x_mm: 30,
      y_mm: 0,
      z_mm: 12,
      rollAngle_deg: 0,
      timestamp_ms: 0,
      isMarkerDetected: true,
    },
    currentSpeed_mm_s = 5.5,
    onToggleTrigger,
    hapticEnabled = true,
    onToggleHaptic,
    recentHapticEvent,
    activeWps,
    showTrajectoryOverlay = true,
    onToggleTrajectoryOverlay,
    onOpenCalibration,
    isCalibrated = false,
    calibrationAccuracy = 98.4,
    recordedSamples = [],
    parameters,
    focusDistance = 0.6,
    onFocusDistanceChange,
    focusMode = 'auto',
    onFocusModeChange,
  }) => {
    // Dynamic Shadow Pacer Position Loop
    const [pacerX_mm, setPacerX_mm] = useState<number>(10);
    const lastPacerTimeRef = useRef<number>(performance.now());
    const animFrameRef = useRef<number>(0);

    // Battery Status API Integration
    interface BatteryInfo {
      level: number;
      charging: boolean;
      supported: boolean;
    }

    const [battery, setBattery] = useState<BatteryInfo>({
      level: 0.88,
      charging: false,
      supported: false,
    });

    const [isGaugeCollapsed, setIsGaugeCollapsed] = useState<boolean>(false);

    useEffect(() => {
      let batteryObj: any = null;
      let onLevelChange: (() => void) | null = null;
      let onChargingChange: (() => void) | null = null;

      const updateBatteryStatus = (batt: any) => {
        setBattery({
          level: batt.level,
          charging: batt.charging,
          supported: true,
        });
      };

      if (typeof navigator !== 'undefined' && 'getBattery' in navigator) {
        (navigator as any).getBattery().then((batt: any) => {
          batteryObj = batt;
          updateBatteryStatus(batt);

          onLevelChange = () => updateBatteryStatus(batt);
          onChargingChange = () => updateBatteryStatus(batt);

          batt.addEventListener('levelchange', onLevelChange);
          batt.addEventListener('chargingchange', onChargingChange);
        }).catch((err: any) => {
          console.warn('Battery Status API rejected:', err);
        });
      } else {
        // Safe mock fallback for unsupported browsers
        const interval = setInterval(() => {
          setBattery((prev) => {
            if (prev.charging) {
              const nextLevel = Math.min(1.0, prev.level + 0.01);
              return {
                ...prev,
                level: parseFloat(nextLevel.toFixed(2)),
                charging: nextLevel < 1.0,
              };
            } else {
              const nextLevel = Math.max(0.05, prev.level - 0.005);
              return {
                ...prev,
                level: parseFloat(nextLevel.toFixed(3)),
                charging: false,
              };
            }
          });
        }, 15000);

        return () => clearInterval(interval);
      }

      return () => {
        if (batteryObj) {
          if (onLevelChange) batteryObj.removeEventListener('levelchange', onLevelChange);
          if (onChargingChange) batteryObj.removeEventListener('chargingchange', onChargingChange);
        }
      };
    }, []);

    const handleBatteryClick = () => {
      if (!battery.supported) {
        setBattery((prev) => {
          let nextLevel = 0.88;
          let nextCharging = false;
          if (prev.level >= 0.85) {
            nextLevel = 0.42;
          } else if (prev.level >= 0.40) {
            nextLevel = 0.15;
          } else if (prev.level >= 0.12) {
            nextLevel = 0.05;
            nextCharging = true;
          } else {
            nextLevel = 0.88;
            nextCharging = false;
          }
          return {
            level: nextLevel,
            charging: nextCharging,
            supported: false,
          };
        });
      }
    };

    const idealSpeed_mm_s = activeWps
      ? (activeWps.targetTravelSpeedMin_mm_s + activeWps.targetTravelSpeedMax_mm_s) / 2
      : 6.0;

    useEffect(() => {
      if (!showTrajectoryOverlay) return;

      const loop = (now: number) => {
        const dt = (now - lastPacerTimeRef.current) / 1000;
        lastPacerTimeRef.current = now;

        setPacerX_mm((prev) => {
          const next = prev + idealSpeed_mm_s * dt;
          return next > 200 ? 0 : next;
        });

        animFrameRef.current = requestAnimationFrame(loop);
      };

      lastPacerTimeRef.current = performance.now();
      animFrameRef.current = requestAnimationFrame(loop);

      return () => cancelAnimationFrame(animFrameRef.current);
    }, [showTrajectoryOverlay, idealSpeed_mm_s]);

    // WebRTC Physical Camera Manual Focus Control Integration
    useEffect(() => {
      if (!cameraActive || !videoRef.current) return;
      
      const stream = videoRef.current.srcObject as MediaStream | null;
      if (!stream) return;

      const track = stream.getVideoTracks()[0];
      if (!track) return;

      const applyFocusConstraints = async () => {
        try {
          if (!track.getCapabilities) return;
          const capabilities = track.getCapabilities() as any;

          // If the browser and hardware support focusMode control
          if (capabilities.focusMode && capabilities.focusMode.includes('manual')) {
            if (focusMode === 'manual') {
              // Determine focusDistance limits (typically in diopters, e.g. 0 to 10 or 12)
              const minDist = capabilities.focusDistance?.min ?? 0;
              const maxDist = capabilities.focusDistance?.max ?? 10;
              const targetDist = minDist + focusDistance * (maxDist - minDist);

              await track.applyConstraints({
                advanced: [{
                  focusMode: 'manual',
                  focusDistance: targetDist
                }]
              } as any);
            } else {
              // Re-enable autofocus
              await track.applyConstraints({
                advanced: [{
                  focusMode: 'continuous'
                }]
              } as any);
            }
          }
        } catch (err) {
          console.warn('Physical camera manual focus constraint not supported on this browser/hardware:', err);
        }
      };

      applyFocusConstraints();
    }, [cameraActive, videoRef, focusDistance, focusMode]);

    // Calculate simulated focus metrics
    const deltaFocus = Math.abs(focusDistance - 0.6); // 0.6 is optimal sharpness
    const sharpnessScore = focusMode === 'manual'
      ? Math.round(Math.max(12, 100 - deltaFocus * 220))
      : 98; // auto-focus maintains peak clarity

    const simulatedBlur = focusMode === 'manual' ? Math.max(0, deltaFocus * 8) : 0;
    const simulatedContrast = focusMode === 'manual' ? 100 + (1 - deltaFocus) * 35 : 100;

    const activeTorchX = currentPose.x_mm;
    const deltaMm = activeTorchX - pacerX_mm;
    const isPacerClose = Math.abs(deltaMm) <= 4;

    // Heat map color calculation for the live torch trail based on thermal heat input (kJ/mm)
    const getHeatColor = (speed: number) => {
      if (!activeWps) return '#10b981';
      const current_A = parameters?.current_A || 130;
      const safeSpeed = Math.max(0.5, speed);
      const heatInput = (0.8 * voltage_V * current_A) / (safeSpeed * 1000);

      if (heatInput < 0.45) {
        return '#3b82f6'; // Too Cold (Lack of fusion - blue)
      } else if (heatInput < 0.65) {
        return '#06b6d4'; // Cool (cyan)
      } else if (heatInput <= 1.10) {
        return '#10b981'; // Optimal heat input (emerald)
      } else if (heatInput <= 1.45) {
        return '#f59e0b'; // Warm (amber)
      } else {
        return '#ef4444'; // Too Hot (Burn-through risk - red)
      }
    };

    const currentHeatColor = getHeatColor(currentSpeed_mm_s);

    return (
      <div className="relative w-full aspect-video sm:aspect-[16/9] max-h-[440px] bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden shadow-2xl flex items-center justify-center select-none">
        {/* Camera Feed & AR Canvas (Used in both Optical and Fused IMU+Camera modes) */}
        {(trackingMode === 'optical_camera' || trackingMode === 'fused_imu_camera') && (
          <>
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className={`w-full h-full object-cover transition-all duration-150 ${!cameraActive ? 'hidden' : ''}`}
              style={{
                filter: focusMode === 'manual'
                  ? `blur(${simulatedBlur}px) contrast(${simulatedContrast}%)`
                  : 'none',
              }}
            />
            <canvas
              ref={canvasRef}
              width={640}
              height={480}
              className={`absolute inset-0 w-full h-full pointer-events-none ${
                !cameraActive ? 'hidden' : ''
              }`}
            />
            {!cameraActive && (
              <div className="absolute inset-0 w-full h-full bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex flex-col items-center justify-center p-6 text-center">
                <div className="w-full max-w-lg flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-cyan-950/80 border border-cyan-800 flex items-center justify-center text-cyan-400">
                    <Camera className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-semibold text-slate-200">
                    {trackingMode === 'fused_imu_camera'
                      ? 'Fused Tracking Standby (Camera + Phone IMU)'
                      : 'Camera Tracking Standby'}
                  </h3>
                  <p className="text-xs text-slate-400 max-w-md">
                    {trackingMode === 'fused_imu_camera'
                      ? 'Start camera to combine optical marker tracking with phone gyroscopic tilt angles for high-precision, occlusion-resistant tracking.'
                      : 'Start your camera to track the 50mm ArUco fiducial tag mounted on your torch.'}
                  </p>
                  {cameraError && (
                    <p className="text-[11px] text-amber-400/90 max-w-md bg-amber-950/50 border border-amber-800/60 rounded-lg p-2">
                      {cameraError}
                    </p>
                  )}
                  <button
                    onClick={onStartCamera}
                    className="px-3.5 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow-md transition flex items-center gap-1.5"
                  >
                    <Camera className="w-3.5 h-3.5" /> Start Phone Camera
                  </button>
                </div>
              </div>
            )}

            {/* Fused Mode Active Badge */}
            {cameraActive && trackingMode === 'fused_imu_camera' && (
              <div className="absolute top-3 left-3 flex items-center gap-2 bg-slate-950/90 border border-cyan-500/80 px-3 py-1.5 rounded-xl text-xs font-mono font-bold text-cyan-300 backdrop-blur-md shadow-xl z-20">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                <span>FUSED: IMU TILT + ARUCO</span>
                <span className="text-emerald-400 bg-emerald-950/80 px-1.5 py-0.5 rounded text-[10px] border border-emerald-800 font-mono">
                  {Math.round((currentPose.fusionConfidence ?? 0.85) * 100)}% CONF
                </span>
              </div>
            )}

            {/* Real-time Digital Focus Assistant Banner */}
            {cameraActive && (
              <div className="absolute top-3 right-32 hidden lg:flex items-center gap-2 bg-slate-950/90 border border-slate-800/80 px-3 py-1.5 rounded-xl text-[10px] font-mono text-slate-300 backdrop-blur-md shadow-xl z-20 animate-fade-in">
                <span className="text-slate-500">SHARPNESS:</span>
                <strong className={sharpnessScore >= 75 ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold animate-pulse'}>
                  {sharpnessScore}%
                </strong>
                <span className="text-slate-700">|</span>
                <span className="text-slate-500">FOCUS LENS:</span>
                <span className="text-cyan-400 font-bold">
                  {focusMode === 'manual' ? `${Math.round(focusDistance * 100)}% (MAN)` : 'AUTO-FOCUS'}
                </span>
                <span className="text-slate-700">|</span>
                <span className="text-slate-500">TRACKER:</span>
                <span className={currentPose.isMarkerDetected ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold animate-pulse'}>
                  {currentPose.isMarkerDetected ? 'ACQUIRED' : 'BLURRY / SEARCHING'}
                </span>
              </div>
            )}

            {/* Cinematic Camera Focus Control Overlay Panel (Left Side) */}
            {cameraActive && (
              <div className="absolute left-3 top-16 bottom-16 w-14 bg-slate-950/90 border border-slate-800/60 rounded-2xl p-2.5 flex flex-col items-center justify-between backdrop-blur-md shadow-2xl z-20 animate-fade-in gap-2.5">
                <span className="text-[9px] font-bold font-mono tracking-widest text-slate-400 uppercase select-none">FOCUS</span>
                
                <div className="flex-1 flex flex-col items-center justify-center relative w-full py-1">
                  {/* Vertical Range Slider */}
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.05"
                    value={focusDistance}
                    disabled={focusMode === 'auto'}
                    onChange={(e) => onFocusDistanceChange && onFocusDistanceChange(parseFloat(e.target.value))}
                    className="accent-cyan-400 cursor-ns-resize h-full w-1.5 rounded-full appearance-none bg-slate-800 focus:outline-none disabled:opacity-20 disabled:cursor-not-allowed"
                    style={{
                      writingMode: 'vertical-lr',
                      direction: 'rtl',
                      WebkitAppearance: 'slider-vertical' as any,
                    }}
                    title="Slide to manually focus the phone's camera"
                  />
                </div>

                <div className="flex flex-col gap-1 w-full">
                  <span className="text-[9px] font-mono text-center text-cyan-400 select-none font-bold">
                    {focusMode === 'manual' ? `${Math.round(focusDistance * 100)}%` : 'AF'}
                  </span>
                  <button
                    onClick={() => onFocusModeChange && onFocusModeChange(focusMode === 'auto' ? 'manual' : 'auto')}
                    className={`w-full py-1.5 rounded-lg text-[9px] font-bold font-mono transition-all duration-150 uppercase text-center ${
                      focusMode === 'manual'
                        ? 'bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/25 border border-cyan-400/30'
                        : 'bg-slate-800/80 text-slate-300 border border-slate-700/50 hover:bg-slate-700 hover:text-white'
                    }`}
                    title={focusMode === 'manual' ? 'Enable Continuous Autofocus' : 'Enable Manual Focus'}
                  >
                    {focusMode === 'manual' ? 'MAN' : 'AUTO'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Phone IMU Mode: Digital Flight / Torch Attitude Indicator */}
        {trackingMode === 'phone_imu' && (
          <div className="absolute inset-0 w-full h-full bg-slate-950 flex flex-col items-center justify-center p-4">
            {/* Background Grid Lines & Weld Joint Axis */}
            <div className="absolute inset-0 opacity-15 pointer-events-none">
              <div className="w-full h-full bg-[linear-gradient(to_right,#334155_1px,transparent_1px),linear-gradient(to_bottom,#334155_1px,transparent_1px)] bg-[size:40px_40px]" />
            </div>

            {/* Weld Seam Path Line with Heat Map Trail & Shadow Path Guide */}
            <div className="absolute inset-x-8 top-1/2 -translate-y-1/2 h-2 bg-slate-900 rounded-full border border-slate-800">
              {/* Centerline Joint Groove */}
              <div className="absolute inset-0 border-b border-dashed border-slate-700/60" />

              {/* WPS Tolerance Corridor Glow (±2mm safe zone) */}
              {showTrajectoryOverlay && (
                <div className="absolute -inset-y-3 inset-x-0 bg-cyan-500/[0.04] border-y border-dashed border-cyan-500/20 pointer-events-none rounded-lg" />
              )}

              {/* Live Thermal Heat Map Trail behind Welder Torch */}
              {showTrajectoryOverlay && (
                <div className="absolute inset-0 rounded-full overflow-hidden pointer-events-none">
                  <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none">
                    {(() => {
                      const maxLen = 200; // Coupon length is 200mm
                      const current_A = parameters?.current_A || 130;

                      if (!recordedSamples || recordedSamples.length < 2) {
                        // Fallback: draw single colored block up to the active torch position
                        const activeWidthPercent = Math.max(0, Math.min(100, (activeTorchX / maxLen) * 100));
                        return (
                          <line
                            x1="0%"
                            y1="50%"
                            x2={`${activeWidthPercent}%`}
                            y2="50%"
                            stroke={currentHeatColor}
                            strokeWidth={8}
                            strokeLinecap="round"
                            style={{ filter: `drop-shadow(0 0 3px ${currentHeatColor})` }}
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
                            strokeWidth={8}
                            strokeLinecap="round"
                          />
                        );
                      }
                      return lines;
                    })()}
                  </svg>
                </div>
              )}

              {/* Ideal Shadow Pacer Lead Cursor */}
              {showTrajectoryOverlay && (
                <div
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-6 h-6 rounded-full border-2 border-cyan-400 bg-cyan-950/70 shadow-[0_0_15px_#22d3ee] flex items-center justify-center pointer-events-none transition-all duration-75 z-10"
                  style={{ left: `${Math.max(5, Math.min(95, (pacerX_mm / 200) * 100))}%` }}
                >
                  <div className="w-2 h-2 rounded-full bg-cyan-300 animate-ping" />
                  <span className="absolute -top-5 px-1 py-0.2 rounded text-[7px] font-mono font-bold bg-cyan-950 text-cyan-300 border border-cyan-700 whitespace-nowrap">
                    SHADOW PACER
                  </span>
                </div>
              )}

              {/* Active Welder Torch tip position along the line */}
              <div
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-amber-400 border-2 border-white shadow-[0_0_15px_#f59e0b] z-20"
                style={{ left: `${Math.max(5, Math.min(95, (activeTorchX / 200) * 100))}%` }}
              />
            </div>

            {/* Central Gyroscopic Horizon & Angle Reticle */}
            <div className="relative w-48 h-48 sm:w-56 sm:h-56 rounded-full border border-slate-700/80 bg-slate-900/60 flex items-center justify-center shadow-inner">
              {/* Outer compass ring */}
              <div className="absolute inset-2 rounded-full border border-dashed border-slate-700/60 pointer-events-none" />

              {/* Pitch & Roll Artificial Horizon Line */}
              <div
                className="absolute w-36 h-1 bg-cyan-400/80 rounded transition-transform duration-75 shadow-[0_0_10px_#22d3ee]"
                style={{
                  transform: `rotate(${currentPose.workAngle_deg - 90}deg) translateY(${-currentPose.travelAngle_deg * 1.5}px)`,
                }}
              />

              {/* Torch Nozzle Aim Reticle */}
              <div className="relative z-10 flex flex-col items-center">
                <div className="w-12 h-12 rounded-xl border-2 border-cyan-400/80 bg-cyan-950/40 flex items-center justify-center text-cyan-300">
                  <Smartphone className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-mono text-cyan-300 mt-1 uppercase font-bold tracking-wider">
                  Torch Axis
                </span>
              </div>

              {/* Target Push Angle Bracket (10° - 15°) */}
              <div className="absolute top-4 text-[10px] font-mono text-emerald-400 font-semibold bg-slate-950/80 px-2 py-0.5 rounded border border-emerald-800">
                {activeWps ? `${activeWps.targetTravelAngleMin_deg}°-` : '10°-'}
                {activeWps ? `${activeWps.targetTravelAngleMax_deg}° PUSH ZONE` : '15° PUSH ZONE'}
              </div>
            </div>

            {/* Bottom Telemetry HUD overlay in viewport */}
            <div className="absolute bottom-3 inset-x-4 flex items-center justify-between text-xs font-mono">
              <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-800 px-3 py-1.5 rounded-xl shadow-lg">
                <Compass className="w-4 h-4 text-amber-400" />
                <span className="text-slate-300">
                  Push: <strong className="text-white">{currentPose.travelAngle_deg > 0 ? `+${currentPose.travelAngle_deg}` : currentPose.travelAngle_deg}°</strong>
                </span>
                <span className="text-slate-500">|</span>
                <span className="text-slate-300">
                  Work: <strong className="text-purple-300">{currentPose.workAngle_deg}°</strong>
                </span>
              </div>

              <div className="hidden md:flex items-center gap-2 bg-slate-900/90 border border-slate-800 px-3 py-1.5 rounded-xl shadow-lg">
                <span className="w-2.5 h-2.5 rounded-full animate-pulse shadow-md" style={{ backgroundColor: currentHeatColor }} />
                <span className="text-slate-300">
                  Heat: <strong style={{ color: currentHeatColor }}>
                    {(() => {
                      const current_A = parameters?.current_A || 130;
                      const safeSpeed = Math.max(0.5, currentSpeed_mm_s);
                      return ((0.8 * voltage_V * current_A) / (safeSpeed * 1000)).toFixed(2);
                    })()} kJ/mm
                  </strong>
                </span>
              </div>

              <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-800 px-3 py-1.5 rounded-xl shadow-lg">
                <Gauge className="w-4 h-4 text-cyan-400" />
                <span className="text-slate-300">
                  Speed: <strong className="text-white">{currentSpeed_mm_s.toFixed(1)} mm/s</strong>
                </span>
                <span className="text-slate-500">({(currentSpeed_mm_s * 2.36).toFixed(0)} IPM)</span>
              </div>
            </div>
          </div>
        )}

        {/* Manual Touch Simulator Mode */}
        {trackingMode === 'touch_simulator' && (
          <div className="absolute inset-0 w-full h-full bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-full max-w-md flex flex-col items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-200">
                Interactive Seam Track Active
              </h3>
              <p className="text-xs text-slate-400">
                Drag the flame cursor across the coupon below or press the trigger switch to run a pass.
              </p>
            </div>
          </div>
        )}

        {/* Floating Real-Time WPS Shadow Pacer Delta Banner (Top-Center) */}
        {showTrajectoryOverlay && activeWps && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 hidden sm:flex items-center gap-2 px-3 py-1 rounded-xl bg-slate-950/90 border border-cyan-500/70 text-cyan-300 text-xs font-mono shadow-xl backdrop-blur-md">
            <Navigation className="w-3.5 h-3.5 text-cyan-400" />
            <span>PACER:</span>
            <strong
              className={
                isPacerClose
                  ? 'text-emerald-400 font-bold'
                  : deltaMm > 0
                  ? 'text-amber-400 font-bold'
                  : 'text-cyan-400 font-bold'
              }
            >
              {isPacerClose
                ? 'IN THE POCKET (±1mm)'
                : deltaMm > 0
                ? `+${deltaMm.toFixed(1)}mm FAST`
                : `${deltaMm.toFixed(1)}mm BEHIND`}
            </strong>
            <span className="text-slate-500">|</span>
            <span className="text-slate-300">{idealSpeed_mm_s.toFixed(1)} mm/s WPS</span>
          </div>
        )}

        {/* Arc Flash & Spark Particle Overlay */}
        {isArcActive && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
            {/* Blinding Arc Glow Center */}
            <div className="w-28 h-28 rounded-full bg-cyan-300/40 blur-xl animate-pulse" />
            <div className="w-10 h-10 rounded-full bg-white shadow-[0_0_60px_#38bdf8] animate-ping" />
            <div className="absolute top-3 left-3 flex items-center gap-2 bg-amber-500/95 text-slate-950 px-3.5 py-1.5 rounded-full text-xs font-black uppercase tracking-wider animate-bounce shadow-xl">
              <Flame className="w-4 h-4" /> ARC IGNITED ({voltage_V}V)
            </div>
          </div>
        )}

        {/* Top Floating Action Controls */}
        <div className="absolute top-3 right-3 flex items-center gap-2 z-20">
          {/* Trainer Device Battery Status Pill */}
          <button
            onClick={handleBatteryClick}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border backdrop-blur-md shadow-lg text-xs font-mono font-bold transition select-none ${
              battery.level <= 0.20
                ? 'bg-red-950/90 border-red-500 text-red-400 animate-pulse'
                : battery.level <= 0.45
                ? 'bg-amber-950/90 border-amber-500 text-amber-400'
                : 'bg-slate-900/80 border-slate-700 text-slate-300'
            }`}
            title={`${battery.charging ? 'Charging' : 'Discharging'} - ${Math.round(battery.level * 100)}% (${
              battery.supported ? 'System Hardware API' : 'Simulated Sandbox. Click to test.'
            })`}
          >
            {battery.charging ? (
              <BatteryCharging className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            ) : (
              <Battery
                className={`w-3.5 h-3.5 ${
                  battery.level <= 0.20 ? 'text-red-500' : battery.level <= 0.45 ? 'text-amber-500' : 'text-emerald-400'
                }`}
              />
            )}
            <span>{Math.round(battery.level * 100)}%</span>
            {!battery.supported && (
              <span className="text-[7px] text-slate-500 uppercase px-1 rounded bg-slate-800">MOCK</span>
            )}
          </button>

          {/* Calibration Wizard Button */}
          {onOpenCalibration && (
            <button
              onClick={onOpenCalibration}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border backdrop-blur-md shadow-lg text-xs font-mono font-bold transition ${
                isCalibrated
                  ? 'bg-emerald-950/90 border-emerald-500 text-emerald-300 ring-1 ring-emerald-500/40'
                  : 'bg-amber-950/90 border-amber-500 text-amber-300 animate-pulse'
              }`}
              title="Open 3-Step Torch Tracking Calibration Wizard"
            >
              <Crosshair className="w-3.5 h-3.5" />
              <span>{isCalibrated ? `${calibrationAccuracy.toFixed(0)}% CAL` : 'CALIBRATE'}</span>
            </button>
          )}

          {/* WPS Shadow Guide & Heat Map Overlay Toggle */}
          {onToggleTrajectoryOverlay && (
            <button
              onClick={onToggleTrajectoryOverlay}
              className={`p-1.5 rounded-xl border backdrop-blur-md shadow-lg transition ${
                showTrajectoryOverlay
                  ? 'bg-cyan-950/90 border-cyan-500 text-cyan-300 ring-2 ring-cyan-500/30'
                  : 'bg-slate-900/80 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
              title={
                showTrajectoryOverlay
                  ? 'WPS Ideal Shadow Guide & Heat Map Active. Click to hide.'
                  : 'Show Ideal WPS Shadow Guide & Real-Time Heat Map.'
              }
            >
              <Navigation className="w-4 h-4" />
            </button>
          )}

          {/* BLE Status Button */}
          <button
            onClick={onConnectBLE}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold backdrop-blur-md border transition shadow-lg ${
              bleState.isConnected
                ? bleState.simulated
                  ? 'bg-purple-950/80 border-purple-600 text-purple-200'
                  : 'bg-emerald-950/80 border-emerald-600 text-emerald-200'
                : 'bg-slate-900/80 border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Bluetooth
              className={`w-3.5 h-3.5 ${
                bleState.isConnected ? 'text-cyan-400' : 'text-slate-400'
              }`}
            />
            <span>
              {bleState.isConnected
                ? bleState.simulated
                  ? 'BLE: Mock ESP32'
                  : `BLE: ${bleState.deviceName || 'Connected'}`
                : 'Pair ESP32'}
            </span>
          </button>

          {/* Trigger Armed Indicator */}
          <button
            onClick={onToggleTrigger}
            title="ESP32 Trigger End Switch (Pin D1). Click or press Spacebar to toggle."
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold backdrop-blur-md border shadow-lg transition cursor-pointer ${
              bleState.isArmed
                ? 'bg-amber-950/90 border-amber-500 text-amber-300 shadow-amber-500/20'
                : 'bg-slate-900/80 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Radio
              className={`w-3.5 h-3.5 ${bleState.isArmed ? 'animate-pulse text-amber-400' : ''}`}
            />
            <span>{bleState.isArmed ? 'SWITCH: ARMED' : 'SWITCH: RELEASED'}</span>
          </button>

          {/* Audio Mute Toggle */}
          <button
            onClick={onToggleSound}
            className="p-1.5 rounded-xl bg-slate-900/80 border border-slate-700 text-slate-300 hover:text-white backdrop-blur-md shadow-lg"
            title={soundMuted ? 'Unmute Arc Audio' : 'Mute Arc Audio'}
          >
            {soundMuted ? (
              <VolumeX className="w-4 h-4" />
            ) : (
              <Volume2 className="w-4 h-4 text-cyan-400" />
            )}
          </button>

          {/* Vibration / Haptic Feedback Toggle */}
          {onToggleHaptic && (
            <button
              onClick={onToggleHaptic}
              className={`p-1.5 rounded-xl border backdrop-blur-md shadow-lg transition ${
                hapticEnabled
                  ? recentHapticEvent
                    ? 'bg-amber-950/90 border-amber-500 text-amber-300 ring-2 ring-amber-400/50 shadow-amber-500/20'
                    : 'bg-slate-900/80 border-slate-700 text-cyan-400 hover:text-white'
                  : 'bg-slate-900/80 border-slate-700 text-slate-500 hover:text-slate-300'
              }`}
              title={
                hapticEnabled
                  ? 'Haptic Feedback Active (Subtle vibration pulses on angle & speed deviations). Click to disable.'
                  : 'Haptic Feedback Disabled. Click to enable.'
              }
            >
              {hapticEnabled ? (
                <Vibrate className={`w-4 h-4 ${recentHapticEvent ? 'animate-pulse text-amber-300' : ''}`} />
              ) : (
                <VibrateOff className="w-4 h-4" />
              )}
            </button>
          )}
        </div>

        {/* Real-Time Torch Tilt Gauge Floating HUD Widget */}
        {(() => {
          const targetTravelMin = activeWps ? activeWps.targetTravelAngleMin_deg : 15;
          const targetTravelMax = activeWps ? activeWps.targetTravelAngleMax_deg : 20;
          const targetWorkAngle = parameters?.jointType === 't_fillet' ? 45 : 90;
          const workAngleDev = currentPose.workAngle_deg - targetWorkAngle;

          const isInsideTravel = currentPose.travelAngle_deg >= targetTravelMin && currentPose.travelAngle_deg <= targetTravelMax;
          const isInsideWork = Math.abs(workAngleDev) <= 5;
          const isPerfect = isInsideTravel && isInsideWork;

          const isCloseTravel = currentPose.travelAngle_deg >= targetTravelMin - 4 && currentPose.travelAngle_deg <= targetTravelMax + 4;
          const isCloseWork = Math.abs(workAngleDev) <= 10;
          const isClose = isCloseTravel && isCloseWork;

          const dotX = 50 + (currentPose.travelAngle_deg * 1.33);
          const dotY = 50 - (workAngleDev * 1.33);

          const clampedDotX = Math.max(8, Math.min(92, dotX));
          const clampedDotY = Math.max(8, Math.min(92, dotY));

          const rectXMin = 50 + (targetTravelMin * 1.33);
          const rectXMax = 50 + (targetTravelMax * 1.33);
          const rectWidth = rectXMax - rectXMin;

          const rectYMin = 50 - (5 * 1.33);
          const rectHeight = 10 * 1.33;

          let guidanceLabel = "OUT OF LIMITS";
          let guidanceColor = "text-red-400 border-red-500/20";
          if (isPerfect) {
            guidanceLabel = "PERFECT TILT!";
            guidanceColor = "text-emerald-400 font-extrabold animate-pulse border-emerald-500/40";
          } else if (isInsideTravel) {
            if (workAngleDev > 5) {
              guidanceLabel = "TILT LOWER (WORK)";
              guidanceColor = "text-amber-400 border-amber-500/30";
            } else {
              guidanceLabel = "TILT HIGHER (WORK)";
              guidanceColor = "text-amber-400 border-amber-500/30";
            }
          } else if (isInsideWork) {
            if (currentPose.travelAngle_deg < targetTravelMin) {
              guidanceLabel = "MORE PUSH TILT";
              guidanceColor = "text-amber-400 border-amber-500/30";
            } else {
              guidanceLabel = "LESS PUSH TILT";
              guidanceColor = "text-amber-400 border-amber-500/30";
            }
          } else {
            guidanceLabel = "CORRECT TILT";
            guidanceColor = "text-red-400 border-red-500/20";
          }

          return (
            <div className="absolute top-14 right-3 z-30 flex flex-col items-end gap-1.5">
              {isGaugeCollapsed ? (
                <button
                  onClick={() => setIsGaugeCollapsed(false)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-900/90 text-slate-300 hover:text-white backdrop-blur-md shadow-lg text-[10px] font-mono font-bold transition select-none cursor-pointer"
                  title="Show Real-time Torch Tilt Gauge"
                >
                  <Compass className="w-3.5 h-3.5 text-cyan-400" />
                  <span>SHOW TILT HUD</span>
                </button>
              ) : (
                <div className="bg-slate-950/95 border border-slate-800 rounded-2xl p-2.5 sm:p-3 shadow-2xl backdrop-blur-md w-36 sm:w-40 text-center font-mono select-none flex flex-col gap-1.5 relative ring-1 ring-slate-800/50">
                  {/* Header */}
                  <div className="flex items-center justify-between text-[9px] font-bold text-slate-400 tracking-wider uppercase border-b border-slate-800 pb-1.5">
                    <span className="flex items-center gap-1">
                      <Compass className="w-3 h-3 text-cyan-400" /> Torch Tilt
                    </span>
                    <button
                      onClick={() => setIsGaugeCollapsed(true)}
                      className="text-slate-500 hover:text-slate-300 font-mono font-normal transition text-[8px] border border-slate-800 px-1 rounded hover:bg-slate-900 cursor-pointer"
                      title="Minimize Torch Tilt Gauge"
                    >
                      HIDE
                    </button>
                  </div>

                  {/* 2D Crosshair Target SVG Dial */}
                  <div className="relative flex items-center justify-center my-1">
                    <svg viewBox="0 0 100 100" className="w-24 h-24 sm:w-28 sm:h-28">
                      {/* Compass grid background circle */}
                      <circle cx="50" cy="50" r="46" fill="#020617" stroke="#1e293b" strokeWidth="1" />
                      <circle cx="50" cy="50" r="30" fill="none" stroke="#1e293b" strokeWidth="0.5" strokeDasharray="2,2" />
                      <circle cx="50" cy="50" r="15" fill="none" stroke="#1e293b" strokeWidth="0.5" strokeDasharray="2,2" />

                      {/* Horizontal and Vertical Crosshair Axis Guides */}
                      <line x1="50" y1="4" x2="50" y2="96" stroke="#334155" strokeWidth="0.5" strokeDasharray="2,2" />
                      <line x1="4" y1="50" x2="96" y2="50" stroke="#334155" strokeWidth="0.5" strokeDasharray="2,2" />

                      {/* SVG Target Zone Box (ideal travel push zone, and ideal work bisector deviation ±5 deg) */}
                      <rect
                        x={rectXMin}
                        y={rectYMin}
                        width={rectWidth}
                        height={rectHeight}
                        fill={isPerfect ? 'rgba(16, 185, 129, 0.25)' : 'rgba(16, 185, 129, 0.08)'}
                        stroke={isPerfect ? '#10b981' : '#10b981/40'}
                        strokeWidth="1.25"
                        rx="1.5"
                      />

                      {/* Ideal Crosshair Pointer (Concentric target rings when perfect) */}
                      {isPerfect && (
                        <circle
                          cx={clampedDotX}
                          cy={clampedDotY}
                          r="9"
                          fill="none"
                          stroke="#10b981"
                          strokeWidth="0.75"
                          className="animate-ping"
                          style={{ transformOrigin: `${clampedDotX}px ${clampedDotY}px` }}
                        />
                      )}

                      {/* Current Position Pointer Dot */}
                      <circle
                        cx={clampedDotX}
                        cy={clampedDotY}
                        r="4"
                        fill={isPerfect ? '#10b981' : isClose ? '#f59e0b' : '#ef4444'}
                        style={{
                          filter: `drop-shadow(0 0 3px ${isPerfect ? '#10b981' : isClose ? '#f59e0b' : '#ef4444'})`,
                        }}
                      />

                      {/* Axis labels inside SVG */}
                      <text x="50" y="11" textAnchor="middle" fill="#475569" fontSize="6" fontWeight="bold">WORK</text>
                      <text x="90" y="52" textAnchor="end" fill="#475569" fontSize="6" fontWeight="bold">PUSH</text>
                    </svg>

                    {/* Target Zone Box Guide Label */}
                    <span className="absolute bottom-1 right-1 text-[7px] font-mono font-bold bg-emerald-950/80 text-emerald-400 px-1 py-0.5 rounded border border-emerald-800/50 uppercase">
                      {targetTravelMin}°-{targetTravelMax}° PUSH
                    </span>
                  </div>

                  {/* Angle Metrics Displays */}
                  <div className="grid grid-cols-2 gap-1 bg-slate-900/60 p-1 rounded-xl border border-slate-800/80 text-[10px]">
                    <div className="flex flex-col items-center">
                      <span className="text-[7px] text-slate-500 uppercase font-bold">TRAVEL</span>
                      <strong className={isInsideTravel ? 'text-emerald-400 font-bold' : 'text-slate-300'}>
                        {currentPose.travelAngle_deg > 0 ? `+${Math.round(currentPose.travelAngle_deg)}` : Math.round(currentPose.travelAngle_deg)}°
                      </strong>
                    </div>
                    <div className="flex flex-col items-center">
                      <span className="text-[7px] text-slate-500 uppercase font-bold">WORK</span>
                      <strong className={isInsideWork ? 'text-emerald-400 font-bold' : 'text-slate-300'}>
                        {Math.round(currentPose.workAngle_deg)}°
                      </strong>
                    </div>
                  </div>

                  {/* Dynamic Guidance Instruction */}
                  <div className={`text-[9px] font-extrabold uppercase leading-tight tracking-wider py-1 px-1.5 rounded-lg border bg-slate-900/40 ${guidanceColor}`}>
                    {guidanceLabel}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* Transient Haptic Pulse Banner */}
        {recentHapticEvent && (
          <div className="absolute top-14 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-950/90 border border-amber-500/80 text-amber-200 text-xs font-semibold shadow-2xl backdrop-blur-md animate-fade-in pointer-events-none">
            <Vibrate className="w-3.5 h-3.5 text-amber-400 animate-bounce" />
            <span className="font-mono text-[11px] uppercase tracking-wide text-amber-300">
              Haptic Pulse: {recentHapticEvent.reason}
            </span>
          </div>
        )}

        {/* Live Active Defect Warning Toast */}
        {activeDefects.length > 0 && isArcActive && (
          <div className="absolute bottom-12 sm:bottom-14 left-3 right-3 sm:right-auto max-w-md bg-red-950/90 border border-red-500/80 text-red-200 px-3.5 py-2 rounded-xl backdrop-blur-md shadow-2xl flex items-center gap-2 text-xs font-semibold z-20 animate-fade-in">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 animate-bounce" />
            <div className="flex flex-col">
              {activeDefects.map((d, i) => (
                <span key={i}>{d}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }
);

TrackingViewport.displayName = 'TrackingViewport';
