import { useParams } from 'react-router';

/** Placeholder — the live dashboard replaces this in the next chunk. */
export function BasketPage() {
  const { address } = useParams<{ address: string }>();
  return (
    <section>
      <h2>Dashboard for {address}</h2>
      <p className="muted">The live request view lands in the next chunk.</p>
    </section>
  );
}
