import { z } from "zod";

export const BookSchema = z.object({
  id: z.string().uuid(),
  isbn: z.string(),
  title: z.string(),
  author: z.string(),
  publisher: z.string().optional(),
  publishedDate: z.string().optional(),
  description: z.string().optional(),
  imageUrl: z.string().url().optional(),
  pageCount: z.number().int().positive().optional(),
  categories: z.array(z.string()).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const CreateBookSchema = z.object({
  isbn: z.string(),
  title: z.string(),
  author: z.string(),
  publisher: z.string().optional(),
  publishedDate: z.string().optional(),
  description: z.string().optional(),
  imageUrl: z.string().url().optional(),
  pageCount: z.number().int().positive().optional(),
  categories: z.array(z.string()).optional(),
});

export const UpdateBookSchema = CreateBookSchema.partial();

export const CollectionSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().optional(),
  bookIds: z.array(z.string().uuid()),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const CreateCollectionSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
});

export const UpdateCollectionSchema = CreateCollectionSchema.partial().extend({
  bookIds: z.array(z.string().uuid()).optional(),
});

export type Book = z.infer<typeof BookSchema>;
export type CreateBook = z.infer<typeof CreateBookSchema>;
export type UpdateBook = z.infer<typeof UpdateBookSchema>;
export type Collection = z.infer<typeof CollectionSchema>;
export type CreateCollection = z.infer<typeof CreateCollectionSchema>;
export type UpdateCollection = z.infer<typeof UpdateCollectionSchema>;
