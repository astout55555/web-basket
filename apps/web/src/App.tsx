import { Link, Route, Routes } from 'react-router';
import { ThemeToggle } from './components/ThemeToggle';
import { BasketPage } from './pages/BasketPage';
import { Home } from './pages/Home';

export function App() {
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-3">
          <Link to="/" className="text-lg font-bold tracking-tight">
            Web Basket
          </Link>
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-5 pb-16 pt-8">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/b/:address" element={<BasketPage />} />
          <Route
            path="*"
            element={
              <p className="text-slate-500 dark:text-slate-400">
                Nothing here — this page does not exist.
              </p>
            }
          />
        </Routes>
      </main>
    </>
  );
}
