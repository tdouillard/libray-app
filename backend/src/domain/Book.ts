import type { Book, CreateBook, UpdateBook } from "@libray/shared";

export interface IBookRepository {
  create(book: CreateBook): Promise<Book>;
  findById(id: string): Promise<Book | null>;
  findByIsbn(isbn: string): Promise<Book | null>;
  findAll(): Promise<Book[]>;
  update(id: string, book: UpdateBook): Promise<Book>;
  delete(id: string): Promise<void>;
}

export class BookService {
  constructor(private bookRepository: IBookRepository) {}

  async addBook(book: CreateBook): Promise<Book> {
    const existing = await this.bookRepository.findByIsbn(book.isbn);
    if (existing) {
      throw new Error(`Book with ISBN ${book.isbn} already exists`);
    }
    return this.bookRepository.create(book);
  }

  async getBook(id: string): Promise<Book | null> {
    return this.bookRepository.findById(id);
  }

  async getAllBooks(): Promise<Book[]> {
    return this.bookRepository.findAll();
  }

  async updateBook(id: string, book: UpdateBook): Promise<Book> {
    return this.bookRepository.update(id, book);
  }

  async deleteBook(id: string): Promise<void> {
    return this.bookRepository.delete(id);
  }

  async searchByTitle(query: string): Promise<Book[]> {
    const books = await this.bookRepository.findAll();
    return books.filter((book) =>
      book.title.toLowerCase().includes(query.toLowerCase())
    );
  }
}
