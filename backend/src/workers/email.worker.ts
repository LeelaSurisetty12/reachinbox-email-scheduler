import "dotenv/config";

import {
  DelayedError,
  Job,
  Worker,
} from "bullmq";

import nodemailer from "nodemailer";

import { prisma } from "../config/prisma";
import { redisConnection } from "../config/redis";

import { sendEmail } from "../services/email.service";

import {
  reserveSendSlot,
} from "../services/rate-limit.service";

import {
  indexEmail,
} from "../services/elasticsearch.service";

import {
  notifyRateLimitReached,
} from "../services/slack.service";

// =====================================================
// Configuration
// =====================================================

const workerConcurrency = Number(
  process.env.WORKER_CONCURRENCY ?? 1
);

// =====================================================
// Worker
// =====================================================

const worker = new Worker(
  "email-queue",

  async (job: Job) => {
    const {
      emailId,
    } = job.data;

    console.log(
      `Processing email: ${emailId}`
    );

    // -----------------------------------------------
    // 1. Find email
    // -----------------------------------------------

    const email =
      await prisma.email.findUnique({
        where: {
          id: emailId,
        },
      });

    if (!email) {
      throw new Error(
        `Email ${emailId} not found`
      );
    }

    // -----------------------------------------------
    // 2. Idempotency
    // -----------------------------------------------

    if (
      email.status === "SENT"
    ) {
      console.log(
        `Email ${emailId} is already sent. Skipping.`
      );

      return {
        success: true,
        skipped: true,
        reason: "already_sent",
      };
    }

    // -----------------------------------------------
    // 3. Claim email atomically
    // -----------------------------------------------

    const claimed =
      await prisma.email.updateMany({
        where: {
          id: emailId,
          status: "SCHEDULED",
        },

        data: {
          status: "PROCESSING",
        },
      });

    if (
      claimed.count === 0
    ) {
      console.log(
        `Email ${emailId} was already claimed.`
      );

      return {
        success: true,
        skipped: true,
        reason: "already_claimed",
      };
    }

    // -----------------------------------------------
    // 4. Configuration
    // -----------------------------------------------

    const minDelayMs =
      Math.max(
        0,
        Number(
          process.env.MIN_DELAY_MS ??
            2000
        )
      );

    const hourlyLimit =
      Math.max(
        1,
        Number(
          process.env
            .MAX_EMAILS_PER_HOUR ??
            100
        )
      );

    // -----------------------------------------------
    // 5. Reserve send slot
    // -----------------------------------------------

    const slot =
      await reserveSendSlot(
        email.senderId,
        hourlyLimit,
        minDelayMs
      );

    // -----------------------------------------------
    // Slack notification
    // -----------------------------------------------

    if (
      slot.limitReached
    ) {
      try {
        const sender =
          await prisma.sender.findUnique({
            where: {
              id: email.senderId,
            },

            select: {
              email: true,
            },
          });

        if (sender) {
          await notifyRateLimitReached(
            email.userId,
            sender.email,
            hourlyLimit,
            slot.count
          );
        }
      } catch (error) {
        // Slack notification failure must
        // never stop the email worker.
        console.error(
          "Failed to send Slack rate-limit notification:",
          error
        );
      }
    }

    // -----------------------------------------------
    // 6. Rate limit / minimum delay
    // -----------------------------------------------

    if (
      !slot.allowed
    ) {
      await prisma.email.update({
        where: {
          id: emailId,
        },

        data: {
          status: "SCHEDULED",
        },
      });

      const delayMs =
        Math.max(
          slot.waitMs,
          minDelayMs
        );

      console.log(
        `Email ${emailId} delayed for ${delayMs}ms`
      );

      await job.moveToDelayed(
        Date.now() + delayMs,
        job.token
      );

      throw new DelayedError();
    }

    // -----------------------------------------------
    // 7. Send email
    // -----------------------------------------------

    try {
      await prisma.email.update({
        where: {
          id: emailId,
        },

        data: {
          attempts: {
            increment: 1,
          },
        },
      });

      console.log(
        `Sending email to ${email.recipient}...`
      );

      const info =
        await sendEmail(
          email.recipient,
          email.subject,
          email.body
        );

      // ---------------------------------------------
      // 8. Preview URL
      // ---------------------------------------------

      const previewUrl =
        nodemailer.getTestMessageUrl(
          info
        );

      // ---------------------------------------------
      // 9. Mark SENT
      // ---------------------------------------------

      const updatedEmail =
        await prisma.email.update({
          where: {
            id: emailId,
          },

          data: {
            status: "SENT",
            sentAt: new Date(),
            messageId:
              info.messageId,
          },
        });

      // ---------------------------------------------
      // 10. Update Elasticsearch
      // ---------------------------------------------

      try {
        await indexEmail({
          id: updatedEmail.id,
          userId:
            updatedEmail.userId,
          senderId:
            updatedEmail.senderId,
          recipient:
            updatedEmail.recipient,
          subject:
            updatedEmail.subject,
          body:
            updatedEmail.body,
          status:
            updatedEmail.status,

          scheduledAt:
            updatedEmail.scheduledAt.toISOString(),

          sentAt:
            updatedEmail.sentAt
              ? updatedEmail.sentAt.toISOString()
              : null,

          createdAt:
            updatedEmail.createdAt.toISOString(),

          updatedAt:
            updatedEmail.updatedAt.toISOString(),
        });
      } catch (error) {
        console.error(
          "Failed to update email in Elasticsearch:",
          error
        );
      }

      // ---------------------------------------------
      // 11. Logging
      // ---------------------------------------------

      console.log(
        `Email ${emailId} sent successfully`
      );

      console.log(
        `Recipient: ${email.recipient}`
      );

      console.log(
        `Message ID: ${info.messageId}`
      );

      if (previewUrl) {
        console.log(
          `Preview URL: ${previewUrl}`
        );
      }

      return {
        success: true,
        messageId:
          info.messageId,
        previewUrl,
      };
    } catch (error) {
      // ---------------------------------------------
      // 12. Retry handling
      // ---------------------------------------------

      const maxAttempts =
        Number(
          job.opts.attempts ?? 1
        );

      const currentAttempt =
        job.attemptsMade + 1;

      const isLastAttempt =
        currentAttempt >=
        maxAttempts;

      if (
        isLastAttempt
      ) {
        await prisma.email.update({
          where: {
            id: emailId,
          },

          data: {
            status: "FAILED",
          },
        });

        console.error(
          `Email ${emailId} permanently failed after ${currentAttempt} attempt(s):`,
          error
        );
      } else {
        // Let BullMQ retry it.
        await prisma.email.update({
          where: {
            id: emailId,
          },

          data: {
            status: "SCHEDULED",
          },
        });

        console.error(
          `Email ${emailId} failed on attempt ${currentAttempt}/${maxAttempts}. Retrying...`,
          error
        );
      }

      throw error;
    }
  },

  {
    connection:
      redisConnection,

    // Strict sequential sending for one sender.
    concurrency:
      workerConcurrency,
  }
);

// =====================================================
// Worker events
// =====================================================

worker.on(
  "completed",
  (job) => {
    console.log(
      `Job ${job.id} completed successfully`
    );
  }
);

worker.on(
  "failed",
  (job, error) => {
    console.error(
      `Job ${job?.id} failed:`,
      error.message
    );
  }
);

worker.on(
  "error",
  (error) => {
    console.error(
      "Worker error:",
      error
    );
  }
);

worker.on(
  "stalled",
  (jobId) => {
    console.warn(
      `Job ${jobId} stalled`
    );
  }
);

console.log(
  `Email worker started with concurrency ${workerConcurrency}`
);