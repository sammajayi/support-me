import {
  BASE_FEE,
  Contract,
  Keypair,
  Networks,
  TransactionBuilder,
  nativeToScVal,
  rpc,
} from "@stellar/stellar-sdk";
import prisma from "../prisma";
import { Subscription } from "@prisma/client";

const RPC_URL = process.env.SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org";
const NETWORK_PASSPHRASE = Networks.TESTNET;
const DONATION_CONTRACT_ID = process.env.NEXT_PUBLIC_DONATION_CONTRACT_ID;
const EXECUTOR_SECRET_KEY = process.env.EXECUTOR_SECRET_KEY;
const POLL_INTERVAL_MS = Number(process.env.SUBSCRIPTION_EXECUTOR_POLL_INTERVAL_MS) || 60_000;

/**
 * Periodically charges due recurring-donation subscriptions by calling the
 * donation contract's `charge_subscription`, signed by this backend's own
 * operational keypair — the "executor" address the contract's admin
 * authorized via `set_executor`. This is the only place the backend signs
 * and submits a Stellar transaction on its own behalf; everywhere else,
 * transactions are built and signed client-side by the end user's wallet.
 *
 * The executor key only pays fees and satisfies the contract's caller
 * check — it never custodies donor funds, since `transfer_from`'s `to` is
 * pinned inside the contract to the subscription's stored creator. A leaked
 * key can at most accelerate/replay already-approved charges, not redirect
 * them.
 *
 * Mirrors `SorobanEventListener`'s start()/stop()/setInterval() shape.
 */
export class SubscriptionExecutor {
  private server = new rpc.Server(RPC_URL);
  private keypair: Keypair | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  start(): void {
    if (!DONATION_CONTRACT_ID) {
      console.warn(
        "SubscriptionExecutor: NEXT_PUBLIC_DONATION_CONTRACT_ID is not set, skipping."
      );
      return;
    }
    if (!EXECUTOR_SECRET_KEY) {
      console.warn(
        "SubscriptionExecutor: EXECUTOR_SECRET_KEY is not set, recurring donations will not be charged."
      );
      return;
    }
    if (this.timer) return;

    this.keypair = Keypair.fromSecret(EXECUTOR_SECRET_KEY);
    this.timer = setInterval(() => {
      void this.tick();
    }, POLL_INTERVAL_MS);
    void this.tick();
    console.log(
      `SubscriptionExecutor: charging due subscriptions every ${POLL_INTERVAL_MS}ms as ${this.keypair.publicKey()}`
    );
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const due = await prisma.subscription.findMany({
        where: { active: true, nextChargeAt: { lte: new Date() } },
      });

      for (const subscription of due) {
        await this.charge(subscription);
      }
    } catch (error) {
      console.error("SubscriptionExecutor: tick failed:", (error as Error).message);
    } finally {
      this.running = false;
    }
  }

  private async charge(subscription: Subscription): Promise<void> {
    const keypair = this.keypair!;
    try {
      const account = await this.server.getAccount(keypair.publicKey());
      const contract = new Contract(DONATION_CONTRACT_ID!);

      const tx = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: NETWORK_PASSPHRASE,
      })
        .addOperation(
          contract.call(
            "charge_subscription",
            nativeToScVal(keypair.publicKey(), { type: "address" }),
            nativeToScVal(BigInt(subscription.onChainId), { type: "u64" })
          )
        )
        .setTimeout(60)
        .build();

      const prepared = await this.server.prepareTransaction(tx);
      prepared.sign(keypair);

      const sendResult = await this.server.sendTransaction(prepared);
      const hash = await this.confirm(sendResult.hash);

      await prisma.$transaction([
        prisma.donation.create({
          data: {
            creatorId: subscription.creatorId,
            senderAddress: subscription.supporterAddress,
            amount: subscription.amount,
            currency: subscription.token,
            message: "Recurring donation",
            transactionHash: hash,
          },
        }),
        prisma.subscription.update({
          where: { id: subscription.id },
          data: {
            nextChargeAt: new Date(Date.now() + subscription.intervalSecs * 1000),
            lastChargeTxHash: hash,
            lastChargedAt: new Date(),
            lastError: null,
          },
        }),
      ]);
    } catch (error) {
      const message = (error as Error).message;
      console.error(
        `SubscriptionExecutor: charge failed for subscription ${subscription.id}:`,
        message
      );
      // Record the failure but leave `active`/`nextChargeAt` untouched — a
      // transient RPC error should retry next tick, and a permanent one
      // (e.g. revoked allowance) surfaces via `lastError` for the supporter
      // to see rather than the executor looping forever.
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { lastError: message },
      });
    }
  }

  private async confirm(hash: string): Promise<string> {
    for (let i = 0; i < 30; i++) {
      const result = await this.server.getTransaction(hash);
      if (result.status === "SUCCESS") return hash;
      if (result.status === "FAILED") {
        throw new Error(`Transaction ${hash} failed on-chain`);
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error(`Transaction ${hash} did not confirm within 30s`);
  }
}

export const subscriptionExecutor = new SubscriptionExecutor();
