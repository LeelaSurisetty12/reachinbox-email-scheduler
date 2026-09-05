import "dotenv/config";

import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.routes";
import cookieParser from "cookie-parser";

import testRoutes from "./routes/test.routes";
import emailRoutes from "./routes/email.routes";
import slackRoutes from "./routes/slack.routes";
import senderRoutes from "./routes/sender.routes";
import googleRoutes from "./routes/google.routes";
import { serverAdapter } from "./config/bull-board";
import { ensureEmailIndex } from "./services/elasticsearch.service";
import { recoverProcessingEmails,reconcileScheduledEmails, } from "./services/recovery.service";


const app = express();

app.use(
  cookieParser()
);

app.use(
  cors({
    origin:
      "http://localhost:5173",
    credentials: true,
  })
);
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({
    success: true,
    message: "ReachInbox Email Scheduler API is running",
  });
});

app.use("/api", testRoutes);
app.use("/api/emails", emailRoutes);

app.use("/auth/slack", slackRoutes);
app.use("/auth/google", googleRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/senders", senderRoutes);

app.use(
  "/admin/queues",
  serverAdapter.getRouter()
);

const PORT = Number(process.env.PORT) || 5000;

app.listen(PORT, async () => {
  console.log(
    `Server running on http://localhost:${PORT}`
  );

  console.log(
    `Bull Board: http://localhost:${PORT}/admin/queues`
  );

  try {
    await ensureEmailIndex();
    console.log("Elasticsearch is ready");
  } catch (error) {
    console.error(
      "Elasticsearch initialization failed:",
      error
    );
  }

  try {
  await recoverProcessingEmails();

  console.log(
    "Email recovery check completed"
  );
} catch (error) {
  console.error(
    "Email recovery failed:",
    error
  );
}

try {
  await reconcileScheduledEmails();

  console.log(
    "Scheduled email reconciliation completed"
  );
} catch (error) {
  console.error(
    "Scheduled email reconciliation failed:",
    error
  );
}
});