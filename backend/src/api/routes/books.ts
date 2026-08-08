import { Router, type Request, type Response } from "express";

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  res.json({ message: "Get all books" });
});

router.post("/", async (req: Request, res: Response) => {
  res.status(201).json({ message: "Create book" });
});

router.get("/:id", async (req: Request, res: Response) => {
  res.json({ message: `Get book ${req.params.id}` });
});

router.put("/:id", async (req: Request, res: Response) => {
  res.json({ message: `Update book ${req.params.id}` });
});

router.delete("/:id", async (req: Request, res: Response) => {
  res.status(204).send();
});

export { router as bookRouter };
