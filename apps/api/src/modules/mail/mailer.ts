import { Logger } from '@nestjs/common';
import { type EmailConfig } from '@salescrm/config';
import nodemailer, { type Transporter } from 'nodemailer';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Sends one email. Implementations: SMTP (any provider), log (development and tests), off. */
export interface Mailer {
  readonly enabled: boolean;
  send(mail: Mail): Promise<void>;
}
export const MAILER = Symbol('MAILER');

export class SmtpMailer implements Mailer {
  readonly enabled = true;
  private readonly transport: Transporter;
  constructor(private readonly config: Extract<EmailConfig, { transport: 'smtp' }>) {
    const { host, port, secure, user, pass } = config.smtp;
    this.transport = nodemailer.createTransport({ host, port, secure, ...(user ? { auth: { user, pass } } : {}) });
  }
  async send(mail: Mail): Promise<void> {
    await this.transport.sendMail({ from: this.config.from, ...mail });
  }
}

/** Writes each email to the server log instead of sending it, and keeps the last ones (tests read `sent`). */
export class LogMailer implements Mailer {
  readonly enabled = true;
  readonly sent: Mail[] = [];
  private readonly log = new Logger('Mail');
  async send(mail: Mail): Promise<void> {
    this.sent.push(mail);
    if (this.sent.length > 50) this.sent.shift();
    this.log.log(`[not sent: EMAIL_TRANSPORT=log] to ${mail.to} · ${mail.subject}\n${mail.text}`);
  }
}

export class OffMailer implements Mailer {
  readonly enabled = false;
  async send(): Promise<void> {}
}

export function mailerFor(config: EmailConfig): Mailer {
  if (config.transport === 'smtp') return new SmtpMailer(config);
  return config.transport === 'log' ? new LogMailer() : new OffMailer();
}
