import express from "express";
import cors from "cors";
import authRouter from "./routes/auth";
import creatorsRouter from "./routes/creators";
import donationsRouter from "./routes/donations";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  return res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api/auth", authRouter);
app.use("/api/creators", creatorsRouter);
app.use("/api/donations", donationsRouter);

app.use((req, res) => {
  return res.status(404).json({ error: "Not Found" });
});

export default app;

