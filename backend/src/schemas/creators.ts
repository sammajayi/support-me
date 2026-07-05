import { z } from "zod";

export const usernameParamSchema = z.object({
  username: z.string().min(1, "username is required"),
});

const usernamePattern = /^[a-zA-Z0-9_-]{3,30}$/;

export const createCreatorSchema = z.object({
  walletAddress: z.string().optional(),
  displayName: z.string().max(80).optional(),
  bio: z.string().max(500).optional(),
  avatarUrl: z.string().url().optional(),
});

export const createCreatorParamsSchema = z.object({
  username: z
    .string()
    .regex(usernamePattern, "username must be 3-30 characters (letters, numbers, _ or -)"),
});

export const updateCreatorSchema = z.object({
  displayName: z.string().max(80).optional(),
  bio: z.string().max(500).optional(),
  avatarUrl: z.string().url().optional(),
  walletAddress: z.string().optional(),
  socialLinks: z.record(z.string(), z.string()).optional(),
  donationGoal: z.number().int().positive().optional(),
});
