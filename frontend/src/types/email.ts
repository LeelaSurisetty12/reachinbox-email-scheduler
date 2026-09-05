export type EmailStatus =
  | "SCHEDULED"
  | "PROCESSING"
  | "SENT"
  | "FAILED";

export interface Email {
  id: string;
  recipient: string;
  subject: string;
  body?: string;
  scheduledAt?: string;
  sentAt?: string | null;
  status: EmailStatus;
  delayMs?: number;
  hourlyLimit?: number;
}

export interface ScheduleEmailRequest {
  userId: string;
  senderId: string;
  recipient: string;
  subject: string;
  body: string;
  scheduledAt: string;
  delayMs: number;
  hourlyLimit: number;
}