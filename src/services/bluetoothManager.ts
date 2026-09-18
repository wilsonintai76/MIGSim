/**
 * @file bluetoothManager.ts
 * @description Web Bluetooth API GATT manager for Seeed Studio XIAO ESP32-C3 welding torch telemetry.
 * Connects to GATT service as central device, subscribes to notifications for:
 *  - `armed`: Gun trigger switch pressed (gas preflow / wire feed contactor on)
 *  - `arc_start`: Workpiece near-zero contact threshold reached (VL6180X ToF distance ≈ 0mm)
 *  - `tof_distance`: Continuous millimeter standoff distance (CTWD from VL6180X)
 *
 * SENSOR SPECIFICATION:
 *  - Sensor: STMicroelectronics VL6180X (TOF050F module, I2C interface)
 *  - Rationale: VL6180X specifically chosen for reliable near-zero-distance detection.
 *    Unlike the VL53L0X which has a ~30-50mm minimum reliable range (unsuitable for true contact detection),
 *    the VL6180X measures accurately from 0mm to 100mm with 1mm resolution, enabling true physical "contact"
 *    and scratch-start arc initiation simulation.
 *
 * Provides robust error handling, event-driven state machine hooks, and virtual hardware simulation.
 */

import { BLESensorState } from '../types';

/**
 * GATT UUIDs for XIAO ESP32-C3 Torch Peripheral
 *
 * Assumed Roles & Architecture:
 * 1. SERVICE (0000ffe0-0000-1000-8000-00805f9b34fb):
 *    Primary GATT Telemetry Service exposed by the ESP32-C3 peripheral device.
 * 2. CHAR_ARMED (0000ffe1-0000-1000-8000-00805f9b34fb):
 *    1 byte uint8 notification.
 *    Assumed Value: 1 = Trigger switch pressed (torch armed, gas preflow / contactor on), 0 = Released.
 * 3. CHAR_ARC_START (0000ffe2-0000-1000-8000-00805f9b34fb):
 *    1 byte uint8 notification.
 *    Assumed Value: 1 = VL6180X distance ≈ 0 mm (true contact / arc strike initiated), 0 = Retracted / arc broken.
 * 4. CHAR_TOF_DISTANCE (0000ffe3-0000-1000-8000-00805f9b34fb):
 *    2 bytes uint16 Little-Endian notification (or uint8 mm).
 *    Assumed Value: Continuous millimetric distance (0 - 100 mm) from VL6180X sensor for CTWD tracking.
 * 5. SERVICE_BATTERY & CHAR_BATTERY (0000180f-0000-1000-8000-00805f9b34fb / 00002a19...):
 *    Standard Bluetooth SIG battery level characteristic (0 - 100%).
 */
export const BLE_UUIDS = {
  SERVICE: '0000ffe0-0000-1000-8000-00805f9b34fb',
  CHAR_ARMED: '0000ffe1-0000-1000-8000-00805f9b34fb',
  CHAR_ARC_START: '0000ffe2-0000-1000-8000-00805f9b34fb',
  CHAR_TOF_DISTANCE: '0000ffe3-0000-1000-8000-00805f9b34fb',
  SERVICE_BATTERY: '0000180f-0000-1000-8000-00805f9b34fb',
  CHAR_BATTERY: '00002a19-0000-1000-8000-00805f9b34fb',
};

/**
 * Operational state for the application state machine
 */
export type TorchOperationalState =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'IDLE'
  | 'ARMED'
  | 'ARC_ACTIVE'
  | 'WARNING_COLLISION'
  | 'WARNING_GAS_LOSS';

export type BLEEventType =
  | 'stateChange'
  | 'triggerPressed'
  | 'triggerReleased'
  | 'arcStruck'
  | 'arcExtinguished'
  | 'distanceUpdate'
  | 'error';

export type BLEEventCallback = (payload: any) => void;
export type BLEListener = (state: BLESensorState) => void;

export class BluetoothManager {
  private device: any | null = null;
  private server: any | null = null;
  private armedChar: any | null = null;
  private arcStartChar: any | null = null;
  private tofChar: any | null = null;
  private batteryChar: any | null = null;

  private state: BLESensorState = {
    isConnected: false,
    isConnecting: false,
    isArmed: false,
    arcStart: false,
    tofDistance_mm: 12,
    switchPolarity: 'NO',
    switchType: 'End Switch / Microswitch (Pin D1)',
    batteryLevel: 95,
    simulated: false,
    error: null,
  };

  private listeners: Set<BLEListener> = new Set();
  private eventHandlers: Map<BLEEventType, Set<BLEEventCallback>> = new Map();
  private mockInterval: number | null = null;

  constructor() {
    // Check if running on non-HTTPS or browser lacking Web Bluetooth
    if (typeof navigator !== 'undefined' && !('bluetooth' in navigator)) {
      this.state.error =
        'Web Bluetooth API requires Chrome or Edge on Android / Desktop over HTTPS.';
    }
  }

  /**
   * Subscribe to full state updates
   */
  public subscribe(listener: BLEListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  /**
   * Register discrete event callbacks for state machine transitions
   */
  public on(event: BLEEventType, callback: BLEEventCallback): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(callback);
    return () => this.eventHandlers.get(event)?.delete(callback);
  }

  private emit(event: BLEEventType, payload?: any) {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach((cb) => {
        try {
          cb(payload);
        } catch (err) {
          console.error(`Error in BLE event handler for '${event}':`, err);
        }
      });
    }
  }

  public getState(): BLESensorState {
    return { ...this.state };
  }

  /**
   * Evaluates the current operational state for the application state machine
   */
  public getOperationalState(): TorchOperationalState {
    if (this.state.isConnecting) return 'CONNECTING';
    if (!this.state.isConnected) return 'DISCONNECTED';

    if (this.state.isArmed) {
      if (this.state.arcStart) {
        if (this.state.tofDistance_mm <= 5) return 'WARNING_COLLISION';
        return 'ARC_ACTIVE';
      }
      if (this.state.tofDistance_mm > 18) return 'WARNING_GAS_LOSS';
      return 'ARMED';
    }

    return 'IDLE';
  }

  private notify() {
    const currentState = this.getState();
    this.listeners.forEach((l) => l(currentState));
    this.emit('stateChange', currentState);
  }

  /**
   * Check if Web Bluetooth is supported in the current runtime
   */
  public isSupported(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      'bluetooth' in navigator &&
      window.isSecureContext
    );
  }

  /**
   * Connect to real physical XIAO ESP32-C3 via Web Bluetooth API
   */
  public async connect(): Promise<boolean> {
    return this.connectRealDevice();
  }

  public async connectRealDevice(): Promise<boolean> {
    if (!this.isSupported()) {
      const errorMsg =
        'Web Bluetooth requires HTTPS and Chrome/Edge browser. You can use the built-in Hardware Simulator below.';
      this.state.error = errorMsg;
      this.emit('error', errorMsg);
      this.notify();
      return false;
    }

    try {
      this.stopSimulation();
      this.state.isConnecting = true;
      this.state.error = null;
      this.notify();

      // 1. Request Bluetooth Device with filters & fallback optional services
      const navBluetooth = (navigator as any).bluetooth;
      this.device = await navBluetooth.requestDevice({
        filters: [
          { services: [BLE_UUIDS.SERVICE] },
          { namePrefix: 'XIAO-MIG' },
          { namePrefix: 'XIAO' },
          { namePrefix: 'ESP32' },
          { namePrefix: 'MIG' },
        ],
        optionalServices: [BLE_UUIDS.SERVICE, BLE_UUIDS.SERVICE_BATTERY],
      });

      // Handle spontaneous hardware disconnect
      this.device.addEventListener(
        'gattserverdisconnected',
        this.handleDisconnection.bind(this)
      );

      // 2. Connect to GATT Server
      this.server = await this.device.gatt.connect();

      // 3. Discover Primary Welding Telemetry Service
      const service = await this.server.getPrimaryService(BLE_UUIDS.SERVICE);

      // 4. Subscribe to Characteristic 1: `armed` (Trigger Switch)
      try {
        this.armedChar = await service.getCharacteristic(BLE_UUIDS.CHAR_ARMED);
        await this.armedChar.startNotifications();
        this.armedChar.addEventListener(
          'characteristicvaluechanged',
          (event: any) => {
            const value = event.target.value;
            const isArmed = value.getUint8(0) === 1;
            const prevArmed = this.state.isArmed;

            this.updateSensorData({
              isArmed,
              arcStart: isArmed && this.state.tofDistance_mm <= 16,
            });

            if (isArmed && !prevArmed) {
              this.emit('triggerPressed');
            } else if (!isArmed && prevArmed) {
              this.emit('triggerReleased');
            }
          }
        );
      } catch (err: any) {
        console.warn('Could not subscribe to `armed` characteristic:', err);
      }

      // 5. Subscribe to Characteristic 2: `arc_start` (Near-Zero ToF Proximity Threshold)
      try {
        this.arcStartChar = await service.getCharacteristic(BLE_UUIDS.CHAR_ARC_START);
        await this.arcStartChar.startNotifications();
        this.arcStartChar.addEventListener(
          'characteristicvaluechanged',
          (event: any) => {
            const value = event.target.value;
            const arcStart = value.getUint8(0) === 1;
            const prevArc = this.state.arcStart;

            this.updateSensorData({ arcStart });

            if (arcStart && !prevArc && this.state.isArmed) {
              this.emit('arcStruck', this.state.tofDistance_mm);
            } else if (!arcStart && prevArc) {
              this.emit('arcExtinguished');
            }
          }
        );
      } catch (err: any) {
        console.warn(
          'Optional `arc_start` characteristic not found, will infer from ToF distance:',
          err
        );
      }

      // 6. Subscribe to Characteristic 3: `tof_distance` (Millimeter CTWD Distance)
      try {
        this.tofChar = await service.getCharacteristic(BLE_UUIDS.CHAR_TOF_DISTANCE);
        await this.tofChar.startNotifications();
        this.tofChar.addEventListener(
          'characteristicvaluechanged',
          (event: any) => {
            const value = event.target.value;
            const distance_mm =
              value.byteLength >= 2
                ? value.getUint16(0, true)
                : value.getUint8(0);

            // If arc_start wasn't provided separately, compute strike condition:
            // VL6180X provides true near-zero detection (distance <= 2mm = contact arc strike)
            // Once struck, the arc column sustains while armed and CTWD <= 18mm
            const isContact = distance_mm >= 0 && distance_mm <= 2;
            const canSustain = this.state.arcStart && distance_mm <= 18;
            const arcStart = this.state.isArmed && (isContact || canSustain);
            const prevArc = this.state.arcStart;

            this.updateSensorData({
              tofDistance_mm: distance_mm,
              arcStart,
            });

            this.emit('distanceUpdate', distance_mm);

            if (arcStart && !prevArc) {
              this.emit('arcStruck', distance_mm);
            } else if (!arcStart && prevArc) {
              this.emit('arcExtinguished');
            }
          }
        );
      } catch (err: any) {
        console.warn('Could not subscribe to ToF distance characteristic:', err);
      }

      // 7. Optional Battery Service
      try {
        const batteryService = await this.server.getPrimaryService(
          BLE_UUIDS.SERVICE_BATTERY
        );
        this.batteryChar = await batteryService.getCharacteristic(
          BLE_UUIDS.CHAR_BATTERY
        );
        const battVal = await this.batteryChar.readValue();
        this.state.batteryLevel = battVal.getUint8(0);
      } catch {
        // Battery service optional
      }

      this.state.isConnected = true;
      this.state.isConnecting = false;
      this.state.deviceName = this.device.name || 'XIAO ESP32-C3 Torch';
      this.state.simulated = false;
      this.state.error = null;
      this.notify();
      return true;
    } catch (err: any) {
      console.error('BLE connection failed:', err);
      this.state.isConnected = false;
      this.state.isConnecting = false;
      // Handle user cancellation gracefully
      if (err.name === 'NotFoundError') {
        this.state.error = 'Pairing prompt was dismissed.';
      } else {
        this.state.error = err.message || 'Bluetooth connection failed.';
      }
      this.emit('error', this.state.error);
      this.notify();
      return false;
    }
  }

  public async disconnect(): Promise<void> {
    this.stopSimulation();
    if (this.device && this.device.gatt?.connected) {
      try {
        this.device.gatt.disconnect();
      } catch (e) {
        console.warn('Disconnection error:', e);
      }
    }
    this.handleDisconnection();
  }

  private handleDisconnection() {
    this.state.isConnected = false;
    this.state.isConnecting = false;
    this.state.isArmed = false;
    this.state.arcStart = false;
    this.armedChar = null;
    this.arcStartChar = null;
    this.tofChar = null;
    this.batteryChar = null;
    this.server = null;
    this.notify();
    this.emit('arcExtinguished');
  }

  public updateSensorData(patch: Partial<BLESensorState>) {
    this.state = {
      ...this.state,
      ...patch,
    };
    this.notify();
  }

  /**
   * Virtual Hardware Simulation Mode
   * Allows full testing on devices without Bluetooth or ESP32 hardware
   */
  public startSimulation() {
    this.stopSimulation();
    this.state.isConnected = true;
    this.state.isConnecting = false;
    this.state.simulated = true;
    this.state.deviceName = 'Virtual XIAO ESP32-C3 (Simulated)';
    this.state.error = null;
    this.state.batteryLevel = 98;
    this.state.tofDistance_mm = 12.0;
    this.notify();

    // Subtle micro-jitter to simulate live analog ToF readings
    this.mockInterval = window.setInterval(() => {
      if (!this.state.simulated || !this.state.isConnected) return;
      const jitter = (Math.random() - 0.5) * 0.4;
      const newDist = Math.max(4, Math.min(25, this.state.tofDistance_mm + jitter));
      this.updateSensorData({
        tofDistance_mm: Number(newDist.toFixed(1)),
        arcStart: this.state.isArmed && newDist <= 16,
      });
    }, 100);
  }

  public stopSimulation() {
    if (this.mockInterval) {
      clearInterval(this.mockInterval);
      this.mockInterval = null;
    }
    if (this.state.simulated) {
      this.state.isConnected = false;
      this.state.simulated = false;
      this.notify();
    }
  }

  public toggleSimulatedTrigger() {
    if (!this.state.isConnected) {
      this.startSimulation();
    }
    const nextArmed = !this.state.isArmed;
    const arcStart = nextArmed && this.state.tofDistance_mm <= 16;
    this.updateSensorData({
      isArmed: nextArmed,
      arcStart,
    });
    if (nextArmed) {
      this.emit('triggerPressed');
      if (arcStart) this.emit('arcStruck', this.state.tofDistance_mm);
    } else {
      this.emit('triggerReleased');
      this.emit('arcExtinguished');
    }
  }

  public setSimulatedTrigger(isPressed: boolean) {
    if (!this.state.isConnected) {
      this.startSimulation();
    }
    const arcStart = isPressed && this.state.tofDistance_mm <= 16;
    this.updateSensorData({
      isArmed: isPressed,
      arcStart,
    });
    if (isPressed) {
      this.emit('triggerPressed');
      if (arcStart) this.emit('arcStruck', this.state.tofDistance_mm);
    } else {
      this.emit('triggerReleased');
      this.emit('arcExtinguished');
    }
  }

  public setSimulatedDistance(distance_mm: number) {
    const arcStart = this.state.isArmed && distance_mm <= 16;
    const prevArc = this.state.arcStart;
    this.updateSensorData({
      tofDistance_mm: distance_mm,
      arcStart,
    });
    this.emit('distanceUpdate', distance_mm);
    if (arcStart && !prevArc) {
      this.emit('arcStruck', distance_mm);
    } else if (!arcStart && prevArc) {
      this.emit('arcExtinguished');
    }
  }
}

/**
 * Singleton instance for app-wide BLE state
 */
export const bleManager = new BluetoothManager();

/**
 * Generates ready-to-flash Arduino / ESP-IDF C++ source code for Seeed Studio XIAO ESP32-C3 + VL6180X
 */
export function getESP32FirmwareSourceCode(): string {
  return `/*
 * ==============================================================================
 * XIAO ESP32-C3 + VL6180X (TOF050F) GMAW Torch BLE Peripheral
 * Firmware for GMAW MIG Welding Simulator PWA
 * ==============================================================================
 * Hardware Pinout:
 *   - Seeed Studio XIAO ESP32-C3 (RISC-V 160MHz, BLE 5.0)
 *   - VL6180X / TOF050F Time-of-Flight Proximity Sensor:
 *       * SDA  -> XIAO Pin D4 (GPIO6)
 *       * SCL  -> XIAO Pin D5 (GPIO7)
 *       * VIN  -> XIAO 3V3
 *       * GND  -> XIAO GND
 *       * GPIO0/CE -> Tied HIGH or left floating
 *   - Trigger Switch / Mechanical End Switch:
 *       * Common (COM) Terminal -> XIAO GND
 *       * Normally Open (NO) -> XIAO Pin D1 (GPIO3) [Recommended, pulls LOW when pressed]
 *       * (Optional) Normally Closed (NC) supported by toggling SWITCH_POLARITY_NO to false
 *       * Hardware/Software Debouncing: Built-in 20ms anti-chatter state filter
 *   - Status LED: D10 (GPIO10)
 *
 * Why VL6180X over VL53L0X?
 *   - VL6180X measures distances accurately down to 0 mm (true nozzle/wire contact)
 *   - VL53L0X has an optical blind spot below ~30-50mm, preventing realistic contact arc strike.
 *
 * GATT UUID Architecture:
 *   - Primary Service:   0000ffe0-0000-1000-8000-00805f9b34fb
 *   - Char 1: armed      0000ffe1-0000-1000-8000-00805f9b34fb (Notify uint8)
 *   - Char 2: arc_start  0000ffe2-0000-1000-8000-00805f9b34fb (Notify uint8)
 *   - Char 3: tof_dist   0000ffe3-0000-1000-8000-00805f9b34fb (Notify uint16 LE mm)
 * ==============================================================================
 */

#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <Wire.h>
#include <Adafruit_VL6180X.h>

#define TRIGGER_PIN D1   // End switch / Microswitch signal pin (internal pull-up)
#define STATUS_LED  D10  // Onboard status indicator

// SWITCH CONFIGURATION:
// Set to true if using Normally Open (NO) switch: pressing closes pin to GND (reads LOW)
// Set to false if using Normally Closed (NC) end switch: pressing breaks connection (reads HIGH)
#define SWITCH_POLARITY_NO true
#define DEBOUNCE_DELAY_MS  20

#define SERVICE_UUID        "0000ffe0-0000-1000-8000-00805f9b34fb"
#define CHAR_ARMED_UUID     "0000ffe1-0000-1000-8000-00805f9b34fb"
#define CHAR_ARC_START_UUID "0000ffe2-0000-1000-8000-00805f9b34fb"
#define CHAR_TOF_UUID       "0000ffe3-0000-1000-8000-00805f9b34fb"

Adafruit_VL6180X vl = Adafruit_VL6180X();
BLEServer* pServer = NULL;
BLECharacteristic* pArmedChar = NULL;
BLECharacteristic* pArcStartChar = NULL;
BLECharacteristic* pTofChar = NULL;

bool deviceConnected = false;
bool oldDeviceConnected = false;

uint8_t lastArmed = 0;
uint8_t debouncedArmed = 0;
int lastRawPinState = HIGH;
unsigned long lastDebounceTimeMs = 0;

uint8_t lastArcStart = 0;
uint16_t lastDistanceMm = 0;
unsigned long lastTofReadMs = 0;

class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer* pServer) {
    deviceConnected = true;
    digitalWrite(STATUS_LED, HIGH);
    Serial.println(">> Web Bluetooth Central connected!");
  }
  void onDisconnect(BLEServer* pServer) {
    deviceConnected = false;
    digitalWrite(STATUS_LED, LOW);
    Serial.println(">> Web Bluetooth Central disconnected.");
  }
};

void setup() {
  Serial.begin(115200);
  pinMode(TRIGGER_PIN, INPUT_PULLUP);
  pinMode(STATUS_LED, OUTPUT);
  digitalWrite(STATUS_LED, LOW);

  // 1. Initialize I2C and VL6180X ToF sensor
  Wire.begin();
  if (!vl.begin()) {
    Serial.println("[ERROR] VL6180X sensor not found! Check I2C wiring (D4=SDA, D5=SCL).");
  } else {
    Serial.println("[OK] VL6180X ToF near-zero proximity sensor online.");
  }

  // 2. Initialize BLE Peripheral
  BLEDevice::init("XIAO-MIG-TORCH");
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new ServerCallbacks());

  BLEService* pService = pServer->createService(SERVICE_UUID);

  // Characteristic 1: Trigger Switch (\`armed\`)
  pArmedChar = pService->createCharacteristic(
    CHAR_ARMED_UUID,
    BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY
  );
  pArmedChar->addDescriptor(new BLE2902());

  // Characteristic 2: Near-Zero Contact Strike Threshold (\`arc_start\`)
  pArcStartChar = pService->createCharacteristic(
    CHAR_ARC_START_UUID,
    BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY
  );
  pArcStartChar->addDescriptor(new BLE2902());

  // Characteristic 3: Continuous Distance Millimeters (\`tof_distance\`)
  pTofChar = pService->createCharacteristic(
    CHAR_TOF_UUID,
    BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY
  );
  pTofChar->addDescriptor(new BLE2902());

  pService->start();

  // 3. Start Advertising
  BLEAdvertising* pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  pAdvertising->setMinPreferred(0x06);
  pAdvertising->setMinPreferred(0x12);
  BLEDevice::startAdvertising();

  Serial.println("[READY] Advertising as 'XIAO-MIG-TORCH'. Ready for Web Bluetooth connection.");
}

void loop() {
  // 1. Read & Debounce Trigger End Switch
  int rawReading = digitalRead(TRIGGER_PIN);
  if (rawReading != lastRawPinState) {
    lastDebounceTimeMs = millis();
    lastRawPinState = rawReading;
  }

  if ((millis() - lastDebounceTimeMs) > DEBOUNCE_DELAY_MS) {
    // Determine active triggered condition based on switch polarity
    bool isTriggerPressed = SWITCH_POLARITY_NO ? (rawReading == LOW) : (rawReading == HIGH);
    uint8_t currentArmed = isTriggerPressed ? 1 : 0;

    if (currentArmed != lastArmed) {
      lastArmed = currentArmed;
      if (deviceConnected && pArmedChar) {
        pArmedChar->setValue(&lastArmed, 1);
        pArmedChar->notify();
        Serial.printf("[BLE] Switch Trigger changed: %d (%s)\\n", 
          lastArmed, lastArmed ? "TRIGGER ARMED" : "RELEASED");
      }
    }
  }

  // 2. Sample VL6180X ToF distance at ~33 Hz (30ms interval)
  if (millis() - lastTofReadMs >= 30) {
    lastTofReadMs = millis();
    
    uint8_t range = vl.readRange();
    uint8_t status = vl.readRangeStatus();
    
    uint16_t distMm = (status == VL6180X_ERROR_NONE) ? range : 255;
    
    // Compute arc_start binary condition:
    // True contact occurs at distance <= 2mm while trigger switch is armed
    // The arc remains established while trigger is held and distance <= 18mm
    bool isContact = (distMm <= 2 && lastArmed == 1);
    bool canSustain = (lastArcStart == 1 && distMm <= 18 && lastArmed == 1);
    uint8_t currentArcStart = (isContact || canSustain) ? 1 : 0;

    if (currentArcStart != lastArcStart) {
      lastArcStart = currentArcStart;
      if (deviceConnected && pArcStartChar) {
        pArcStartChar->setValue(&lastArcStart, 1);
        pArcStartChar->notify();
        Serial.printf("[BLE] ArcStart changed: %d (dist: %dmm)\\n", lastArcStart, distMm);
      }
    }

    // Send continuous distance notifications on delta >= 1mm
    if (abs((int)distMm - (int)lastDistanceMm) >= 1 && deviceConnected && pTofChar) {
      lastDistanceMm = distMm;
      uint8_t buffer[2];
      buffer[0] = distMm & 0xFF;        // Low byte
      buffer[1] = (distMm >> 8) & 0xFF; // High byte
      pTofChar->setValue(buffer, 2);
      pTofChar->notify();
    }
  }

  // Automatic restart advertising if disconnected
  if (!deviceConnected && oldDeviceConnected) {
    delay(500);
    pServer->startAdvertising();
    Serial.println("[BLE] Central disconnected. Restarted advertising.");
    oldDeviceConnected = deviceConnected;
  }
  if (deviceConnected && !oldDeviceConnected) {
    oldDeviceConnected = deviceConnected;
  }
}
`;
}
