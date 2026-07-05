jest.mock("../../prisma", () => ({
  __esModule: true,
  default: {
    creator: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}));

import request from "supertest";
import app from "../../app";
import prisma from "../../prisma";
import { generateToken } from "../../middleware/auth";

const mockedPrisma = prisma as unknown as {
  creator: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
};

describe("GET /api/creators", () => {
  it("lists all creators with their donations", async () => {
    const creators = [{ id: 1, username: "bob", donations: [] }];
    mockedPrisma.creator.findMany.mockResolvedValue(creators);

    const res = await request(app).get("/api/creators");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(creators);
  });
});

describe("GET /api/creators/:username", () => {
  it("returns the creator when found", async () => {
    const creator = { id: 1, username: "bob", donations: [] };
    mockedPrisma.creator.findUnique.mockResolvedValue(creator);

    const res = await request(app).get("/api/creators/bob");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(creator);
  });

  it("returns 404 when the creator does not exist", async () => {
    mockedPrisma.creator.findUnique.mockResolvedValue(null);

    const res = await request(app).get("/api/creators/missing");

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
  });
});

describe("POST /api/creators/:username/create", () => {
  const token = generateToken(1, "GUSERADDRESS");

  it("rejects requests without an auth token", async () => {
    const res = await request(app).post("/api/creators/bob/create").send({});
    expect(res.status).toBe(401);
  });

  it("rejects an invalid username shape before hitting the database", async () => {
    const res = await request(app)
      .post("/api/creators/a/create")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 409 when the username is already taken", async () => {
    mockedPrisma.creator.findUnique.mockResolvedValueOnce({ id: 2, username: "bob" });

    const res = await request(app)
      .post("/api/creators/bob/create")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("CONFLICT");
  });

  it("returns 409 when the authenticated user already has a profile", async () => {
    mockedPrisma.creator.findUnique
      .mockResolvedValueOnce(null) // username lookup
      .mockResolvedValueOnce({ id: 3, username: "existing-profile" }); // userId lookup

    const res = await request(app)
      .post("/api/creators/bob/create")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("CONFLICT");
  });

  it("creates a creator profile for a new, authenticated user", async () => {
    mockedPrisma.creator.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    const created = { id: 4, userId: 1, username: "bob", walletAddress: "GADDR" };
    mockedPrisma.creator.create.mockResolvedValue(created);

    const res = await request(app)
      .post("/api/creators/bob/create")
      .set("Authorization", `Bearer ${token}`)
      .send({ walletAddress: "GADDR", displayName: "Bob" });

    expect(res.status).toBe(201);
    expect(res.body).toEqual(created);
  });
});

describe("PUT /api/creators/:username", () => {
  it("returns 404 when updating a creator that does not exist", async () => {
    mockedPrisma.creator.findUnique.mockResolvedValue(null);

    const res = await request(app).put("/api/creators/missing").send({ bio: "hi" });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
  });

  it("updates an existing creator", async () => {
    mockedPrisma.creator.findUnique.mockResolvedValue({ id: 1, username: "bob" });
    const updated = { id: 1, username: "bob", bio: "hi there" };
    mockedPrisma.creator.update.mockResolvedValue(updated);

    const res = await request(app).put("/api/creators/bob").send({ bio: "hi there" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(updated);
    expect(mockedPrisma.creator.update).toHaveBeenCalledWith({
      where: { username: "bob" },
      data: { bio: "hi there" },
    });
  });
});
