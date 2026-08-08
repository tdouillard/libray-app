import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { BooksPage } from "./pages/BooksPage";
import { CollectionsPage } from "./pages/CollectionsPage";

const queryClient = new QueryClient();

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="min-h-screen bg-gray-50">
          <nav className="bg-white shadow">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex justify-between h-16">
                <div className="flex items-center">
                  <h1 className="text-2xl font-bold text-gray-900">
                    Libray
                  </h1>
                </div>
                <div className="flex items-center space-x-4">
                  <a href="/" className="text-gray-700 hover:text-gray-900">
                    Books
                  </a>
                  <a
                    href="/collections"
                    className="text-gray-700 hover:text-gray-900"
                  >
                    Collections
                  </a>
                </div>
              </div>
            </div>
          </nav>

          <Routes>
            <Route path="/" element={<BooksPage />} />
            <Route path="/collections" element={<CollectionsPage />} />
          </Routes>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
