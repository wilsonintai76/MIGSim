import React from 'react';
import { MaterialType, ShieldingGas, WeldingParameters } from '../../types';

interface MaterialSelectorsProps {
  parameters: WeldingParameters;
  disabled?: boolean;
  onParamChange: <K extends keyof WeldingParameters>(
    key: K,
    value: WeldingParameters[K]
  ) => void;
}

export const MaterialSelectors: React.FC<MaterialSelectorsProps> = React.memo(
  ({ parameters, disabled = false, onParamChange }) => {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
        {/* Material */}
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium text-slate-400">Material Type</label>
          <select
            value={parameters.material}
            disabled={disabled}
            onChange={(e) => onParamChange('material', e.target.value as MaterialType)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
          >
            <option value="mild_steel">Mild Steel (ER70S-6)</option>
            <option value="stainless_304">Stainless Steel 304</option>
            <option value="aluminum_4043">Aluminum 4043</option>
          </select>
        </div>

        {/* Wire Diameter */}
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium text-slate-400">Wire Diameter</label>
          <select
            value={parameters.wireDiameter_mm}
            disabled={disabled}
            onChange={(e) => onParamChange('wireDiameter_mm', Number(e.target.value))}
            className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-500 font-mono"
          >
            <option value={0.8}>0.8 mm (.030")</option>
            <option value={0.9}>0.9 mm (.035")</option>
            <option value={1.0}>1.0 mm (.040")</option>
            <option value={1.2}>1.2 mm (.045")</option>
          </select>
        </div>

        {/* Plate Thickness */}
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium text-slate-400">Plate Thickness</label>
          <select
            value={parameters.materialThickness_mm}
            disabled={disabled}
            onChange={(e) => onParamChange('materialThickness_mm', Number(e.target.value))}
            className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-500 font-mono"
          >
            <option value={1.5}>1.5 mm (16 ga)</option>
            <option value={3.0}>3.0 mm (1/8")</option>
            <option value={6.0}>6.0 mm (1/4")</option>
            <option value={10.0}>10.0 mm (3/8")</option>
          </select>
        </div>

        {/* Shielding Gas */}
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium text-slate-400">Shielding Gas</label>
          <select
            value={parameters.shieldingGas}
            disabled={disabled}
            onChange={(e) => onParamChange('shieldingGas', e.target.value as ShieldingGas)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
          >
            <option value="75Ar_25CO2">75% Ar / 25% CO2 (C25)</option>
            <option value="82Ar_18CO2">82% Ar / 18% CO2</option>
            <option value="100_CO2">100% CO2 (Dip Transfer)</option>
            <option value="98Ar_2O2">98% Ar / 2% O2 (Stainless)</option>
            <option value="100_Ar">100% Argon (Aluminum)</option>
          </select>
        </div>
      </div>
    );
  }
);

MaterialSelectors.displayName = 'MaterialSelectors';
