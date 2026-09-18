/**
 * Core type definitions for GMAW / MIG Welding Simulator
 */

export type MaterialType = 'mild_steel' | 'stainless_304' | 'aluminum_4043';
export type ShieldingGas = '100_CO2' | '75Ar_25CO2' | '82Ar_18CO2' | '98Ar_2O2' | '100_Ar';
export type JointType = 'butt' | 't_fillet' | 'lap';
export type WeldingPosition = '1F_1G' | '2F' | '3F_up';
export type TransferMode = 'short_circuit' | 'globular' | 'spray' | 'pulsed';

export interface WeldingParameters {
  current_A: number;             // e.g. 50 - 250 A
  voltage_V: number;             // e.g. 14.0 - 28.0 V
  wireFeedSpeed_m_min: number;   // e.g. 2.0 - 12.0 m/min (approx 80 - 470 IPM)
  stickout_mm: number;           // Contact Tip to Work Distance (CTWD), e.g. 6 - 20 mm
  wireDiameter_mm: number;       // 0.8, 0.9, 1.0, 1.2 mm
  material: MaterialType;
  materialThickness_mm: number;  // 1.5, 3.0, 6.0, 10.0 mm
  shieldingGas: ShieldingGas;
  jointType: JointType;
  weldingPosition: WeldingPosition;
}

export interface TorchPose {
  x_mm: number;                  // Seam progress coordinate along joint (mm)
  y_mm: number;                  // Lateral offset from seam centerline (mm)
  z_mm: number;                  // Standoff / height above plate (mm)
  travelAngle_deg: number;       // Push (+) or Drag (-) angle (deg), ideal: 10° to 15° push/drag
  workAngle_deg: number;         // Angle to plate surface (deg), ideal 90° for butt, 45° for fillet
  rollAngle_deg: number;         // Gun rotation around barrel axis (deg)
  timestamp_ms: number;
  isMarkerDetected: boolean;
  trackingSource?: 'fused_imu_camera' | 'phone_imu' | 'camera_marker' | 'manual';
  rawCorners?: [number, number][]; // Pixel coordinates [TL, TR, BR, BL]
  markerId?: number;
  fusionConfidence?: number;     // 0 to 1 confidence score
  imuActive?: boolean;           // Whether IMU orientation refinement is active
}

export type TrackingMode = 'fused_imu_camera' | 'phone_imu' | 'optical_camera' | 'touch_simulator';
export type SwitchPolarity = 'NO' | 'NC';

export interface BLESensorState {
  isConnected: boolean;
  isConnecting: boolean;
  isArmed: boolean;              // Trigger switch pressed (gas preflow / wire feed contactor on)
  arcStart: boolean;             // VL6180X distance ≈ 0 mm (true near-zero contact detection, arc strike active)
  tofDistance_mm: number;        // VL6180X ToF proximity reading in mm (reliable down to 0mm contact)
  switchPolarity?: SwitchPolarity;
  switchType?: string;
  batteryLevel?: number;         // 0 - 100%
  rssi?: number;                 // dBm
  simulated: boolean;            // Whether using virtual hardware
  deviceName?: string;
  lastNotificationTime?: number;
  error?: string | null;
}

export interface LiveTorchSample {
  timestamp_ms: number;
  pose: TorchPose;
  ble: BLESensorState;
  computedSpeed_mm_s: number;    // Travel speed in mm/s (ideal ~4-8 mm/s or 10-20 IPM)
  computedSpeed_ipm: number;
  effectiveCTWD_mm: number;      // Effective Contact Tip to Work Distance
  isArcActive: boolean;          // Both trigger armed AND within arc strike distance
  instantaneousDefects: string[];
}

export interface DefectReport {
  id: string;
  name: string;
  category: 'parameter' | 'technique' | 'both';
  severity: 'minor' | 'moderate' | 'critical';
  description: string;
  cause: string;
  correctiveAction: string;
  occurredAtPercentage?: number; // Approximate location along the weld pass (0-100%)
}

export interface BeadSegment {
  x_mm: number;
  y_mm: number;
  width_mm: number;
  height_mm: number;             // Reinforcement height
  penetration_mm: number;
  speed_mm_s: number;
  travelAngle_deg: number;
  workAngle_deg: number;
  ctwd_mm: number;
  heatInput_kJ_per_mm: number;
  defectFlags: string[];
}

export interface BeadQualityResult {
  overallScore: number;          // 0 - 100
  subScores: {
    speedConsistency: number;    // 0 - 100 (smooth, constant travel)
    angleTechnique: number;      // 0 - 100 (consistent push/work angle)
    ctwdControl: number;         // 0 - 100 (consistent standoff distance)
    parameterBalance: number;    // 0 - 100 (V vs WFS vs thickness match)
  };
  heatInput_kJ_per_mm: number;   // Typical GMAW 0.4 - 1.8 kJ/mm
  depositionArea_mm2: number;    // Cross sectional area of deposited wire
  meanBeadWidth_mm: number;      // Theoretical bead width
  meanBeadHeight_mm: number;     // Theoretical reinforcement height
  meanPenetration_mm: number;    // Theoretical penetration depth
  transferMode: TransferMode;
  transferModeFeedback: string;
  defects: DefectReport[];
  attribution: {
    parameterScore: number;      // 0 - 100
    techniqueScore: number;      // 0 - 100
    primaryIssue: 'parameter' | 'technique' | 'both' | 'none';
    summary: string;
    recommendations: string[];
  };
  beadSegments: BeadSegment[];
}

export type BeadQualitySubScores = BeadQualityResult['subScores'];
export type RootCauseAttribution = BeadQualityResult['attribution'];
export type WeldingDefect = DefectReport;

export interface WeldPassRecord {
  id: string;
  timestamp: number;
  studentName: string;
  parameters: WeldingParameters;
  result: BeadQualityResult;
  durationSeconds: number;
  totalLength_mm: number;
  sampleCount: number;
  syncedToD1: boolean;
  d1SyncedAt?: number;
  samples?: LiveTorchSample[];
  instructorNotes?: string;
  instructorGrade?: 'PASS' | 'RETEST' | 'REJECT' | 'PENDING';
  gradedBy?: string;
  gradedAt?: number;
}

export type AppRole = 'trainer' | 'instructor';

export interface StudentStation {
  id: string;
  name: string;
  stationNumber: number;
  status: 'active_arc' | 'ready' | 'standby' | 'offline';
  currentWpsId: string;
  lastPassTime?: number;
  lastScore?: number;
  avgScore: number;
  completedPasses: number;
}

export interface WPSProcedure {
  id: string;
  code: string;
  title: string;
  standard: string; // e.g. "AWS D1.1 / ASME IX"
  jointType: JointType;
  weldingPosition: WeldingPosition;
  material: MaterialType;
  materialThickness_mm: number;
  wireDiameter_mm: number;
  shieldingGas: ShieldingGas;
  voltage_V: number;
  voltageTolerance_V: number;
  current_A: number;
  currentTolerance_A: number;
  wireFeedSpeed_m_min: number;
  wireFeedSpeedTolerance: number;
  stickout_mm: number;
  targetTravelSpeedMin_mm_s: number;
  targetTravelSpeedMax_mm_s: number;
  targetTravelAngleMin_deg: number;
  targetTravelAngleMax_deg: number;
  targetWorkAngle_deg: number;
  notes: string;
}

export interface TorchCalibrationData {
  isCalibrated: boolean;
  calibratedAt: number;
  standoffOffset_mm: number;      // Calibrated baseline CTWD
  seamOriginX_mm: number;         // Calibrated start position
  seamOriginY_mm: number;         // Centerline deviation
  workAngleOffset_deg: number;    // Work angle zero offset
  travelAngleOffset_deg: number;  // Push/travel angle zero offset
  accuracyScore: number;          // 0 - 100%
  markerTagId: number;            // e.g. 0
}
