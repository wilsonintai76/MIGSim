import React from 'react';
import { Activity, Flame, Zap } from 'lucide-react';
import { WeldingParameters } from '../../types';

interface ParameterBounds {
  voltageMin: number;
  voltageMax: number;
  currentMin: number;
  currentMax: number;
  wfsMin: number;
  wfsMax: number;
}

interface ParameterSlidersProps {
  parameters: WeldingParameters;
  bounds: ParameterBounds;
  idealVoltage: number;
  disabled?: boolean;
  onParamChange: <K extends keyof WeldingParameters>(
    key: K,
    value: WeldingParameters[K]
  ) => void;
  onWfsChangeWithAutoCurrent: (wfs: number) => void;
}

export const ParameterSliders: React.FC<ParameterSlidersProps> = React.memo(
  ({
    parameters,
    bounds,
    idealVoltage,
    disabled = false,
    onParamChange,
    onWfsChangeWithAutoCurrent,
  }) => {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
        {/* 1. Arc Voltage (V) */}
        <div className="flex flex-col gap-2 bg-slate-950/50 p-3 rounded-xl border border-slate-800/80">
          <div className="flex justify-between items-center">
            <span className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-400" /> Arc Voltage
            </span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={bounds.voltageMin}
                max={bounds.voltageMax}
                step={0.1}
                value={parameters.voltage_V}
                disabled={disabled}
                onChange={(e) =>
                  onParamChange(
                    'voltage_V',
                    Math.max(12, Math.min(36, parseFloat(e.target.value) || bounds.voltageMin))
                  )
                }
                className="w-16 bg-slate-900 border border-slate-700 rounded-md px-1.5 py-0.5 text-xs text-amber-400 font-mono font-bold text-right focus:outline-none focus:border-amber-500"
              />
              <span className="text-xs text-slate-400 font-mono">V</span>
            </div>
          </div>
          <input
            type="range"
            min={bounds.voltageMin}
            max={bounds.voltageMax}
            step={0.1}
            value={parameters.voltage_V}
            disabled={disabled}
            onChange={(e) => onParamChange('voltage_V', parseFloat(e.target.value))}
            className="w-full accent-amber-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
          />
          <div className="flex justify-between text-[10px] text-slate-500 font-mono">
            <span>{bounds.voltageMin}V</span>
            <span className="text-slate-400">Sweet Spot: ~{idealVoltage.toFixed(1)}V</span>
            <span>{bounds.voltageMax}V</span>
          </div>
        </div>

        {/* 2. Wire Feed Speed (WFS) */}
        <div className="flex flex-col gap-2 bg-slate-950/50 p-3 rounded-xl border border-slate-800/80">
          <div className="flex justify-between items-center">
            <span className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-cyan-400" /> Wire Feed Speed (WFS)
            </span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={bounds.wfsMin}
                max={bounds.wfsMax}
                step={0.1}
                value={parameters.wireFeedSpeed_m_min}
                disabled={disabled}
                onChange={(e) => {
                  const val = Math.max(1, Math.min(18, parseFloat(e.target.value) || bounds.wfsMin));
                  onWfsChangeWithAutoCurrent(val);
                }}
                className="w-16 bg-slate-900 border border-slate-700 rounded-md px-1.5 py-0.5 text-xs text-cyan-400 font-mono font-bold text-right focus:outline-none focus:border-cyan-500"
              />
              <span className="text-xs text-slate-400 font-mono">m/m</span>
            </div>
          </div>
          <input
            type="range"
            min={bounds.wfsMin}
            max={bounds.wfsMax}
            step={0.1}
            value={parameters.wireFeedSpeed_m_min}
            disabled={disabled}
            onChange={(e) => onWfsChangeWithAutoCurrent(parseFloat(e.target.value))}
            className="w-full accent-cyan-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
          />
          <div className="flex justify-between text-[10px] text-slate-500 font-mono">
            <span>{bounds.wfsMin} m/min</span>
            <span className="text-slate-400">
              {Math.round(parameters.wireFeedSpeed_m_min * 39.37)} IPM
            </span>
            <span>{bounds.wfsMax} m/min</span>
          </div>
        </div>

        {/* 3. Welding Current (A) */}
        <div className="flex flex-col gap-2 bg-slate-950/50 p-3 rounded-xl border border-slate-800/80">
          <div className="flex justify-between items-center">
            <span className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-orange-400" /> Output Current
            </span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={bounds.currentMin}
                max={bounds.currentMax}
                step={1}
                value={parameters.current_A}
                disabled={disabled}
                onChange={(e) =>
                  onParamChange(
                    'current_A',
                    Math.max(
                      bounds.currentMin,
                      Math.min(bounds.currentMax, parseInt(e.target.value, 10) || bounds.currentMin)
                    )
                  )
                }
                className="w-16 bg-slate-900 border border-slate-700 rounded-md px-1.5 py-0.5 text-xs text-orange-400 font-mono font-bold text-right focus:outline-none focus:border-orange-500"
              />
              <span className="text-xs text-slate-400 font-mono">A</span>
            </div>
          </div>
          <input
            type="range"
            min={bounds.currentMin}
            max={bounds.currentMax}
            step={5}
            value={parameters.current_A}
            disabled={disabled}
            onChange={(e) => onParamChange('current_A', parseInt(e.target.value, 10))}
            className="w-full accent-orange-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
          />
          <div className="flex justify-between text-[10px] text-slate-500 font-mono">
            <span>{bounds.currentMin}A</span>
            <span className="text-slate-400">
              Target ~{parameters.materialThickness_mm * 40}A
            </span>
            <span>{bounds.currentMax}A</span>
          </div>
        </div>

        {/* 4. Target CTWD Standoff */}
        <div className="flex flex-col gap-2 bg-slate-950/50 p-3 rounded-xl border border-slate-800/80">
          <div className="flex justify-between items-center">
            <span className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-emerald-400" /> Target CTWD Standoff
            </span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={6}
                max={22}
                step={1}
                value={parameters.stickout_mm}
                disabled={disabled}
                onChange={(e) =>
                  onParamChange(
                    'stickout_mm',
                    Math.max(6, Math.min(22, parseInt(e.target.value, 10) || 12))
                  )
                }
                className="w-16 bg-slate-900 border border-slate-700 rounded-md px-1.5 py-0.5 text-xs text-emerald-400 font-mono font-bold text-right focus:outline-none focus:border-emerald-500"
              />
              <span className="text-xs text-slate-400 font-mono">mm</span>
            </div>
          </div>
          <input
            type="range"
            min={6}
            max={22}
            step={1}
            value={parameters.stickout_mm}
            disabled={disabled}
            onChange={(e) => onParamChange('stickout_mm', parseInt(e.target.value, 10))}
            className="w-full accent-emerald-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
          />
          <div className="flex justify-between text-[10px] text-slate-500 font-mono">
            <span>6 mm</span>
            <span className="text-slate-400">Nominal: 10 - 14 mm</span>
            <span>22 mm</span>
          </div>
        </div>
      </div>
    );
  }
);

ParameterSliders.displayName = 'ParameterSliders';
