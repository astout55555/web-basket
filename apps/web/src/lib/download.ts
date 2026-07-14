import type { RequestRecord } from '@web-basket/shared';

/** Standard browser download dance: Blob → object URL → synthetic <a> click. */
export function downloadRecordJson(record: RequestRecord): void {
  const blob = new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `request-${record.id}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
