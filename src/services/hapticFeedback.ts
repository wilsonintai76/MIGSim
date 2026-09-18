/**
 * @file hapticFeedback.ts
 * @description Web Vibration API service for welding technique coaching.
 * Provides subtle tactile haptic pulses when the welder's torch deviates beyond
 * ideal travel angle, work angle, or progression speed thresholds during active tracking.
 */

export type HapticDeviationType =
  | 'angle_push_excess'
  | 'angle_drag_excess'
  | 'angle_work_misaligned'
  | 'speed_fast'
  | 'speed_slow'
  | 'severe_multi'
  | 'test';

export interface HapticEvent {
  type: HapticDeviationType;
  category: 'angle' | 'speed' | 'severe' | 'test';
  timestamp: number;
  reason: string;
  pattern: number[];
}

export type HapticListener = (event: HapticEvent) => void;

export interface TelemetryCheckInput {
  travelAngle_deg: number;
  workAngle_deg: number;
  targetWorkAngle: number;
  speed_mm_s: number;
  isTrackingActive: boolean;
}

export interface DeviationStatus {
  hasDeviation: boolean;
  angleDeviation: boolean;
  speedDeviation: boolean;
  primaryReason: string | null;
  deviationType: HapticDeviationType | null;
  details: {
    travelAngleIssue?: string;
    workAngleIssue?: string;
    speedIssue?: string;
  };
}

class HapticFeedbackService {
  private enabled: boolean = true;
  private supported: boolean = false;
  private listeners: Set<HapticListener> = new Set();

  // Rate-limiting / cadence state
  private lastPulseTime: number = 0;
  private lastDeviationType: HapticDeviationType | null = null;
  private wasDeviating: boolean = false;

  // Cadence timing in ms
  private readonly PULSE_INTERVAL_MS = 750; // Repeat cadence while remaining out of bounds
  private readonly RETRIGGER_MIN_MS = 350;  // Minimum gap between different deviation triggers

  // Vibration patterns (durations in ms: [vibrate, pause, vibrate, ...])
  // Kept subtle and crisp so they do not fatigue or numb the welder's hand
  private readonly PATTERNS: Record<HapticDeviationType, number[]> = {
    // Subtle double-tick for push angle excess (>20°)
    angle_push_excess: [35, 45, 35],
    // Subtle double-tick for drag angle excess (<5° or negative)
    angle_drag_excess: [35, 45, 35],
    // Crisp single pulse for work angle misalignment (>10° off bisector)
    angle_work_misaligned: [45],
    // Quick warning flutter for moving too fast (undercut risk)
    speed_fast: [25, 30, 25, 30, 25],
    // Firm nudge for moving too slow (excessive buildup)
    speed_slow: [70],
    // Multi-fault compound pulse
    severe_multi: [40, 40, 40, 40, 55],
    // Crisp test click
    test: [40, 50, 40],
  };

  constructor() {
    this.checkSupport();
    this.loadPreference();
  }

  private checkSupport() {
    if (typeof window !== 'undefined' && typeof navigator !== 'undefined') {
      this.supported = 'vibrate' in navigator && typeof navigator.vibrate === 'function';
    } else {
      this.supported = false;
    }
  }

  private loadPreference() {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem('welder_haptic_feedback_enabled');
      if (stored !== null) {
        this.enabled = stored === 'true';
      } else {
        this.enabled = true; // Default ON
      }
    } catch {
      this.enabled = true;
    }
  }

  public isSupported(): boolean {
    return this.supported;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('welder_haptic_feedback_enabled', String(enabled));
      } catch {
        // Ignore storage errors
      }
    }
    if (!enabled) {
      this.stop();
    }
  }

  public toggle(): boolean {
    this.setEnabled(!this.enabled);
    if (this.enabled) {
      this.triggerTestPulse();
    }
    return this.enabled;
  }

  public subscribe(listener: HapticListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(event: HapticEvent): void {
    this.listeners.forEach((l) => {
      try {
        l(event);
      } catch (err) {
        console.warn('Haptic listener error:', err);
      }
    });
  }

  /**
   * Directly emit a vibration pattern via Web Vibration API
   */
  private vibrate(pattern: number[]): boolean {
    if (!this.enabled || !this.supported) return false;
    try {
      return navigator.vibrate(pattern);
    } catch (err) {
      // In some sandboxed iframes or browsers without user activation, vibrate might throw
      console.warn('Vibration API call failed:', err);
      return false;
    }
  }

  /**
   * Stop any in-progress vibration immediately
   */
  public stop(): void {
    if (this.supported) {
      try {
        navigator.vibrate(0);
      } catch {
        // Ignore
      }
    }
    this.wasDeviating = false;
    this.lastDeviationType = null;
  }

  /**
   * Test vibration pulse (e.g. from UI button click)
   */
  public triggerTestPulse(): void {
    const pattern = this.PATTERNS.test;
    this.vibrate(pattern);
    this.notify({
      type: 'test',
      category: 'test',
      timestamp: performance.now(),
      reason: 'Haptic test pulse triggered',
      pattern,
    });
  }

  /**
   * Evaluate torch telemetry against welding standards:
   * - Travel (Push/Drag) angle: Ideal 10°-15° push. In-bounds: 6° to 20°.
   * - Work angle: Target nominal (90° for butt/lap, 45° for fillet). In-bounds: ±10°.
   * - Travel speed: Ideal 4.0 - 8.0 mm/s. In-bounds: 3.5 - 8.5 mm/s.
   */
  public checkDeviations(input: TelemetryCheckInput): DeviationStatus {
    const { travelAngle_deg, workAngle_deg, targetWorkAngle, speed_mm_s, isTrackingActive } = input;

    if (!isTrackingActive) {
      return {
        hasDeviation: false,
        angleDeviation: false,
        speedDeviation: false,
        primaryReason: null,
        deviationType: null,
        details: {},
      };
    }

    const details: DeviationStatus['details'] = {};
    let angleDeviation = false;
    let speedDeviation = false;
    let deviationType: HapticDeviationType | null = null;
    let primaryReason: string | null = null;

    // 1. Travel Angle Checks (Ideal is 10° to 15° forehand push)
    if (travelAngle_deg > 20) {
      angleDeviation = true;
      details.travelAngleIssue = `Push angle too steep (+${travelAngle_deg.toFixed(0)}° > 20° max)`;
      deviationType = 'angle_push_excess';
      primaryReason = details.travelAngleIssue;
    } else if (travelAngle_deg < 6) {
      angleDeviation = true;
      if (travelAngle_deg < 0) {
        details.travelAngleIssue = `Excessive drag angle (${travelAngle_deg.toFixed(0)}°)`;
        deviationType = 'angle_drag_excess';
      } else {
        details.travelAngleIssue = `Push angle too low (${travelAngle_deg.toFixed(0)}° < 6° min)`;
        deviationType = 'angle_push_excess';
      }
      primaryReason = details.travelAngleIssue;
    }

    // 2. Work Angle Checks (Ideal is targetWorkAngle ± 10°)
    const workAngleDelta = Math.abs(workAngle_deg - targetWorkAngle);
    if (workAngleDelta > 10) {
      angleDeviation = true;
      details.workAngleIssue = `Work angle off by ${workAngleDelta.toFixed(0)}° (target: ${targetWorkAngle}°)`;
      if (!deviationType) {
        deviationType = 'angle_work_misaligned';
        primaryReason = details.workAngleIssue;
      }
    }

    // 3. Travel Speed Checks (Ideal is 4.0 - 8.0 mm/s)
    if (speed_mm_s > 8.5) {
      speedDeviation = true;
      details.speedIssue = `Travel speed too fast (${speed_mm_s.toFixed(1)} mm/s > 8.5 max)`;
      if (!deviationType) {
        deviationType = 'speed_fast';
        primaryReason = details.speedIssue;
      }
    } else if (speed_mm_s < 3.2 && speed_mm_s > 0.4) {
      speedDeviation = true;
      details.speedIssue = `Travel speed too slow (${speed_mm_s.toFixed(1)} mm/s < 3.2 min)`;
      if (!deviationType) {
        deviationType = 'speed_slow';
        primaryReason = details.speedIssue;
      }
    }

    // Multi-fault condition
    if (angleDeviation && speedDeviation) {
      deviationType = 'severe_multi';
      primaryReason = `Multiple deviations: ${details.travelAngleIssue || details.workAngleIssue} & ${details.speedIssue}`;
    }

    const hasDeviation = angleDeviation || speedDeviation;

    return {
      hasDeviation,
      angleDeviation,
      speedDeviation,
      primaryReason,
      deviationType,
      details,
    };
  }

  /**
   * Process high-rate telemetry feed from tracking loop.
   * Emits subtle haptic pulse when crossing into deviation or at periodic cadence while out of bounds.
   */
  public processActiveTelemetry(input: TelemetryCheckInput): DeviationStatus {
    const status = this.checkDeviations(input);
    const now = performance.now();

    if (!this.enabled || !input.isTrackingActive || !status.hasDeviation || !status.deviationType) {
      if (this.wasDeviating) {
        this.wasDeviating = false;
        this.lastDeviationType = null;
      }
      return status;
    }

    const pattern = this.PATTERNS[status.deviationType];
    const timeSinceLast = now - this.lastPulseTime;

    // Trigger condition:
    // 1. Edge trigger: newly entered deviation state (wasDeviating was false)
    // 2. Type change: deviation changed (e.g. angle error became speed error) after min gap
    // 3. Cadence trigger: continuously out of bounds after PULSE_INTERVAL_MS
    const isNewDeviation = !this.wasDeviating;
    const isChangedType = status.deviationType !== this.lastDeviationType && timeSinceLast > this.RETRIGGER_MIN_MS;
    const isCadenceReminder = timeSinceLast >= this.PULSE_INTERVAL_MS;

    if (isNewDeviation || isChangedType || isCadenceReminder) {
      this.lastPulseTime = now;
      this.lastDeviationType = status.deviationType;
      this.wasDeviating = true;

      this.vibrate(pattern);

      const category = status.deviationType === 'severe_multi'
        ? 'severe'
        : status.deviationType.startsWith('angle')
        ? 'angle'
        : 'speed';

      this.notify({
        type: status.deviationType,
        category,
        timestamp: now,
        reason: status.primaryReason || 'Technique deviation detected',
        pattern,
      });
    }

    return status;
  }
}

export const hapticFeedback = new HapticFeedbackService();
