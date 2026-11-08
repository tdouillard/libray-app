import { BrowserRouter, NavLink, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BooksPage } from "./pages/BooksPage";
import { BatchScanPage } from "./pages/BatchScanPage";
import { CollectionsPage } from "./pages/CollectionsPage";
import { AccountPage } from "./pages/AccountPage";
import { AdminScanLogsPage } from "./pages/AdminScanLogsPage";
import { ProfileMenu } from "./components/ProfileMenu";
import { I18nProvider, useI18n } from "./i18n/I18nContext";
import { useLanguageSync } from "./auth/useLanguage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { LoginPage } from "./pages/LoginPage";
import { AuthProvider, useAuth } from "./auth/AuthContext";

const queryClient = new QueryClient();

function AuthGate() {
  const { user, ready, recovering } = useAuth();
  useLanguageSync();

  if (!ready) return null;
  if (!user) return <LoginPage />;
  if (recovering) return <ResetPasswordPage />;

  return <Shell />;
}

const navItems = [
  { to: "/", label: "nav.books" },
  { to: "/scan", label: "nav.scan" },
  { to: "/collections", label: "nav.collections" },
] as const;

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <AuthProvider>
          <AuthGate />
        </AuthProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}

function Shell() {
  const { t } = useI18n();
  return (
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <div className="min-h-screen bg-slate-100 text-slate-900">
          <header className="relative z-40 border-b border-slate-200 bg-white/90 backdrop-blur-sm">
            <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  {t("app.tagline")}
                </p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
                  Libray
                </h1>
              </div>

              <nav aria-label={t("nav.label")} className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 p-1.5">
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
                    {t(item.label)}
                  </NavLink>
                ))}
              </nav>

              <ProfileMenu />
            </div>
          </header>

          <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            <Routes>
              <Route path="/" element={<BooksPage />} />
              <Route path="/scan" element={<BatchScanPage />} />
              <Route path="/collections" element={<CollectionsPage />} />
              <Route path="/account" element={<AccountPage />} />
              <Route path="/admin/scan-logs" element={<AdminScanLogsPage />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
  );
}
