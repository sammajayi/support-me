import { z } from "zod";

export const listSubscriptionsQuerySchema = z.object({
  creatorUsername: z.string().optional(),
  supporterAddress: z.string().optional(),
});

export const createSubscriptionSchema = z.object({
  creatorUsername: z.string().min(1, "creatorUsername is required"),
  supporterAddress: z.string().min(1, "supporterAddress is required"),
  token: z.string().min(1, "token is required"),
  amount: z.coerce.number().positive("amount must be a positive number"),
  intervalSecs: z.coerce.number().int().positive("intervalSecs must be a positive integer"),
  onChainId: z.coerce.number().int().nonnegative("onChainId is required"),
  subscribeTxHash: z.string().optional(),
});
