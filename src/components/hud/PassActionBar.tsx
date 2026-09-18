import React from 'react';
import { Play, Square } from 'lucide-react';

interface PassActionBarProps {
  isRecording: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
}

export const PassActionBar: React.FC<PassActionBarProps> = React.memo(
  ({ isRecording, onStartRecording, onStopRecording }) => {
    return (
      <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border border-slate-700 shadow-2xl">
        <div className="flex flex-col">
          <span className="text-xs text-slate-400">Pass Recording Status</span>
          <span className="text-sm font-bold text-white flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isRecording ? 'bg-red-500 animate-ping' : 'bg-slate-500'
              }`}
            />
            {isRecording ? 'Recording Active Weld Pass...' : 'Ready to Start Pass'}
          </span>
        </div>

        {!isRecording ? (
          <button
            id="btn-start-pass"
            onClick={onStartRecording}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-sm shadow-xl shadow-cyan-600/20 transition-transform active:scale-95"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>Start Practice Pass</span>
          </button>
        ) : (
          <button
            id="btn-stop-pass"
            onClick={onStopRecording}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-sm shadow-xl shadow-red-600/20 transition-transform active:scale-95 animate-pulse"
          >
            <Square className="w-4 h-4 fill-current" />
            <span>Finish & Evaluate Bead</span>
          </button>
        )}
      </div>
    );
  }
);

PassActionBar.displayName = 'PassActionBar';
