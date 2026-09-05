import { Router } from "express";

import { prisma } from "../config/prisma";
import {
  AuthenticatedRequest,
  requireAuth,
} from "../middleware/auth.middleware";

const router = Router();

router.get(
  "/",
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

      let senders =
        await prisma.sender.findMany({
          where: {
            userId,
          },
          orderBy: {
            createdAt: "asc",
          },
        });

      // Create a default Ethereal sender
      // for a newly authenticated user.
      if (senders.length === 0) {
        const smtpUser =
          process.env.SMTP_USER;

        if (!smtpUser) {
          return res.status(500).json({
            success: false,
            message:
              "SMTP_USER is not configured",
          });
        }

        const sender =
          await prisma.sender.upsert({
            where: {
              userId_email: {
                userId,
                email: smtpUser,
              },
            },
            update: {},
            create: {
              userId,
              email: smtpUser,
              name: "Ethereal Sender",
            },
          });

        senders = [sender];
      }

      return res.json({
        success: true,
        senders,
      });
    } catch (error) {
      console.error(
        "Get senders error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to fetch senders",
      });
    }
  }
);

export default router;