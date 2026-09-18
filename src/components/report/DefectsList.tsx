import React from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { WeldingDefect } from '../../types';

interface DefectsListProps {
  defects: WeldingDefect[];
  recommendations: string[];
}

export const DefectsList: React.FC<DefectsListProps> = React.memo(
  ({ defects, recommendations }) => {
    return (
      <div className="bg-slate-950/80 rounded-2xl border border-slate-800 p-4 sm:p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-200 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-cyan-400" />
            Defect Diagnosis & Corrective Actions ({defects.length})
          </h3>
          <span className="text-xs text-slate-400">AWS D1.1 Inspection Standard</span>
        </div>

        {defects.length === 0 ? (
          <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-800/60 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <p className="text-xs text-emerald-200 font-medium">
              No visual or metallurgical defects detected. Clean toe wetting, sound root
              penetration, and uniform chevrons.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {defects.map((d) => (
              <div
                key={d.id}
                className="rounded-xl bg-slate-900 border border-slate-800 p-3.5 flex flex-col gap-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        d.severity === 'critical' ? 'bg-red-500' : 'bg-amber-500'
                      }`}
                    />
                    <span className="text-xs font-bold text-white">{d.name}</span>
                  </div>
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${
                      d.category === 'parameter'
                        ? 'bg-orange-950 text-orange-300 border-orange-800'
                        : d.category === 'technique'
                        ? 'bg-purple-950 text-purple-300 border-purple-800'
                        : 'bg-red-950 text-red-300 border-red-800'
                    }`}
                  >
                    {d.category} defect
                  </span>
                </div>
                <p className="text-xs text-slate-300">{d.description}</p>
                <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800 text-xs">
                  <p className="text-slate-400">
                    <strong className="text-slate-200">Cause:</strong> {d.cause}
                  </p>
                  <p className="text-cyan-300 mt-1">
                    <strong className="text-cyan-400">Coaching Tip:</strong>{' '}
                    {d.correctiveAction}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* General Recommendations */}
        {recommendations.length > 0 && (
          <div className="mt-2 pt-3 border-t border-slate-800">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Instructor Next Steps
            </span>
            <ul className="mt-1.5 space-y-1">
              {recommendations.map((rec, i) => (
                <li key={i} className="text-xs text-slate-300 flex items-start gap-2">
                  <span className="text-cyan-400 font-bold">&bull;</span>
                  {rec}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }
);

DefectsList.displayName = 'DefectsList';
