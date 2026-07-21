import { basketAddressSchema } from '@web-basket/shared';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { CopyButton } from '../components/CopyButton';
import { RequestCard } from '../components/RequestCard';
import { useLiveRequests } from '../hooks/useLiveRequests';
import { deleteBasket } from '../lib/api';
import { removeBasket } from '../lib/baskets-store';
import { sinkUrl } from '../lib/urls';

const STATUS_LABEL = {
  connecting: 'connecting…',
  live: 'live',
  reconnecting: 'reconnecting…',
  gone: 'gone',
} as const;

const STATUS_STYLES = {
  connecting: 'border-slate-300 text-slate-500 dark:border-slate-700 dark:text-slate-400',
  live: 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-400',
  reconnecting:
    'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-400',
  gone: 'border-slate-300 text-slate-500 dark:border-slate-700 dark:text-slate-400',
} as const;

export function BasketPage() {
  const { address = '' } = useParams<{ address: string }>();
  const navigate = useNavigate();
  const { requests, status } = useLiveRequests(address);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (!basketAddressSchema.safeParse(address).success) {
    return (
      <p className="text-slate-500 dark:text-slate-400">
        That doesn&rsquo;t look like a basket address.{' '}
        <Link to="/" className="text-blue-600 hover:underline dark:text-blue-400">
          Go home
        </Link>
      </p>
    );
  }

  const url = sinkUrl(address);

  async function onDelete() {
    if (!window.confirm('Delete this basket and all its recorded requests?')) return;
    try {
      await deleteBasket(address);
      removeBasket(address);
      navigate('/');
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  function onRemoveFromList() {
    removeBasket(address);
    navigate('/');
  }

  if (status === 'gone') {
    return (
      <section>
        <h2 className="text-xl font-bold">
          Basket <code className="font-mono">{address}</code>
        </h2>
        <p className="mt-2 text-slate-500 dark:text-slate-400">
          This basket expired or was deleted. (Idle baskets are removed after the retention period.)
        </p>
        <button className="btn btn-ghost mt-4" onClick={onRemoveFromList}>
          Remove from my baskets
        </button>
      </section>
    );
  }

  return (
    <section>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="mr-auto text-xl font-bold">
          Basket <code className="font-mono">{address}</code>
        </h2>
        <span
          className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[status]}`}
        >
          {STATUS_LABEL[status]}
        </span>
        <button className="btn btn-danger" onClick={onDelete}>
          Delete basket
        </button>
      </div>
      {deleteError !== null && (
        <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
          {deleteError}
        </p>
      )}

      <div className="card-surface mb-6 mt-4 px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded-md border border-slate-200 bg-slate-100 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800/60">
            {url}
          </code>
          <CopyButton text={url} />
        </div>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Send any HTTP request to this URL — any method, any content type — and it appears below
          instantly.
        </p>
      </div>

      {requests.length === 0 ? (
        <div className="text-slate-500 dark:text-slate-400">
          <p>Waiting for the first request…</p>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-200 ring-1 ring-slate-800">
            {`curl -X POST '${url}/demo' \\\n  -H 'content-type: application/json' \\\n  --data-raw '{"hello":"basket"}'`}
          </pre>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {requests.map((record) => (
            <RequestCard key={record.id} record={record} />
          ))}
        </ul>
      )}
    </section>
  );
}
