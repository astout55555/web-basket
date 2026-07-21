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
      <div className="card-surface p-8">
        <h2 className="text-2xl font-bold tracking-tight">Inspect any HTTP request</h2>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          Create a basket, point a webhook (or curl) at its URL, and watch requests appear live.
        </p>
        <button className="btn btn-primary mt-5" onClick={onCreate} disabled={creating}>
          {creating ? 'Creating…' : 'Create basket'}
        </button>
        {error !== null && (
          <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </div>

      <h3 className="mb-3 mt-10 text-lg font-semibold">Your baskets</h3>
      {baskets.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No baskets yet — create one above. (This list lives in your browser only; anyone with a
          basket&rsquo;s URL can see it, and idle baskets expire after 7 days.)
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {baskets.map((basket) => (
            <li
              key={basket.address}
              className="card-surface flex flex-wrap items-center justify-between gap-3 px-5 py-4"
            >
              <div>
                <Link
                  to={dashboardPath(basket.address)}
                  className="font-mono font-semibold text-blue-600 hover:underline dark:text-blue-400"
                >
                  {basket.address}
                </Link>
                <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  created {new Date(basket.createdAt).toLocaleString()}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <code className="rounded-md border border-slate-200 bg-slate-100 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800/60">
                  {sinkUrl(basket.address)}
                </code>
                <CopyButton text={sinkUrl(basket.address)} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
