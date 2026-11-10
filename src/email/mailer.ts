import { Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Delivers one email. Implementations throw on failure; the outbox retries.
 * New providers (Resend, SendGrid…) implement this and get picked in
 * EmailModule.
 */
export abstract class Mailer {
  abstract send(message: MailMessage): Promise<void>;
}

/** Any SMTP server, configured as a URL: smtp(s)://user:pass@host:port. */
export class SmtpMailer extends Mailer {
  private readonly transport: Transporter;

  constructor(
    url: string,
    private readonly from: string,
  ) {
    super();
    this.transport = createTransport(url);
  }

  async send(message: MailMessage) {
    await this.transport.sendMail({ from: this.from, ...message });
  }
}

/**
 * Logs instead of sending: the default when no SMTP server is configured.
 * Keeps the latest messages in memory so tests can inspect them.
 */
export class LogMailer extends Mailer {
  private readonly logger = new Logger('Mailer');
  readonly sent: MailMessage[] = [];

  send(message: MailMessage) {
    this.sent.push(message);
    if (this.sent.length > 100) this.sent.shift();
    this.logger.log(`(not sent, no SMTP_URL) "${message.subject}"`);
    return Promise.resolve();
  }
}
