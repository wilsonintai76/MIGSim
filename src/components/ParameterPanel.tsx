import React, { useCallback } from 'react';
import { Sliders, Zap } from 'lucide-react';
import {
  calculateTransferMode,
  GMAW_ARC_EFFICIENCY,
  PARAMETER_BOUNDS,
} from '../services/beadQualityEngine';
import { WeldingParameters } from '../types';
import { MaterialSelectors } from './parameters/MaterialSelectors';
import { JointPositionSelector } from './parameters/JointPositionSelector';
import { ParameterSliders } from './parameters/ParameterSliders';
import { ParameterValidationCard } from './parameters/ParameterValidationCard';

interface ParameterPanelProps {
  parameters: WeldingParameters;
  onChange: (updated: WeldingParameters) => void;
  disabled?: boolean;
}

export const ParameterPanel: React.FC<ParameterPanelProps> = ({
  parameters,
  onChange,
  disabled = false,
}) => {
  const { mode: transferMode, feedback: transferFeedback } = calculateTransferMode(
    parameters.voltage_V,
    parameters.current_A,
    parameters.shieldingGas,
    parameters.wireDiameter_mm
  );

  // Dynamic bounds lookup based on selected material & wire diameter
  const bounds =
    PARAMETER_BOUNDS[parameters.material]?.[parameters.wireDiameter_mm] ||
    PARAMETER_BOUNDS.mild_steel[0.8];

  // Theoretical ideal voltage for given WFS
  const idealVoltage = 13.5 + parameters.wireFeedSpeed_m_min * 0.95;
  const voltageDelta = parameters.voltage_V - idealVoltage;

  // Theoretical Heat Input estimation at nominal 6 mm/s travel speed
  const nominalHeatInput =
    (GMAW_ARC_EFFICIENCY * parameters.voltage_V * parameters.current_A) / (1000 * 6.0);

  // Validation checks against realistic hardcoded bounds
  const isVoltageValid =
    parameters.voltage_V >= bounds.voltageMin && parameters.voltage_V <= bounds.voltageMax;
  const isCurrentValid =
    parameters.current_A >= bounds.currentMin && parameters.current_A <= bounds.currentMax;
  const isWfsValid =
    parameters.wireFeedSpeed_m_min >= bounds.wfsMin &&
    parameters.wireFeedSpeed_m_min <= bounds.wfsMax;
  const isCtwdValid = parameters.stickout_mm >= 6 && parameters.stickout_mm <= 22;

  const allParametersValid = isVoltageValid && isCurrentValid && isWfsValid && isCtwdValid;

  const updateParam = useCallback(
    <K extends keyof WeldingParameters>(key: K, value: WeldingParameters[K]) => {
      onChange({
        ...parameters,
        [key]: value,
      });
    },
    [onChange, parameters]
  );

  const handleWfsChangeWithAutoCurrent = useCallback(
    (newWfs: number) => {
      const autoCurrent = Math.round(
        newWfs * 20 + (parameters.wireDiameter_mm - 0.8) * 40
      );
      onChange({
        ...parameters,
        wireFeedSpeed_m_min: newWfs,
        current_A: Math.max(
          bounds.currentMin,
          Math.min(bounds.currentMax, autoCurrent)
        ),
      });
    },
    [bounds.currentMax, bounds.currentMin, onChange, parameters]
  );

  // Quick Preset Handlers
  const applyPreset = (preset: 'sheet_short_arc' | 'standard_3mm' | 'spray_heavy') => {
    if (preset === 'sheet_short_arc') {
      onChange({
        ...parameters,
        material: 'mild_steel',
        materialThickness_mm: 1.5,
        wireDiameter_mm: 0.8,
        shieldingGas: '75Ar_25CO2',
        voltage_V: 16.5,
        current_A: 85,
        wireFeedSpeed_m_min: 4.2,
        stickout_mm: 10,
        jointType: 'butt',
      });
    } else if (preset === 'standard_3mm') {
      onChange({
        ...parameters,
        material: 'mild_steel',
        materialThickness_mm: 3.0,
        wireDiameter_mm: 0.9,
        shieldingGas: '75Ar_25CO2',
        voltage_V: 19.5,
        current_A: 135,
        wireFeedSpeed_m_min: 6.5,
        stickout_mm: 12,
        jointType: 't_fillet',
      });
    } else if (preset === 'spray_heavy') {
      onChange({
        ...parameters,
        material: 'mild_steel',
        materialThickness_mm: 6.0,
        wireDiameter_mm: 1.0,
        shieldingGas: '82Ar_18CO2',
        voltage_V: 26.0,
        current_A: 210,
        wireFeedSpeed_m_min: 9.2,
        stickout_mm: 16,
        jointType: 'butt',
      });
    }
  };

  return (
    <div className="w-full bg-slate-900/90 rounded-2xl border border-slate-800 p-4 md:p-5 shadow-xl flex flex-col gap-4">
      {/* Header & Transfer Mode Badge */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-cyan-400" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white">
            WPS Parameter Input & Validation
          </h2>
        </div>

        {/* Transfer Mode Indicator */}
        <div className="flex items-center gap-2">
          <span
            className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${
              transferMode === 'short_circuit'
                ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-700'
                : transferMode === 'spray'
                ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-700'
                : 'bg-amber-950/80 text-amber-300 border border-amber-700'
            }`}
          >
            <Zap className="w-3 h-3" />
            {transferMode.replace('_', ' ')}
          </span>
        </div>
      </div>

      {/* Preset Quick-Buttons */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <span className="text-[11px] font-medium text-slate-400 shrink-0">WPS Presets:</span>
        <button
          onClick={() => applyPreset('sheet_short_arc')}
          disabled={disabled}
          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 shrink-0 transition"
        >
          1.5mm Sheet (Short-Arc)
        </button>
        <button
          onClick={() => applyPreset('standard_3mm')}
          disabled={disabled}
          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 shrink-0 transition"
        >
          3.0mm Plate (Fillet 2F)
        </button>
        <button
          onClick={() => applyPreset('spray_heavy')}
          disabled={disabled}
          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 shrink-0 transition"
        >
          6.0mm Heavy (Spray)
        </button>
      </div>

      {/* 1. Material, Wire Diameter, Thickness, Gas Selectors */}
      <MaterialSelectors
        parameters={parameters}
        disabled={disabled}
        onParamChange={updateParam}
      />

      {/* 2. Joint Type & Welding Position */}
      <JointPositionSelector
        parameters={parameters}
        disabled={disabled}
        onParamChange={updateParam}
      />

      {/* 3. Main Sliders + Direct Numeric Inputs: Voltage, Current, WFS, CTWD */}
      <ParameterSliders
        parameters={parameters}
        bounds={bounds}
        idealVoltage={idealVoltage}
        disabled={disabled}
        onParamChange={updateParam}
        onWfsChangeWithAutoCurrent={handleWfsChangeWithAutoCurrent}
      />

      {/* 4. Real-time Parameter Validation & Sweet-Spot Guidance Banner */}
      <ParameterValidationCard
        allParametersValid={allParametersValid}
        voltageDelta={voltageDelta}
        nominalHeatInput={nominalHeatInput}
        transferFeedback={transferFeedback}
      />
    </div>
  );
};
