import nodemailer, { Transporter } from "nodemailer";

export interface EtherealCredentials {
  etherealEmail: string;
  etherealPass: string;
  etherealSmtpHost: string;
  etherealSmtpPort: number;
}

// Cache one transporter per sender so we don't re-authenticate with
// Ethereal on every single send.
const transporterCache = new Map<string, Transporter>();

function getTransporter(senderId: string, creds: EtherealCredentials): Transporter {
  const cached = transporterCache.get(senderId);
  if (cached) return cached;

  const transporter = nodemailer.createTransport({
    host: creds.etherealSmtpHost,
    port: creds.etherealSmtpPort,
    secure: false,
    auth: {
      user: creds.etherealEmail,
      pass: creds.etherealPass,
    },
  });

  transporterCache.set(senderId, transporter);
  return transporter;
}

export interface SendEmailInput {
  senderId: string;
  credentials: EtherealCredentials;
  to: string;
  subject: string;
  html: string;
}

export interface SendEmailResult {
  messageId: string;
  previewUrl: string | false;
}

export async function sendEmailViaEthereal(
  input: SendEmailInput
): Promise<SendEmailResult> {
  const transporter = getTransporter(input.senderId, input.credentials);

  const info = await transporter.sendMail({
    from: input.credentials.etherealEmail,
    to: input.to,
    subject: input.subject,
    html: input.html,
  });

  return {
    messageId: info.messageId,
    previewUrl: nodemailer.getTestMessageUrl(info),
  };
}

/**
 * Creates a brand-new Ethereal test account. Used when a user adds a new
 * "sender" identity from the dashboard so each sender gets its own real,
 * inspectable mailbox instead of everyone sharing one Ethereal account.
 */
export async function createEtherealAccount(): Promise<EtherealCredentials> {
  const account = await nodemailer.createTestAccount();
  return {
    etherealEmail: account.user,
    etherealPass: account.pass,
    etherealSmtpHost: account.smtp.host,
    etherealSmtpPort: account.smtp.port,
  };
}
