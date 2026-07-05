import { Request, Response } from "express";
import { z, ZodError } from "zod";
import { validate } from "../../middleware/validate";

function mockReqRes(overrides: Partial<Request> = {}) {
  const req = { body: {}, params: {}, query: {}, ...overrides } as Request;
  const res = {} as Response;
  const next = jest.fn();
  return { req, res, next };
}

describe("validate middleware", () => {
  it("parses and replaces req.body when valid, then calls next()", () => {
    const schema = z.object({ amount: z.coerce.number().positive() });
    const { req, res, next } = mockReqRes({ body: { amount: "42" } });

    validate({ body: schema })(req, res, next);

    expect(req.body).toEqual({ amount: 42 });
    expect(next).toHaveBeenCalledWith();
  });

  it("throws a ZodError instead of calling next() when body is invalid", () => {
    const schema = z.object({ amount: z.coerce.number().positive() });
    const { req, res, next } = mockReqRes({ body: { amount: "-5" } });

    expect(() => validate({ body: schema })(req, res, next)).toThrow(ZodError);
    expect(next).not.toHaveBeenCalled();
  });

  it("validates params independently of body", () => {
    const paramsSchema = z.object({ username: z.string().min(3) });
    const { req, res, next } = mockReqRes({ params: { username: "bob" } });

    validate({ params: paramsSchema })(req, res, next);

    expect(req.params).toEqual({ username: "bob" });
    expect(next).toHaveBeenCalledWith();
  });

  it("validates query independently and leaves body/params untouched", () => {
    const querySchema = z.object({ creatorUsername: z.string().optional() });
    const { req, res, next } = mockReqRes({
      body: { untouched: true },
      query: { creatorUsername: "bob" },
    });

    validate({ query: querySchema })(req, res, next);

    expect(req.query).toEqual({ creatorUsername: "bob" });
    expect(req.body).toEqual({ untouched: true });
    expect(next).toHaveBeenCalledWith();
  });
});
