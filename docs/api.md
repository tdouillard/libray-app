# API Documentation

## Base URL

Local: `http://localhost:3000/api`
Production: `https://api.libray.example.com`

## Authentication

Currently, no authentication is required. Authentication will be added in a future release.

## Response Format

All endpoints return JSON responses.

### Success Response (2xx)

```json
{
  "data": {},
  "message": "Success"
}
```

### Error Response (4xx, 5xx)

```json
{
  "error": "Error message",
  "details": []
}
```

## Books Endpoints

### List All Books

```
GET /api/books
```

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "isbn": "978-0-123456-78-9",
      "title": "Book Title",
      "author": "Author Name",
      "publisher": "Publisher",
      "publishedDate": "2024-01-01",
      "description": "Book description",
      "imageUrl": "https://...",
      "pageCount": 300,
      "categories": ["Fiction"],
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-01-01T00:00:00Z"
    }
  ]
}
```

### Create Book

```
POST /api/books
Content-Type: application/json
```

**Request Body:**
```json
{
  "isbn": "978-0-123456-78-9",
  "title": "Book Title",
  "author": "Author Name",
  "publisher": "Publisher (optional)",
  "publishedDate": "2024-01-01 (optional)",
  "description": "Book description (optional)",
  "imageUrl": "https://... (optional)",
  "pageCount": 300,
  "categories": ["Fiction"]
}
```

**Response:** `201 Created`

### Get Book by ID

```
GET /api/books/:id
```

**Response:** `200 OK`

### Update Book

```
PUT /api/books/:id
Content-Type: application/json
```

**Request Body:** (all fields optional)
```json
{
  "title": "New Title",
  "author": "New Author",
  ...
}
```

**Response:** `200 OK`

### Delete Book

```
DELETE /api/books/:id
```

**Response:** `204 No Content`

## Collections Endpoints

### List All Collections

```
GET /api/collections
```

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "My Collection",
      "description": "Collection description",
      "bookIds": ["book-id-1", "book-id-2"],
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-01-01T00:00:00Z"
    }
  ]
}
```

### Create Collection

```
POST /api/collections
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "My Collection",
  "description": "Collection description (optional)"
}
```

**Response:** `201 Created`

### Get Collection by ID

```
GET /api/collections/:id
```

**Response:** `200 OK`

### Update Collection

```
PUT /api/collections/:id
Content-Type: application/json
```

**Request Body:** (all fields optional)
```json
{
  "name": "New Name",
  "description": "New description",
  "bookIds": ["book-id-1", "book-id-2"]
}
```

**Response:** `200 OK`

### Delete Collection

```
DELETE /api/collections/:id
```

**Response:** `204 No Content`

### Add Book to Collection

```
POST /api/collections/:id/books
Content-Type: application/json
```

**Request Body:**
```json
{
  "bookId": "book-id"
}
```

**Response:** `201 Created`

### Remove Book from Collection

```
DELETE /api/collections/:id/books/:bookId
```

**Response:** `204 No Content`

## Status Codes

- `200 OK` - Request succeeded
- `201 Created` - Resource created successfully
- `204 No Content` - Request succeeded with no response body
- `400 Bad Request` - Invalid request data
- `404 Not Found` - Resource not found
- `409 Conflict` - Resource already exists
- `500 Internal Server Error` - Server error

## Rate Limiting

Currently not implemented. Will be added in a future release.

## Pagination

Currently not implemented. Use client-side filtering for large datasets.

## Filtering and Search

Currently not implemented. API will be enhanced to support:
- `?search=<query>` for full-text search
- `?author=<name>` for filtering by author
- `?category=<category>` for filtering by category

## Sorting

Currently not implemented. Future versions will support sorting by:
- Title
- Author
- Published date
- Date added
