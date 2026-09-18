import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      id="offline-banner"
      className="fixed bottom-4 left-4 z-40 flex items-center gap-2 rounded-xl bg-amber-500/90 backdrop-blur-md border border-amber-400 px-3.5 py-2 text-xs font-semibold text-slate-950 shadow-xl animate-fade-in"
    >
      <WifiOff className="w-4 h-4 text-slate-950 animate-pulse" />
      <span>Offline Mode — Passes cached locally & queued for D1 sync</span>
    </div>
  );
};
