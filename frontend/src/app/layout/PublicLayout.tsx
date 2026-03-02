import { Outlet } from 'react-router';

export function PublicLayout() {
  return (
    <div className="min-h-full bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-16 max-w-4xl items-center px-4">
          <span className="text-lg font-bold text-primary">WashFlow</span>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
