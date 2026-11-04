import { Logger } from '@nestjs/common';
import { type EmailConfig } from '@salescrm/config';
import nodemailer, { type Transporter } from 'nodemailer';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Sends one email. Implementations: SMTP (any provider), Brevo's HTTPS API, log (development and tests), off. */
export interface Mailer {
  readonly enabled: boolean;
  /** True only when send() really delivers to someone's inbox (SMTP), so the screen may say "emailed". */
  readonly delivers: boolean;
  send(mail: Mail): Promise<void>;
}
export const MAILER = Symbol('MAILER');

export class SmtpMailer implements Mailer {
  readonly enabled = true;
  readonly delivers = true;
  private readonly transport: Transporter;
  constructor(private readonly config: Extract<EmailConfig, { transport: 'smtp' }>) {
    const { host, port, secure, user, pass } = config.smtp;
    this.transport = nodemailer.createTransport({ host, port, secure, ...(user ? { auth: { user, pass } } : {}) });
  }
  async send(mail: Mail): Promise<void> {
    await this.transport.sendMail({ from: this.config.from, ...mail });
  }
}

/** "Name <address>" or a bare address, as Brevo wants it. */
function sender(from: string): { name?: string; email: string } {
  const m = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return m ? { ...(m[1] ? { name: m[1].replace(/^"|"$/g, '') } : {}), email: m[2]!.trim() } : { email: from.trim() };
}

/** D-032: sends through Brevo over HTTPS (port 443), for hosts that block SMTP ports such as Render's free plan. */
export class BrevoMailer implements Mailer {
  readonly enabled = true;
  readonly delivers = true;
  constructor(private readonly config: Extract<EmailConfig, { transport: 'brevo' }>) {}
  async send(mail: Mail): Promise<void> {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': this.config.brevo.apiKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: sender(this.config.from),
        to: [{ email: mail.to }],
        subject: mail.subject,
        htmlContent: mail.html,
        textContent: mail.text,
      }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      throw new Error(`Brevo refused the email (${res.status}): ${body.message ?? res.statusText}`);
    }
  }
}

/** Writes each email to the server log instead of sending it, and keeps the last ones (tests read `sent`). */
export class LogMailer implements Mailer {
  readonly enabled = true;
  /** Never delivered: written to the log. (Tests may set it to stand in for a real server.) */
  delivers = false;
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
  readonly delivers = false;
  async send(): Promise<void> {}
}

export function mailerFor(config: EmailConfig): Mailer {
  if (config.transport === 'smtp') return new SmtpMailer(config);
  if (config.transport === 'brevo') return new BrevoMailer(config);
  return config.transport === 'log' ? new LogMailer() : new OffMailer();
}
