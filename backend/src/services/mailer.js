import nodemailer from 'nodemailer';
import { config } from '../config.js';

let transport = null;
if (config.smtp) transport = nodemailer.createTransport(config.smtp);

/**
 * Send an e-mail. Without SMTP settings (the default on free hosting) the
 * message is written to the server log instead, so flows still work in dev.
 */
export async function sendMail(to, subject, text, attachments) {
  if (!transport) {
    console.log(`[mail:dev] to=${to} subject="${subject}"\n${text}`);
    return { delivered: false, logged: true };
  }
  await transport.sendMail({ from: config.smtp.from, to, subject, text, attachments });
  return { delivered: true };
}

export const mailEnabled = () => Boolean(transport);
