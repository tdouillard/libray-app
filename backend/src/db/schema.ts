import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  varchar,
} from "drizzle-orm/pg-core";

export const booksTable = pgTable("books", {
  id: uuid("id").primaryKey().defaultRandom(),
  isbn: varchar("isbn", { length: 20 }).notNull().unique(),
  title: varchar("title", { length: 500 }).notNull(),
  author: varchar("author", { length: 500 }).notNull(),
  publisher: varchar("publisher", { length: 500 }),
  publishedDate: varchar("published_date", { length: 20 }),
  description: text("description"),
  imageUrl: text("image_url"),
  pageCount: integer("page_count"),
  categories: varchar("categories", { length: 500 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const collectionsTable = pgTable("collections", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 500 }).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const collectionBooksTable = pgTable("collection_books", {
  id: uuid("id").primaryKey().defaultRandom(),
  collectionId: uuid("collection_id")
    .notNull()
    .references(() => collectionsTable.id, { onDelete: "cascade" }),
  bookId: uuid("book_id")
    .notNull()
    .references(() => booksTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
