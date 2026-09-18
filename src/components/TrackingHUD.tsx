import React, { useEffect, useRef, useState } from 'react';
import { MarkerDetector } from '../services/markerDetector';
import { bleManager } from '../services/bluetoothManager';
import { phoneImuTracker, PhoneImuData } from '../services/phoneImuTracker';
import { soundEngine } from '../services/soundEngine';
import {
  hapticFeedback,
  HapticEvent,
  DeviationStatus,
} from '../services/hapticFeedback';
import {
  BLESensorState,
  LiveTorchSample,
  TorchPose,
  TrackingMode,
  WeldingParameters,
  WPSProcedure,
  TorchCalibrationData,
} from '../types';
import { TrackingViewport } from './hud/TrackingViewport';
import { TelemetryGauges } from './hud/TelemetryGauges';
import { SeamProgressTrack } from './hud/SeamProgressTrack';
import { PassActionBar } from './hud/PassActionBar';
import { PhoneImuControlBar } from './hud/PhoneImuControlBar';
import { WpsTrajectoryOverlay } from './hud/WpsTrajectoryOverlay';
import { CalibrationWizardModal } from './hud/CalibrationWizardModal';

interface TrackingHUDProps {
  parameters: WeldingParameters;
  isRecording: boolean;
  onStartPass: () => void;
  onFinishPass: (samples: LiveTorchSample[]) => void;
  bleState: BLESensorState;
  onConnectBLE: () => void;
  onOpenHardwareGuide?: () => void;
  activeWps?: WPSProcedure;
}

export const TrackingHUD: React.FC<TrackingHUDProps> = ({
  parameters,
  isRecording,
  onStartPass,
  onFinishPass,
  bleState,
  onConnectBLE,
  onOpenHardwareGuide,
  activeWps,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const seamTrackRef = useRef<HTMLDivElement>(null);

  // Overlay state
  const [showTrajectoryOverlay, setShowTrajectoryOverlay] = useState<boolean>(true);

  // 3-Step Calibration Wizard state
  const [isCalibrationOpen, setIsCalibrationOpen] = useState<boolean>(false);
  const [calibrationData, setCalibrationData] = useState<TorchCalibrationData>({
    isCalibrated: true, // initial default calibration baseline
    calibratedAt: Date.now(),
    standoffOffset_mm: 12.5,
    seamOriginX_mm: 0.0,
    seamOriginY_mm: 0.0,
    workAngleOffset_deg: 0.0,
    travelAngleOffset_deg: 0.0,
    accuracyScore: 98.4,
    markerTagId: 0,
  });

  // Tracking source mode: Fused (Phone IMU + Camera ArUco) vs Phone IMU Only vs Optical vs Manual
  const [trackingMode, setTrackingMode] = useState<TrackingMode>('fused_imu_camera');
  const [imuData, setImuData] = useState<PhoneImuData>(phoneImuTracker.getData());

  // Haptic coaching states (Web Vibration API)
  const [hapticEnabled, setHapticEnabled] = useState<boolean>(hapticFeedback.isEnabled());
  const [hapticSupported] = useState<boolean>(hapticFeedback.isSupported());
  const [recentHapticEvent, setRecentHapticEvent] = useState<HapticEvent | null>(null);
  const [currentDeviation, setCurrentDeviation] = useState<DeviationStatus | null>(null);

  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [currentPose, setCurrentPose] = useState<TorchPose>({
    x_mm: 20,
    y_mm: 0,
    z_mm: 12,
    travelAngle_deg: 12,
    workAngle_deg: parameters.jointType === 't_fillet' ? 45 : 90,
    rollAngle_deg: 0,
    timestamp_ms: 0,
    isMarkerDetected: true,
    trackingSource: 'fused_imu_camera',
    fusionConfidence: 0.85,
    imuActive: true,
  });

  const [currentSpeed_mm_s, setCurrentSpeed_mm_s] = useState<number>(5.5);
  const [activeDefects, setActiveDefects] = useState<string[]>([]);
  const [soundMuted, setSoundMuted] = useState<boolean>(false);
  const [virtualTorchX, setVirtualTorchX] = useState<number>(20); // for seam track
  const [recordedSamples, setRecordedSamples] = useState<LiveTorchSample[]>([]);
  const [focusDistance, setFocusDistance] = useState<number>(0.6); // 0.1 to 1.0, optimal focus is 0.6
  const [focusMode, setFocusMode] = useState<'auto' | 'manual'>('auto');

  const samplesRef = useRef<LiveTorchSample[]>([]);
  const detectorRef = useRef<MarkerDetector | null>(null);
  const animFrameRef = useRef<number>(0);
  const passStartTimeRef = useRef<number>(0);

  const targetWorkAngle = parameters.jointType === 't_fillet' ? 45 : 90;

  // Initialize marker detector with Phone IMU sensor fusion
  useEffect(() => {
    detectorRef.current = new MarkerDetector({
      physicalMarkerSize_mm: 50.0,
      targetTagId: 0,
      enableImuFusion: true,
    });
  }, []);

  // Subscribe to Phone IMU Tracker
  useEffect(() => {
    const unsubscribe = phoneImuTracker.subscribe((data) => {
      setImuData(data);
    });

    if (trackingMode === 'phone_imu' || trackingMode === 'fused_imu_camera') {
      phoneImuTracker.start().catch((err) => {
        console.warn('Phone IMU start warning:', err);
      });
    }

    return () => {
      unsubscribe();
    };
  }, [trackingMode]);

  // Subscribe to Haptic Feedback service events for tactile HUD alerts
  useEffect(() => {
    const unsubscribe = hapticFeedback.subscribe((event) => {
      setRecentHapticEvent(event);
      const timer = setTimeout(() => {
        setRecentHapticEvent((prev) => (prev?.timestamp === event.timestamp ? null : prev));
      }, 1200);
      return () => clearTimeout(timer);
    });

    return () => {
      unsubscribe();
      hapticFeedback.stop();
    };
  }, []);

  // Keyboard shortcut: Spacebar toggles trigger switch (ESP32 switch simulation)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        bleManager.toggleSimulatedTrigger();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Camera stream initialization (only when in optical camera mode)
  const startCamera = async () => {
    try {
      setCameraError(null);
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((t) => t.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: cameraFacing,
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30 },
        },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          setCameraActive(true);
        };
      }
    } catch (err: any) {
      console.warn('Camera access error:', err);
      setCameraError(
        'Camera unavailable or permission denied. Phone IMU mode is active.'
      );
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    if (trackingMode === 'optical_camera' || trackingMode === 'fused_imu_camera') {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [trackingMode, cameraFacing]);

  // Main 30-60 FPS Processing & Telemetry Update Loop
  useEffect(() => {
    const processFrame = () => {
      let pose: TorchPose;
      let speed = currentSpeed_mm_s;

      const deltaFocus = Math.abs(focusDistance - 0.6);
      const sharpness = focusMode === 'manual' ? Math.max(12, 100 - deltaFocus * 220) : 98;
      const isTrackingTooBlurry = focusMode === 'manual' && sharpness < 75;

      if (trackingMode === 'fused_imu_camera') {
        // Fused Mode: Camera Marker anchors 3D position & cancels drift, Phone IMU refines tilt & angles
        const imuCurrent = phoneImuTracker.getData();
        if (
          cameraActive &&
          videoRef.current &&
          canvasRef.current &&
          detectorRef.current
        ) {
          pose = detectorRef.current.detect(videoRef.current, canvasRef.current, imuCurrent);

          // Simulated Defocus Tracking Loss
          if (isTrackingTooBlurry) {
            pose.isMarkerDetected = false;
            pose.fusionConfidence = 0.35;
          }

          const detectedSpeed = detectorRef.current.getTravelSpeed_mm_s();
          speed = pose.isMarkerDetected
            ? (detectedSpeed > 0.5 ? detectedSpeed : 5.8)
            : (imuCurrent.linearSpeed_mm_s || 5.8);
          setVirtualTorchX(pose.x_mm);
        } else {
          // Camera starting or standby: seamlessly coast on IMU attitude
          speed = imuCurrent.linearSpeed_mm_s;
          setVirtualTorchX(imuCurrent.displacement_mm);
          pose = {
            x_mm: imuCurrent.displacement_mm,
            y_mm: 0,
            z_mm: bleState.tofDistance_mm,
            travelAngle_deg: imuCurrent.travelAngle_deg,
            workAngle_deg: imuCurrent.workAngle_deg,
            rollAngle_deg: imuCurrent.rollAngle_deg,
            timestamp_ms: performance.now(),
            isMarkerDetected: false,
            trackingSource: 'fused_imu_camera',
            fusionConfidence: 0.8,
            imuActive: true,
          };
        }
      } else if (trackingMode === 'phone_imu') {
        // Phone IMU mode: Drive angle and linear travel speed directly from device sensors
        const imuCurrent = phoneImuTracker.getData();
        speed = imuCurrent.linearSpeed_mm_s;
        setVirtualTorchX(imuCurrent.displacement_mm);

        pose = {
          x_mm: imuCurrent.displacement_mm,
          y_mm: 0,
          z_mm: bleState.tofDistance_mm,
          travelAngle_deg: imuCurrent.travelAngle_deg,
          workAngle_deg: imuCurrent.workAngle_deg,
          rollAngle_deg: imuCurrent.rollAngle_deg,
          timestamp_ms: performance.now(),
          isMarkerDetected: true,
          trackingSource: 'phone_imu',
          fusionConfidence: 0.7,
          imuActive: true,
        };
      } else if (
        trackingMode === 'optical_camera' &&
        cameraActive &&
        videoRef.current &&
        canvasRef.current &&
        detectorRef.current
      ) {
        pose = detectorRef.current.detect(videoRef.current, canvasRef.current, null);

        // Simulated Defocus Tracking Loss
        if (isTrackingTooBlurry) {
          pose.isMarkerDetected = false;
        }

        pose.trackingSource = 'camera_marker';
        const detectedSpeed = detectorRef.current.getTravelSpeed_mm_s();
        speed = detectedSpeed > 0.5 ? detectedSpeed : 5.8;
      } else {
        // Virtual manual torch mode
        pose = {
          x_mm: virtualTorchX,
          y_mm: 0,
          z_mm: bleState.tofDistance_mm,
          travelAngle_deg: currentPose.travelAngle_deg,
          workAngle_deg: currentPose.workAngle_deg,
          rollAngle_deg: 0,
          timestamp_ms: performance.now(),
          isMarkerDetected: true,
          trackingSource: 'manual',
        };
      }

      setCurrentSpeed_mm_s(speed);
      setCurrentPose(pose);

      // Arc active status: trigger switch is armed AND distance is within strike zone (<18mm)
      const effectiveCTWD = bleState.isConnected ? bleState.tofDistance_mm : pose.z_mm;
      const isArcActive = bleState.isArmed && effectiveCTWD <= 18;

      // Instantaneous defect checks
      const defects: string[] = [];
      if (isArcActive) {
        if (effectiveCTWD > 17) defects.push('CTWD > 17mm: Losing Shielding Gas!');
        if (effectiveCTWD < 6) defects.push('CTWD < 6mm: Tip Collision Risk!');
        if (pose.travelAngle_deg > 25) defects.push('Push Angle > 25°: Air Aspiration!');
        if (pose.travelAngle_deg < -20) defects.push('Drag Angle > 20°: Ropey Crown!');
        if (speed > 9.5) defects.push('Travel Too Fast: Undercut!');
        if (speed < 3.0 && speed > 0.5) defects.push('Travel Too Slow: Excessive Buildup!');
      }
      setActiveDefects(defects);

      // Sound Engine updates
      if (isArcActive) {
        soundEngine.startArcSound(parameters.voltage_V, effectiveCTWD);
        soundEngine.updateArcSound(parameters.voltage_V, effectiveCTWD);
        if (defects.length > 0 && Math.random() < 0.05) {
          soundEngine.playWarningBeep();
        }
      } else {
        soundEngine.stopArcSound();
      }

      // Haptic Feedback Coaching Engine (Web Vibration API)
      // Provide subtle tactile pulses when torch deviates beyond ideal angle or travel speed thresholds
      const isTrackingActive =
        isArcActive ||
        isRecording ||
        speed > 0.6 ||
        ((trackingMode === 'fused_imu_camera' || trackingMode === 'phone_imu') &&
          (imuData.isSensorStreaming || Math.abs(speed) > 0.4));

      const deviation = hapticFeedback.processActiveTelemetry({
        travelAngle_deg: pose.travelAngle_deg,
        workAngle_deg: pose.workAngle_deg,
        targetWorkAngle,
        speed_mm_s: speed,
        isTrackingActive,
      });
      setCurrentDeviation(deviation);

      // Record sample if session active
      if (isRecording) {
        const sample: LiveTorchSample = {
          timestamp_ms: performance.now(),
          pose: { ...pose },
          ble: { ...bleState },
          computedSpeed_mm_s: speed,
          computedSpeed_ipm: speed * 2.36,
          effectiveCTWD_mm: effectiveCTWD,
          isArcActive,
          instantaneousDefects: [...defects],
        };
        samplesRef.current.push(sample);

        // Throttle state updates for live visualization (every 3 frames) to keep performance high
        if (samplesRef.current.length % 3 === 0) {
          setRecordedSamples([...samplesRef.current]);
        }
      }

      animFrameRef.current = requestAnimationFrame(processFrame);
    };

    animFrameRef.current = requestAnimationFrame(processFrame);
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      soundEngine.stopArcSound();
      hapticFeedback.stop();
    };
  }, [
    trackingMode,
    cameraActive,
    isRecording,
    bleState,
    virtualTorchX,
    currentPose.travelAngle_deg,
    currentPose.workAngle_deg,
    currentSpeed_mm_s,
    parameters.voltage_V,
    targetWorkAngle,
    imuData.isSensorStreaming,
    focusDistance,
    focusMode,
  ]);

  // Calibrate Phone IMU Tare
  const handleCalibrateZero = () => {
    phoneImuTracker.calibrateZero(targetWorkAngle, 12);
  };

  const handleResetDisplacement = () => {
    phoneImuTracker.resetDisplacement(0);
    setVirtualTorchX(0);
  };

  // Pass recording controls
  const handleStartRecording = () => {
    samplesRef.current = [];
    setRecordedSamples([]); // Clear visual trail
    passStartTimeRef.current = performance.now();
    soundEngine.playContactorClick();
    onStartPass();
  };

  const handleStopRecording = () => {
    soundEngine.playContactorClick();
    soundEngine.stopArcSound();
    hapticFeedback.stop();
    setRecordedSamples([...samplesRef.current]); // Ensure final full trail is drawn
    onFinishPass(samplesRef.current);
  };

  // Seam track click / drag for virtual torch
  const handleSeamTrackInteraction = (
    e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>
  ) => {
    if (!seamTrackRef.current) return;
    const rect = seamTrackRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const normX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const newX = normX * 200; // 200mm length
    setVirtualTorchX(newX);
    if (trackingMode === 'phone_imu') {
      phoneImuTracker.resetDisplacement(newX);
    }
    setCurrentSpeed_mm_s(6.2 + (Math.random() - 0.5) * 1.5);
  };

  const handleToggleSound = () => {
    const next = !soundMuted;
    setSoundMuted(next);
    soundEngine.setMuted(next);
  };

  const handleToggleHaptic = () => {
    const next = hapticFeedback.toggle();
    setHapticEnabled(next);
  };

  const handleTestHaptic = () => {
    hapticFeedback.triggerTestPulse();
  };

  const isArcActive = bleState.isArmed && (bleState.tofDistance_mm <= 18 || currentPose.z_mm <= 18);

  return (
    <div className="w-full flex flex-col gap-4">
      {/* 1. Phone IMU & Tracking Mode Selection Bar */}
      <PhoneImuControlBar
        trackingMode={trackingMode}
        onSelectMode={(mode) => setTrackingMode(mode)}
        imuData={imuData}
        onCalibrateZero={handleCalibrateZero}
        onResetDisplacement={handleResetDisplacement}
        bleState={bleState}
        onToggleTrigger={() => bleManager.toggleSimulatedTrigger()}
        onOpenHardwareGuide={() => onOpenHardwareGuide?.() || onConnectBLE()}
        targetWorkAngle={targetWorkAngle}
        hapticEnabled={hapticEnabled}
        hapticSupported={hapticSupported}
        onToggleHaptic={handleToggleHaptic}
        onTestHaptic={handleTestHaptic}
        recentHapticEvent={recentHapticEvent}
        currentDeviation={currentDeviation}
      />

      {/* 2. Live Viewport & Augmented Reality / Gyroscopic Attitude Stage */}
      <TrackingViewport
        videoRef={videoRef}
        canvasRef={canvasRef}
        cameraActive={cameraActive}
        cameraError={cameraError}
        onStartCamera={startCamera}
        isArcActive={isArcActive}
        voltage_V={parameters.voltage_V}
        bleState={bleState}
        onConnectBLE={onConnectBLE}
        soundMuted={soundMuted}
        onToggleSound={handleToggleSound}
        activeDefects={activeDefects}
        trackingMode={trackingMode}
        currentPose={currentPose}
        currentSpeed_mm_s={currentSpeed_mm_s}
        onToggleTrigger={() => bleManager.toggleSimulatedTrigger()}
        hapticEnabled={hapticEnabled}
        onToggleHaptic={handleToggleHaptic}
        recentHapticEvent={recentHapticEvent}
        activeWps={activeWps}
        showTrajectoryOverlay={showTrajectoryOverlay}
        onToggleTrajectoryOverlay={() => setShowTrajectoryOverlay(!showTrajectoryOverlay)}
        onOpenCalibration={() => setIsCalibrationOpen(true)}
        isCalibrated={calibrationData.isCalibrated}
        calibrationAccuracy={calibrationData.accuracyScore}
        recordedSamples={recordedSamples}
        parameters={parameters}
        focusDistance={focusDistance}
        onFocusDistanceChange={setFocusDistance}
        focusMode={focusMode}
        onFocusModeChange={setFocusMode}
      />

      {/* 3. Interactive WPS Trajectory Overlay (Ideal Shadow Path & Real-time Heat Map) */}
      {activeWps && showTrajectoryOverlay && (
        <WpsTrajectoryOverlay
          activeWps={activeWps}
          currentPose={currentPose}
          currentSpeed_mm_s={currentSpeed_mm_s}
          isRecording={isRecording}
          virtualTorchX={virtualTorchX}
          onSetVirtualTorchX={(x) => setVirtualTorchX(x)}
        />
      )}

      {/* 4. Real-time Telemetry Dashboard (4 Gauges) */}
      <TelemetryGauges
        currentSpeed_mm_s={currentSpeed_mm_s}
        currentPose={currentPose}
        targetWorkAngle={targetWorkAngle}
        tofDistance_mm={bleState.tofDistance_mm}
        hapticEnabled={hapticEnabled}
        activeDeviation={currentDeviation}
      />

      {/* 4. Interactive Seam Simulator & Hand Progression Track */}
      <SeamProgressTrack
        virtualTorchX={virtualTorchX}
        seamTrackRef={seamTrackRef}
        onSeamTrackInteraction={handleSeamTrackInteraction}
        bleState={bleState}
        currentPose={currentPose}
        onAngleChange={(angle) =>
          setCurrentPose((prev) => ({ ...prev, travelAngle_deg: angle }))
        }
        recordedSamples={recordedSamples}
        parameters={parameters}
      />

      {/* 5. Main Action Bar: Start / Stop Pass */}
      <PassActionBar
        isRecording={isRecording}
        onStartRecording={handleStartRecording}
        onStopRecording={handleStopRecording}
      />

      {/* 3-Step Calibration Wizard Modal */}
      <CalibrationWizardModal
        isOpen={isCalibrationOpen}
        onClose={() => setIsCalibrationOpen(false)}
        onCalibrationComplete={(newCalib) => {
          setCalibrationData(newCalib);
          setIsCalibrationOpen(false);
        }}
        activeWps={activeWps}
        currentPose={currentPose}
        cameraActive={cameraActive}
        onStartCamera={startCamera}
        videoRef={videoRef}
      />
    </div>
  );
};

