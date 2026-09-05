import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.upsert({
    where: {
      email: "test@reachinbox.local",
    },
    update: {},
    create: {
      name: "Test User",
      email: "test@reachinbox.local",
    },
  });

  const sender = await prisma.sender.upsert({
    where: {
      userId_email: {
        userId: user.id,
        email: process.env.SMTP_USER || "test@ethereal.email",
      },
    },
    update: {},
    create: {
      userId: user.id,
      email: process.env.SMTP_USER || "test@ethereal.email",
      name: "Test Sender",
    },
  });

  console.log("\nTest data created successfully!\n");
  console.log("USER_ID =", user.id);
  console.log("SENDER_ID =", sender.id);
  console.log("SENDER_EMAIL =", sender.email);
}

main()
  .catch((error) => {
    console.error("Error creating test data:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });