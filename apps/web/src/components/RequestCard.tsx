import type { RequestRecord } from '@web-basket/shared';
import { buildCurlCommand } from '@web-basket/shared';
import { describeBody } from '../lib/body-render';
import { downloadRecordJson } from '../lib/download';
import { sinkOrigin } from '../lib/urls';
import { CopyButton } from './CopyButton';

const METHOD_STYLES: Record<string, string> = {
  GET: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400',
  POST: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400',
  PUT: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
  PATCH: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-400',
  DELETE: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400',
};
const METHOD_FALLBACK = 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300';

export function RequestCard({ record }: { record: RequestRecord }) {
  const body = describeBody(record);
  const headerNames = Object.keys(record.headers);
  const fullPath = record.query ? `${record.path}?${record.query}` : record.path;

  return (
    <li className="card-surface px-5 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`rounded-md px-2 py-0.5 font-mono text-xs font-bold ${
            METHOD_STYLES[record.method] ?? METHOD_FALLBACK
          }`}
        >
          {record.method}
        </span>
        <code className="break-all text-sm">{fullPath}</code>
        <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">
          {new Date(record.receivedAt).toLocaleString()}
        </span>
      </div>

      <div className="mt-1.5 flex flex-wrap gap-4 text-xs text-slate-500 dark:text-slate-400">
        {record.remoteIp !== null && <span>from {record.remoteIp}</span>}
        {record.contentType !== null && <span>{record.contentType}</span>}
        <span>
          {record.bodySize} bytes
          {record.truncated && (
            <strong className="ml-1.5 font-semibold text-red-600 dark:text-red-400">
              truncated
            </strong>
          )}
        </span>
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
          Headers ({headerNames.length})
        </summary>
        <table className="mt-2 w-full border-collapse text-xs">
          <tbody>
            {headerNames.map((name) => {
              const value = record.headers[name];
              return (
                <tr key={name}>
                  <td className="border-t border-slate-200 px-2 py-1.5 align-top font-mono whitespace-nowrap text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    {name}
                  </td>
                  <td className="border-t border-slate-200 px-2 py-1.5 align-top break-all dark:border-slate-800">
                    {Array.isArray(value) ? value.join(', ') : value}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </details>

      {body.kind === 'binary' && (
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          Binary body ({body.size} bytes) — not shown.
        </p>
      )}
      {(body.kind === 'json' || body.kind === 'text') && (
        <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-200 ring-1 ring-slate-800">
          {body.text}
        </pre>
      )}

      <div className="mt-3 flex gap-2">
        <CopyButton text={buildCurlCommand(record, sinkOrigin)} label="Copy as cURL" />
        <button className="btn btn-ghost" onClick={() => downloadRecordJson(record)}>
          Download JSON
        </button>
      </div>
    </li>
  );
}
