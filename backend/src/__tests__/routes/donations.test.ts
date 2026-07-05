jest.mock("../../prisma", () => ({
  __esModule: true,
  default: {
    creator: {
      findUnique: jest.fn(),
    },
    donation: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
  },
}));

import request from "supertest";
import app from "../../app";
import prisma from "../../prisma";

const mockedPrisma = prisma as unknown as {
  creator: { findUnique: jest.Mock };
  donation: { findMany: jest.Mock; create: jest.Mock };
};

describe("GET /api/donations", () => {
  it("returns all donations ordered by creation date", async () => {
    const donations = [{ id: 1, creatorId: 1, senderAddress: "GABC", amount: 5 }];
    mockedPrisma.donation.findMany.mockResolvedValue(donations);

    const res = await request(app).get("/api/donations");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(donations);
    expect(mockedPrisma.donation.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: "desc" },
    });
  });

  it("filters by creatorUsername when provided as a query param", async () => {
    mockedPrisma.donation.findMany.mockResolvedValue([]);

    await request(app).get("/api/donations").query({ creatorUsername: "bob" });

    expect(mockedPrisma.donation.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: "desc" },
      where: { creator: { username: "bob" } },
    });
  });
});

describe("POST /api/donations", () => {
  it("rejects a request missing required fields with a validation error", async () => {
    const res = await request(app).post("/api/donations").send({ amount: 10 });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 404 when the target creator does not exist", async () => {
    mockedPrisma.creator.findUnique.mockResolvedValue(null);

    const res = await request(app).post("/api/donations").send({
      creatorUsername: "unknown",
      senderAddress: "GSENDER",
      amount: 10,
    });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
  });

  it("creates a donation for an existing creator", async () => {
    mockedPrisma.creator.findUnique.mockResolvedValue({ id: 7, username: "bob" });
    const created = {
      id: 1,
      creatorId: 7,
      senderAddress: "GSENDER",
      amount: 10,
      currency: "XLM",
    };
    mockedPrisma.donation.create.mockResolvedValue(created);

    const res = await request(app).post("/api/donations").send({
      creatorUsername: "bob",
      senderAddress: "GSENDER",
      amount: 10,
      message: "nice work",
    });

    expect(res.status).toBe(201);
    expect(res.body).toEqual(created);
    expect(mockedPrisma.donation.create).toHaveBeenCalledWith({
      data: {
        creatorId: 7,
        senderAddress: "GSENDER",
        amount: 10,
        currency: "XLM",
        message: "nice work",
        transactionHash: undefined,
      },
    });
  });
});
