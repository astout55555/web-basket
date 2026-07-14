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

export function BasketPage() {
  const { address = '' } = useParams<{ address: string }>();
  const navigate = useNavigate();
  const { requests, status } = useLiveRequests(address);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (!basketAddressSchema.safeParse(address).success) {
    return (
      <p className="muted">
        That doesn&rsquo;t look like a basket address. <Link to="/">Go home</Link>
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
        <h2>
          Basket <code>{address}</code>
        </h2>
        <p className="muted">
          This basket expired or was deleted. (Idle baskets are removed after the retention period.)
        </p>
        <button onClick={onRemoveFromList}>Remove from my baskets</button>
      </section>
    );
  }

  return (
    <section>
      <div className="toolbar">
        <h2>
          Basket <code>{address}</code>
        </h2>
        <span className={`status status-${status}`}>{STATUS_LABEL[status]}</span>
        <button className="danger" onClick={onDelete}>
          Delete basket
        </button>
      </div>
      {deleteError !== null && (
        <p role="alert" className="error">
          {deleteError}
        </p>
      )}

      <div className="sink-panel">
        <div className="sink-url">
          <code>{url}</code>
          <CopyButton text={url} />
        </div>
        <p className="muted small">
          Send any HTTP request to this URL — any method, any content type — and it appears below
          instantly.
        </p>
      </div>

      {requests.length === 0 ? (
        <div className="empty">
          <p>Waiting for the first request…</p>
          <pre className="body">{`curl -X POST '${url}/demo' \\\n  -H 'content-type: application/json' \\\n  --data-raw '{"hello":"basket"}'`}</pre>
        </div>
      ) : (
        <ul className="request-list">
          {requests.map((record) => (
            <RequestCard key={record.id} record={record} />
          ))}
        </ul>
      )}
    </section>
  );
}
