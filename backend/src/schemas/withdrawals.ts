import { z } from "zod";

export const listWithdrawalsQuerySchema = z.object({
  creatorUsername: z.string().optional(),
});

export const createWithdrawalSchema = z.object({
  creatorUsername: z.string().min(1, "creatorUsername is required"),
  amountIn: z.coerce.number().positive("amountIn must be a positive number"),
  amountOut: z.coerce.number().nonnegative().optional(),
  fee: z.coerce.number().nonnegative().optional(),
  currency: z.string().default("USDC"),
  anchorTxId: z.string().min(1, "anchorTxId is required"),
  stellarTxId: z.string().optional(),
  status: z.string().default("completed"),
});
