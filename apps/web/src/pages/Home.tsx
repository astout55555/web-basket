import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { CopyButton } from '../components/CopyButton';
import { createBasket } from '../lib/api';
import type { SavedBasket } from '../lib/baskets-store';
import { loadBaskets, saveBasket } from '../lib/baskets-store';
import { dashboardPath, sinkUrl } from '../lib/urls';

export function Home() {
  const navigate = useNavigate();
  // Read-only on this page: creating navigates away, deleting happens on the
  // dashboard. One read at mount is all we need.
  const [baskets] = useState<SavedBasket[]>(() => loadBaskets());
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onCreate() {
    setCreating(true);
    setError(null);
    try {
      const address = await createBasket();
      saveBasket({ address, createdAt: new Date().toISOString() });
      navigate(dashboardPath(address));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create a basket');
      setCreating(false);
    }
  }

  return (
    <section>
      <div className="hero">
        <h2>Inspect any HTTP request</h2>
        <p>
          Create a basket, point a webhook (or curl) at its URL, and watch requests appear live.
        </p>
        <button className="primary" onClick={onCreate} disabled={creating}>
          {creating ? 'Creating…' : 'Create basket'}
        </button>
        {error !== null && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </div>

      <h3>Your baskets</h3>
      {baskets.length === 0 ? (
        <p className="muted">
          No baskets yet — create one above. (This list lives in your browser only; anyone with a
          basket&rsquo;s URL can see it, and idle baskets expire after 7 days.)
        </p>
      ) : (
        <ul className="basket-list">
          {baskets.map((basket) => (
            <li key={basket.address} className="basket-row">
              <div>
                <Link to={dashboardPath(basket.address)} className="basket-link">
                  {basket.address}
                </Link>
                <div className="muted small">
                  created {new Date(basket.createdAt).toLocaleString()}
                </div>
              </div>
              <div className="sink-url">
                <code>{sinkUrl(basket.address)}</code>
                <CopyButton text={sinkUrl(basket.address)} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
