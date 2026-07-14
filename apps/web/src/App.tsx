import { Link, Route, Routes } from 'react-router';
import { BasketPage } from './pages/BasketPage';
import { Home } from './pages/Home';

export function App() {
  return (
    <>
      <header className="topbar">
        <Link to="/" className="brand">
          Web Basket
        </Link>
      </header>
      <main className="container">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/b/:address" element={<BasketPage />} />
          <Route
            path="*"
            element={<p className="muted">Nothing here — this page does not exist.</p>}
          />
        </Routes>
      </main>
    </>
  );
}
