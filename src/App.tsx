import React, { useEffect, useState } from 'react';
import { Header } from './components/Header';
import { FeedbackReportModal } from './components/FeedbackReportModal';
import { HardwareGuideModal } from './components/HardwareGuideModal';
import { PassHistoryModal } from './components/PassHistoryModal';
import { OfflineIndicator } from './components/OfflineIndicator';
import { TrainerView } from './components/views/TrainerView';
import { InstructorView } from './components/views/InstructorView';
import { bleManager } from './services/bluetoothManager';
import { evaluateWeldPass } from './services/beadQualityEngine';
import { storageService } from './services/storageAndSync';
import { instructorService } from './services/instructorService';
import {
  AppRole,
  BLESensorState,
  LiveTorchSample,
  WeldingParameters,
  WeldPassRecord,
  WPSProcedure,
} from './types';

const INITIAL_PARAMETERS: WeldingParameters = {
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
};

export function App() {
  // Active Role: 'trainer' (Mobile UI) vs 'instructor' (Web UI)
  const [activeRole, setActiveRole] = useState<AppRole>(() => {
    try {
      const saved = localStorage.getItem('mig_active_role');
      if (saved === 'instructor' || saved === 'trainer') return saved;
      // If mobile width, default to trainer; if wide, trainer is still great default with simulator
      return 'trainer';
    } catch {
      return 'trainer';
    }
  });

  const [activeWps, setActiveWps] = useState<WPSProcedure>(instructorService.getActiveWPS());
  const [parameters, setParameters] = useState<WeldingParameters>(() =>
    instructorService.wpsToParameters(instructorService.getActiveWPS()) || INITIAL_PARAMETERS
  );
  const [studentName, setStudentName] = useState<string>('Alex Morgan');

  const [bleState, setBleState] = useState<BLESensorState>(bleManager.getState());
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingStartTime, setRecordingStartTime] = useState<number>(0);

  const [passes, setPasses] = useState<WeldPassRecord[]>([]);
  const [latestPass, setLatestPass] = useState<WeldPassRecord | null>(null);
  const [activeReport, setActiveReport] = useState<WeldPassRecord | null>(null);
  const [isHardwareGuideOpen, setIsHardwareGuideOpen] = useState<boolean>(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);

  // Load history from storage & seed initial passes on mount
  const refreshPasses = () => {
    instructorService.seedInitialPassesIfEmpty();
    const saved = storageService.getPasses();
    setPasses(saved);
    if (saved.length > 0 && !latestPass) {
      setLatestPass(saved[0]);
    }
  };

  useEffect(() => {
    refreshPasses();

    // Subscribe to BLE sensor updates
    const unsubscribe = bleManager.subscribe((state) => {
      setBleState(state);
    });

    return () => unsubscribe();
  }, []);

  // Save active role preference
  const handleSelectRole = (role: AppRole) => {
    setActiveRole(role);
    try {
      localStorage.setItem('mig_active_role', role);
    } catch {
      // ignore
    }
  };

  // When instructor deploys a WPS to the trainer
  const handleDeployWpsToTrainer = (wps: WPSProcedure) => {
    setActiveWps(wps);
    setParameters(instructorService.wpsToParameters(wps));
    // Provide a brief notification or option to switch to trainer
    handleSelectRole('trainer');
  };

  // Handle Pass Start
  const handleStartPass = () => {
    setIsRecording(true);
    setRecordingStartTime(performance.now());
  };

  // Handle Pass Finish & Compute Evaluation
  const handleFinishPass = (samples: LiveTorchSample[]) => {
    setIsRecording(false);
    const durationSeconds = Math.max(1, (performance.now() - recordingStartTime) / 1000);

    // Run deterministic empirical welding physics evaluation
    const evaluation = evaluateWeldPass(parameters, samples);

    const record: WeldPassRecord = {
      id: `weld_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      timestamp: Date.now(),
      studentName,
      parameters: { ...parameters },
      durationSeconds,
      totalLength_mm: 180,
      sampleCount: samples.length,
      result: evaluation,
      samples: samples.slice(0, 300), // store up to 300 samples for playback
      syncedToD1: false,
    };

    // Save locally and queue for D1
    storageService.savePass(record);
    refreshPasses();
    setLatestPass(record);

    // Open detailed report modal
    setActiveReport(record);
  };

  const handleConnectRealBLE = async () => {
    try {
      await bleManager.connectRealDevice();
    } catch (err) {
      console.warn('BLE connect error:', err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-white">
      {/* Universal Header with Distinct Role Switcher */}
      <Header
        bleState={bleState}
        onOpenHardwareGuide={() => setIsHardwareGuideOpen(true)}
        onOpenHistory={() => setIsHistoryOpen(true)}
        passCount={passes.length}
        activeRole={activeRole}
        onSelectRole={handleSelectRole}
      />

      {/* Main Container - Renders either Trainer (Mobile UI) or Instructor (Web UI) */}
      <main className="flex-1 w-full max-w-7xl mx-auto p-2 sm:p-4 md:p-6 flex flex-col">
        {activeRole === 'trainer' ? (
          /* Trainer View - Optimized Mobile UI */
          <TrainerView
            parameters={parameters}
            onParametersChange={setParameters}
            bleState={bleState}
            isRecording={isRecording}
            onStartPass={handleStartPass}
            onFinishPass={handleFinishPass}
            onOpenHardwareGuide={() => setIsHardwareGuideOpen(true)}
            latestPass={latestPass}
            onOpenReport={(p) => setActiveReport(p)}
            activeWps={activeWps}
            studentName={studentName}
            onSelectStudentName={setStudentName}
            onSwitchToInstructor={() => handleSelectRole('instructor')}
          />
        ) : (
          /* Instructor View - Optimized Web Dashboard UI */
          <InstructorView
            passes={passes}
            activeWps={activeWps}
            onDeployWpsToTrainer={handleDeployWpsToTrainer}
            onSelectPassForReport={(p) => setActiveReport(p)}
            onRefreshPasses={refreshPasses}
            onSwitchToTrainer={() => handleSelectRole('trainer')}
          />
        )}
      </main>

      {/* Offline Status Badge */}
      <OfflineIndicator />

      {/* Evaluation Report Modal */}
      {activeReport && (
        <FeedbackReportModal
          passRecord={activeReport}
          onClose={() => setActiveReport(null)}
          onRetry={() => {
            setActiveReport(null);
            handleStartPass();
          }}
          onExportJSON={() => storageService.exportJSON()}
        />
      )}

      {/* Hardware & BLE Guide Modal */}
      <HardwareGuideModal
        isOpen={isHardwareGuideOpen}
        onClose={() => setIsHardwareGuideOpen(false)}
        bleState={bleState}
        onConnectRealBLE={handleConnectRealBLE}
      />

      {/* Pass History & Analytics Modal */}
      <PassHistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        passes={passes}
        onSelectPass={(p) => setActiveReport(p)}
        onRefresh={refreshPasses}
      />
    </div>
  );
}

export default App;
