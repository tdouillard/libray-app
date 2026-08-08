import type { Collection, CreateCollection, UpdateCollection } from "@libray/shared";

export interface ICollectionRepository {
  create(collection: CreateCollection): Promise<Collection>;
  findById(id: string): Promise<Collection | null>;
  findAll(): Promise<Collection[]>;
  update(id: string, collection: UpdateCollection): Promise<Collection>;
  delete(id: string): Promise<void>;
  addBook(collectionId: string, bookId: string): Promise<void>;
  removeBook(collectionId: string, bookId: string): Promise<void>;
}

export class CollectionService {
  constructor(private collectionRepository: ICollectionRepository) {}

  async createCollection(collection: CreateCollection): Promise<Collection> {
    return this.collectionRepository.create(collection);
  }

  async getCollection(id: string): Promise<Collection | null> {
    return this.collectionRepository.findById(id);
  }

  async getAllCollections(): Promise<Collection[]> {
    return this.collectionRepository.findAll();
  }

  async updateCollection(
    id: string,
    collection: UpdateCollection
  ): Promise<Collection> {
    return this.collectionRepository.update(id, collection);
  }

  async deleteCollection(id: string): Promise<void> {
    return this.collectionRepository.delete(id);
  }

  async addBookToCollection(
    collectionId: string,
    bookId: string
  ): Promise<void> {
    const collection = await this.collectionRepository.findById(collectionId);
    if (!collection) {
      throw new Error(`Collection ${collectionId} not found`);
    }
    return this.collectionRepository.addBook(collectionId, bookId);
  }

  async removeBookFromCollection(
    collectionId: string,
    bookId: string
  ): Promise<void> {
    const collection = await this.collectionRepository.findById(collectionId);
    if (!collection) {
      throw new Error(`Collection ${collectionId} not found`);
    }
    return this.collectionRepository.removeBook(collectionId, bookId);
  }
}
