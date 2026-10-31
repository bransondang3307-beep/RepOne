import { systemScheduler, type Scheduler } from '@repone/sensor-contracts';
import { BLE_UUIDS } from '@repone/sensor-protocol';
import type { BleCentral, BlePeripheralSeen, BleRadioState } from './BleCentral';
import { RADIO_MESSAGES } from './BleSensorDevice';

export interface ScanResult {
  /** `on` when the scan ran; otherwise why it could not. */
  readonly radio: BleRadioState;
  /** What to tell the user when the scan could not run; null when it ran. */
  readonly message: string | null;
}

export interface ScanOptions {
  readonly durationMs?: number;
  /** Called once the scan has stopped, by itself or through stop(). */
  readonly onStopped?: () => void;
}

/**
 * Finds sensors that advertise the protocol's service UUID (ADR 0008). It filters by service, never by name, and
 * reports each peripheral once per scan. The user then picks one; nothing connects automatically.
 */
export class BleSensorScanner {
  private timer: unknown = null;
  private active = false;
  private onStopped: (() => void) | null = null;
  /** Bumped by every scan() and stop(): a scan still preparing when stop() runs never starts. */
  private token = 0;

  constructor(
    private readonly central: BleCentral,
    private readonly scheduler: Scheduler = systemScheduler,
  ) {}

  get scanning(): boolean {
    return this.active;
  }

  async scan(onFound: (sensor: BlePeripheralSeen) => void, options: ScanOptions = {}): Promise<ScanResult> {
    await this.stop();
    const token = ++this.token;
    const radio = await this.central.prepare();
    if (token !== this.token) return { radio, message: null }; // stopped while preparing (e.g. the permission prompt)
    if (radio !== 'on') return { radio, message: RADIO_MESSAGES[radio] };
    const seen = new Set<string>();
    this.active = true;
    this.onStopped = options.onStopped ?? null;
    await this.central.startScan([BLE_UUIDS.service], (peripheral) => {
      if (!this.active || token !== this.token || seen.has(peripheral.id)) return;
      seen.add(peripheral.id);
      onFound(peripheral);
    });
    if (token !== this.token) {
      await this.central.stopScan(); // stopped while the scan was starting
      return { radio, message: null };
    }
    this.timer = this.scheduler.setInterval(() => void this.stop(), options.durationMs ?? 10_000);
    return { radio, message: null };
  }

  async stop(): Promise<void> {
    this.token += 1;
    if (this.timer !== null) {
      this.scheduler.clearInterval(this.timer);
      this.timer = null;
    }
    if (!this.active) return;
    this.active = false;
    const onStopped = this.onStopped;
    this.onStopped = null;
    await this.central.stopScan();
    onStopped?.();
  }
}
