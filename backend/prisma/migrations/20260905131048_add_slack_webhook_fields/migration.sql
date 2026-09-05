/*
  Warnings:

  - Added the required column `webhookUrl` to the `SlackConnection` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "SlackConnection" ADD COLUMN     "channelId" TEXT,
ADD COLUMN     "channelName" TEXT,
ADD COLUMN     "teamName" TEXT,
ADD COLUMN     "webhookUrl" TEXT NOT NULL,
ALTER COLUMN "accessToken" DROP NOT NULL;
