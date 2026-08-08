export interface Book {
  id: string;
  isbn: string;
  title: string;
  author: string;
  publisher?: string;
  publishedDate?: string;
  description?: string;
  imageUrl?: string;
  pageCount?: number;
  categories?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateBookRequest {
  isbn: string;
  title: string;
  author: string;
  publisher?: string;
  publishedDate?: string;
  description?: string;
  imageUrl?: string;
  pageCount?: number;
  categories?: string[];
}

export interface UpdateBookRequest {
  title?: string;
  author?: string;
  publisher?: string;
  publishedDate?: string;
  description?: string;
  imageUrl?: string;
  pageCount?: number;
  categories?: string[];
}
