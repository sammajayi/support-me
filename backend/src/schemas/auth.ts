import { z } from "zod";
import { StrKey } from "@stellar/stellar-sdk";

const stellarAddress = z
  .string()
  .refine((value) => StrKey.isValidEd25519PublicKey(value), {
    message: "Must be a valid Stellar wallet address",
  });

export const challengeSchema = z.object({
  walletAddress: stellarAddress,
});

export const verifySchema = z.object({
  walletAddress: stellarAddress,
  signedMessage: z.string().min(1, "signedMessage is required"),
});
