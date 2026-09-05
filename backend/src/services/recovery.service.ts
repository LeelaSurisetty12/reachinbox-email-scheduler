import { prisma } from "../config/prisma";
import { emailQueue } from "./email.queue";

type RecoverableEmail = {
  id: string;
  bullJobId: string | null;
  scheduledAt: Date;
  status: "SCHEDULED" | "PROCESSING";
};

async function ensureBullMQJob(
  email: RecoverableEmail
): Promise<boolean> {
  const jobId =
    email.bullJobId || email.id;

  const existingJob =
    await emailQueue.getJob(jobId);

  // ---------------------------------------------
  // Job already exists
  // ---------------------------------------------

  if (existingJob) {
    const state =
      await existingJob.getState();

    if (
      state === "waiting" ||
      state === "delayed" ||
      state === "active"
    ) {
      return true;
    }

    /*
     * A completed job should not be recreated.
     * The database should normally already be SENT.
     */
    if (state === "completed") {
      console.log(
        `Recovery: job ${jobId} is completed for email ${email.id}.`
      );

      return true;
    }

    /*
     * A failed job is left alone here.
     * The worker is responsible for updating
     * the email status to FAILED.
     */
    if (state === "failed") {
      console.log(
        `Recovery: job ${jobId} is failed for email ${email.id}.`
      );

      return true;
    }
  }

  // ---------------------------------------------
  // Job doesn't exist
  // ---------------------------------------------

  const delay = Math.max(
    0,
    email.scheduledAt.getTime() -
      Date.now()
  );

  try {
    const job =
      await emailQueue.add(
        "send-email",
        {
          emailId: email.id,
        },
        {
          delay,
          jobId: jobId,
        }
      );

    // Store the deterministic job ID
    await prisma.email.update({
      where: {
        id: email.id,
      },
      data: {
        bullJobId: job.id,
        status: "SCHEDULED",
      },
    });

    console.log(
      `Recovery: re-enqueued email ${email.id}`
    );

    return true;
  } catch (error) {
    console.error(
      `Recovery: failed to re-enqueue email ${email.id}:`,
      error
    );

    return false;
  }
}

// =====================================================
// Reconcile scheduled emails
// =====================================================

export async function reconcileScheduledEmails(): Promise<void> {
  console.log(
    "Checking scheduled emails for missing BullMQ jobs..."
  );

  const emails =
    await prisma.email.findMany({
      where: {
        status: "SCHEDULED",
      },

      select: {
        id: true,
        bullJobId: true,
        scheduledAt: true,
        status: true,
      },

      orderBy: {
        scheduledAt: "asc",
      },
    });

  if (emails.length === 0) {
    console.log(
      "No scheduled emails need reconciliation."
    );

    return;
  }

  console.log(
    `Checking ${emails.length} scheduled email(s)...`
  );

  let missingJobs = 0;
  let recreatedJobs = 0;

  for (const email of emails) {
    const jobId =
      email.bullJobId ||
      email.id;

    const existingJob =
      await emailQueue.getJob(
        jobId
      );

    if (existingJob) {
      const state =
        await existingJob.getState();

      if (
        state === "waiting" ||
        state === "delayed" ||
        state === "active"
      ) {
        continue;
      }

      if (
        state === "completed" ||
        state === "failed"
      ) {
        console.log(
          `Recovery: email ${email.id} has a ${state} BullMQ job.`
        );

        continue;
      }
    }

    missingJobs++;

    const success =
      await ensureBullMQJob(
        email
      );

    if (success) {
      recreatedJobs++;
    }
  }

  console.log(
    `Scheduled reconciliation finished. Missing jobs: ${missingJobs}, recreated: ${recreatedJobs}.`
  );
}

// =====================================================
// Recover interrupted PROCESSING emails
// =====================================================

export async function recoverProcessingEmails(): Promise<void> {
  console.log(
    "Checking for interrupted email jobs..."
  );

  const processingEmails =
    await prisma.email.findMany({
      where: {
        status: "PROCESSING",
      },

      select: {
        id: true,
        bullJobId: true,
        scheduledAt: true,
        status: true,
      },
    });

  if (
    processingEmails.length ===
    0
  ) {
    console.log(
      "No interrupted emails found."
    );

    return;
  }

  console.log(
    `Found ${processingEmails.length} interrupted email(s).`
  );

  for (
    const email of processingEmails
  ) {
    try {
      const jobId =
        email.bullJobId ||
        email.id;

      const existingJob =
        await emailQueue.getJob(
          jobId
        );

      // -------------------------------------------
      // Original job still exists
      // -------------------------------------------

      if (existingJob) {
        const state =
          await existingJob.getState();

        if (
          state === "waiting" ||
          state === "delayed" ||
          state === "active"
        ) {
          console.log(
            `Recovery: job ${jobId} still exists with state ${state}.`
          );

          continue;
        }

        if (
          state === "completed"
        ) {
          console.log(
            `Recovery: job ${jobId} completed while email ${email.id} is still PROCESSING.`
          );

          continue;
        }

        if (
          state === "failed"
        ) {
          console.log(
            `Recovery: job ${jobId} failed while email ${email.id} is still PROCESSING.`
          );

          continue;
        }
      }

      // -------------------------------------------
      // Original job is missing
      // -------------------------------------------

      await prisma.email.update({
        where: {
          id: email.id,
        },

        data: {
          status: "SCHEDULED",
        },
      });

      await ensureBullMQJob({
        id: email.id,
        bullJobId:
          email.bullJobId,
        scheduledAt:
          email.scheduledAt,
        status: "SCHEDULED",
      });
    } catch (error) {
      console.error(
        `Recovery: failed for email ${email.id}:`,
        error
      );
    }
  }

  console.log(
    "Interrupted-email recovery completed."
  );
}