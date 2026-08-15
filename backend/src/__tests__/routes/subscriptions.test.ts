jest.mock("../../prisma", () => ({
  __esModule: true,
  default: {
    creator: {
      findUnique: jest.fn(),
    },
    subscription: {
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
  creator: { findUnique: jest.Mock };
  subscription: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
};

describe("GET /api/subscriptions", () => {
  it("returns all subscriptions ordered by creation date", async () => {
    const subscriptions = [{ id: 1, creatorId: 1, supporterAddress: "GSUPPORTER" }];
    mockedPrisma.subscription.findMany.mockResolvedValue(subscriptions);

    const res = await request(app).get("/api/subscriptions");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(subscriptions);
    expect(mockedPrisma.subscription.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: "desc" },
      where: {},
    });
  });

  it("filters by supporterAddress when provided as a query param", async () => {
    mockedPrisma.subscription.findMany.mockResolvedValue([]);

    await request(app).get("/api/subscriptions").query({ supporterAddress: "GSUPPORTER" });

    expect(mockedPrisma.subscription.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: "desc" },
      where: { supporterAddress: "GSUPPORTER" },
    });
  });
});

describe("POST /api/subscriptions", () => {
  const token = generateToken(1, "GSUPPORTER");

  it("rejects requests without an auth token", async () => {
    const res = await request(app).post("/api/subscriptions").send({
      creatorUsername: "bob",
      supporterAddress: "GSUPPORTER",
      token: "XLM",
      amount: 10,
      intervalSecs: 2592000,
      onChainId: 0,
    });

    expect(res.status).toBe(401);
  });

  it("rejects a request missing required fields with a validation error", async () => {
    const res = await request(app)
      .post("/api/subscriptions")
      .set("Authorization", `Bearer ${token}`)
      .send({ creatorUsername: "bob" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("rejects recording a subscription under someone else's wallet address", async () => {
    const res = await request(app)
      .post("/api/subscriptions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        creatorUsername: "bob",
        supporterAddress: "GSOMEONEELSE",
        token: "XLM",
        amount: 10,
        intervalSecs: 2592000,
        onChainId: 0,
      });

    expect(res.status).toBe(401);
    expect(mockedPrisma.subscription.create).not.toHaveBeenCalled();
  });

  it("returns 404 when the target creator does not exist", async () => {
    mockedPrisma.creator.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post("/api/subscriptions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        creatorUsername: "unknown",
        supporterAddress: "GSUPPORTER",
        token: "XLM",
        amount: 10,
        intervalSecs: 2592000,
        onChainId: 0,
      });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
  });

  it("creates a subscription for the reporting supporter", async () => {
    mockedPrisma.creator.findUnique.mockResolvedValue({ id: 7, userId: 2, username: "bob" });
    mockedPrisma.subscription.findUnique.mockResolvedValue(null);
    const created = {
      id: 1,
      creatorId: 7,
      supporterAddress: "GSUPPORTER",
      token: "XLM",
      amount: 10,
      intervalSecs: 2592000,
      onChainId: 0,
    };
    mockedPrisma.subscription.create.mockResolvedValue(created);

    const res = await request(app)
      .post("/api/subscriptions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        creatorUsername: "bob",
        supporterAddress: "GSUPPORTER",
        token: "XLM",
        amount: 10,
        intervalSecs: 2592000,
        onChainId: 0,
        subscribeTxHash: "tx-1",
      });

    expect(res.status).toBe(201);
    expect(res.body).toEqual(created);
    expect(mockedPrisma.subscription.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          creatorId: 7,
          supporterAddress: "GSUPPORTER",
          token: "XLM",
          amount: 10,
          intervalSecs: 2592000,
          onChainId: 0,
          subscribeTxHash: "tx-1",
        }),
      })
    );
  });

  it("is idempotent: a duplicate onChainId returns the existing record", async () => {
    mockedPrisma.creator.findUnique.mockResolvedValue({ id: 7, userId: 2, username: "bob" });
    const existing = { id: 1, creatorId: 7, supporterAddress: "GSUPPORTER", onChainId: 0 };
    mockedPrisma.subscription.findUnique.mockResolvedValue(existing);

    const res = await request(app)
      .post("/api/subscriptions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        creatorUsername: "bob",
        supporterAddress: "GSUPPORTER",
        token: "XLM",
        amount: 10,
        intervalSecs: 2592000,
        onChainId: 0,
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(existing);
    expect(mockedPrisma.subscription.create).not.toHaveBeenCalled();
  });
});

describe("POST /api/subscriptions/:id/cancel", () => {
  const token = generateToken(1, "GSUPPORTER");

  it("rejects requests without an auth token", async () => {
    const res = await request(app).post("/api/subscriptions/1/cancel");
    expect(res.status).toBe(401);
  });

  it("returns 404 when the subscription does not exist", async () => {
    mockedPrisma.subscription.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post("/api/subscriptions/1/cancel")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it("rejects cancelling a subscription that isn't the caller's own", async () => {
    mockedPrisma.subscription.findUnique.mockResolvedValue({
      id: 1,
      supporterAddress: "GSOMEONEELSE",
    });

    const res = await request(app)
      .post("/api/subscriptions/1/cancel")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(401);
    expect(mockedPrisma.subscription.update).not.toHaveBeenCalled();
  });

  it("deactivates the caller's own subscription", async () => {
    mockedPrisma.subscription.findUnique.mockResolvedValue({
      id: 1,
      supporterAddress: "GSUPPORTER",
    });
    const updated = { id: 1, supporterAddress: "GSUPPORTER", active: false };
    mockedPrisma.subscription.update.mockResolvedValue(updated);

    const res = await request(app)
      .post("/api/subscriptions/1/cancel")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(updated);
    expect(mockedPrisma.subscription.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { active: false },
    });
  });
});
