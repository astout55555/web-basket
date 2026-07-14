import type { RequestRecord } from '@web-basket/shared';
import { buildCurlCommand } from '@web-basket/shared';
import { describeBody } from '../lib/body-render';
import { downloadRecordJson } from '../lib/download';
import { sinkOrigin } from '../lib/urls';
import { CopyButton } from './CopyButton';

export function RequestCard({ record }: { record: RequestRecord }) {
  const body = describeBody(record);
  const headerNames = Object.keys(record.headers);
  const fullPath = record.query ? `${record.path}?${record.query}` : record.path;

  return (
    <li className="card">
      <div className="card-head">
        <span className={`badge method-${record.method}`}>{record.method}</span>
        <code className="path">{fullPath}</code>
        <span className="muted small">{new Date(record.receivedAt).toLocaleString()}</span>
      </div>

      <div className="meta muted small">
        {record.remoteIp !== null && <span>from {record.remoteIp}</span>}
        {record.contentType !== null && <span>{record.contentType}</span>}
        <span>
          {record.bodySize} bytes
          {record.truncated && <strong className="chip">truncated</strong>}
        </span>
      </div>

      <details className="headers">
        <summary>Headers ({headerNames.length})</summary>
        <table>
          <tbody>
            {headerNames.map((name) => {
              const value = record.headers[name];
              return (
                <tr key={name}>
                  <td>{name}</td>
                  <td>{Array.isArray(value) ? value.join(', ') : value}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </details>

      {body.kind === 'binary' && (
        <p className="muted small">Binary body ({body.size} bytes) — not shown.</p>
      )}
      {(body.kind === 'json' || body.kind === 'text') && <pre className="body">{body.text}</pre>}

      <div className="actions">
        <CopyButton text={buildCurlCommand(record, sinkOrigin)} label="Copy as cURL" />
        <button className="ghost" onClick={() => downloadRecordJson(record)}>
          Download JSON
        </button>
      </div>
    </li>
  );
}
