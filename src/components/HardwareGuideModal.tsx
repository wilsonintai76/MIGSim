import React, { useState } from 'react';
import {
  Bluetooth,
  Check,
  Code2,
  Compass,
  Copy,
  Cpu,
  Download,
  ExternalLink,
  Layers,
  Printer,
  QrCode,
  Radio,
  Smartphone,
  ToggleLeft,
  X,
  Zap,
} from 'lucide-react';
import {
  bleManager,
  BLE_UUIDS,
  getESP32FirmwareSourceCode,
} from '../services/bluetoothManager';
import { BLESensorState } from '../types';

interface HardwareGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  bleState: BLESensorState;
  onConnectRealBLE: () => void;
}

export const HardwareGuideModal: React.FC<HardwareGuideModalProps> = ({
  isOpen,
  onClose,
  bleState,
  onConnectRealBLE,
}) => {
  const [activeTab, setActiveTab] = useState<
    'ble_spec' | 'switch_wiring' | 'phone_imu' | 'marker_print' | 'esp32_firmware'
  >('switch_wiring');
  const [copiedCode, setCopiedCode] = useState(false);

  if (!isOpen) return null;

  const firmwareCode = getESP32FirmwareSourceCode();

  const handleCopy = () => {
    navigator.clipboard.writeText(firmwareCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handlePrintMarker = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>GMAW Torch Fiducial Marker Printout</title>
          <style>
            body { font-family: sans-serif; text-align: center; padding: 40px; }
            .marker-container { display: inline-block; border: 1px dashed #666; padding: 20px; margin: 20px; }
            svg { width: 50mm; height: 50mm; }
            .ruler { width: 50mm; height: 5mm; background: #333; margin: 10px auto; color: white; font-size: 8px; line-height: 5mm; }
          </style>
        </head>
        <body>
          <h2>GMAW MIG Simulator — 50mm ArUco Marker #0</h2>
          <p>Print at 100% scale (no scaling). Cut out and tape firmly to mock torch nozzle neck.</p>
          <div class="marker-container">
            <svg viewBox="0 0 6 6" xmlns="http://www.w3.org/2000/svg">
              <rect width="6" height="6" fill="black" />
              <!-- ArUco 4x4 ID 0 Data Bits: [1,0,1,1, 0,1,0,0, 0,1,0,0, 1,0,1,1] -->
              <rect x="1" y="1" width="1" height="1" fill="white" />
              <rect x="3" y="1" width="1" height="1" fill="white" />
              <rect x="4" y="1" width="1" height="1" fill="white" />
              <rect x="2" y="2" width="1" height="1" fill="white" />
              <rect x="2" y="3" width="1" height="1" fill="white" />
              <rect x="1" y="4" width="1" height="1" fill="white" />
              <rect x="3" y="4" width="1" height="1" fill="white" />
              <rect x="4" y="4" width="1" height="1" fill="white" />
            </svg>
            <div class="ruler">50mm SCALE CHECK</div>
          </div>
          <script>window.onload = function() { window.print(); }</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-6 overflow-y-auto">
      <div className="w-full max-w-3xl bg-slate-900 border border-slate-700 rounded-3xl p-5 sm:p-7 shadow-2xl text-slate-100 flex flex-col gap-5 my-auto max-h-[92vh] overflow-y-auto">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-950 border border-cyan-700 flex items-center justify-center text-cyan-400">
              <Cpu className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Hardware &amp; Sensor Setup Guide</h2>
              <p className="text-xs text-slate-400">
                Trigger / End Switch, Phone IMU 6DOF, XIAO ESP32-C3 &amp; VL6180X ToF
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex flex-wrap items-center gap-2 bg-slate-950 p-1.5 rounded-2xl border border-slate-800">
          <button
            onClick={() => setActiveTab('switch_wiring')}
            className={`flex-1 min-w-[120px] py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
              activeTab === 'switch_wiring'
                ? 'bg-cyan-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <ToggleLeft className="w-4 h-4" />
            <span>End Switch Wiring</span>
          </button>

          <button
            onClick={() => setActiveTab('phone_imu')}
            className={`flex-1 min-w-[120px] py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
              activeTab === 'phone_imu'
                ? 'bg-cyan-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            <span>Phone IMU Tracking</span>
          </button>

          <button
            onClick={() => setActiveTab('ble_spec')}
            className={`flex-1 min-w-[120px] py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
              activeTab === 'ble_spec'
                ? 'bg-cyan-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Bluetooth className="w-4 h-4" />
            <span>BLE GATT Specs</span>
          </button>

          <button
            onClick={() => setActiveTab('esp32_firmware')}
            className={`flex-1 min-w-[120px] py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
              activeTab === 'esp32_firmware'
                ? 'bg-cyan-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Code2 className="w-4 h-4" />
            <span>ESP32 C++ Code</span>
          </button>

          <button
            onClick={() => setActiveTab('marker_print')}
            className={`flex-1 min-w-[100px] py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
              activeTab === 'marker_print'
                ? 'bg-cyan-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <QrCode className="w-4 h-4" />
            <span>Optical Tag</span>
          </button>
        </div>

        {/* TAB: TRIGGER & END SWITCH WIRING */}
        {activeTab === 'switch_wiring' && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <ToggleLeft className="w-4 h-4" /> Trigger Switch &amp; Mechanical End Switch Support
                </span>
                <span className="text-xs font-mono text-cyan-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                  Pin D1 (GPIO3) &amp; GND
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Yes! You can trigger the arc using either a standard welding torch momentary trigger, a tactile button, or a <strong>mechanical end switch / limit switch (endstop microswitch)</strong>.
              </p>

              {/* Wiring schematic diagram */}
              <div className="bg-slate-900 rounded-xl p-3 border border-slate-800 text-xs font-mono text-slate-300 space-y-2">
                <div className="text-cyan-400 font-bold">Wiring Diagram:</div>
                <div className="pl-2 border-l-2 border-cyan-500/50 space-y-1 text-[11px]">
                  <div>[ESP32 Pin D1 / GPIO3] &larr;&mdash;&mdash;&mdash;&gt; [Switch Common (COM) or Pin 1]</div>
                  <div>[ESP32 GND]             &larr;&mdash;&mdash;&mdash;&gt; [Switch Normally Open (NO) or Pin 2]</div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
                <div className="bg-slate-900/90 rounded-xl p-3 border border-slate-800 space-y-1">
                  <h4 className="font-bold text-white flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-emerald-400" /> Normally Open (NO) &bull; Recommended
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Switch contacts close to GND when pressed. Internal pullup keeps D1 HIGH (3.3V) when idle; pulling to GND signals trigger pull.
                  </p>
                </div>

                <div className="bg-slate-900/90 rounded-xl p-3 border border-slate-800 space-y-1">
                  <h4 className="font-bold text-white flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-cyan-400" /> 20ms Contact Debounce
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    The ESP32 firmware includes a 20ms non-blocking debounce timer. Mechanical microswitch bounce will never cause false arc extinguishments.
                  </p>
                </div>
              </div>

              {/* Live Switch Status & Spacebar Quick Test */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-900 rounded-xl border border-slate-800 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">Live Switch State:</span>
                  <span
                    className={`font-mono font-bold px-2.5 py-1 rounded-lg border ${
                      bleState.isArmed
                        ? 'bg-amber-950 border-amber-500 text-amber-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    {bleState.isArmed ? 'ARMED / CLOSED' : 'RELEASED / OPEN'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => bleManager.toggleSimulatedTrigger()}
                    className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold transition"
                  >
                    Click to Toggle Switch
                  </button>
                  <span className="text-[11px] text-slate-400 hidden sm:inline">
                    (or hit <kbd className="px-1.5 py-0.5 bg-slate-950 rounded border border-slate-700 text-slate-200">Space</kbd>)
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB: PHONE IMU TRACKING */}
        {activeTab === 'phone_imu' && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                  <Compass className="w-4 h-4" /> Phone IMU 6DOF Motion &amp; Angle Tracking
                </span>
                <span className="text-xs text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800">
                  Zero Camera Occlusion
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Yes, absolutely! By mounting the phone directly onto your mock torch handle or clamp, the phone&apos;s internal 6DOF IMU (accelerometer + gyroscope) tracks movement and angles with zero camera occlusion:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="bg-slate-900 rounded-xl p-3 border border-slate-800 space-y-1.5">
                  <h4 className="font-bold text-white flex items-center gap-1.5">
                    <Compass className="w-3.5 h-3.5 text-amber-400" /> Torch Angles (Pitch &amp; Roll)
                  </h4>
                  <ul className="text-[11px] text-slate-400 space-y-1">
                    <li>&bull; <strong className="text-slate-200">Push/Drag Angle (Pitch):</strong> Measured from device pitch. Target is 10° to 15° forehand push.</li>
                    <li>&bull; <strong className="text-slate-200">Work Angle (Roll):</strong> 90° for butt joints; 45° bisector for T-fillet joints.</li>
                    <li>&bull; Uses Exponential Moving Average (EMA &alpha;=0.25) to eliminate hand tremor.</li>
                  </ul>
                </div>

                <div className="bg-slate-900 rounded-xl p-3 border border-slate-800 space-y-1.5">
                  <h4 className="font-bold text-white flex items-center gap-1.5">
                    <Smartphone className="w-3.5 h-3.5 text-cyan-400" /> Travel Speed &amp; Movement
                  </h4>
                  <ul className="text-[11px] text-slate-400 space-y-1">
                    <li>&bull; <strong className="text-slate-200">Linear Travel Speed:</strong> Derived by integrating phone linear acceleration along the weld seam.</li>
                    <li>&bull; <strong className="text-slate-200">Zero-Velocity Update (ZUPT):</strong> When hand tremor is stationary, velocity smoothly zeroes out to prevent drift.</li>
                  </ul>
                </div>
              </div>

              <div className="bg-cyan-950/40 border border-cyan-800/80 rounded-xl p-3 text-xs text-cyan-200 space-y-1">
                <strong>One-Touch Calibration Tip:</strong>
                <p className="text-[11px] text-cyan-300">
                  Hold your mock torch in your natural welding stance over the coupon and tap <strong>&quot;Tare / Zero Angles&quot;</strong> in the HUD. The app zeroes the orientation so your current grip equals the recommended 12° push angle.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* TAB: BLE & GATT SPECS */}
        {activeTab === 'ble_spec' && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">
                  Direct Phone-to-Torch BLE Connection
                </span>
                <span className="text-xs text-slate-400">Web Bluetooth API (HTTPS)</span>
              </div>
              <p className="text-xs text-slate-300">
                The PWA pairs directly with the XIAO ESP32-C3 acting as a BLE GATT Server. No broker, router, or local Wi-Fi AP is needed.
              </p>

              {/* Live Pairing Controls */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  onClick={onConnectRealBLE}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-md transition"
                >
                  <Bluetooth className="w-4 h-4" />
                  <span>Scan &amp; Pair Real ESP32</span>
                </button>

                <button
                  onClick={() => bleManager.toggleSimulatedTrigger()}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition"
                >
                  <Radio className="w-4 h-4 text-amber-400" />
                  <span>
                    Test Trigger Switch ({bleState.isArmed ? 'ARMED' : 'RELEASED'})
                  </span>
                </button>
              </div>
            </div>

            {/* GATT Telemetry Characteristics */}
            <div className="bg-slate-950/80 rounded-2xl border border-slate-800 p-4 space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Custom GATT UUID Specifications
              </span>

              <div className="space-y-2 text-xs font-mono">
                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <div>
                    <span className="text-cyan-400 font-bold">Primary Service:</span>
                    <span className="text-slate-300 ml-2">Welding Torch Telemetry</span>
                  </div>
                  <span className="text-slate-400 text-[11px]">{BLE_UUIDS.SERVICE}</span>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <div>
                    <span className="text-amber-400 font-bold">Characteristic: armed</span>
                    <span className="text-slate-300 ml-2">Trigger Switch (uint8, Read/Notify: 1=Armed, 0=Idle)</span>
                  </div>
                  <span className="text-slate-400 text-[11px]">{BLE_UUIDS.CHAR_ARMED}</span>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <div>
                    <span className="text-red-400 font-bold">Characteristic: arc_start</span>
                    <span className="text-slate-300 ml-2">VL6180X Contact Strike (uint8, Read/Notify: 1=Arc Active, 0=Off)</span>
                  </div>
                  <span className="text-slate-400 text-[11px]">{BLE_UUIDS.CHAR_ARC_START}</span>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <div>
                    <span className="text-emerald-400 font-bold">Characteristic: tof_distance</span>
                    <span className="text-slate-300 ml-2">VL6180X Standoff Distance (uint16 LE mm, 0-100mm)</span>
                  </div>
                  <span className="text-slate-400 text-[11px]">{BLE_UUIDS.CHAR_TOF_DISTANCE}</span>
                </div>
              </div>
            </div>

            {/* Hardware Wiring Pinouts & Sensor Justification */}
            <div className="bg-slate-950/80 rounded-2xl border border-slate-800 p-4 space-y-2 text-xs">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                XIAO ESP32-C3 &amp; VL6180X Hardware Pinout (TOF050F Module)
              </span>
              <p className="text-[11px] text-cyan-300/90 leading-relaxed">
                <strong>Why VL6180X?</strong> Unlike the VL53L0X which has a blind zone below ~30-50mm, the VL6180X provides true 0-100mm continuous ranging, enabling authentic near-zero workpiece contact detection for strike initiation.
              </p>
              <ul className="space-y-1.5 text-slate-300 pt-1">
                <li>&bull; <strong className="text-cyan-400">VL6180X SDA:</strong> Connect to XIAO Pin <strong className="text-white">D4 (GPIO6)</strong></li>
                <li>&bull; <strong className="text-cyan-400">VL6180X SCL:</strong> Connect to XIAO Pin <strong className="text-white">D5 (GPIO7)</strong></li>
                <li>&bull; <strong className="text-cyan-400">VL6180X Power:</strong> VIN &rarr; 3V3, GND &rarr; GND (GPIO0/CE left floating or tied HIGH)</li>
                <li>&bull; <strong className="text-amber-400">Trigger Microswitch:</strong> Between Pin <strong className="text-white">D1 (GPIO3)</strong> and <strong className="text-white">GND</strong> (Internal Pullup active)</li>
              </ul>
            </div>
          </div>
        )}

        {/* TAB: MARKER PRINTOUT */}
        {activeTab === 'marker_print' && (
          <div className="space-y-4 text-center">
            <div className="bg-slate-950/90 rounded-2xl border border-slate-800 p-6 flex flex-col items-center justify-center gap-4">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                High-Contrast 50mm ArUco 4x4 Marker Tag (#0)
              </span>

              {/* Vector SVG Marker */}
              <div className="w-48 h-48 bg-white p-4 rounded-xl shadow-2xl flex items-center justify-center">
                <svg viewBox="0 0 6 6" className="w-full h-full">
                  <rect width="6" height="6" fill="black" />
                  {/* ArUco 4x4 Tag 0 Bit Pattern */}
                  <rect x="1" y="1" width="1" height="1" fill="white" />
                  <rect x="3" y="1" width="1" height="1" fill="white" />
                  <rect x="4" y="1" width="1" height="1" fill="white" />
                  <rect x="2" y="2" width="1" height="1" fill="white" />
                  <rect x="2" y="3" width="1" height="1" fill="white" />
                  <rect x="1" y="4" width="1" height="1" fill="white" />
                  <rect x="3" y="4" width="1" height="1" fill="white" />
                  <rect x="4" y="4" width="1" height="1" fill="white" />
                </svg>
              </div>

              <p className="text-xs text-slate-400 max-w-md">
                Mount this tag rigidly on your mock torch neck or nozzle holder if you choose Optical Camera mode.
              </p>

              <button
                onClick={handlePrintMarker}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-lg transition"
              >
                <Printer className="w-4 h-4" />
                <span>Print Scaled 50mm Tag Sheet</span>
              </button>
            </div>
          </div>
        )}

        {/* TAB: ESP32 ARDUINO C++ CODE */}
        {activeTab === 'esp32_firmware' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">
                Arduino IDE / PlatformIO sketch for Seeed Studio XIAO ESP32-C3
              </span>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow-md transition"
              >
                {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedCode ? 'Copied to Clipboard!' : 'Copy Code'}</span>
              </button>
            </div>

            <div className="relative max-h-72 overflow-y-auto rounded-2xl bg-slate-950 p-4 border border-slate-800 text-[11px] font-mono text-slate-300">
              <pre>{firmwareCode}</pre>
            </div>
          </div>
        )}

        {/* Modal Footer */}
        <div className="flex justify-end pt-2 border-t border-slate-800">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition"
          >
            Close Guide
          </button>
        </div>
      </div>
    </div>
  );
};
