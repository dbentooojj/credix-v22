import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../config/env";

let cachedTransporter: Transporter | null = null;

export function getSmtpConfigError(): string | null {
  if (!env.SMTP_HOST) return "SMTP_HOST nao configurado";
  if (!env.SMTP_FROM) return "SMTP_FROM nao configurado";
  if ((env.SMTP_USER && !env.SMTP_PASS) || (!env.SMTP_USER && env.SMTP_PASS)) {
    return "Defina SMTP_USER e SMTP_PASS juntos, ou deixe ambos vazios";
  }
  return null;
}

export function isEmailServiceConfigured(): boolean {
  return getSmtpConfigError() === null;
}

function getTransporter(): Transporter {
  if (cachedTransporter) return cachedTransporter;

  const configError = getSmtpConfigError();
  if (configError) {
    throw new Error(configError);
  }

  cachedTransporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER && env.SMTP_PASS
      ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
      : undefined,
  });

  return cachedTransporter;
}

type SendEmailInput = {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  from?: string;
  attachments?: Array<{
    filename: string;
    content: string | Buffer;
    contentType?: string;
  }>;
};

export async function sendEmail(input: SendEmailInput): Promise<void> {
  const transporter = getTransporter();
  const recipients = Array.isArray(input.to) ? input.to.join(",") : input.to;

  await transporter.sendMail({
    from: input.from || env.SMTP_FROM,
    to: recipients,
    subject: input.subject,
    text: input.text,
    html: input.html,
    attachments: input.attachments,
  });
}
