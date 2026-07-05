import { NextFunction, Request, Response } from "express";
import { ZodType } from "zod";

interface Schemas {
  body?: ZodType;
  params?: ZodType;
  query?: ZodType;
}

/**
 * Parses `req.body` / `req.params` / `req.query` against the given Zod
 * schemas, replacing each with its parsed (and coerced) value. Validation
 * failures throw a `ZodError`, which `asyncHandler` forwards to the global
 * `errorHandler`.
 */
export const validate =
  ({ body, params, query }: Schemas) =>
  (req: Request, res: Response, next: NextFunction) => {
    if (body) req.body = body.parse(req.body);
    if (params) req.params = params.parse(req.params) as typeof req.params;
    if (query) req.query = query.parse(req.query) as typeof req.query;
    next();
  };
