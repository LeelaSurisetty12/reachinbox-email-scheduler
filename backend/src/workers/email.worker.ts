import "dotenv/config";
import { DelayedError, Job, Worker } from "bullmq";
import nodemailer from "nodemailer";

import { prisma } from "../config/prisma";
import { redisConnection } from "../config/redis";
import { sendEmail } from "../services/email.service";
import { reserveSendSlot } from "../services/rate-limit.service";
import { indexEmail } from "../services/elasticsearch.service";
import { notifyRateLimitReached } from "../services/slack.service";
const worker = new Worker(
  "email-queue",

  async (job: Job) => {
    const { emailId } = job.data;

    console.log(`Processing email: ${emailId}`);

    // --------------------------------
    // 1. Find email in PostgreSQL
    // --------------------------------
    const email = await prisma.email.findUnique({
      where: {
        id: emailId,
      },
    });

    if (!email) {
      throw new Error(`Email ${emailId} not found`);
    }

    // --------------------------------
    // 2. Idempotency check
    // --------------------------------
    if (email.status === "SENT") {
      console.log(
        `Email ${emailId} is already sent. Skipping.`
      );

      return {
        success: true,
        skipped: true,
        reason: "already_sent",
      };
    }

    // --------------------------------
    // 3. Atomically claim the email
    // --------------------------------
    const claimed = await prisma.email.updateMany({
      where: {
        id: emailId,
        status: "SCHEDULED",
      },

      data: {
        status: "PROCESSING",
      },
    });

    // Another worker may have already claimed it
    if (claimed.count === 0) {
      console.log(
        `Email ${emailId} was already claimed by another worker.`
      );

      return {
        success: true,
        skipped: true,
        reason: "already_claimed",
      };
    }

    // --------------------------------
    // 4. Get rate-limit configuration
    // --------------------------------
    const minDelayMs = Math.max(
      0,
      email.delayMs ??
        Number(process.env.MIN_DELAY_MS ?? 2000)
    );

    const hourlyLimit = Math.max(
      1,
      email.hourlyLimit ??
        Number(process.env.MAX_EMAILS_PER_HOUR ?? 100)
    );

    // --------------------------------
    // 5. Reserve a Redis send slot
    // --------------------------------
    const slot = await reserveSendSlot(
      email.senderId,
      hourlyLimit,
      minDelayMs
    );
    if (slot.limitReached) {
  try {
    const sender = await prisma.sender.findUnique({
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
    // Slack failure must not crash the email worker
    console.error(
      "Failed to send Slack rate-limit notification:",
      error
    );
  }
}

    // --------------------------------
    // 6. Rate limit / minimum delay hit
    // --------------------------------
    if (!slot.allowed) {
      // Return email to scheduled state
      await prisma.email.update({
        where: {
          id: emailId,
        },

        data: {
          status: "SCHEDULED",
        },
      });

      const delayMs = Math.max(
        slot.waitMs,
        minDelayMs
      );

      console.log(
        `Email ${emailId} delayed for ${delayMs}ms`
      );

      // Move the same BullMQ job back to delayed state
      await job.moveToDelayed(
        Date.now() + delayMs,
        job.token
      );

      // Tell BullMQ this job was deliberately delayed
      throw new DelayedError();
    }

    // --------------------------------
    // 7. Send the email
    // --------------------------------
    try {
      // Count the actual sending attempt
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

      const info = await sendEmail(
        email.recipient,
        email.subject,
        email.body
      );

      // --------------------------------
      // 8. Get Ethereal preview URL
      // --------------------------------
      const previewUrl =
        nodemailer.getTestMessageUrl(info);

      // --------------------------------
      // 9. Update email as SENT
      // --------------------------------
      const updatedEmail = await prisma.email.update({
        where: {
          id: emailId,
      },
      data: {
        status: "SENT",
        sentAt: new Date(),
        messageId: info.messageId,
     },
  });
  try {
  await indexEmail({
    id: updatedEmail.id,
    userId: updatedEmail.userId,
    senderId: updatedEmail.senderId,
    recipient: updatedEmail.recipient,
    subject: updatedEmail.subject,
    body: updatedEmail.body,
    status: updatedEmail.status,
    scheduledAt:
      updatedEmail.scheduledAt.toISOString(),
    sentAt: updatedEmail.sentAt
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

      console.log(
        `Email ${emailId} sent successfully`
      );

      console.log(
        `Recipient: ${email.recipient}`
      );

      console.log(
        `Message ID: ${info.messageId}`
      );

      console.log(
        `Preview URL: ${previewUrl}`
      );

      return {
        success: true,
        messageId: info.messageId,
        previewUrl,
      };
    } catch (error) {
      // --------------------------------
      // 10. Mark email as FAILED
      // --------------------------------
      await prisma.email.update({
        where: {
          id: emailId,
        },

        data: {
          status: "FAILED",
        },
      });

      console.error(
        `Email ${emailId} failed:`,
        error
      );

      throw error;
    }
  },

  {
    connection: redisConnection,

    // Configurable concurrency
    concurrency: Number(
      process.env.WORKER_CONCURRENCY ?? 5
    ),
  }
);

// --------------------------------
// Worker events
// --------------------------------

worker.on("completed", (job) => {
  console.log(
    `Job ${job.id} completed successfully`
  );
});

worker.on("failed", (job, error) => {
  console.error(
    `Job ${job?.id} failed:`,
    error.message
  );
});

worker.on("error", (error) => {
  console.error(
    "Worker error:",
    error
  );
});

console.log(
  `Email worker started with concurrency ${Number(
    process.env.WORKER_CONCURRENCY ?? 5
  )}`
);