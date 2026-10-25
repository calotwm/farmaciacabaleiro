import nodemailer from "nodemailer";
import type { EmailMessage, EmailSender } from "../application/ports";

/** Development adapter: prints the message (including reset links) to the server log. */
export class ConsoleEmailSender implements EmailSender {
  async send(message: EmailMessage) {
    console.info(`[email:console] to=${message.to} subject="${message.subject}"\n${message.text}`);
  }
}

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

/** Free-SMTP adapter (e.g. Gmail app password). Enabled only when SMTP_* is configured. */
export class SmtpEmailSender implements EmailSender {
  private readonly transport;

  constructor(private readonly config: SmtpConfig) {
    this.transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: { user: config.user, pass: config.pass },
    });
  }

  async send(message: EmailMessage) {
    await this.transport.sendMail({
      from: this.config.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
  }
}
