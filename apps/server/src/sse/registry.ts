/**
 * In-memory SSE fan-out: address → set of open connections. This is the
 * whole "live updates" mechanism, and it works precisely because we run ONE
 * server process (spec §8). Scaling to multiple instances would move this
 * map behind Redis pub/sub — documented future work, deliberately not built.
 */

/** The two things the registry needs from a connection (reply.raw in prod). */
export interface SseConnection {
  /**
   * Write a frame. Returns false if the connection is already dead — a
   * destroyed socket's write() does NOT throw (it returns false or no-ops),
   * so liveness must be reported, not inferred from a thrown error, or dead
   * connections would never be evicted.
   */
  write(frame: string): boolean;
  end(): void;
}

export class SseRegistry {
  private byAddress = new Map<string, Set<SseConnection>>();

  add(address: string, conn: SseConnection): void {
    let set = this.byAddress.get(address);
    if (!set) {
      set = new Set();
      this.byAddress.set(address, set);
    }
    set.add(conn);
  }

  remove(address: string, conn: SseConnection): void {
    const set = this.byAddress.get(address);
    if (!set) return;
    set.delete(conn);
    if (set.size === 0) this.byAddress.delete(address);
  }

  connectionCount(address?: string): number {
    if (address !== undefined) return this.byAddress.get(address)?.size ?? 0;
    let total = 0;
    for (const set of this.byAddress.values()) total += set.size;
    return total;
  }

  /**
   * Send one SSE event frame to every subscriber of `address`.
   * Returns how many connections received it.
   */
  broadcast(address: string, event: string, data: unknown): number {
    // JSON.stringify never emits raw newlines, so a single data: line is safe
    // (a literal newline would otherwise terminate the SSE field early).
    const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    return this.writeTo(address, frame);
  }

  /** Comment-only frames; clients ignore them, proxies see traffic. */
  heartbeat(): number {
    let delivered = 0;
    for (const address of [...this.byAddress.keys()]) {
      delivered += this.writeTo(address, ': keep-alive\n\n');
    }
    return delivered;
  }

  /** End every connection (server shutdown) and forget them all. */
  closeAll(): void {
    for (const set of this.byAddress.values()) {
      for (const conn of set) {
        try {
          conn.end();
        } catch {
          // already dead — nothing to do
        }
      }
    }
    this.byAddress.clear();
  }

  private writeTo(address: string, frame: string): number {
    const set = this.byAddress.get(address);
    if (!set) return 0;
    let delivered = 0;
    const dead: SseConnection[] = [];
    for (const conn of set) {
      let alive: boolean;
      try {
        alive = conn.write(frame);
      } catch {
        alive = false;
      }
      if (alive) delivered++;
      else dead.push(conn);
    }
    // Evicting a half-open connection here (not just on the socket's 'close'
    // event, which may never fire for a dropped-WiFi/sleeping client) is what
    // keeps the registry from filling with zombies.
    for (const conn of dead) this.remove(address, conn);
    return delivered;
  }
}
