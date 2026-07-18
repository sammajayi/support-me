import express from "express";
import cors from "cors";
import authRouter from "./routes/auth";
import creatorsRouter from "./routes/creators";
import donationsRouter from "./routes/donations";
import withdrawalsRouter from "./routes/withdrawals";
import eventsRouter from "./routes/events";
import { errorHandler } from "./middleware/errorHandler";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  return res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api/auth", authRouter);
app.use("/api/creators", creatorsRouter);
app.use("/api/donations", donationsRouter);
app.use("/api/withdrawals", withdrawalsRouter);
app.use("/api/events", eventsRouter);

app.use((req, res) => {
  return res.status(404).json({ error: "Not Found", code: "NOT_FOUND" });
});

app.use(errorHandler);

export default app;

