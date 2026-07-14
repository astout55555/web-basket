import { vi } from 'vitest';

/**
 * jsdom has no EventSource; this stand-in lets tests drive the SSE lifecycle
 * by hand: emitOpen(), emitRequest(record), emitError(readyState).
 */
export class FakeEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;

  static instances: FakeEventSource[] = [];
  static latest(): FakeEventSource {
    const last = FakeEventSource.instances.at(-1);
    if (!last) throw new Error('no EventSource was constructed');
    return last;
  }
  static reset(): void {
    FakeEventSource.instances = [];
  }

  readonly url: string;
  readyState: number = FakeEventSource.CONNECTING;
  onopen: ((ev: Event) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  closed = false;

  private listeners = new Map<string, Set<(ev: MessageEvent) => void>>();

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, cb: (ev: MessageEvent) => void): void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(cb);
  }

  removeEventListener(type: string, cb: (ev: MessageEvent) => void): void {
    this.listeners.get(type)?.delete(cb);
  }

  close(): void {
    this.closed = true;
    this.readyState = FakeEventSource.CLOSED;
  }

  emitOpen(): void {
    this.readyState = FakeEventSource.OPEN;
    this.onopen?.(new Event('open'));
  }

  emitError(readyState: number): void {
    this.readyState = readyState;
    this.onerror?.(new Event('error'));
  }

  emitRequest(data: unknown): void {
    const ev = new MessageEvent('request', { data: JSON.stringify(data) });
    for (const cb of this.listeners.get('request') ?? []) cb(ev);
  }
}

export function installFakeEventSource(): void {
  FakeEventSource.reset();
  vi.stubGlobal('EventSource', FakeEventSource);
}
