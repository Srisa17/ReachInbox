export interface AppUser {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
}

export type EmailStatus = "PENDING" | "QUEUED" | "RESCHEDULED" | "SENT" | "FAILED";

export interface SenderSummary {
  id: string;
  label: string;
  etherealEmail: string;
}

export interface ScheduledEmailItem {
  id: string;
  toEmail: string;
  subject: string;
  scheduledFor: string;
  status: EmailStatus;
  sender: SenderSummary;
}

export interface SentEmailItem {
  id: string;
  toEmail: string;
  subject: string;
  sentAt: string | null;
  status: EmailStatus;
  errorMessage: string | null;
  sender: SenderSummary;
}

export interface Sender {
  id: string;
  label: string;
  etherealEmail: string;
  maxEmailsPerHour: number;
  minDelayMs: number;
}
