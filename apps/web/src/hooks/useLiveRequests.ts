import type { RequestRecord } from '@web-basket/shared';
import { requestRecordSchema, SSE_EVENT_REQUEST } from '@web-basket/shared';
import { useEffect, useState } from 'react';
import { fetchRequests, HttpError } from '../lib/api';

export type LiveStatus = 'connecting' | 'live' | 'reconnecting' | 'gone';

// Matches the server's default ring-buffer cap; purely a client memory guard.
const CLIENT_LIST_CAP = 200;

/** Newest-first, deduped by id (ids are DB-assigned and strictly increasing). */
function merge(incoming: RequestRecord[], existing: RequestRecord[]): RequestRecord[] {
  const byId = new Map<number, RequestRecord>();
  for (const rec of [...incoming, ...existing]) {
    if (!byId.has(rec.id)) byId.set(rec.id, rec);
  }
  return [...byId.values()].sort((a, b) => b.id - a.id).slice(0, CLIENT_LIST_CAP);
}

/**
 * The live feed: subscribe FIRST, then fetch history on every `open` —
 * including reopens after EventSource's automatic reconnects, which fills
 * any gap from the disconnected stretch. Subscribing before fetching can
 * deliver a request twice (once live, once in history); the id-dedupe in
 * merge() makes that harmless. The opposite order would *lose* requests.
 */
export function useLiveRequests(address: string): {
  requests: RequestRecord[];
  status: LiveStatus;
} {
  const [requests, setRequests] = useState<RequestRecord[]>([]);
  const [status, setStatus] = useState<LiveStatus>('connecting');

  useEffect(() => {
    setRequests([]);
    setStatus('connecting');
    let disposed = false;

    const es = new EventSource(`/api/baskets/${address}/stream`);

    es.onopen = () => {
      void fetchRequests(address)
        .then((history) => {
          if (disposed) return;
          setRequests((current) => merge(history, current));
          setStatus('live');
        })
        .catch((err: unknown) => {
          if (disposed) return;
          if (err instanceof HttpError && err.status === 404) {
            setStatus('gone');
          } else {
            // Transient history failure with a working stream: stay live;
            // the next reconnect re-syncs.
            setStatus('live');
          }
        });
    };

    es.addEventListener(SSE_EVENT_REQUEST, (ev) => {
      try {
        const parsed = requestRecordSchema.safeParse(JSON.parse((ev as MessageEvent).data));
        if (parsed.success) {
          setRequests((current) => merge([parsed.data], current));
        }
      } catch {
        // malformed frame — ignore
      }
    });

    es.onerror = () => {
      if (disposed) return;
      // CLOSED = the browser gave up (non-retryable response, e.g. 404).
      // CONNECTING = it is retrying by itself.
      setStatus(es.readyState === EventSource.CLOSED ? 'gone' : 'reconnecting');
    };

    return () => {
      disposed = true;
      es.close();
    };
  }, [address]);

  return { requests, status };
}
