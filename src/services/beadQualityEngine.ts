/**
 * @file beadQualityEngine.ts
 * @description Isolated, deterministic empirical formula engine for GMAW / MIG welding simulation.
 * Computes heat input, transfer mode, bead geometry (width, height, penetration),
 * defect identification, and score attribution (technique vs. parameter errors).
 *
 * References:
 * - AWS Welding Handbook, Vol. 1 & 2 (GMAW fundamentals)
 * - IIW (International Institute of Welding) Doc. IX-1834-96 for Heat Input Calculation
 * - Lesnewich Equation for MIG Wire Melting Rate and Empirical Bead Dimensions
 */

import {
  BeadQualityResult,
  BeadSegment,
  DefectReport,
  LiveTorchSample,
  MaterialType,
  ShieldingGas,
  TransferMode,
  WeldingParameters,
} from '../types';

/**
 * GMAW Thermal Efficiency Factor (AWS standard = 0.80)
 * 80% of electrical arc power is transferred to the workpiece; 20% lost to radiation and gas convection.
 */
export const GMAW_ARC_EFFICIENCY = 0.80;

/**
 * Empirical constants for mild steel with ER70S-6 wire.
 */
export const EMPIRICAL_COEFFICIENTS = {
  // Bead Width k_w factor: W = k_w * (I^0.45 * V^0.70) / (v^0.35)
  beadWidthConstant: 0.082,
  // Bead Penetration k_p factor: P = k_p * (I^0.75) / (v^0.45 * V^0.15)
  penetrationConstant: 0.038,
  // Reinforcement Area coefficient: derived from mass conservation of wire feed
  wireMeltingEfficiency: 0.95, // Account for ~5% spatter loss
};

/**
 * Default ideal parameter ranges for common materials & wire sizes.
 */
export const PARAMETER_BOUNDS: Record<
  MaterialType,
  Record<
    number, // wire diameter in mm
    {
      currentMin: number;
      currentMax: number;
      voltageMin: number;
      voltageMax: number;
      wfsMin: number; // m/min
      wfsMax: number; // m/min
      ctwdMin: number; // mm
      ctwdMax: number; // mm
      idealTravelSpeed_mm_s: [number, number]; // [min, max] recommended
    }
  >
> = {
  mild_steel: {
    0.8: {
      currentMin: 50,
      currentMax: 180,
      voltageMin: 14.5,
      voltageMax: 22.0,
      wfsMin: 2.5,
      wfsMax: 10.0,
      ctwdMin: 8.0,
      ctwdMax: 15.0,
      idealTravelSpeed_mm_s: [4.0, 7.5],
    },
    0.9: {
      currentMin: 70,
      currentMax: 220,
      voltageMin: 15.0,
      voltageMax: 24.5,
      wfsMin: 2.0,
      wfsMax: 11.0,
      ctwdMin: 10.0,
      ctwdMax: 16.0,
      idealTravelSpeed_mm_s: [4.5, 8.0],
    },
    1.0: {
      currentMin: 90,
      currentMax: 260,
      voltageMin: 16.0,
      voltageMax: 26.5,
      wfsMin: 2.0,
      wfsMax: 12.0,
      ctwdMin: 10.0,
      ctwdMax: 18.0,
      idealTravelSpeed_mm_s: [5.0, 8.5],
    },
    1.2: {
      currentMin: 120,
      currentMax: 320,
      voltageMin: 17.5,
      voltageMax: 29.0,
      wfsMin: 1.8,
      wfsMax: 11.5,
      ctwdMin: 12.0,
      ctwdMax: 20.0,
      idealTravelSpeed_mm_s: [5.5, 9.5],
    },
  },
  stainless_304: {
    0.8: {
      currentMin: 45,
      currentMax: 160,
      voltageMin: 15.0,
      voltageMax: 21.5,
      wfsMin: 2.2,
      wfsMax: 9.0,
      ctwdMin: 8.0,
      ctwdMax: 14.0,
      idealTravelSpeed_mm_s: [4.0, 7.0],
    },
    0.9: {
      currentMin: 60,
      currentMax: 200,
      voltageMin: 15.5,
      voltageMax: 23.5,
      wfsMin: 2.0,
      wfsMax: 10.0,
      ctwdMin: 9.0,
      ctwdMax: 15.0,
      idealTravelSpeed_mm_s: [4.5, 7.5],
    },
    1.0: {
      currentMin: 80,
      currentMax: 240,
      voltageMin: 16.5,
      voltageMax: 25.5,
      wfsMin: 1.8,
      wfsMax: 11.0,
      ctwdMin: 10.0,
      ctwdMax: 16.0,
      idealTravelSpeed_mm_s: [4.8, 8.0],
    },
    1.2: {
      currentMin: 110,
      currentMax: 290,
      voltageMin: 18.0,
      voltageMax: 28.0,
      wfsMin: 1.6,
      wfsMax: 10.5,
      ctwdMin: 12.0,
      ctwdMax: 18.0,
      idealTravelSpeed_mm_s: [5.0, 8.5],
    },
  },
  aluminum_4043: {
    0.8: {
      currentMin: 60,
      currentMax: 150,
      voltageMin: 18.0,
      voltageMax: 23.0,
      wfsMin: 4.5,
      wfsMax: 13.0,
      ctwdMin: 10.0,
      ctwdMax: 15.0,
      idealTravelSpeed_mm_s: [6.0, 11.0],
    },
    0.9: {
      currentMin: 80,
      currentMax: 190,
      voltageMin: 19.0,
      voltageMax: 24.5,
      wfsMin: 4.0,
      wfsMax: 14.0,
      ctwdMin: 10.0,
      ctwdMax: 16.0,
      idealTravelSpeed_mm_s: [6.5, 12.0],
    },
    1.0: {
      currentMin: 100,
      currentMax: 230,
      voltageMin: 20.0,
      voltageMax: 26.0,
      wfsMin: 3.5,
      wfsMax: 14.5,
      ctwdMin: 12.0,
      ctwdMax: 18.0,
      idealTravelSpeed_mm_s: [7.0, 13.0],
    },
    1.2: {
      currentMin: 130,
      currentMax: 280,
      voltageMin: 21.0,
      voltageMax: 28.0,
      wfsMin: 3.0,
      wfsMax: 15.0,
      ctwdMin: 12.0,
      ctwdMax: 20.0,
      idealTravelSpeed_mm_s: [7.5, 14.0],
    },
  },
};

/**
 * 1. Calculate Transfer Mode based on Voltage, Current, Shielding Gas and Wire Diameter.
 */
export function calculateTransferMode(
  voltage: number,
  current: number,
  gas: ShieldingGas,
  wireDiameter_mm: number
): { mode: TransferMode; feedback: string } {
  // 100% CO2 cannot achieve pure spray transfer (remains short-circuit or globular)
  const isArgonRich = gas !== '100_CO2';
  // Spray transition current threshold for 0.8mm - 1.2mm wire in argon-rich gas
  const sprayCurrentThreshold = 160 + (wireDiameter_mm - 0.8) * 120;
  const sprayVoltageThreshold = 22.5 + (wireDiameter_mm - 0.8) * 3.0;

  if (voltage < 21.0 && current < sprayCurrentThreshold * 0.85) {
    return {
      mode: 'short_circuit',
      feedback: 'Short-Circuit Transfer (Dip transfer): Ideal for sheet metal, root passes, and out-of-position welds with minimal distortion.',
    };
  } else if (isArgonRich && voltage >= sprayVoltageThreshold && current >= sprayCurrentThreshold) {
    return {
      mode: 'spray',
      feedback: 'Axial Spray Transfer: High deposition rate, deep finger penetration, smooth spatter-free arc. Best for flat/horizontal plate > 3mm.',
    };
  } else {
    return {
      mode: 'globular',
      feedback: 'Globular Transfer: Irregular large droplet detachment. Prone to heavier spatter and unstable puddle. Usually avoided by adjusting voltage/WFS.',
    };
  }
}

/**
 * 2. Calculate Heat Input (kJ/mm)
 * Equation: H = eta * (V * I * 60) / (v_mm_min * 1000)
 * where eta is arc thermal efficiency (0.80 for GMAW).
 */
export function calculateHeatInput(
  voltage_V: number,
  current_A: number,
  travelSpeed_mm_s: number,
  efficiency = GMAW_ARC_EFFICIENCY
): number {
  const safeSpeed = Math.max(0.5, travelSpeed_mm_s);
  const travelSpeed_mm_min = safeSpeed * 60;
  const heatInput_kJ_per_mm = (efficiency * voltage_V * current_A * 60) / (travelSpeed_mm_min * 1000);
  return Number(heatInput_kJ_per_mm.toFixed(3));
}

/**
 * 3. Calculate Cross-Sectional Deposition Area (mm²)
 * From conservation of mass: A_dep = (pi * (d/2)^2 * WFS_mm_s) / v_mm_s
 */
export function calculateDepositionArea(
  wireDiameter_mm: number,
  wireFeedSpeed_m_min: number,
  travelSpeed_mm_s: number
): number {
  const safeSpeed = Math.max(0.5, travelSpeed_mm_s);
  const wireRadius_mm = wireDiameter_mm / 2;
  const wireArea_mm2 = Math.PI * Math.pow(wireRadius_mm, 2);
  const wfs_mm_s = (wireFeedSpeed_m_min * 1000) / 60;

  const theoreticalArea = (wireArea_mm2 * wfs_mm_s) / safeSpeed;
  return Number((theoreticalArea * EMPIRICAL_COEFFICIENTS.wireMeltingEfficiency).toFixed(2));
}

/**
 * 4. Calculate Single Point Bead Geometry (Width, Height, Penetration)
 * Incorporates torch push/drag and work angle physics:
 * - Push angle (positive): wider bead, flatter crown, shallower penetration.
 * - Drag angle (negative): narrower bead, taller crown, deeper finger penetration.
 * - Work angle: off 90° for butt (or off 45° for fillet) distorts lateral profile.
 */
export function calculateBeadGeometry(
  params: WeldingParameters,
  travelSpeed_mm_s: number,
  travelAngle_deg: number, // + for push (forehand), - for drag (backhand)
  workAngle_deg: number,
  ctwd_mm: number
): {
  width_mm: number;
  height_mm: number;
  penetration_mm: number;
} {
  const safeSpeed = Math.max(0.8, travelSpeed_mm_s);
  const { current_A, voltage_V, wireDiameter_mm, wireFeedSpeed_m_min, jointType } = params;

  // Base empirical width
  const baseWidth =
    EMPIRICAL_COEFFICIENTS.beadWidthConstant *
    (Math.pow(current_A, 0.45) * Math.pow(voltage_V, 0.70)) /
    Math.pow(safeSpeed, 0.35);

  // Push angle widens the puddle (+15% at +20° push); drag narrows it (-10% at -20° drag)
  const angleRad = (travelAngle_deg * Math.PI) / 180;
  const pushFactor = 1.0 + 0.35 * Math.sin(angleRad); // > 1 for push, < 1 for drag

  // CTWD standoff factor (longer stickout increases arc resistance & widens arc cone slightly)
  const ctwdFactor = Math.pow(Math.max(6, ctwd_mm) / 12, 0.15);

  const width_mm = Math.max(2.0, baseWidth * pushFactor * ctwdFactor);

  // Penetration formula: drag angle increases penetration; push angle decreases it
  const basePenetration =
    EMPIRICAL_COEFFICIENTS.penetrationConstant *
    Math.pow(current_A, 0.78) /
    (Math.pow(safeSpeed, 0.42) * Math.pow(voltage_V, 0.18));

  // Cosine attenuation with travel angle + penalty if pushing
  const dragPenetrationFactor = 1.0 - 0.25 * Math.sin(angleRad); // Pushing reduces penetration

  // Work angle alignment penalty (ideal butt = 90°, ideal fillet = 45°)
  const targetWorkAngle = jointType === 't_fillet' ? 45 : 90;
  const workAngleDelta = Math.abs(workAngle_deg - targetWorkAngle);
  const workAnglePenalty = Math.max(0.5, Math.cos((workAngleDelta * Math.PI) / 180));

  const penetration_mm = Math.max(0.4, basePenetration * dragPenetrationFactor * workAnglePenalty);

  // Reinforcement Height calculated from parabolic cross-section: Area ≈ (2/3) * Width * Height
  const depArea = calculateDepositionArea(wireDiameter_mm, wireFeedSpeed_m_min, safeSpeed);
  const height_mm = Math.max(0.5, (1.5 * depArea) / width_mm);

  return {
    width_mm: Number(width_mm.toFixed(2)),
    height_mm: Number(height_mm.toFixed(2)),
    penetration_mm: Number(penetration_mm.toFixed(2)),
  };
}

/**
 * 5. Deterministic Defect Diagnosis & Attribution Engine
 * Evaluates parameter mismatches and technique errors with root-cause categorization.
 */
export function evaluateDefectsAndScores(
  params: WeldingParameters,
  samples: LiveTorchSample[]
): {
  defects: DefectReport[];
  subScores: BeadQualityResult['subScores'];
  overallScore: number;
  attribution: BeadQualityResult['attribution'];
} {
  const defects: DefectReport[] = [];
  const bounds = PARAMETER_BOUNDS[params.material]?.[params.wireDiameter_mm] || PARAMETER_BOUNDS.mild_steel[0.8];

  // ----------------------------------------------------
  // A. PARAMETER-CAUSED EVALUATION (Settings before pass)
  // ----------------------------------------------------
  let parameterScore = 100;
  const parameterIssues: string[] = [];

  // 1. Voltage vs Wire Feed Speed Balance (V-WFS ratio)
  // Approximate equilibrium curve for mild steel: V_ideal ≈ 14.0 + 0.05 * (WFS_m_min * 20)
  const theoreticalIdealVoltage = 13.5 + params.wireFeedSpeed_m_min * 0.95;
  const voltageDiff = params.voltage_V - theoreticalIdealVoltage;

  if (voltageDiff > 3.5) {
    parameterScore -= 28;
    defects.push({
      id: 'param_excess_spatter',
      name: 'Excessive Spatter & High Arc Flaring',
      category: 'parameter',
      severity: 'moderate',
      description: 'The arc voltage is set too high relative to wire feed speed, creating long arc length and turbulent droplet transfer.',
      cause: `Arc Voltage (${params.voltage_V}V) is too high for Wire Feed Speed (${params.wireFeedSpeed_m_min} m/min). Ideal voltage is ~${theoreticalIdealVoltage.toFixed(1)}V.`,
      correctiveAction: 'Decrease machine voltage by 1.5 - 3.0V or increase wire feed speed to stabilize short-circuit frequency.',
    });
    parameterIssues.push('High voltage / spatter');
  } else if (voltageDiff < -3.2) {
    parameterScore -= 30;
    defects.push({
      id: 'param_stubbing',
      name: 'Wire Stubbing / Freezing Arc',
      category: 'parameter',
      severity: 'critical',
      description: 'Wire is feeding faster than arc energy can melt it, causing the electrode to physically stab into the puddle and pop violently.',
      cause: `Arc Voltage (${params.voltage_V}V) is too low for Wire Feed Speed (${params.wireFeedSpeed_m_min} m/min).`,
      correctiveAction: 'Increase voltage by 2.0 - 3.5V or reduce wire feed speed to maintain stable arc column.',
    });
    parameterIssues.push('Wire stubbing / low voltage');
  }

  // 2. Current vs Plate Thickness Match
  // General rule of thumb: ~35-40 Amps per 1mm thickness for mild steel
  const recommendedCurrentMin = params.materialThickness_mm * 30;
  const recommendedCurrentMax = params.materialThickness_mm * 55;

  if (params.current_A < recommendedCurrentMin) {
    parameterScore -= 22;
    defects.push({
      id: 'param_cold_lap',
      name: 'Lack of Fusion / Cold Lap Risk',
      category: 'parameter',
      severity: 'critical',
      description: 'The welding current is insufficient to achieve complete joint penetration and side-wall fusion into base plate.',
      cause: `Current (${params.current_A}A) is too low for ${params.materialThickness_mm}mm plate thickness.`,
      correctiveAction: `Increase current to at least ${Math.round(recommendedCurrentMin)}A (increase WFS) for proper puddle fluid dynamics.`,
    });
    parameterIssues.push('Insufficient current for thickness');
  } else if (params.current_A > recommendedCurrentMax && params.materialThickness_mm <= 3.0) {
    parameterScore -= 24;
    defects.push({
      id: 'param_burnthrough',
      name: 'Melt-Through / Burn-Through Risk',
      category: 'parameter',
      severity: 'critical',
      description: 'Excessive thermal amperage on thin sheet metal will cause localized blowout and puddle drop-out.',
      cause: `Current (${params.current_A}A) exceeds thermal capacity of ${params.materialThickness_mm}mm plate.`,
      correctiveAction: `Reduce current below ${Math.round(recommendedCurrentMax)}A or switch to backing bar / pulsed transfer.`,
    });
    parameterIssues.push('Excessive current for thin sheet');
  }

  // 3. Shielding Gas Suitability
  if (params.material === 'stainless_304' && params.shieldingGas === '100_CO2') {
    parameterScore -= 30;
    defects.push({
      id: 'param_gas_carb',
      name: 'Severe Carbide Precipitation (Incorrect Gas)',
      category: 'parameter',
      severity: 'critical',
      description: 'Welding stainless steel with 100% CO2 introduces carbon into the weld pool, degrading corrosion resistance (intergranular corrosion).',
      cause: '100% CO2 used on Austenitic Stainless Steel 304.',
      correctiveAction: 'Switch to 98% Ar / 2% O2 or Ar/CO2/He trimix shielding gas for stainless steel.',
    });
    parameterIssues.push('Incorrect shielding gas');
  }

  // ----------------------------------------------------
  // B. TECHNIQUE-CAUSED EVALUATION (Live Sensor & Marker Data)
  // ----------------------------------------------------
  let techniqueScore = 100;
  let speedConsistencyScore = 100;
  let angleTechniqueScore = 100;
  let ctwdScore = 100;
  const techniqueIssues: string[] = [];

  if (samples.length === 0) {
    // Fallback if no live samples
    return {
      defects,
      subScores: {
        speedConsistency: 85,
        angleTechnique: 85,
        ctwdControl: 85,
        parameterBalance: Math.max(10, parameterScore),
      },
      overallScore: Math.round(parameterScore * 0.4 + 85 * 0.6),
      attribution: {
        parameterScore: Math.max(10, parameterScore),
        techniqueScore: 85,
        primaryIssue: parameterScore < 75 ? 'parameter' : 'none',
        summary: 'Preset parameters analyzed. Perform live pass for full technique score.',
        recommendations: ['Maintain smooth steady torch travel and 10-15° push angle.'],
      },
    };
  }

  // Calculate statistics across live torch samples
  const speeds = samples.map((s) => s.computedSpeed_mm_s);
  const travelAngles = samples.map((s) => s.pose.travelAngle_deg);
  const workAngles = samples.map((s) => s.pose.workAngle_deg);
  const ctwds = samples.map((s) => s.effectiveCTWD_mm || s.pose.z_mm);

  const meanSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length;
  const meanTravelAngle = travelAngles.reduce((a, b) => a + b, 0) / travelAngles.length;
  const meanWorkAngle = workAngles.reduce((a, b) => a + b, 0) / workAngles.length;
  const meanCTWD = ctwds.reduce((a, b) => a + b, 0) / ctwds.length;

  // Standard deviations
  const speedVariance = speeds.reduce((acc, v) => acc + Math.pow(v - meanSpeed, 2), 0) / speeds.length;
  const speedStdDev = Math.sqrt(speedVariance);
  const speedCOV = meanSpeed > 0 ? (speedStdDev / meanSpeed) * 100 : 0; // Coefficient of variation %

  const targetWorkAngle = params.jointType === 't_fillet' ? 45 : 90;

  // 1. Travel Speed Evaluation
  const [idealSpeedMin, idealSpeedMax] = bounds.idealTravelSpeed_mm_s;

  if (meanSpeed < idealSpeedMin * 0.75) {
    speedConsistencyScore -= 25;
    defects.push({
      id: 'tech_slow_travel',
      name: 'Excessive Bead Crown & Over-Heating (Too Slow)',
      category: 'technique',
      severity: 'moderate',
      description: 'Torch was moved too slowly along the seam, causing high reinforcement height, wide heat-affected zone (HAZ), and puddle flooding.',
      cause: `Average travel speed (${meanSpeed.toFixed(1)} mm/s) was significantly below target (${idealSpeedMin.toFixed(1)} - ${idealSpeedMax.toFixed(1)} mm/s).`,
      correctiveAction: 'Increase torch progression speed along joint seam to maintain consistent puddle control.',
    });
    techniqueIssues.push('Travel speed too slow');
  } else if (meanSpeed > idealSpeedMax * 1.35) {
    speedConsistencyScore -= 30;
    defects.push({
      id: 'tech_undercut_fast',
      name: 'Undercut & Starved Convex Bead (Too Fast)',
      category: 'technique',
      severity: 'critical',
      description: 'Moving too fast leaves groove melted in base metal without adequate deposited filler metal to backfill the toe.',
      cause: `Average travel speed (${meanSpeed.toFixed(1)} mm/s) was too fast for wire deposition rate.`,
      correctiveAction: `Slow down to ${idealSpeedMin.toFixed(1)} - ${idealSpeedMax.toFixed(1)} mm/s to allow base metal wetting at toes.`,
    });
    techniqueIssues.push('Travel speed too fast (undercut)');
  }

  // Speed variance / jerky motion
  if (speedCOV > 35) {
    speedConsistencyScore -= 20;
    defects.push({
      id: 'tech_speed_irregularity',
      name: 'Irregular Bead Width & Inconsistent Ripples',
      category: 'technique',
      severity: 'moderate',
      description: 'Hesitations and jerky hand acceleration created uneven bead crests and localized thinning.',
      cause: `Travel speed variation was ${speedCOV.toFixed(0)}% (ideal is < 20%).`,
      correctiveAction: 'Anchor your body posture, rest your supporting hand on a resting pad, and slide torch with smooth shoulder movement.',
    });
    techniqueIssues.push('Inconsistent travel pace');
  }

  // 2. Torch Angle Evaluation
  // Ideal travel angle for GMAW: 10° - 15° forehand push (or slight drag on thick plate)
  if (meanTravelAngle > 25.0) {
    angleTechniqueScore -= 25;
    defects.push({
      id: 'tech_excess_push_angle',
      name: 'Severe Push Angle (Shielding Gas Aspiration)',
      category: 'technique',
      severity: 'critical',
      description: 'Pushing at > 25° aspirates atmospheric nitrogen and oxygen into the shielding gas column, causing porosity and shallow fusion.',
      cause: `Travel angle averaged ${meanTravelAngle.toFixed(0)}° push (recommended: 10° - 15°).`,
      correctiveAction: 'Bring torch barrel closer to 10° - 15° push angle to keep nozzle perpendicular to the puddle.',
    });
    techniqueIssues.push('Excessive push angle');
  } else if (meanTravelAngle < -20.0) {
    angleTechniqueScore -= 20;
    defects.push({
      id: 'tech_excess_drag_angle',
      name: 'Excessive Drag Angle (Ropey Convex Bead)',
      category: 'technique',
      severity: 'moderate',
      description: 'Dragging too steep directs arc force directly onto top of molten puddle rather than leading edge of cold steel, causing a humped bead.',
      cause: `Travel angle averaged ${Math.abs(meanTravelAngle).toFixed(0)}° drag.`,
      correctiveAction: 'Maintain a slight 10° - 15° push or mild drag angle for optimal puddle profile.',
    });
    techniqueIssues.push('Excessive drag angle');
  }

  // Work angle evaluation
  const workAngleDelta = Math.abs(meanWorkAngle - targetWorkAngle);
  if (workAngleDelta > 15) {
    angleTechniqueScore -= 25;
    defects.push({
      id: 'tech_work_angle_off',
      name: params.jointType === 't_fillet' ? 'Unequal Fillet Legs (Work Angle Bias)' : 'Off-Center Asymmetrical Bead',
      category: 'technique',
      severity: 'moderate',
      description: `Torch work angle deviated from the ${targetWorkAngle}° bisector, biasing arc force into one member.`,
      cause: `Average work angle was ${meanWorkAngle.toFixed(0)}° (target: ${targetWorkAngle}°).`,
      correctiveAction: `Hold torch at exactly ${targetWorkAngle}° relative to joint plate faces to balance heat input evenly.`,
    });
    techniqueIssues.push('Work angle misaligned');
  }

  // 3. Standoff / CTWD (Contact Tip to Work Distance)
  if (meanCTWD > 18.0) {
    ctwdScore -= 35;
    defects.push({
      id: 'tech_porosity_ctwd',
      name: 'Gross Wormhole Porosity (Long Standoff Distance)',
      category: 'technique',
      severity: 'critical',
      description: 'Contact tip was held too far from workpiece (> 18mm), allowing ambient air turbulence to disperse shielding gas shroud.',
      cause: `Average standoff distance was ${meanCTWD.toFixed(1)}mm (ideal: 10 - 14mm).`,
      correctiveAction: 'Keep nozzle 10 - 13mm away from workpiece throughout the entire pass.',
    });
    techniqueIssues.push('Standoff too long (porosity)');
  } else if (meanCTWD < 6.0) {
    ctwdScore -= 25;
    defects.push({
      id: 'tech_nozzle_fouling',
      name: 'Nozzle Spatter Clogging / Contact Tip Fusion Risk',
      category: 'technique',
      severity: 'moderate',
      description: 'Holding torch too close (< 6mm) fouls gas diffuser with spatter and risks fusing contact tip to workpiece.',
      cause: `Average standoff was ${meanCTWD.toFixed(1)}mm (too close).`,
      correctiveAction: 'Maintain 10 - 12mm stick-out distance.',
    });
    techniqueIssues.push('Torch held too close');
  }

  // Normalize subscores
  parameterScore = Math.max(0, Math.min(100, parameterScore));
  speedConsistencyScore = Math.max(0, Math.min(100, speedConsistencyScore));
  angleTechniqueScore = Math.max(0, Math.min(100, angleTechniqueScore));
  ctwdScore = Math.max(0, Math.min(100, ctwdScore));

  techniqueScore = Math.round(speedConsistencyScore * 0.40 + angleTechniqueScore * 0.35 + ctwdScore * 0.25);

  // Overall Score (Weighted 30% Parameters, 70% Technique)
  const overallScore = Math.round(parameterScore * 0.30 + techniqueScore * 0.70);

  // Determine Primary Attribution Issue
  let primaryIssue: 'parameter' | 'technique' | 'both' | 'none' = 'none';
  let summary = 'Well balanced welding parameters and steady torch technique!';
  const recommendations: string[] = [];

  const paramFault = parameterScore < 80;
  const techFault = techniqueScore < 80;

  if (paramFault && techFault) {
    primaryIssue = 'both';
    summary = `Combined Issues Detected: Both initial machine settings (${parameterIssues.join(', ')}) and torch manipulation (${techniqueIssues.join(', ')}) need correction.`;
    recommendations.push('First calibrate your machine voltage and wire feed speed before starting your next pass.');
    recommendations.push('Focus on maintaining a uniform 10-15° push angle and steady travel pace.');
  } else if (paramFault) {
    primaryIssue = 'parameter';
    summary = `Parameter-Caused Defect: Good torch hand technique, but machine settings (${parameterIssues.join(', ')}) compromised bead quality.`;
    recommendations.push('Adjust machine voltage and wire feed speed to the recommended window.');
    recommendations.push('Your hand speed and angles were steady—keep that exact technique once parameters are dialed in.');
  } else if (techFault) {
    primaryIssue = 'technique';
    summary = `Technique-Caused Defect: Machine parameters were well set, but torch manipulation (${techniqueIssues.join(', ')}) caused weld defects.`;
    recommendations.push('Practice holding a steady travel pace and maintaining proper nozzle standoff distance (10-13mm).');
    recommendations.push('Verify push/pull angles in the live HUD before pulling the trigger.');
  } else {
    primaryIssue = 'none';
    summary = 'Excellent Pass! Smooth travel speed, proper gas coverage, and optimal arc voltage balance.';
    recommendations.push('Ready for destructive bend test or radiographic quality inspection standard.');
  }

  return {
    defects,
    subScores: {
      speedConsistency: speedConsistencyScore,
      angleTechnique: angleTechniqueScore,
      ctwdControl: ctwdScore,
      parameterBalance: parameterScore,
    },
    overallScore,
    attribution: {
      parameterScore,
      techniqueScore,
      primaryIssue,
      summary,
      recommendations,
    },
  };
}

/**
 * 6. Master Full Pass Evaluation Function
 * Generates bead segments, calculates aggregate heat input, geometry, and defect reports.
 */
export function evaluateFullWeldPass(
  params: WeldingParameters,
  samples: LiveTorchSample[]
): BeadQualityResult {
  const { mode: transferMode, feedback: transferModeFeedback } = calculateTransferMode(
    params.voltage_V,
    params.current_A,
    params.shieldingGas,
    params.wireDiameter_mm
  );

  const { defects, subScores, overallScore, attribution } = evaluateDefectsAndScores(params, samples);

  // Generate localized bead segments along the seam
  const beadSegments: BeadSegment[] = [];
  let totalHeatInput = 0;
  let totalWidth = 0;
  let totalHeight = 0;
  let totalPenetration = 0;

  const validSamples = samples.filter((s) => s.isArcActive || s.ble.isArmed);
  const evaluationSamples = validSamples.length > 0 ? validSamples : samples;

  if (evaluationSamples.length > 0) {
    evaluationSamples.forEach((sample, idx) => {
      const speed = Math.max(0.5, sample.computedSpeed_mm_s);
      const geom = calculateBeadGeometry(
        params,
        speed,
        sample.pose.travelAngle_deg,
        sample.pose.workAngle_deg,
        sample.effectiveCTWD_mm || sample.pose.z_mm
      );

      const heat = calculateHeatInput(params.voltage_V, params.current_A, speed);

      totalHeatInput += heat;
      totalWidth += geom.width_mm;
      totalHeight += geom.height_mm;
      totalPenetration += geom.penetration_mm;

      beadSegments.push({
        x_mm: sample.pose.x_mm || idx * 2.5,
        y_mm: sample.pose.y_mm || 0,
        width_mm: geom.width_mm,
        height_mm: geom.height_mm,
        penetration_mm: geom.penetration_mm,
        speed_mm_s: speed,
        travelAngle_deg: sample.pose.travelAngle_deg,
        workAngle_deg: sample.pose.workAngle_deg,
        ctwd_mm: sample.effectiveCTWD_mm || sample.pose.z_mm,
        heatInput_kJ_per_mm: heat,
        defectFlags: sample.instantaneousDefects || [],
      });
    });
  } else {
    // Generate synthetic nominal segment if no samples
    const nominalSpeed = 6.0;
    const geom = calculateBeadGeometry(params, nominalSpeed, 12, 90, 12);
    const heat = calculateHeatInput(params.voltage_V, params.current_A, nominalSpeed);

    totalHeatInput = heat;
    totalWidth = geom.width_mm;
    totalHeight = geom.height_mm;
    totalPenetration = geom.penetration_mm;

    beadSegments.push({
      x_mm: 0,
      y_mm: 0,
      width_mm: geom.width_mm,
      height_mm: geom.height_mm,
      penetration_mm: geom.penetration_mm,
      speed_mm_s: nominalSpeed,
      travelAngle_deg: 12,
      workAngle_deg: 90,
      ctwd_mm: 12,
      heatInput_kJ_per_mm: heat,
      defectFlags: [],
    });
  }

  const count = Math.max(1, evaluationSamples.length);
  const meanBeadWidth_mm = Number((totalWidth / count).toFixed(2));
  const meanBeadHeight_mm = Number((totalHeight / count).toFixed(2));
  const meanPenetration_mm = Number((totalPenetration / count).toFixed(2));
  const meanHeatInput = Number((totalHeatInput / count).toFixed(3));

  const nominalSpeed = evaluationSamples.length > 0
    ? evaluationSamples.reduce((acc, s) => acc + s.computedSpeed_mm_s, 0) / evaluationSamples.length
    : 6.0;

  const depositionArea_mm2 = calculateDepositionArea(
    params.wireDiameter_mm,
    params.wireFeedSpeed_m_min,
    nominalSpeed
  );

  return {
    overallScore,
    subScores,
    heatInput_kJ_per_mm: meanHeatInput,
    depositionArea_mm2,
    meanBeadWidth_mm,
    meanBeadHeight_mm,
    meanPenetration_mm,
    transferMode,
    transferModeFeedback,
    defects,
    attribution,
    beadSegments,
  };
}

export const evaluateWeldPass = evaluateFullWeldPass;
