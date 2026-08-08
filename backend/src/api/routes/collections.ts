import { Router, type Request, type Response } from "express";

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  res.json({ message: "Get all collections" });
});

router.post("/", async (req: Request, res: Response) => {
  res.status(201).json({ message: "Create collection" });
});

router.get("/:id", async (req: Request, res: Response) => {
  res.json({ message: `Get collection ${req.params.id}` });
});

router.put("/:id", async (req: Request, res: Response) => {
  res.json({ message: `Update collection ${req.params.id}` });
});

router.delete("/:id", async (req: Request, res: Response) => {
  res.status(204).send();
});

router.post("/:id/books", async (req: Request, res: Response) => {
  res.status(201).json({ message: "Add book to collection" });
});

router.delete("/:id/books/:bookId", async (req: Request, res: Response) => {
  res.status(204).send();
});

export { router as collectionRouter };
