import { z } from "zod";

export const listDonationsQuerySchema = z.object({
  creatorUsername: z.string().optional(),
});

export const createDonationSchema = z.object({
  creatorUsername: z.string().min(1, "creatorUsername is required"),
  senderAddress: z.string().min(1, "senderAddress is required"),
  amount: z.coerce.number().positive("amount must be a positive number"),
  currency: z.string().default("XLM"),
  message: z.string().max(500).optional(),
  transactionHash: z.string().optional(),
});
