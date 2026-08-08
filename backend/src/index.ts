import express from "express";
import cors from "cors";
import { bookRouter } from "./api/routes/books.js";
import { collectionRouter } from "./api/routes/collections.js";
import { errorHandler } from "./api/middleware/errorHandler.js";

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());

app.use("/api/books", bookRouter);
app.use("/api/collections", collectionRouter);

app.use(errorHandler);

app.listen(port, () => {
  console.log(`Backend running on http://localhost:${port}`);
});
