import { Router } from "express";
import { emailQueue } from "../services/email.queue";

const router = Router();

router.post("/test-email", async (_req, res) => {
  try {
    const job = await emailQueue.add(
      "test-email",
      {
        recipient: "elaina.cremin@ethereal.email",
        subject: "ReachInbox Test Email",
        body: "Hello! This is a test email from the ReachInbox scheduler.",
      },
      {
        delay: 5000,
      }
    );

    res.json({
      success: true,
      jobId: job.id,
      message: "Test email scheduled",
    });
  } catch (error) {
    console.error("Failed to schedule test email:", error);

    res.status(500).json({
      success: false,
      message: "Failed to schedule test email",
    });
  }
});

export default router;