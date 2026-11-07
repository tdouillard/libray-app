import { BrowserRouter, NavLink, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BooksPage } from "./pages/BooksPage";
import { BatchScanPage } from "./pages/BatchScanPage";
import { CollectionsPage } from "./pages/CollectionsPage";
import { AccountPage } from "./pages/AccountPage";
import { Avatar } from "./components/Avatar";
import { LoginPage } from "./pages/LoginPage";
import { AuthProvider, useAuth } from "./auth/AuthContext";

const queryClient = new QueryClient();

function AuthGate() {
  const { user, ready, signOut } = useAuth();

  if (!ready) return null;
  if (!user) return <LoginPage />;

  return <Shell onSignOut={signOut} />;
}

const navItems = [
  { to: "/", label: "Books" },
  { to: "/scan", label: "Batch scan" },
  { to: "/collections", label: "Collections" },
];

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </QueryClientProvider>
  );
}

function Shell({ onSignOut }: { onSignOut: () => void }) {
  return (
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <div className="min-h-screen bg-slate-100 text-slate-900">
          <header className="border-b border-slate-200 bg-white/90 backdrop-blur-sm">
            <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Personal library
                </p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
                  Libray
                </h1>
              </div>

              <nav className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 p-1.5">
                {navItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      `rounded-full px-4 py-2 text-sm font-medium transition ${
                        isActive
                          ? "bg-slate-900 text-white shadow-sm"
                          : "text-slate-600 hover:bg-white hover:text-slate-900"
                      }`
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </nav>

              <div className="flex items-center gap-3 text-sm text-slate-600">
                <NavLink to="/account" aria-label="Account settings" className="flex items-center gap-2 rounded-full hover:opacity-80">
                  <Avatar />
                </NavLink>
                <button
                  type="button"
                  onClick={onSignOut}
                  className="rounded-full border border-slate-200 px-3 py-1.5 font-medium hover:bg-white"
                >
                  Sign out
                </button>
              </div>
            </div>
          </header>

          <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            <Routes>
              <Route path="/" element={<BooksPage />} />
              <Route path="/scan" element={<BatchScanPage />} />
              <Route path="/collections" element={<CollectionsPage />} />
              <Route path="/account" element={<AccountPage />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
  );
}
