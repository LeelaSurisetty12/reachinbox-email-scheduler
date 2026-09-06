import { Router } from "express";

import { prisma } from "../config/prisma";

import {
  indexEmail,
  searchEmails,
  deleteEmailFromIndex,
  deleteEmailsFromIndex,
} from "../services/elasticsearch.service";

import { emailQueue } from "../services/email.queue";

import {
  AuthenticatedRequest,
  requireAuth,
} from "../middleware/auth.middleware";

const router = Router();

// =====================================================
// POST /api/emails/schedule
// =====================================================

router.post(
  "/schedule",
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

      const {
        senderId,
        recipient,
        subject,
        body,
        scheduledAt,
        delayMs,
        hourlyLimit,
      } = req.body;

      // -----------------------------------------------
      // Validate required fields
      // -----------------------------------------------

      if (
        !senderId ||
        !recipient ||
        !subject ||
        !body ||
        !scheduledAt
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Missing required fields",
        });
      }

      // -----------------------------------------------
      // Validate scheduled date
      // -----------------------------------------------

      const scheduledDate =
        new Date(scheduledAt);

      if (
        Number.isNaN(
          scheduledDate.getTime()
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid scheduledAt date",
        });
      }

      // -----------------------------------------------
      // Parse delay
      // -----------------------------------------------

      const parsedDelayMs =
        delayMs !== undefined
          ? Number(delayMs)
          : Number(
              process.env.MIN_DELAY_MS ??
                2000
            );

      if (
        !Number.isInteger(
          parsedDelayMs
        ) ||
        parsedDelayMs < 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "delayMs must be a non-negative integer",
        });
      }

      // -----------------------------------------------
      // Parse hourly limit
      // -----------------------------------------------

      const parsedHourlyLimit =
        hourlyLimit !== undefined
          ? Number(hourlyLimit)
          : Number(
              process.env
                .MAX_EMAILS_PER_HOUR ??
                100
            );

      if (
        !Number.isInteger(
          parsedHourlyLimit
        ) ||
        parsedHourlyLimit <= 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "hourlyLimit must be a positive integer",
        });
      }

      // -----------------------------------------------
      // Verify sender belongs to current user
      // -----------------------------------------------

      const sender =
        await prisma.sender.findFirst({
          where: {
            id: senderId,
            userId,
          },
        });

      if (!sender) {
        return res.status(404).json({
          success: false,
          message:
            "Sender not found",
        });
      }

      // -----------------------------------------------
      // Create PostgreSQL record
      // -----------------------------------------------

      const email =
        await prisma.email.create({
          data: {
            userId,
            senderId,
            recipient,
            subject,
            body,
            scheduledAt:
              scheduledDate,
            delayMs:
              parsedDelayMs,
            hourlyLimit:
              parsedHourlyLimit,
          },
        });

      // -----------------------------------------------
      // Index in Elasticsearch
      // -----------------------------------------------

      try {
        await indexEmail({
          id: email.id,
          userId: email.userId,
          senderId: email.senderId,
          recipient: email.recipient,
          subject: email.subject,
          body: email.body,
          status: email.status,
          scheduledAt:
            email.scheduledAt.toISOString(),
          sentAt: email.sentAt
            ? email.sentAt.toISOString()
            : null,
          createdAt:
            email.createdAt.toISOString(),
          updatedAt:
            email.updatedAt.toISOString(),
        });
      } catch (error) {
        console.error(
          "Failed to index email:",
          error
        );
      }

      // -----------------------------------------------
      // Calculate BullMQ delay
      // -----------------------------------------------

      const delay = Math.max(
        0,
        scheduledDate.getTime() -
          Date.now()
      );

      // -----------------------------------------------
      // Create deterministic BullMQ job
      // -----------------------------------------------

      const job =
  await emailQueue.add(
    "send-email",
    {
      emailId: email.id,
    },
    {
      delay,
      jobId: email.id,

      attempts: 5,

      backoff: {
        type: "exponential",
        delay: 5000,
      },
    }
  );

      // -----------------------------------------------
      // Save BullMQ job ID
      // -----------------------------------------------

      await prisma.email.update({
        where: {
          id: email.id,
        },
        data: {
          bullJobId: job.id,
        },
      });

      return res.status(201).json({
        success: true,
        message:
          "Email scheduled successfully",
        email: {
          id: email.id,
          recipient:
            email.recipient,
          subject:
            email.subject,
          scheduledAt:
            email.scheduledAt,
          status:
            email.status,
          delayMs:
            parsedDelayMs,
          hourlyLimit:
            parsedHourlyLimit,
          bullJobId:
            job.id,
        },
      });
    } catch (error) {
      console.error(
        "Schedule email error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to schedule email",
      });
    }
  }
);
// =====================================================
// POST /api/emails/schedule-bulk
// Schedule many emails in one request
// =====================================================

router.post(
  "/schedule-bulk",
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

      const {
        senderId,
        recipients,
        subject,
        body,
        startTime,
        delayMs,
        hourlyLimit,
      } = req.body;

      // ---------------------------------------------
      // Validation
      // ---------------------------------------------

      if (!senderId) {
        return res.status(400).json({
          success: false,
          message: "senderId is required",
        });
      }

      if (
        !Array.isArray(recipients) ||
        recipients.length === 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "recipients must contain at least one email",
        });
      }

      if (recipients.length > 5000) {
        return res.status(400).json({
          success: false,
          message:
            "Maximum 5000 recipients per request",
        });
      }

      if (
        typeof subject !== "string" ||
        !subject.trim()
      ) {
        return res.status(400).json({
          success: false,
          message: "subject is required",
        });
      }

      if (
        typeof body !== "string" ||
        !body.trim()
      ) {
        return res.status(400).json({
          success: false,
          message: "body is required",
        });
      }

      // ---------------------------------------------
      // Validate sender
      // ---------------------------------------------

      const sender =
        await prisma.sender.findFirst({
          where: {
            id: senderId,
            userId,
          },
        });

      if (!sender) {
        return res.status(404).json({
          success: false,
          message: "Sender not found",
        });
      }

      // ---------------------------------------------
      // Parse scheduling settings
      // ---------------------------------------------

      const parsedDelayMs =
        delayMs !== undefined
          ? Number(delayMs)
          : Number(
              process.env.MIN_DELAY_MS ?? 2000
            );

      const parsedHourlyLimit =
        hourlyLimit !== undefined
          ? Number(hourlyLimit)
          : Number(
              process.env.MAX_EMAILS_PER_HOUR ??
                100
            );

      if (
        !Number.isInteger(
          parsedDelayMs
        ) ||
        parsedDelayMs < 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "delayMs must be a non-negative integer",
        });
      }

      if (
        !Number.isInteger(
          parsedHourlyLimit
        ) ||
        parsedHourlyLimit <= 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "hourlyLimit must be a positive integer",
        });
      }

      // ---------------------------------------------
      // Validate start time
      // ---------------------------------------------

      const startDate =
        new Date(startTime);

      if (
        Number.isNaN(
          startDate.getTime()
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid startTime",
        });
      }

      if (
        startDate.getTime() <
        Date.now()
      ) {
        return res.status(400).json({
          success: false,
          message:
            "startTime must be in the future",
        });
      }

      // ---------------------------------------------
      // Clean + deduplicate recipients
      // ---------------------------------------------

      const uniqueRecipients =
        Array.from(
          new Set(
            recipients
              .filter(
                (value): value is string =>
                  typeof value ===
                  "string"
              )
              .map((email: string) =>
                email
                  .trim()
                  .toLowerCase()
              )
              .filter(Boolean)
          )
        );

      if (
        uniqueRecipients.length ===
        0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "No valid recipients found",
        });
      }

      // ---------------------------------------------
      // Basic email validation
      // ---------------------------------------------

      const emailRegex =
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      const invalidEmails =
        uniqueRecipients.filter(
          (email) =>
            !emailRegex.test(email)
        );

      if (
        invalidEmails.length > 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "One or more invalid email addresses found",
          invalidEmails:
            invalidEmails.slice(0, 20),
        });
      }

      // ---------------------------------------------
      // Generate records
      // ---------------------------------------------

      const emailRecords =
        uniqueRecipients.map(
          (
            recipient,
            index
          ) => {
            const id =
              crypto.randomUUID();

            const scheduledAt =
              new Date(
                startDate.getTime() +
                  index *
                    parsedDelayMs
              );

            return {
              id,
              userId,
              senderId,
              recipient,
              subject:
                subject.trim(),
              body: body.trim(),
              scheduledAt,
              delayMs:
                parsedDelayMs,
              hourlyLimit:
                parsedHourlyLimit,
              status:
                "SCHEDULED" as const,
              bullJobId: id,
            };
          }
        );

      // ---------------------------------------------
      // Save all emails in one DB operation
      // ---------------------------------------------

      await prisma.email.createMany({
        data: emailRecords,
      });

      // ---------------------------------------------
      // Create BullMQ jobs in bulk
      // ---------------------------------------------

      const jobs =
        await emailQueue.addBulk(
          emailRecords.map(
            (email) => ({
              name: "send-email",
              data: {
                emailId: email.id,
              },
              opts: {
  delay: Math.max(
    0,
    email.scheduledAt.getTime() -
      Date.now()
  ),

  jobId: email.id,

  attempts: 5,

  backoff: {
    type: "exponential",
    delay: 5000,
  },
},
            })
          )
        );

      // ---------------------------------------------
      // Index all emails
      // ---------------------------------------------

      try {
        await Promise.all(
          emailRecords.map(
            (email) =>
              indexEmail({
                id: email.id,
                userId:
                  email.userId,
                senderId:
                  email.senderId,
                recipient:
                  email.recipient,
                subject:
                  email.subject,
                body:
                  email.body,
                status:
                  email.status,
                scheduledAt:
                  email.scheduledAt.toISOString(),
                sentAt: null,
                createdAt:
                  new Date().toISOString(),
                updatedAt:
                  new Date().toISOString(),
              })
          )
        );
      } catch (error) {
        console.error(
          "Bulk Elasticsearch indexing error:",
          error
        );
      }

      return res.status(201).json({
        success: true,
        message:
          "Emails scheduled successfully",
        count:
          emailRecords.length,
        jobsCreated:
          jobs.length,
        firstScheduledAt:
          emailRecords[0]
            .scheduledAt,
        lastScheduledAt:
          emailRecords[
            emailRecords.length - 1
          ].scheduledAt,
        delayMs:
          parsedDelayMs,
        hourlyLimit:
          parsedHourlyLimit,
      });
    } catch (error) {
      console.error(
        "Bulk schedule error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to schedule emails",
      });
    }
  }
);

// =====================================================
// GET /api/emails/scheduled
// =====================================================

router.get(
  "/scheduled",
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

      const emails =
        await prisma.email.findMany({
          where: {
            userId,
            status: {
              in: [
                "SCHEDULED",
                "PROCESSING",
              ],
            },
          },
          orderBy: {
            scheduledAt: "asc",
          },
          select: {
            id: true,
            recipient: true,
            subject: true,
            scheduledAt: true,
            status: true,
            createdAt: true,
            delayMs: true,
            hourlyLimit: true,
          },
        });

      return res.json({
        success: true,
        count: emails.length,
        emails,
      });
    } catch (error) {
      console.error(
        "Get scheduled emails error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to fetch scheduled emails",
      });
    }
  }
);

// =====================================================
// GET /api/emails/sent
// =====================================================

router.get(
  "/sent",
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

      const emails =
        await prisma.email.findMany({
          where: {
            userId,
            status: {
              in: [
                "SENT",
                "FAILED",
              ],
            },
          },
          orderBy: {
            sentAt: "desc",
          },
          select: {
            id: true,
            recipient: true,
            subject: true,
            sentAt: true,
            status: true,
            createdAt: true,
          },
        });

      return res.json({
        success: true,
        count: emails.length,
        emails,
      });
    } catch (error) {
      console.error(
        "Get sent emails error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to fetch sent emails",
      });
    }
  }
);

// =====================================================
// GET /api/emails/search
// =====================================================

router.get(
  "/search",
  requireAuth,
  async (
    req: AuthenticatedRequest,
    res
  ) => {
    try {
      const userId = req.userId;
      const query = req.query.q;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message:
            "Authentication required",
        });
      }

      if (
        typeof query !== "string" ||
        !query.trim()
      ) {
        return res.status(400).json({
          success: false,
          message:
            "q is required",
        });
      }

      const emails =
        await searchEmails(
          userId,
          query.trim()
        );

      return res.json({
        success: true,
        count: emails.length,
        emails,
      });
    } catch (error) {
      console.error(
        "Email search error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to search emails",
      });
    }
  }
);
// =====================================================
// DELETE /api/emails/:id
// Delete an email owned by the authenticated user
// =====================================================

router.delete(
  "/:id",
  requireAuth,
  async (
    req: AuthenticatedRequest,
    res
  ) => {
    try {
      const userId = req.userId;
      const emailId = req.params.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message:
            "Authentication required",
        });
      }

      if (typeof emailId !== "string" || !emailId) {
        return res.status(400).json({
          success: false,
          message:
            "Email id is required",
        });
      }

      // ---------------------------------------------
      // Make sure the email belongs to this user
      // ---------------------------------------------

      const email =
        await prisma.email.findFirst({
          where: {
            id: emailId,
            userId,
          },
        });

      if (!email) {
        return res.status(404).json({
          success: false,
          message:
            "Email not found",
        });
      }

      // ---------------------------------------------
      // Remove BullMQ job if one exists
      // ---------------------------------------------

      if (email.bullJobId) {
        try {
          const job =
            await emailQueue.getJob(
              email.bullJobId
            );

          if (job) {
            const state =
              await job.getState();

            // A scheduled/waiting/delayed job
            // can be safely removed.
            if (
              state === "waiting" ||
              state === "delayed"
            ) {
              await job.remove();

              console.log(
                `Deleted BullMQ job ${email.bullJobId}`
              );
            }
          }
        } catch (error) {
          console.error(
            "Failed to remove BullMQ job:",
            error
          );
        }
      }

      // ---------------------------------------------
      // Delete database record
      // ---------------------------------------------

      await prisma.email.delete({
        where: {
          id: emailId,
        },
      });
      try {
  await deleteEmailFromIndex(
    emailId
  );
} catch (error) {
  console.error(
    "Failed to delete email from Elasticsearch:",
    error
  );
}

      return res.json({
        success: true,
        message:
          "Email deleted successfully",
        emailId,
      });
    } catch (error) {
      console.error(
        "Delete email error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to delete email",
      });
    }
  }
);
// =====================================================
// POST /api/emails/bulk-delete
// Delete multiple emails owned by authenticated user
// =====================================================

router.post(
  "/bulk-delete",
  requireAuth,
  async (
    req: AuthenticatedRequest,
    res
  ) => {
    try {
      const userId =
        req.userId;

      const {
        emailIds,
      } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message:
            "Authentication required",
        });
      }

      if (
        !Array.isArray(emailIds) ||
        emailIds.length === 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "emailIds must contain at least one email id",
        });
      }

      if (
        emailIds.length > 5000
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Maximum 5000 emails can be deleted at once",
        });
      }

      // ---------------------------------------------
      // Find only emails belonging to current user
      // ---------------------------------------------

      const emails =
        await prisma.email.findMany({
          where: {
            id: {
              in: emailIds,
            },
            userId,
          },

          select: {
            id: true,
            bullJobId: true,
          },
        });

      if (
        emails.length === 0
      ) {
        return res.status(404).json({
          success: false,
          message:
            "No matching emails found",
        });
      }

      // ---------------------------------------------
      // Remove queue jobs
      // ---------------------------------------------

      await Promise.all(
        emails.map(
          async (email) => {
            if (
              !email.bullJobId
            ) {
              return;
            }

            try {
              const job =
                await emailQueue.getJob(
                  email.bullJobId
                );

              if (!job) {
                return;
              }

              const state =
                await job.getState();

              if (
                state ===
                  "waiting" ||
                state ===
                  "delayed"
              ) {
                await job.remove();
              }
            } catch (error) {
              console.error(
                `Failed to remove BullMQ job for email ${email.id}:`,
                error
              );
            }
          }
        )
      );

      // ---------------------------------------------
      // Delete database records
      // ---------------------------------------------

      const result =
        await prisma.email.deleteMany({
          where: {
            id: {
              in: emails.map(
                (email) =>
                  email.id
              ),
            },
            userId,
          },
        });
        try {
  await deleteEmailsFromIndex(
    emails.map(
      (email) =>
        email.id
    )
  );
} catch (error) {
  console.error(
    "Failed to delete emails from Elasticsearch:",
    error
  );
}

      return res.json({
        success: true,
        message:
          "Emails deleted successfully",
        deletedCount:
          result.count,
      });
    } catch (error) {
      console.error(
        "Bulk delete error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to delete emails",
      });
    }
  }
);

export default router;