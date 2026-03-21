import { runtimeManager } from '../runtime/stateManager';

/**
 * Infrastructure Tick Engine
 * Simple heartbeat that drives the entire facility runtime.
 */
export class TickEngine {
  private timer: any = null;
  private intervalMs: number = 2000; // 2s default
  private isRunning: boolean = false;

  public start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.run();
  }

  public stop() {
    this.isRunning = false;
    if (this.timer) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
  }

  public setFrequency(hz: number) {
    this.intervalMs = 1000 / hz;
  }

  private run() {
    if (!this.isRunning) return;

    const startTime = performance.now();
    runtimeManager.tick(startTime);

    const duration = performance.now() - startTime;
    const delay = Math.max(0, this.intervalMs - duration);
    
    this.timer = window.setTimeout(() => this.run(), delay);
  }
}

export const tickEngine = new TickEngine();
