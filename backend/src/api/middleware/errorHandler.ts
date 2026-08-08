import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  console.error("Error:", err);

  if (err instanceof ZodError) {
    return res.status(400).json({
      error: "Validation error",
      details: err.errors,
    });
  }

  if (err.message.includes("not found")) {
    return res.status(404).json({
      error: err.message,
    });
  }

  if (err.message.includes("already exists")) {
    return res.status(409).json({
      error: err.message,
    });
  }

  res.status(500).json({
    error: "Internal server error",
  });
}
