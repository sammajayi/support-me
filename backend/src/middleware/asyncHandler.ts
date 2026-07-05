import { NextFunction, Request, Response } from "express";

type AsyncRouteHandler<Req extends Request = Request> = (
  req: Req,
  res: Response,
  next: NextFunction
) => Promise<unknown>;

/**
 * Wraps an async route handler so that a rejected promise (a thrown error
 * inside `await`) is forwarded to Express's error-handling middleware via
 * `next(err)`, instead of crashing the process or hanging the request.
 */
export const asyncHandler =
  <Req extends Request = Request>(handler: AsyncRouteHandler<Req>) =>
  (req: Req, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
