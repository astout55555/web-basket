import { describe, expect, it } from 'vitest';
import type { SseConnection } from './registry';
import { SseRegistry } from './registry';

function fakeConn() {
  const written: string[] = [];
  let ended = false;
  const conn: SseConnection = {
    write: (frame) => {
      written.push(frame);
    },
    end: () => {
      ended = true;
    },
  };
  return { conn, written, isEnded: () => ended };
}

describe('SseRegistry', () => {
  it('broadcasts a correctly framed SSE event to subscribers of that address', () => {
    const registry = new SseRegistry();
    const a = fakeConn();
    registry.add('addr1', a.conn);

    const delivered = registry.broadcast('addr1', 'request', { id: 7 });

    expect(delivered).toBe(1);
    expect(a.written).toEqual(['event: request\ndata: {"id":7}\n\n']);
  });

  it('does not deliver to other addresses or removed connections', () => {
    const registry = new SseRegistry();
    const mine = fakeConn();
    const other = fakeConn();
    const gone = fakeConn();
    registry.add('addr1', mine.conn);
    registry.add('addr2', other.conn);
    registry.add('addr1', gone.conn);
    registry.remove('addr1', gone.conn);

    const delivered = registry.broadcast('addr1', 'request', { id: 1 });

    expect(delivered).toBe(1);
    expect(mine.written).toHaveLength(1);
    expect(other.written).toHaveLength(0);
    expect(gone.written).toHaveLength(0);
  });

  it('tracks connection counts per address and in total', () => {
    const registry = new SseRegistry();
    const a = fakeConn();
    const b = fakeConn();
    registry.add('addr1', a.conn);
    registry.add('addr1', b.conn);
    expect(registry.connectionCount('addr1')).toBe(2);
    expect(registry.connectionCount()).toBe(2);
    registry.remove('addr1', a.conn);
    registry.remove('addr1', b.conn);
    expect(registry.connectionCount()).toBe(0);
  });

  it('drops connections whose write throws, without losing the rest', () => {
    const registry = new SseRegistry();
    const dead: SseConnection = {
      write: () => {
        throw new Error('socket gone');
      },
      end: () => {},
    };
    const alive = fakeConn();
    registry.add('addr1', dead);
    registry.add('addr1', alive.conn);

    const delivered = registry.broadcast('addr1', 'request', { id: 1 });

    expect(delivered).toBe(1);
    expect(alive.written).toHaveLength(1);
    expect(registry.connectionCount('addr1')).toBe(1);
  });

  it('sends heartbeat comments to every connection on every address', () => {
    const registry = new SseRegistry();
    const a = fakeConn();
    const b = fakeConn();
    registry.add('addr1', a.conn);
    registry.add('addr2', b.conn);

    registry.heartbeat();

    expect(a.written).toEqual([': keep-alive\n\n']);
    expect(b.written).toEqual([': keep-alive\n\n']);
  });

  it('closeAll ends every connection and empties the registry', () => {
    const registry = new SseRegistry();
    const a = fakeConn();
    const b = fakeConn();
    registry.add('addr1', a.conn);
    registry.add('addr2', b.conn);

    registry.closeAll();

    expect(a.isEnded()).toBe(true);
    expect(b.isEnded()).toBe(true);
    expect(registry.connectionCount()).toBe(0);
  });
});
