import { Router } from "express";
import prisma from "../prisma";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import { validate } from "../middleware/validate";
import {
  createCreatorParamsSchema,
  createCreatorSchema,
  updateCreatorSchema,
  usernameParamSchema,
} from "../schemas/creators";
import { ConflictError, NotFoundError, UnauthorizedError } from "../errors/AppError";

const router = Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const creators = await prisma.creator.findMany({
      orderBy: { createdAt: "desc" },
      include: { donations: true },
    });
    return res.json(creators);
  })
);

router.get(
  "/:username",
  validate({ params: usernameParamSchema }),
  asyncHandler(async (req, res) => {
    const { username } = req.params;
    const creator = await prisma.creator.findUnique({
      where: { username },
      include: { donations: true },
    });

    if (!creator) {
      throw new NotFoundError("Creator not found");
    }

    return res.json(creator);
  })
);

router.post(
  "/:username/create",
  authMiddleware as any,
  validate({ params: createCreatorParamsSchema, body: createCreatorSchema }),
  asyncHandler(async (req: AuthRequest, res) => {
    const { username } = req.params;
    const { walletAddress, displayName, bio, avatarUrl } = req.body;

    if (!req.user) {
      throw new UnauthorizedError("User not authenticated");
    }

    const existing = await prisma.creator.findUnique({ where: { username } });
    if (existing) {
      throw new ConflictError("Username already exists");
    }

    const userCreator = await prisma.creator.findUnique({
      where: { userId: req.user.id },
    });
    if (userCreator) {
      throw new ConflictError("User already has a creator profile");
    }

    const creator = await prisma.creator.create({
      data: {
        userId: req.user.id,
        username,
        walletAddress: walletAddress || "",
        displayName,
        bio,
        avatarUrl,
      },
    });

    return res.status(201).json(creator);
  })
);

router.put(
  "/:username",
  authMiddleware as any,
  validate({ params: usernameParamSchema, body: updateCreatorSchema }),
  asyncHandler(async (req: AuthRequest, res) => {
    const { username } = req.params;
    const updates = req.body;

    if (!req.user) {
      throw new UnauthorizedError("User not authenticated");
    }

    const existing = await prisma.creator.findUnique({ where: { username } });
    if (!existing) {
      throw new NotFoundError("Creator not found");
    }

    // A profile can only be edited by its owner — otherwise anyone could
    // overwrite another creator's payout wallet and redirect their donations.
    if (existing.userId !== req.user.id) {
      throw new UnauthorizedError("You can only edit your own profile");
    }

    const creator = await prisma.creator.update({
      where: { username },
      data: updates,
    });

    return res.json(creator);
  })
);

export default router;
