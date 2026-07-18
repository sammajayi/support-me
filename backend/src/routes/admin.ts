import { Router } from "express";
import prisma from "../prisma";
import { authMiddleware } from "../middleware/auth";
import { adminAuth } from "../middleware/adminAuth";
import { asyncHandler } from "../middleware/asyncHandler";

const router = Router();

// All admin routes require a verified JWT (authMiddleware) AND an allowlisted
// wallet (adminAuth). This data exposes every user's wallet + earnings, so both
// gates always run first.
router.use(authMiddleware as any, adminAuth as any);

// Earnings keyed by currency, e.g. { XLM: 1234.5, USDC: 50 }. XLM and USDC are
// not equal in value, so we never collapse them into one number.
type EarningsByCurrency = Record<string, number>;

router.get(
  "/overview",
  asyncHandler(async (_req, res) => {
    // Run the independent aggregates concurrently.
    const [totalSignups, totalCreators, totalByCurrency, perCreatorByCurrency, users] =
      await Promise.all([
        prisma.user.count(),
        prisma.creator.count(),
        // Platform-wide earnings, grouped by currency.
        prisma.donation.groupBy({
          by: ["currency"],
          _sum: { amount: true },
        }),
        // Per-creator earnings, grouped by creator + currency. One flat query we
        // fold into a per-creator map below — avoids an N+1 loop over creators.
        prisma.donation.groupBy({
          by: ["creatorId", "currency"],
          _sum: { amount: true },
        }),
        // Every user, with their creator profile (if they've made one yet).
        prisma.user.findMany({
          orderBy: { createdAt: "desc" },
          include: { creator: true },
        }),
      ]);

    const earningsByCurrency: EarningsByCurrency = {};
    for (const row of totalByCurrency) {
      earningsByCurrency[row.currency] = row._sum.amount ?? 0;
    }

    // creatorId -> { currency -> summed amount }
    const earningsByCreator = new Map<number, EarningsByCurrency>();
    for (const row of perCreatorByCurrency) {
      const bucket = earningsByCreator.get(row.creatorId) ?? {};
      bucket[row.currency] = row._sum.amount ?? 0;
      earningsByCreator.set(row.creatorId, bucket);
    }

    const userRows = users.map((u) => ({
      id: u.id,
      walletAddress: u.walletAddress,
      joinedAt: u.createdAt,
      username: u.creator?.username ?? null,
      displayName: u.creator?.displayName ?? null,
      earningsByCurrency: u.creator ? earningsByCreator.get(u.creator.id) ?? {} : {},
    }));

    return res.json({
      totalSignups,
      totalCreators,
      earningsByCurrency,
      users: userRows,
    });
  })
);

export default router;
