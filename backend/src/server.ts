import "dotenv/config";

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import authRoutes from "./routes/auth.routes";
import testRoutes from "./routes/test.routes";
import emailRoutes from "./routes/email.routes";
import slackRoutes from "./routes/slack.routes";
import senderRoutes from "./routes/sender.routes";
import googleRoutes from "./routes/google.routes";

import { serverAdapter } from "./config/bull-board";

import {
  ensureEmailIndex,
} from "./services/elasticsearch.service";

import {
  recoverProcessingEmails,
  reconcileScheduledEmails,
} from "./services/recovery.service";

const app = express();

// =====================================================
// Configuration
// =====================================================

const PORT =
  Number(process.env.PORT) || 5000;

const FRONTEND_URL =
  process.env.FRONTEND_URL ||
  "http://localhost:5173";

// =====================================================
// Middleware
// =====================================================

app.use(
  cookieParser()
);

app.use(
  cors({
    origin: (
      origin,
      callback
    ) => {
      // Allow requests with no Origin
      // such as server-to-server requests.
      if (!origin) {
        callback(null, true);
        return;
      }

      const allowedOrigins = [
        "http://localhost:5173",
        FRONTEND_URL,
      ];

      if (
        allowedOrigins.includes(
          origin
        )
      ) {
        callback(null, true);
        return;
      }

      callback(
        new Error(
          "Not allowed by CORS"
        )
      );
    },

    credentials: true,
  })
);

app.use(
  express.json({
    limit: "10mb",
  })
);

// =====================================================
// Health check
// =====================================================

app.get(
  "/health",
  (_req, res) => {
    res.status(200).json({
      success: true,
      status: "healthy",
      service:
        "ReachInbox Email Scheduler API",
      timestamp:
        new Date().toISOString(),
    });
  }
);

// =====================================================
// Root
// =====================================================

app.get(
  "/",
  (_req, res) => {
    res.json({
      success: true,
      message:
        "ReachInbox Email Scheduler API is running",
    });
  }
);

// =====================================================
// Routes
// =====================================================

app.use(
  "/api",
  testRoutes
);

app.use(
  "/api/emails",
  emailRoutes
);

app.use(
  "/auth/slack",
  slackRoutes
);

app.use(
  "/auth/google",
  googleRoutes
);

app.use(
  "/api/auth",
  authRoutes
);

app.use(
  "/api/senders",
  senderRoutes
);

// =====================================================
// Bull Board
// =====================================================

app.use(
  "/admin/queues",
  serverAdapter.getRouter()
);

// =====================================================
// Start server
// =====================================================

app.listen(
  PORT,
  "0.0.0.0",
  async () => {
    console.log(
      `Server running on port ${PORT}`
    );

    console.log(
      `Bull Board: http://localhost:${PORT}/admin/queues`
    );

    console.log(
      `Frontend URL: ${FRONTEND_URL}`
    );

    // -----------------------------------------------
    // Elasticsearch
    // -----------------------------------------------

    try {
      await ensureEmailIndex();

      console.log(
        "Elasticsearch is ready"
      );
    } catch (error) {
      console.error(
        "Elasticsearch initialization failed:",
        error
      );
    }

    // -----------------------------------------------
    // Recover PROCESSING emails
    // -----------------------------------------------

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

    // -----------------------------------------------
    // Reconcile SCHEDULED emails
    // -----------------------------------------------

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
  }
);