import {
  AppError,
  BadRequestError,
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from "../../errors/AppError";

describe("AppError subclasses", () => {
  it("sets statusCode, code and message on the base AppError", () => {
    const err = new AppError("Something went wrong", 418, "TEAPOT");

    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("Something went wrong");
    expect(err.statusCode).toBe(418);
    expect(err.code).toBe("TEAPOT");
    expect(err.name).toBe("AppError");
  });

  it("BadRequestError maps to 400/BAD_REQUEST", () => {
    const err = new BadRequestError("bad input");
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe("BAD_REQUEST");
    expect(err.message).toBe("bad input");
  });

  it("UnauthorizedError maps to 401/UNAUTHORIZED with a default message", () => {
    const err = new UnauthorizedError();
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe("UNAUTHORIZED");
    expect(err.message).toBe("Authentication required");
  });

  it("UnauthorizedError accepts a custom message", () => {
    const err = new UnauthorizedError("Invalid signature");
    expect(err.message).toBe("Invalid signature");
  });

  it("NotFoundError maps to 404/NOT_FOUND", () => {
    const err = new NotFoundError("Creator not found");
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe("NOT_FOUND");
  });

  it("ConflictError maps to 409/CONFLICT", () => {
    const err = new ConflictError("Username already exists");
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe("CONFLICT");
  });
});
