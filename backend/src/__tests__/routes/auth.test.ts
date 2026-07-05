jest.mock("../../prisma", () => ({
  __esModule: true,
  default: {
    user: {
      upsert: jest.fn(),
    },
    creator: {
      findUnique: jest.fn(),
    },
  },
}));

import { createHash } from "crypto";
import { Keypair } from "@stellar/stellar-sdk";
import request from "supertest";
import app from "../../app";
import prisma from "../../prisma";

const mockedPrisma = prisma as unknown as {
  user: { upsert: jest.Mock };
  creator: { findUnique: jest.Mock };
};

const STELLAR_SIGNED_MESSAGE_PREFIX = "Stellar Signed Message:\n";

function signChallenge(keypair: Keypair, message: string): string {
  const payload = Buffer.concat([
    Buffer.from(STELLAR_SIGNED_MESSAGE_PREFIX, "utf-8"),
    Buffer.from(message, "utf-8"),
  ]);
  const hash = createHash("sha256").update(payload).digest();
  return keypair.sign(hash).toString("base64");
}

describe("POST /api/auth/challenge", () => {
  it("rejects a malformed wallet address", async () => {
    const res = await request(app)
      .post("/api/auth/challenge")
      .send({ walletAddress: "not-a-real-address" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("issues a signable challenge message for a valid address", async () => {
    const keypair = Keypair.random();

    const res = await request(app)
      .post("/api/auth/challenge")
      .send({ walletAddress: keypair.publicKey() });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain(`Address: ${keypair.publicKey()}`);
  });
});

describe("POST /api/auth/verify", () => {
  it("rejects verification when no challenge was requested first", async () => {
    const keypair = Keypair.random();

    const res = await request(app).post("/api/auth/verify").send({
      walletAddress: keypair.publicKey(),
      signedMessage: "bogus",
    });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });

  it("rejects an invalid signature", async () => {
    const keypair = Keypair.random();
    const otherKeypair = Keypair.random();

    const challengeRes = await request(app)
      .post("/api/auth/challenge")
      .send({ walletAddress: keypair.publicKey() });
    const { message } = challengeRes.body;

    // Sign with the wrong keypair so the signature won't match walletAddress.
    const badSignature = signChallenge(otherKeypair, message);

    const res = await request(app).post("/api/auth/verify").send({
      walletAddress: keypair.publicKey(),
      signedMessage: badSignature,
    });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });

  it("issues a token for a correctly signed challenge", async () => {
    const keypair = Keypair.random();

    const challengeRes = await request(app)
      .post("/api/auth/challenge")
      .send({ walletAddress: keypair.publicKey() });
    const { message } = challengeRes.body;

    const signedMessage = signChallenge(keypair, message);

    mockedPrisma.user.upsert.mockResolvedValue({ id: 1, walletAddress: keypair.publicKey() });
    mockedPrisma.creator.findUnique.mockResolvedValue(null);

    const res = await request(app).post("/api/auth/verify").send({
      walletAddress: keypair.publicKey(),
      signedMessage,
    });

    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user).toEqual({ id: 1, walletAddress: keypair.publicKey() });
    expect(res.body.hasProfile).toBe(false);
  });
});
