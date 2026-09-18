/**
 * @file instructorService.ts
 * @description State and data management for Instructor Web UI:
 * - Welding Procedure Specifications (WPS) library and active assignments
 * - Student workstation stations and live telemetry monitoring
 * - AWS D1.1 grading sign-offs and notes
 */

import { StudentStation, WeldingParameters, WeldPassRecord, WPSProcedure } from '../types';
import { storageService } from './storageAndSync';

export const DEFAULT_WPS_LIBRARY: WPSProcedure[] = [
  {
    id: 'wps-001',
    code: 'WPS-AWS-D1.1-01',
    title: 'GMAW-S Butt Joint 3.0mm Mild Steel (1G)',
    standard: 'AWS D1.1 Table 4.5 Pre-Qualified',
    jointType: 'butt',
    weldingPosition: '1F_1G',
    material: 'mild_steel',
    materialThickness_mm: 3.0,
    wireDiameter_mm: 0.9,
    shieldingGas: '75Ar_25CO2',
    voltage_V: 19.5,
    voltageTolerance_V: 1.0,
    current_A: 135,
    currentTolerance_A: 15,
    wireFeedSpeed_m_min: 6.5,
    wireFeedSpeedTolerance: 0.5,
    stickout_mm: 12,
    targetTravelSpeedMin_mm_s: 4.5,
    targetTravelSpeedMax_mm_s: 7.5,
    targetTravelAngleMin_deg: 10,
    targetTravelAngleMax_deg: 15,
    targetWorkAngle_deg: 90,
    notes: 'Short-circuiting transfer mode. Maintain smooth torch travel, zero weave, 12mm CTWD.',
  },
  {
    id: 'wps-002',
    code: 'WPS-AWS-D1.1-02',
    title: 'GMAW Fillet Weld 6.0mm Plate (2F Horizontal)',
    standard: 'AWS D1.1 Clause 5 Technique Rules',
    jointType: 't_fillet',
    weldingPosition: '2F',
    material: 'mild_steel',
    materialThickness_mm: 6.0,
    wireDiameter_mm: 1.2,
    shieldingGas: '75Ar_25CO2',
    voltage_V: 24.5,
    voltageTolerance_V: 1.2,
    current_A: 210,
    currentTolerance_A: 20,
    wireFeedSpeed_m_min: 7.8,
    wireFeedSpeedTolerance: 0.6,
    stickout_mm: 15,
    targetTravelSpeedMin_mm_s: 5.0,
    targetTravelSpeedMax_mm_s: 8.5,
    targetTravelAngleMin_deg: 10,
    targetTravelAngleMax_deg: 15,
    targetWorkAngle_deg: 45,
    notes: 'Aim bisector at 45° into joint root. Avoid cold lap at bottom leg.',
  },
  {
    id: 'wps-003',
    code: 'WPS-SS-304-03',
    title: 'GMAW Stainless Steel 304 2.0mm Lap Joint',
    standard: 'AWS D1.6 Structural Stainless',
    jointType: 'lap',
    weldingPosition: '1F_1G',
    material: 'stainless_304',
    materialThickness_mm: 2.0,
    wireDiameter_mm: 0.8,
    shieldingGas: '98Ar_2O2',
    voltage_V: 18.0,
    voltageTolerance_V: 0.8,
    current_A: 110,
    currentTolerance_A: 10,
    wireFeedSpeed_m_min: 5.8,
    wireFeedSpeedTolerance: 0.4,
    stickout_mm: 10,
    targetTravelSpeedMin_mm_s: 5.5,
    targetTravelSpeedMax_mm_s: 8.0,
    targetTravelAngleMin_deg: 10,
    targetTravelAngleMax_deg: 15,
    targetWorkAngle_deg: 60,
    notes: 'Low heat input critical to avoid chromium carbide precipitation and burn-through.',
  },
  {
    id: 'wps-004',
    code: 'WPS-AL-4043-04',
    title: 'GMAW Aluminum 4043 4.0mm Butt Joint',
    standard: 'AWS D1.2 Structural Aluminum',
    jointType: 'butt',
    weldingPosition: '1F_1G',
    material: 'aluminum_4043',
    materialThickness_mm: 4.0,
    wireDiameter_mm: 1.2,
    shieldingGas: '100_Ar',
    voltage_V: 22.0,
    voltageTolerance_V: 1.0,
    current_A: 160,
    currentTolerance_A: 15,
    wireFeedSpeed_m_min: 8.5,
    wireFeedSpeedTolerance: 0.7,
    stickout_mm: 15,
    targetTravelSpeedMin_mm_s: 7.0,
    targetTravelSpeedMax_mm_s: 11.0,
    targetTravelAngleMin_deg: 10,
    targetTravelAngleMax_deg: 15,
    targetWorkAngle_deg: 90,
    notes: 'Push technique mandatory for oxide cleaning action and inert gas coverage.',
  },
];

export const INITIAL_STUDENT_STATIONS: StudentStation[] = [
  {
    id: 'station-1',
    name: 'Alex Morgan',
    stationNumber: 1,
    status: 'ready',
    currentWpsId: 'wps-001',
    lastScore: 89,
    avgScore: 84.5,
    completedPasses: 12,
  },
  {
    id: 'station-2',
    name: 'Sarah Chen',
    stationNumber: 2,
    status: 'active_arc',
    currentWpsId: 'wps-001',
    lastScore: 92,
    avgScore: 88.0,
    completedPasses: 16,
  },
  {
    id: 'station-3',
    name: 'Marcus Vance',
    stationNumber: 3,
    status: 'ready',
    currentWpsId: 'wps-002',
    lastScore: 68,
    avgScore: 71.2,
    completedPasses: 9,
  },
  {
    id: 'station-4',
    name: 'Jordan Lee',
    stationNumber: 4,
    status: 'standby',
    currentWpsId: 'wps-001',
    lastScore: 78,
    avgScore: 76.4,
    completedPasses: 11,
  },
];

const WPS_KEY = 'mig_wps_library_v1';
const ACTIVE_WPS_KEY = 'mig_active_assigned_wps_v1';
const STATIONS_KEY = 'mig_student_stations_v1';

export class InstructorService {
  private wpsList: WPSProcedure[] = [];
  private activeWpsId: string = 'wps-001';
  private stations: StudentStation[] = [];

  constructor() {
    this.loadState();
  }

  private loadState() {
    try {
      const savedWps = localStorage.getItem(WPS_KEY);
      this.wpsList = savedWps ? JSON.parse(savedWps) : [...DEFAULT_WPS_LIBRARY];

      const savedActiveWps = localStorage.getItem(ACTIVE_WPS_KEY);
      this.activeWpsId = savedActiveWps || this.wpsList[0]?.id || 'wps-001';

      const savedStations = localStorage.getItem(STATIONS_KEY);
      this.stations = savedStations ? JSON.parse(savedStations) : [...INITIAL_STUDENT_STATIONS];
    } catch {
      this.wpsList = [...DEFAULT_WPS_LIBRARY];
      this.activeWpsId = 'wps-001';
      this.stations = [...INITIAL_STUDENT_STATIONS];
    }
  }

  public getWPSList(): WPSProcedure[] {
    return this.wpsList;
  }

  public getActiveWPS(): WPSProcedure {
    const found = this.wpsList.find((w) => w.id === this.activeWpsId);
    return found || this.wpsList[0];
  }

  public setActiveWPS(id: string): WPSProcedure | null {
    const found = this.wpsList.find((w) => w.id === id);
    if (found) {
      this.activeWpsId = id;
      localStorage.setItem(ACTIVE_WPS_KEY, id);
      return found;
    }
    return null;
  }

  public saveWPS(wps: WPSProcedure): void {
    const idx = this.wpsList.findIndex((w) => w.id === wps.id);
    if (idx >= 0) {
      this.wpsList[idx] = wps;
    } else {
      this.wpsList.push(wps);
    }
    localStorage.setItem(WPS_KEY, JSON.stringify(this.wpsList));
  }

  public deleteWPS(id: string): void {
    if (this.wpsList.length <= 1) return; // Keep at least one
    this.wpsList = this.wpsList.filter((w) => w.id !== id);
    if (this.activeWpsId === id) {
      this.activeWpsId = this.wpsList[0].id;
      localStorage.setItem(ACTIVE_WPS_KEY, this.activeWpsId);
    }
    localStorage.setItem(WPS_KEY, JSON.stringify(this.wpsList));
  }

  public getStations(): StudentStation[] {
    return this.stations;
  }

  public updateStationStatus(stationId: string, status: StudentStation['status']): void {
    this.stations = this.stations.map((st) => (st.id === stationId ? { ...st, status } : st));
    localStorage.setItem(STATIONS_KEY, JSON.stringify(this.stations));
  }

  public assignWpsToStation(stationId: string, wpsId: string): void {
    this.stations = this.stations.map((st) =>
      st.id === stationId ? { ...st, currentWpsId: wpsId } : st
    );
    localStorage.setItem(STATIONS_KEY, JSON.stringify(this.stations));
  }

  /**
   * Convert a WPS procedure to WeldingParameters for the Trainer app
   */
  public wpsToParameters(wps: WPSProcedure): WeldingParameters {
    return {
      material: wps.material,
      materialThickness_mm: wps.materialThickness_mm,
      wireDiameter_mm: wps.wireDiameter_mm,
      shieldingGas: wps.shieldingGas,
      voltage_V: wps.voltage_V,
      current_A: wps.current_A,
      wireFeedSpeed_m_min: wps.wireFeedSpeed_m_min,
      stickout_mm: wps.stickout_mm,
      jointType: wps.jointType,
      weldingPosition: wps.weldingPosition,
    };
  }

  /**
   * Grade or add instructor feedback note to a pass
   */
  public gradePass(
    passId: string,
    grade: 'PASS' | 'RETEST' | 'REJECT',
    notes: string,
    instructorName: string = 'CWI Inspector #441'
  ): WeldPassRecord | null {
    const passes = storageService.getPasses();
    const idx = passes.findIndex((p) => p.id === passId);
    if (idx === -1) return null;

    passes[idx] = {
      ...passes[idx],
      instructorGrade: grade,
      instructorNotes: notes,
      gradedBy: instructorName,
      gradedAt: Date.now(),
    };

    localStorage.setItem('mig_welding_pass_history_v1', JSON.stringify(passes));
    return passes[idx];
  }

  /**
   * Ensure initial sample weld passes exist so the instructor view is immediately informative
   */
  public seedInitialPassesIfEmpty(): void {
    const current = storageService.getPasses();
    if (current.length > 0) return;

    // Seed realistic sample passes from multiple students
    const samplePasses: WeldPassRecord[] = [
      {
        id: 'weld_sample_01',
        timestamp: Date.now() - 14 * 60 * 1000,
        studentName: 'Alex Morgan',
        parameters: {
          material: 'mild_steel',
          materialThickness_mm: 3.0,
          wireDiameter_mm: 0.9,
          shieldingGas: '75Ar_25CO2',
          voltage_V: 19.5,
          current_A: 135,
          wireFeedSpeed_m_min: 6.5,
          stickout_mm: 12,
          jointType: 'butt',
          weldingPosition: '1F_1G',
        },
        durationSeconds: 24.2,
        totalLength_mm: 180,
        sampleCount: 120,
        syncedToD1: true,
        instructorGrade: 'PASS',
        instructorNotes: 'Consistent travel speed and sound crown geometry. Approved for qualification test.',
        gradedBy: 'CWI Miller',
        gradedAt: Date.now() - 10 * 60 * 1000,
        result: {
          overallScore: 89,
          subScores: {
            speedConsistency: 91,
            angleTechnique: 88,
            ctwdControl: 87,
            parameterBalance: 90,
          },
          heatInput_kJ_per_mm: 0.65,
          depositionArea_mm2: 8.4,
          meanBeadWidth_mm: 6.8,
          meanBeadHeight_mm: 2.1,
          meanPenetration_mm: 2.4,
          transferMode: 'short_circuit',
          transferModeFeedback: 'Crisp, rapid short-circuiting droplets with minimal spatter.',
          defects: [],
          attribution: {
            parameterScore: 90,
            techniqueScore: 88,
            primaryIssue: 'none',
            summary: 'Excellent parameter balance and steady push angle within AWS D1.1 limits.',
            recommendations: ['Maintain current technique on real coupon.'],
          },
          beadSegments: [],
        },
      },
      {
        id: 'weld_sample_02',
        timestamp: Date.now() - 32 * 60 * 1000,
        studentName: 'Marcus Vance',
        parameters: {
          material: 'mild_steel',
          materialThickness_mm: 6.0,
          wireDiameter_mm: 1.2,
          shieldingGas: '75Ar_25CO2',
          voltage_V: 24.5,
          current_A: 210,
          wireFeedSpeed_m_min: 7.8,
          stickout_mm: 15,
          jointType: 't_fillet',
          weldingPosition: '2F',
        },
        durationSeconds: 18.0,
        totalLength_mm: 160,
        sampleCount: 95,
        syncedToD1: true,
        instructorGrade: 'RETEST',
        instructorNotes: 'Excessive travel angle caused undercut along upper toe. Keep push angle under 15°.',
        gradedBy: 'CWI Miller',
        gradedAt: Date.now() - 25 * 60 * 1000,
        result: {
          overallScore: 68,
          subScores: {
            speedConsistency: 72,
            angleTechnique: 58,
            ctwdControl: 74,
            parameterBalance: 88,
          },
          heatInput_kJ_per_mm: 0.72,
          depositionArea_mm2: 9.1,
          meanBeadWidth_mm: 7.4,
          meanBeadHeight_mm: 2.6,
          meanPenetration_mm: 2.1,
          transferMode: 'globular',
          transferModeFeedback: 'Large droplets with moderate spatter ejection.',
          defects: [
            {
              id: 'def_undercut_01',
              name: 'Toe Undercut',
              category: 'technique',
              severity: 'moderate',
              description: 'Groove melted into the base metal adjacent to the toe and left unfilled by weld metal.',
              cause: 'excessive_travel_angle',
              correctiveAction: 'Reduce forward push angle from 22° back to 10°-15° and direct arc energy into root',
            },
          ],
          attribution: {
            parameterScore: 88,
            techniqueScore: 58,
            primaryIssue: 'technique',
            summary: 'Good machine voltage and wire feed, but torch technique exceeded allowable push angle.',
            recommendations: ['Focus on stabilizing torch angle during the second half of the joint.'],
          },
          beadSegments: [],
        },
      },
      {
        id: 'weld_sample_03',
        timestamp: Date.now() - 55 * 60 * 1000,
        studentName: 'Sarah Chen',
        parameters: {
          material: 'mild_steel',
          materialThickness_mm: 3.0,
          wireDiameter_mm: 0.9,
          shieldingGas: '75Ar_25CO2',
          voltage_V: 19.5,
          current_A: 135,
          wireFeedSpeed_m_min: 6.5,
          stickout_mm: 12,
          jointType: 'butt',
          weldingPosition: '1F_1G',
        },
        durationSeconds: 26.5,
        totalLength_mm: 180,
        sampleCount: 130,
        syncedToD1: true,
        instructorGrade: 'PASS',
        instructorNotes: 'Outstanding uniformity across the full 180mm seam.',
        gradedBy: 'CWI Miller',
        gradedAt: Date.now() - 40 * 60 * 1000,
        result: {
          overallScore: 94,
          subScores: {
            speedConsistency: 96,
            angleTechnique: 93,
            ctwdControl: 92,
            parameterBalance: 95,
          },
          heatInput_kJ_per_mm: 0.62,
          depositionArea_mm2: 8.2,
          meanBeadWidth_mm: 6.6,
          meanBeadHeight_mm: 2.0,
          meanPenetration_mm: 2.5,
          transferMode: 'short_circuit',
          transferModeFeedback: 'Pristine short-circuiting frequency with zero spatter.',
          defects: [],
          attribution: {
            parameterScore: 95,
            techniqueScore: 93,
            primaryIssue: 'none',
            summary: 'Exceptional hand stability and flawless arc standoff control.',
            recommendations: ['Ready for welding certification coupon inspection.'],
          },
          beadSegments: [],
        },
      },
    ];

    samplePasses.forEach((p) => storageService.savePass(p));
  }
}

export const instructorService = new InstructorService();
