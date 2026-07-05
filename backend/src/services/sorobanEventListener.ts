import { xdr, scValToNative } from "@stellar/stellar-sdk";
import { DONATION_EVENT, DonationEvent, eventBus } from "./eventBus";

const RPC_URL = process.env.SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org";
const DONATION_CONTRACT_ID = process.env.NEXT_PUBLIC_DONATION_CONTRACT_ID;
const POLL_INTERVAL_MS = Number(process.env.SOROBAN_EVENTS_POLL_INTERVAL_MS) || 5000;
// How far back to look for events the first time the listener starts, so a
// freshly-restarted backend still surfaces recent donations instead of only
// ones that happen after this exact moment.
const LOOKBACK_LEDGERS = Number(process.env.SOROBAN_EVENTS_LOOKBACK_LEDGERS) || 100;

interface RawEvent {
  type: string;
  ledger: number;
  id: string;
  txHash: string;
  topic: string[];
  value: string;
}

function decodeScVal(base64Xdr: string): unknown {
  return scValToNative(xdr.ScVal.fromXDR(base64Xdr, "base64"));
}

async function rpcCall<T>(method: string, params: Record<string, unknown>): Promise<T> {
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = (await response.json()) as { result?: T; error?: { message: string } };
  if (body.error) {
    throw new Error(`Soroban RPC ${method} failed: ${body.error.message}`);
  }
  return body.result as T;
}

/**
 * Polls the Soroban RPC's `getEvents` for `DonatedEvent`s emitted by the
 * donation contract and republishes them on the local `eventBus`, which the
 * SSE route (`routes/events.ts`) streams to connected dashboard clients.
 *
 * Uses cursor-based pagination after the first poll so restarting the
 * process doesn't re-deliver events, and each poll only asks for events
 * newer than the last one it saw.
 */
export class SorobanEventListener {
  private cursor: string | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private polling = false;

  start(): void {
    if (!DONATION_CONTRACT_ID) {
      console.warn(
        "SorobanEventListener: NEXT_PUBLIC_DONATION_CONTRACT_ID is not set, skipping event polling."
      );
      return;
    }
    if (this.timer) return;

    this.timer = setInterval(() => {
      void this.poll();
    }, POLL_INTERVAL_MS);
    void this.poll();
    console.log(
      `SorobanEventListener: polling ${RPC_URL} for contract ${DONATION_CONTRACT_ID} every ${POLL_INTERVAL_MS}ms`
    );
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      const params: Record<string, unknown> = {
        filters: [{ type: "contract", contractIds: [DONATION_CONTRACT_ID] }],
        pagination: { limit: 50 },
      };

      if (this.cursor) {
        (params.pagination as Record<string, unknown>).cursor = this.cursor;
      } else {
        const { sequence: latestLedger } = await rpcCall<{ sequence: number }>(
          "getLatestLedger",
          {}
        );
        params.startLedger = Math.max(latestLedger - LOOKBACK_LEDGERS, 1);
      }

      const result = await rpcCall<{ events: RawEvent[] }>("getEvents", params);

      for (const evt of result.events) {
        if (evt.type !== "contract") continue;

        const topics = evt.topic.map(decodeScVal);
        if (topics[0] !== "donated") continue;

        const value = decodeScVal(evt.value) as {
          amount: bigint;
          memo: string;
          timestamp: bigint;
        };

        const payload: DonationEvent = {
          donor: topics[1] as string,
          creator: topics[2] as string,
          amount: value.amount.toString(),
          memo: value.memo,
          timestamp: Number(value.timestamp),
          ledger: evt.ledger,
          txHash: evt.txHash,
        };

        eventBus.emit(DONATION_EVENT, payload);
      }

      if (result.events.length > 0) {
        this.cursor = result.events[result.events.length - 1].id;
      }
    } catch (error) {
      console.error("SorobanEventListener: poll failed:", (error as Error).message);
    } finally {
      this.polling = false;
    }
  }
}

export const sorobanEventListener = new SorobanEventListener();
