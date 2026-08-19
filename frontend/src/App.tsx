import { BrowserRouter, NavLink, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BooksPage } from "./pages/BooksPage";
import { CollectionsPage } from "./pages/CollectionsPage";

const queryClient = new QueryClient();

const navItems = [
  { to: "/", label: "Books" },
  { to: "/collections", label: "Collections" },
];

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
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
            </div>
          </header>

          <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            <Routes>
              <Route path="/" element={<BooksPage />} />
              <Route path="/collections" element={<CollectionsPage />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
