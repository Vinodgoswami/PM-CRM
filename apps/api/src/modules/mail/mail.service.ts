import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Role } from '@salescrm/types';
import { type Mail, MAILER, type Mailer } from './mailer';

const ROLE_NAME: Record<Role, string> = { ADMIN: 'Admin', CEO: 'CEO', SALES: 'Project Manager' };
const APP = 'Project Management CRM';

/** HTML-escapes text that came from people (names, company), so an email can never carry their markup. */
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const when = (d: Date) => d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });

function layout(heading: string, lines: string[], button: { label: string; url: string }, footer: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f2f4f3;font-family:Arial,Helvetica,sans-serif;color:#1d2420">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:16px;padding:32px">
<tr><td><h1 style="margin:0 0 16px;font-size:22px">${esc(heading)}</h1>
${lines.map((l) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.5">${esc(l)}</p>`).join('')}
<p style="margin:24px 0"><a href="${esc(button.url)}" style="background:#2f6b45;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:bold;display:inline-block">${esc(button.label)}</a></p>
<p style="margin:0 0 8px;font-size:13px;color:#5f6b64">If the button does not work, copy this link into your browser:<br><span style="word-break:break-all">${esc(button.url)}</span></p>
<p style="margin:16px 0 0;font-size:12px;color:#8a948e">${esc(footer)}</p></td></tr></table></td></tr></table></body></html>`;
}

/** Invite and reset emails. Sending never blocks the action: on failure the link is still shown to share by hand. */
@Injectable()
export class MailService {
  private readonly log = new Logger('Mail');
  constructor(@Inject(MAILER) private readonly mailer: Mailer) {}

  /** True only when the email was handed to a real mail server; log mode writes it but returns false. */
  async trySend(mail: Mail): Promise<boolean> {
    if (!this.mailer.enabled) return false;
    try {
      await this.mailer.send(mail);
      return this.mailer.delivers;
    } catch (e) {
      this.log.error(`Could not send "${mail.subject}" to ${mail.to}: ${(e as Error).message}`);
      return false;
    }
  }

  invite(p: { to: string; name: string | null; role: Role; company: string; invitedBy: string; url: string; expiresAt: Date }): Mail {
    const where = p.company || 'the team';
    const subject = `You’re invited to ${where} as ${ROLE_NAME[p.role]}`;
    const lines = [
      `Hello${p.name ? ` ${p.name}` : ''},`,
      `${p.invitedBy} invited you to ${where} on ${APP} as ${ROLE_NAME[p.role]}.`,
      `Open the link, choose a password, and you're in. You will sign in with this email address: ${p.to}.`,
    ];
    const footer = `This link works once and expires on ${when(p.expiresAt)}. If you did not expect it, you can ignore this email.`;
    return {
      to: p.to,
      subject,
      text: `${lines.join('\n\n')}\n\nSet up your account: ${p.url}\n\n${footer}\n`,
      html: layout(subject, lines, { label: 'Set up your account', url: p.url }, footer),
    };
  }

  reset(p: { to: string; name: string; url: string; expiresAt: Date }): Mail {
    const subject = `Reset your ${APP} password`;
    const lines = [`Hello ${p.name},`, 'An administrator created a link for you to choose a new password.'];
    const footer = `This link works once and expires on ${when(p.expiresAt)}. Using it signs you out everywhere else.`;
    return {
      to: p.to,
      subject,
      text: `${lines.join('\n\n')}\n\nChoose a new password: ${p.url}\n\n${footer}\n`,
      html: layout(subject, lines, { label: 'Choose a new password', url: p.url }, footer),
    };
  }
}
