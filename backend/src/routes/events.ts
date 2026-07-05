import { Router } from "express";
import { DONATION_EVENT, DonationEvent, eventBus } from "../services/eventBus";

const router = Router();

/**
 * Server-Sent Events stream of on-chain donation events. The frontend
 * dashboard opens this with `EventSource` to get live updates without
 * polling the REST API.
 */
router.get("/", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.flushHeaders?.();

  // Comment ping so proxies/browsers don't time out an idle connection.
  const heartbeat = setInterval(() => res.write(": ping\n\n"), 30000);

  const onDonation = (payload: DonationEvent) => {
    res.write(`event: donation\ndata: ${JSON.stringify(payload)}\n\n`);
  };
  eventBus.on(DONATION_EVENT, onDonation);

  req.on("close", () => {
    clearInterval(heartbeat);
    eventBus.off(DONATION_EVENT, onDonation);
    res.end();
  });
});

export default router;
