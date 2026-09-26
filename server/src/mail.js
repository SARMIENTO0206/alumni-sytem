import { db } from './db.js';

export function mailConfig() {
  const host = String(process.env.SMTP_HOST || '').trim();
  return {
    configured: Boolean(host && process.env.SMTP_USER && process.env.SMTP_PASS),
    host,
    port: Number(process.env.SMTP_PORT || 587),
    user: String(process.env.SMTP_USER || ''),
    pass: String(process.env.SMTP_PASS || ''),
    from: String(process.env.SMTP_FROM || process.env.SMTP_USER || 'alumni@localhost')
  };
}

function writeMailLog({ notificationId, userId, recipient, subject, status, reason }) {
  try {
    db.prepare(
      `INSERT INTO mail_logs (notification_id, user_id, recipient, subject, status, reason)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(notificationId || 0, userId || 0, recipient || '', subject || '', status || '', reason || '');
  } catch { /* logging must not break sending */ }
}

export async function sendMail({ to, subject, text, html, notificationId, userId, attachments }) {
  if (!to) {
    const result = { sent: false, accepted: false, status: 'failed', reason: 'No recipient email on the account.' };
    writeMailLog({ notificationId, userId, recipient: to, subject, ...result });
    return result;
  }
  const cfg = mailConfig();
  if (!cfg.configured) {
    const result = {
      sent: false,
      accepted: false,
      status: 'not_configured',
      reason: 'Email service is currently unavailable. Please contact the system administrator.'
    };
    writeMailLog({ notificationId, userId, recipient: to, subject, ...result });
    return result;
  }
  try {
    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.port === 465,
      auth: { user: cfg.user, pass: cfg.pass }
    });
    const info = await transporter.sendMail({
      from: cfg.from,
      to,
      subject,
      text,
      html: html || undefined,
      attachments: attachments || undefined
    });
    const accepted = Array.isArray(info.accepted) ? info.accepted.length > 0 : Boolean(info.messageId);
    const result = accepted
      ? { sent: true, accepted: true, status: 'accepted', reason: '', messageId: info.messageId || '' }
      : { sent: false, accepted: false, status: 'failed', reason: 'The SMTP server did not accept the message.' };
    writeMailLog({ notificationId, userId, recipient: to, subject, ...result });
    return result;
  } catch (err) {
    const result = {
      sent: false,
      accepted: false,
      status: 'failed',
      reason: err.message || 'Unable to send email.'
    };
    writeMailLog({ notificationId, userId, recipient: to, subject, ...result });
    return result;
  }
}

export async function sendPaymentReceiptEmail({ user, payment, requestCode, receiptUrl }) {
  const subject = `Payment Confirmed - ${payment.description || 'Alumni payment'} ${requestCode || ''}`.trim();
  const text = [
    `Hello ${user?.name || 'Alumni'},`,
    '',
    'Your payment has been successfully confirmed.',
    '',
    `Request: ${payment.description || ''}`,
    `Request ID: ${requestCode || ''}`,
    `Amount Paid: PHP ${Number(payment.amount_centavos || 0) / 100}`,
    `Transaction Reference: ${payment.reference_id || payment.gateway_payment_id || ''}`,
    '',
    'You may view your receipt by logging in to your Alumni Portal.',
    receiptUrl ? `Receipt: ${receiptUrl}` : '',
    '',
    'Regards,',
    'Alumni Management System'
  ].filter(Boolean).join('\n');

  return sendMail({
    to: user?.email,
    subject,
    text,
    userId: user?.id || payment.user_id
  });
}
