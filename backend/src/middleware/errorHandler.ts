import { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { AppError } from "../errors/AppError";

/**
 * Single place where every error thrown or forwarded via `next(err)` in the
 * app ends up. Keeping this centralized means every route gets the same
 * response shape and log format instead of ad-hoc `res.status(...).json(...)`
 * calls scattered across route files.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message, code: err.code });
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      error: "Validation failed",
      code: "VALIDATION_ERROR",
      details: err.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      return res.status(409).json({
        error: `A record with this ${(err.meta?.target as string[] | undefined)?.join(", ") ?? "value"} already exists`,
        code: "CONFLICT",
      });
    }
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Record not found", code: "NOT_FOUND" });
    }
  }

  console.error(`Unhandled error on ${req.method} ${req.path}:`, err);
  return res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
}
