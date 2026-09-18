/**
 * @file phoneImuTracker.ts
 * @description Real-time phone IMU tracker for welding torch motion and orientation.
 * Uses DeviceOrientationEvent and DeviceMotionEvent to capture:
 *  - Push / Drag Travel Angle (Pitch / Beta)
 *  - Work Angle to plate surface (Roll / Gamma)
 *  - Instantaneous Travel Speed (mm/s & IPM) via filtered linear acceleration integration
 *  - Seam Displacement (mm along joint)
 *
 * Includes tare/zero calibration, deadband filtering, and zero-velocity updates (ZUPT).
 */

export interface PhoneImuData {
  supported: boolean;
  active: boolean;
  permissionGranted: boolean;
  isSensorStreaming: boolean;
  travelAngle_deg: number;     // Push (+) or Drag (-) angle in degrees
  workAngle_deg: number;       // Angle to workpiece surface (nominal 90° or 45°)
  rollAngle_deg: number;       // Gun roll angle
  linearSpeed_mm_s: number;    // Filtered instantaneous forward travel speed
  linearSpeed_ipm: number;     // Inches per minute
  displacement_mm: number;     // Integrated linear position along 0-200mm joint
  rawAcceleration: { x: number; y: number; z: number };
  rawRotationRate: { alpha: number; beta: number; gamma: number }; // Gyro deg/sec
  rawOrientation: { alpha: number; beta: number; gamma: number };
  calibratedZero: { pitchOffset: number; rollOffset: number };
  lastUpdateTimestamp: number;
}

export type ImuListener = (data: PhoneImuData) => void;

class PhoneImuTracker {
  private isRunning = false;
  private listeners: Set<ImuListener> = new Set();

  private pitchOffset = 0;
  private rollOffset = 0;

  // Motion integration state
  private lastMotionTimestamp = 0;
  private currentSpeed_mm_s = 0;
  private currentDisplacement_mm = 0;
  private stationaryCount = 0;

  // Smoothing filters (Exponential Moving Averages)
  private filteredSpeed_mm_s = 0;
  private smoothedTravelAngle = 12; // Start with nominal ~12° push
  private smoothedWorkAngle = 90;   // Start with nominal ~90° butt joint

  private currentData: PhoneImuData = {
    supported: typeof window !== 'undefined' && 'DeviceOrientationEvent' in window,
    active: false,
    permissionGranted: false,
    isSensorStreaming: false,
    travelAngle_deg: 12,
    workAngle_deg: 90,
    rollAngle_deg: 0,
    linearSpeed_mm_s: 5.5,
    linearSpeed_ipm: 13.0,
    displacement_mm: 30,
    rawAcceleration: { x: 0, y: 0, z: 0 },
    rawRotationRate: { alpha: 0, beta: 0, gamma: 0 },
    rawOrientation: { alpha: 0, beta: 0, gamma: 0 },
    calibratedZero: { pitchOffset: 0, rollOffset: 0 },
    lastUpdateTimestamp: 0,
  };

  constructor() {
    if (typeof window !== 'undefined') {
      this.currentData.supported = 'DeviceOrientationEvent' in window && 'DeviceMotionEvent' in window;
    }
  }

  public getData(): PhoneImuData {
    return { ...this.currentData };
  }

  public subscribe(listener: ImuListener): () => void {
    this.listeners.add(listener);
    listener(this.getData());
    return () => this.listeners.delete(listener);
  }

  private notify() {
    const data = this.getData();
    this.listeners.forEach((l) => l(data));
  }

  /**
   * Request permission for iOS 13+ devices
   */
  public async requestPermission(): Promise<boolean> {
    if (typeof window === 'undefined') return false;

    // Check iOS 13+ permission requirements
    const orientationReq = (DeviceOrientationEvent as any)?.requestPermission;
    const motionReq = (DeviceMotionEvent as any)?.requestPermission;

    try {
      if (typeof orientationReq === 'function') {
        const res = await orientationReq();
        if (res !== 'granted') {
          this.currentData.permissionGranted = false;
          this.notify();
          return false;
        }
      }

      if (typeof motionReq === 'function') {
        const res = await motionReq();
        if (res !== 'granted') {
          this.currentData.permissionGranted = false;
          this.notify();
          return false;
        }
      }

      this.currentData.permissionGranted = true;
      this.notify();
      return true;
    } catch (err) {
      console.warn('IMU permission request error:', err);
      // Non-iOS or already granted
      this.currentData.permissionGranted = true;
      this.notify();
      return true;
    }
  }

  /**
   * Start listening to device orientation and motion events
   */
  public async start(): Promise<boolean> {
    if (this.isRunning) return true;

    const granted = await this.requestPermission();
    if (!granted) {
      console.warn('Device orientation permission not granted.');
    }

    window.addEventListener('deviceorientation', this.handleOrientation, true);
    window.addEventListener('devicemotion', this.handleMotion, true);

    this.isRunning = true;
    this.lastMotionTimestamp = performance.now();
    this.currentData.active = true;
    this.notify();
    return true;
  }

  /**
   * Stop listening
   */
  public stop() {
    if (!this.isRunning) return;

    window.removeEventListener('deviceorientation', this.handleOrientation, true);
    window.removeEventListener('devicemotion', this.handleMotion, true);

    this.isRunning = false;
    this.currentData.active = false;
    this.notify();
  }

  /**
   * Calibrate / Tare current device angle as the 0° reference baseline.
   */
  public calibrateZero(targetWorkAngle: number = 90, targetPushAngle: number = 12) {
    const rawBeta = this.currentData.rawOrientation.beta || 0;
    const rawGamma = this.currentData.rawOrientation.gamma || 0;

    // We tare so that current orientation matches targetPushAngle & targetWorkAngle
    this.pitchOffset = rawBeta - targetPushAngle;
    this.rollOffset = rawGamma - (targetWorkAngle - 90);

    this.currentData.calibratedZero = {
      pitchOffset: Math.round(this.pitchOffset),
      rollOffset: Math.round(this.rollOffset),
    };
    this.notify();
  }

  /**
   * Reset linear displacement along seam track
   */
  public resetDisplacement(newX_mm: number = 0) {
    this.currentDisplacement_mm = Math.max(0, Math.min(200, newX_mm));
    this.currentSpeed_mm_s = 0;
    this.filteredSpeed_mm_s = 0;
    this.currentData.displacement_mm = this.currentDisplacement_mm;
    this.currentData.linearSpeed_mm_s = 0;
    this.currentData.linearSpeed_ipm = 0;
    this.notify();
  }

  /**
   * Device Orientation Handler: Beta (pitch) and Gamma (roll)
   */
  private handleOrientation = (event: DeviceOrientationEvent) => {
    const alpha = event.alpha ?? 0;
    const beta = event.beta ?? 0;   // Front-to-back tilt (-180 to 180)
    const gamma = event.gamma ?? 0; // Left-to-right tilt (-90 to 90)

    this.currentData.rawOrientation = { alpha, beta, gamma };

    // Compute Push / Drag angle from beta minus calibrated offset
    // In typical torch mounting, tilting forward is push (+), backwards is drag (-)
    const rawTravelAngle = beta - this.pitchOffset;
    // Work angle relative to 90° plate normal, adjusted by roll
    const rawWorkAngle = 90 + (gamma - this.rollOffset);

    // Apply low-pass exponential filter for jitter-free display (alpha = 0.25)
    this.smoothedTravelAngle = this.smoothedTravelAngle * 0.75 + rawTravelAngle * 0.25;
    this.smoothedWorkAngle = this.smoothedWorkAngle * 0.75 + rawWorkAngle * 0.25;

    // Clamp reasonable bounds
    this.currentData.travelAngle_deg = Math.round(
      Math.max(-45, Math.min(45, this.smoothedTravelAngle))
    );
    this.currentData.workAngle_deg = Math.round(
      Math.max(20, Math.min(160, this.smoothedWorkAngle))
    );
    this.currentData.rollAngle_deg = Math.round(gamma);

    this.currentData.lastUpdateTimestamp = performance.now();
    this.currentData.isSensorStreaming = true;
    this.notify();
  };

  /**
   * Device Motion Handler: Linear acceleration & rotationRate (gyroscope) along phone axes
   */
  private handleMotion = (event: DeviceMotionEvent) => {
    const now = performance.now();
    const dt = (now - this.lastMotionTimestamp) / 1000.0; // Seconds
    this.lastMotionTimestamp = now;
    this.currentData.lastUpdateTimestamp = now;
    this.currentData.isSensorStreaming = true;

    // Safety guard on anomalous dt
    if (dt <= 0 || dt > 0.3) return;

    // Capture Gyroscope Angular Velocity (degrees per second)
    if (event.rotationRate) {
      this.currentData.rawRotationRate = {
        alpha: Math.round((event.rotationRate.alpha ?? 0) * 10) / 10,
        beta: Math.round((event.rotationRate.beta ?? 0) * 10) / 10,
        gamma: Math.round((event.rotationRate.gamma ?? 0) * 10) / 10,
      };
    }

    // Prefer linear acceleration (with gravity subtracted by device sensor fusion)
    const acc = event.acceleration || event.accelerationIncludingGravity;
    if (!acc) return;

    const ax = acc.x ?? 0;
    const ay = acc.y ?? 0;
    const az = acc.z ?? 0;

    this.currentData.rawAcceleration = { x: ax, y: ay, z: az };

    // Along a weld seam, the dominant travel vector is along the phone's long axis (Y) or lateral axis (X)
    // We compute the magnitude of horizontal motion:
    const forwardAcc_m_s2 = Math.hypot(ax, ay);

    // Noise Gate & Deadband Filter: Ignore ambient micro-vibrations (< 0.18 m/s²)
    const DEAD_BAND = 0.18;
    const effectiveAcc = Math.max(0, forwardAcc_m_s2 - DEAD_BAND);

    if (effectiveAcc > 0.05) {
      this.stationaryCount = 0;
      // Convert acceleration (m/s²) to torch velocity increment (mm/s)
      // Realistic welding travel speed is between 2 mm/s and 12 mm/s
      // A gentle steady hand motion corresponds to ~3-8 mm/s
      const instantVelocity_mm_s = effectiveAcc * 1000 * dt * 0.12; // Scaled calibration factor
      this.currentSpeed_mm_s = Math.min(15.0, this.currentSpeed_mm_s + instantVelocity_mm_s);
    } else {
      this.stationaryCount++;
      // Zero-Velocity Update (ZUPT): Rapid decay when torch is held steady or at rest
      const decayFactor = this.stationaryCount > 4 ? 0.75 : 0.92;
      this.currentSpeed_mm_s *= decayFactor;
      if (this.currentSpeed_mm_s < 0.3) {
        this.currentSpeed_mm_s = 0;
      }
    }

    // Filter speed with EMA
    this.filteredSpeed_mm_s = this.filteredSpeed_mm_s * 0.7 + this.currentSpeed_mm_s * 0.3;

    // Integrate forward displacement along the 200mm joint
    if (this.filteredSpeed_mm_s > 0.3) {
      this.currentDisplacement_mm += this.filteredSpeed_mm_s * dt;
      if (this.currentDisplacement_mm > 200) {
        this.currentDisplacement_mm = 200; // Seam length limit
      }
    }

    this.currentData.linearSpeed_mm_s = Math.round(this.filteredSpeed_mm_s * 10) / 10;
    this.currentData.linearSpeed_ipm = Math.round(this.currentData.linearSpeed_mm_s * 2.36 * 10) / 10;
    this.currentData.displacement_mm = Math.round(this.currentDisplacement_mm * 10) / 10;

    this.notify();
  };

  /**
   * Complementary Sensor Fusion:
   * Fuses high-rate, low-noise Phone IMU angles with visual ArUco marker estimates.
   *
   * - When visual marker is visible (visualConfidence > 0):
   *   Blends IMU orientation with visual perspective (85% IMU, 15% Visual).
   * - When visual marker is occluded / blurred / lost:
   *   Seamlessly coast with dead-reckoning IMU attitude.
   */
  public fuseOrientation(
    visualPush_deg: number,
    visualWork_deg: number,
    visualConfidence: number = 1.0
  ): {
    travelAngle_deg: number;
    workAngle_deg: number;
    rollAngle_deg: number;
    fusionConfidence: number;
    method: 'fused_imu_camera' | 'imu_coasting' | 'visual_only';
  } {
    const imuPush = this.currentData.travelAngle_deg;
    const imuWork = this.currentData.workAngle_deg;
    const imuRoll = this.currentData.rollAngle_deg;

    // Check if IMU is active (or has streamed data recently)
    const isImuAvailable = this.currentData.active || this.currentData.isSensorStreaming;

    if (isImuAvailable) {
      if (visualConfidence > 0.2) {
        // High-confidence visual marker present:
        // Complementary filter: IMU provides smooth instantaneous angular response without
        // pixel quantization noise, while the camera marker anchors the true spatial coordinate frame.
        const imuWeight = 0.85;
        const fusedPush = imuPush * imuWeight + visualPush_deg * (1 - imuWeight);
        const fusedWork = imuWork * imuWeight + visualWork_deg * (1 - imuWeight);

        return {
          travelAngle_deg: Number(fusedPush.toFixed(1)),
          workAngle_deg: Number(fusedWork.toFixed(1)),
          rollAngle_deg: imuRoll,
          fusionConfidence: Number(Math.min(1.0, 0.85 + visualConfidence * 0.15).toFixed(2)),
          method: 'fused_imu_camera',
        };
      } else {
        // Visual marker is occluded! Coast seamlessly on IMU
        return {
          travelAngle_deg: imuPush,
          workAngle_deg: imuWork,
          rollAngle_deg: imuRoll,
          fusionConfidence: 0.75, // Reliable IMU coasting
          method: 'imu_coasting',
        };
      }
    }

    // Fallback: visual only (when IMU not available or supported)
    return {
      travelAngle_deg: Number(visualPush_deg.toFixed(1)),
      workAngle_deg: Number(visualWork_deg.toFixed(1)),
      rollAngle_deg: 0,
      fusionConfidence: visualConfidence,
      method: 'visual_only',
    };
  }

  /**
   * Slowly align IMU baseline to visual marker reference frame to eliminate mounting bias.
   */
  public alignImuWithVisual(visualPush_deg: number, visualWork_deg: number) {
    if (!this.currentData.rawOrientation.beta) return;

    // Gentle adjustment (1% per frame to avoid jump)
    const currentImuPush = this.currentData.travelAngle_deg;
    const currentImuWork = this.currentData.workAngle_deg;

    const pushErr = currentImuPush - visualPush_deg;
    const workErr = currentImuWork - visualWork_deg;

    if (Math.abs(pushErr) < 25) {
      this.pitchOffset += pushErr * 0.01;
    }
    if (Math.abs(workErr) < 25) {
      this.rollOffset += workErr * 0.01;
    }
  }
}

export const phoneImuTracker = new PhoneImuTracker();
