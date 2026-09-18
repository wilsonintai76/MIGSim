import React from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

interface ParameterValidationCardProps {
  allParametersValid: boolean;
  voltageDelta: number;
  nominalHeatInput: number;
  transferFeedback: string;
}

export const ParameterValidationCard: React.FC<ParameterValidationCardProps> = React.memo(
  ({ allParametersValid, voltageDelta, nominalHeatInput, transferFeedback }) => {
    const isOptimal = allParametersValid && Math.abs(voltageDelta) < 1.8;

    return (
      <div
        className={`rounded-xl p-3.5 flex flex-col gap-1.5 border transition-all ${
          isOptimal
            ? 'bg-emerald-950/40 border-emerald-800/80'
            : 'bg-amber-950/40 border-amber-800/80'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isOptimal ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            )}
            <span
              className={`text-xs font-bold ${
                isOptimal ? 'text-emerald-300' : 'text-amber-300'
              }`}
            >
              {isOptimal
                ? 'WPS Qualified Operating Window (AWS D1.1 Table 3.7)'
                : 'Parameter Tuning Alert: Arc Imbalance'}
            </span>
          </div>

          <span className="text-[11px] font-mono text-slate-400">
            Heat Input:{' '}
            <strong className="text-white">{nominalHeatInput.toFixed(2)} kJ/mm</strong>
          </span>
        </div>

        <p className="text-xs text-slate-300">
          {Math.abs(voltageDelta) < 1.8
            ? 'Voltage and Wire Feed Speed are synchronized for smooth metal transfer, sound fusion, and minimal spatter.'
            : voltageDelta > 1.8
            ? `Voltage is +${voltageDelta.toFixed(1)}V above optimal. Expect a widened arc column and higher spatter droplets.`
            : `Voltage is ${voltageDelta.toFixed(1)}V below optimal. Risk of solid wire stubbing and pool freezing.`}
        </p>

        <p className="text-[11px] text-slate-400">{transferFeedback}</p>
      </div>
    );
  }
);

ParameterValidationCard.displayName = 'ParameterValidationCard';
