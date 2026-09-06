import { Router } from "express";
import crypto from "crypto";

import {
  disconnectSlack,
  exchangeSlackCode,
  getSlackAuthorizeUrl,
  getSlackStatus,
  saveSlackConnection,
  // The Slack service is provided by the backend service layer at runtime.
  // @ts-ignore The service module is not included in the current TypeScript project references.
} from "../services/slack.service";

import { redisConnection } from "../config/redis";

import {
  AuthenticatedRequest,
  requireAuth,
} from "../middleware/auth.middleware";

const router = Router();

const STATE_TTL_SECONDS = 600;

// =====================================================
// POST /auth/slack/connect
// Start Slack OAuth
// =====================================================

router.post(
  "/connect",
  requireAuth,
  async (
    req: AuthenticatedRequest,
    res
  ) => {
    try {
      const userId = req.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      const state = crypto
        .randomBytes(32)
        .toString("hex");

      await redisConnection.set(
        `slack-oauth-state:${state}`,
        userId,
        "EX",
        STATE_TTL_SECONDS
      );

      const authorizeUrl =
        getSlackAuthorizeUrl(state);

      return res.json({
        success: true,
        authorizeUrl,
      });
    } catch (error) {
      console.error(
        "Slack connect error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to start Slack OAuth",
      });
    }
  }
);

// =====================================================
// GET /auth/slack/callback
// =====================================================

router.get(
  "/callback",
  async (req, res) => {
    try {
      const {
        code,
        state,
        error,
      } = req.query;

      if (error) {
        return res.status(400).send(`
          <h2>Slack authorization failed</h2>
          <p>${String(error)}</p>
        `);
      }

      if (
        typeof code !== "string" ||
        typeof state !== "string"
      ) {
        return res.status(400).send(
          "Missing Slack OAuth code or state"
        );
      }

      const stateKey =
        `slack-oauth-state:${state}`;

      const userId =
        await redisConnection.get(
          stateKey
        );

      if (!userId) {
        return res.status(400).send(
          "Invalid or expired OAuth state"
        );
      }

      await redisConnection.del(
        stateKey
      );

      const oauthResponse =
        await exchangeSlackCode(code);

      await saveSlackConnection(
        userId,
        oauthResponse
      );

      const frontendUrl =
        process.env.FRONTEND_URL ||
        "http://localhost:5173";

      return res.redirect(
        `${frontendUrl}/dashboard?slack=connected`
      );
    } catch (error) {
      console.error(
        "Slack callback error:",
        error
      );

      return res.status(500).send(`
        <h2>Slack connection failed</h2>
        <p>Please try connecting Slack again.</p>
      `);
    }
  }
);

// =====================================================
// GET /auth/slack/status
// =====================================================

router.get(
  "/status",
  requireAuth,
  async (
    req: AuthenticatedRequest,
    res
  ) => {
    try {
      const userId = req.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message:
            "Authentication required",
        });
      }

      const status =
        await getSlackStatus(userId);

      return res.json({
        success: true,
        ...status,
      });
    } catch (error) {
      console.error(
        "Slack status error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to check Slack status",
      });
    }
  }
);

// =====================================================
// POST /auth/slack/disconnect
// =====================================================

router.post(
  "/disconnect",
  requireAuth,
  async (
    req: AuthenticatedRequest,
    res
  ) => {
    try {
      const userId = req.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message:
            "Authentication required",
        });
      }

      await disconnectSlack(userId);

      return res.json({
        success: true,
        message:
          "Slack disconnected",
      });
    } catch (error) {
      console.error(
        "Slack disconnect error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to disconnect Slack",
      });
    }
  }
);

export default router;