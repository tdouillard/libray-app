export interface Collection {
  id: string;
  name: string;
  description?: string;
  bookIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateCollectionRequest {
  name: string;
  description?: string;
}

export interface UpdateCollectionRequest {
  name?: string;
  description?: string;
  bookIds?: string[];
}
