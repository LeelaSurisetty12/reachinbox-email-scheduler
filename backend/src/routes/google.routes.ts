import { Router } from "express";
import crypto from "crypto";

import {
  getGoogleAuthorizeUrl,
  handleGoogleCallback,
} from "../services/google.service";

import { redisConnection } from "../config/redis";

const router = Router();

const STATE_TTL_SECONDS = 600;

const COOKIE_NAME =
  "reachinbox_token";

const COOKIE_MAX_AGE =
  7 * 24 * 60 * 60 * 1000;

// =====================================================
// GET /auth/google
// =====================================================

router.get("/", async (_req, res) => {
  try {
    const state =
      crypto
        .randomBytes(32)
        .toString("hex");

    await redisConnection.set(
      `google-oauth-state:${state}`,
      "valid",
      "EX",
      STATE_TTL_SECONDS
    );

    const authorizeUrl =
      getGoogleAuthorizeUrl(
        state
      );

    return res.redirect(
      authorizeUrl
    );
  } catch (error) {
    console.error(
      "Google OAuth start error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to start Google login",
    });
  }
});

// =====================================================
// GET /auth/google/callback
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
          <h2>Google Login Failed</h2>
          <p>${String(error)}</p>
        `);
      }

      if (
        typeof code !== "string" ||
        typeof state !== "string"
      ) {
        return res.status(400).send(
          "Missing Google OAuth code or state"
        );
      }

      const stateKey =
        `google-oauth-state:${state}`;

      const validState =
        await redisConnection.get(
          stateKey
        );

      if (!validState) {
        return res.status(400).send(
          "Invalid or expired OAuth state"
        );
      }

      // One-time use
      await redisConnection.del(
        stateKey
      );

      const result =
        await handleGoogleCallback(
          code
        );

      // -----------------------------------------
      // Store JWT in HttpOnly cookie
      // -----------------------------------------

      res.cookie(
        COOKIE_NAME,
        result.token,
        {
          httpOnly: true,
          secure: false,
          sameSite: "lax",
          maxAge:
            COOKIE_MAX_AGE,
          path: "/",
        }
      );

      const frontendUrl =
        process.env.FRONTEND_URL ||
        "http://localhost:5173";

      // -----------------------------------------
      // IMPORTANT:
      // No JWT in URL anymore.
      // -----------------------------------------

      return res.redirect(
        `${frontendUrl}/dashboard`
      );
    } catch (error) {
      console.error(
        "Google OAuth callback error:",
        error
      );

      return res.status(500).send(`
        <h2>Google Login Failed</h2>
        <p>Please try again.</p>
      `);
    }
  }
);

export default router;