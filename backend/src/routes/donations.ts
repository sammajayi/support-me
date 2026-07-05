import { Router } from "express";
import prisma from "../prisma";
import { asyncHandler } from "../middleware/asyncHandler";
import { validate } from "../middleware/validate";
import { createDonationSchema, listDonationsQuerySchema } from "../schemas/donations";
import { NotFoundError } from "../errors/AppError";

const router = Router();

router.get(
  "/",
  validate({ query: listDonationsQuerySchema }),
  asyncHandler(async (req, res) => {
    const { creatorUsername } = req.query as { creatorUsername?: string };

    const donations = await prisma.donation.findMany({
      orderBy: { createdAt: "desc" },
      ...(creatorUsername ? { where: { creator: { username: creatorUsername } } } : {}),
    });

    return res.json(donations);
  })
);

router.post(
  "/",
  validate({ body: createDonationSchema }),
  asyncHandler(async (req, res) => {
    const { creatorUsername, senderAddress, amount, currency, message, transactionHash } = req.body;

    const creator = await prisma.creator.findUnique({ where: { username: creatorUsername } });
    if (!creator) {
      throw new NotFoundError("Creator not found");
    }

    const donation = await prisma.donation.create({
      data: {
        creatorId: creator.id,
        senderAddress,
        amount,
        currency,
        message,
        transactionHash,
      },
    });

    return res.status(201).json(donation);
  })
);

export default router;
