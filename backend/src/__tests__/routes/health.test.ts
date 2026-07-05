jest.mock("../../prisma", () => ({
  __esModule: true,
  default: {},
}));

import request from "supertest";
import app from "../../app";

describe("GET /health", () => {
  it("returns 200 with an ok status", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(typeof res.body.timestamp).toBe("string");
  });
});

describe("unknown routes", () => {
  it("returns a structured 404", async () => {
    const res = await request(app).get("/api/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Not Found", code: "NOT_FOUND" });
  });
});
