import React from 'react';
import { JointType, WeldingParameters, WeldingPosition } from '../../types';

interface JointPositionSelectorProps {
  parameters: WeldingParameters;
  disabled?: boolean;
  onParamChange: <K extends keyof WeldingParameters>(
    key: K,
    value: WeldingParameters[K]
  ) => void;
}

export const JointPositionSelector: React.FC<JointPositionSelectorProps> = React.memo(
  ({ parameters, disabled = false, onParamChange }) => {
    return (
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium text-slate-400">Joint Configuration</label>
          <div className="grid grid-cols-3 gap-1.5">
            {(['butt', 't_fillet', 'lap'] as JointType[]).map((j) => (
              <button
                key={j}
                disabled={disabled}
                onClick={() => onParamChange('jointType', j)}
                className={`py-1.5 text-xs font-medium rounded-lg capitalize border transition ${
                  parameters.jointType === j
                    ? 'bg-cyan-950 border-cyan-500 text-cyan-300 font-bold'
                    : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:bg-slate-800'
                }`}
              >
                {j === 't_fillet' ? 'T-Fillet' : j}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium text-slate-400">Welding Position</label>
          <div className="grid grid-cols-3 gap-1.5">
            {(
              [
                { id: '1F_1G', label: '1F / 1G' },
                { id: '2F', label: '2F Horiz' },
                { id: '3F_up', label: '3F Vert' },
              ] as const
            ).map((pos) => (
              <button
                key={pos.id}
                disabled={disabled}
                onClick={() => onParamChange('weldingPosition', pos.id as WeldingPosition)}
                className={`py-1.5 text-xs font-medium rounded-lg border transition ${
                  parameters.weldingPosition === pos.id
                    ? 'bg-cyan-950 border-cyan-500 text-cyan-300 font-bold'
                    : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:bg-slate-800'
                }`}
              >
                {pos.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }
);

JointPositionSelector.displayName = 'JointPositionSelector';
