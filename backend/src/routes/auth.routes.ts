import {
  Router,
} from "express";

import {
  AuthenticatedRequest,
  requireAuth,
} from "../middleware/auth.middleware";

import { prisma } from "../config/prisma";

const router = Router();

const COOKIE_NAME =
  "reachinbox_token";

// =====================================================
// GET /api/auth/me
// =====================================================

router.get(
  "/me",
  requireAuth,
  async (
    req: AuthenticatedRequest,
    res
  ) => {
    try {
      const userId =
        req.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message:
            "Authentication required",
        });
      }

      const user =
        await prisma.user.findUnique({
          where: {
            id: userId,
          },

          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        });

      if (!user) {
        return res.status(404).json({
          success: false,
          message:
            "User not found",
        });
      }

      return res.json({
        success: true,
        user,
      });
    } catch (error) {
      console.error(
        "Get current user error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to get user",
      });
    }
  }
);

// =====================================================
// POST /api/auth/logout
// =====================================================

router.post(
  "/logout",
  (_req, res) => {
    res.clearCookie(
      COOKIE_NAME,
      {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        path: "/",
      }
    );

    return res.json({
      success: true,
      message:
        "Logged out successfully",
    });
  }
);

export default router;