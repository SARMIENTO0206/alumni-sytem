import { db, notifyUser, notifyAlumniAudience, notifyStaffAudience } from './db.js';
import { mailConfig, sendMail } from './mail.js';
import { sendSms, smsConfig } from './sms.js';

export function notificationTarget(relatedType, relatedId, extras = {}) {
  const id = relatedId == null || relatedId === '' ? '' : String(relatedId);
  const type = String(relatedType || '').toLowerCase();
  if (type === 'transcript' || type === 'document') {
    return { view: 'transcript', url: id ? `/#/transcript-requests/${id}` : '/#/transcript-requests' };
  }
  if (type === 'reprint') {
    return { view: 'reprint', url: id ? `/#/certificate-requests/${id}` : '/#/certificate-requests' };
  }
  if (type === 'event') {
    return { view: 'events', url: id ? `/#/events/${id}` : '/#/events' };
  }
  if (type === 'reunion') {
    return { view: 'reunions', url: '/#/batch-reunions' };
  }
  if (type === 'job') {
    return { view: 'job-opportunities', url: id ? `/#/jobs/${id}` : '/#/jobs' };
  }
  if (type === 'announcement') {
    return { view: 'announcements', url: id ? `/#/announcements/${id}` : '/#/announcements' };
  }
  if (type === 'survey' || type === 'feedback') {
    return { view: 'feedback', url: id ? `/#/surveys/${id}` : '/#/surveys' };
  }
  if (type === 'payment') {
    if (extras.paid) return { view: 'payment-receipt', url: id ? `/#/payment-receipt/${id}` : '/#/donor-campaigns' };
    return { view: 'payment', url: id ? `/#/payment/${id}` : '/#/donor-campaigns' };
  }
  if (type === 'application') {
    return { view: 'applications', url: '/#/applications' };
  }
  if (type === 'system') {
    return { view: 'settings', url: '/#/settings' };
  }
  return { view: 'notifications', url: '/#/notifications' };
}

export function mapNotification(n) {
  if (!n) return null;
  const target = n.target_url || notificationTarget(n.related_type, n.related_id).url;
  return {
    id: n.id,
    channel: n.channel,
    recipient: n.recipient,
    subject: n.subject,
    title: n.subject,
    message: n.message,
    createdAt: n.created_at,
    isRead: Boolean(Number(n.is_read)),
    readAt: n.read_at || '',
    notificationType: n.notification_type || n.related_type || n.channel || 'system',
    relatedType: n.related_type || '',
    relatedId: n.related_id || '',
    targetUrl: target,
    emailStatus: n.email_status || '',
    smsStatus: n.sms_status || '',
    userId: n.user_id || 0,
    alumniId: n.alumni_id || 0
  };
}

function recipientUser(opts) {
  if (opts.userId) {
    return db.prepare('SELECT * FROM users WHERE id = ?').get(opts.userId);
  }
  if (opts.alumniId) {
    return db.prepare('SELECT * FROM users WHERE alumni_id = ?').get(opts.alumniId);
  }
  return null;
}

function persistChannelStatus(id, emailStatus, smsStatus) {
  if (!id) return;
  db.prepare('UPDATE notifications SET email_status = ?, sms_status = ? WHERE id = ?').run(
    emailStatus || '',
    smsStatus || '',
    id
  );
}

export async function deliverChannels(notification, opts = {}) {
  const user = recipientUser(opts.user || { userId: notification.user_id, alumniId: notification.alumni_id });
  const emailTo = opts.email || user?.email || '';
  const phoneTo = opts.phone || user?.contact || '';
  const settings = (() => {
    try {
      const row = db.prepare("SELECT value FROM app_meta WHERE key = 'system_settings'").get();
      return row ? JSON.parse(row.value) : {};
    } catch { return {}; }
  })();
  const prefs = settings.notifications || {};
  let emailStatus = '';
  let smsStatus = '';

  const emailEnabled = opts.forceChannels ? opts.sendEmail === true : opts.sendEmail !== false && prefs.email !== false;
  const smsEnabled = opts.forceChannels ? opts.sendSms === true : opts.sendSms === true || (prefs.sms === true && phoneTo);
  if (emailEnabled && emailTo) {
    const result = await sendMail({
      to: emailTo,
      subject: notification.subject,
      text: notification.message,
      notificationId: notification.id,
      userId: notification.user_id
    });
    emailStatus = result.status;
  } else if (opts.sendEmail !== false && !emailTo) {
    emailStatus = 'skipped';
  }

  if (smsEnabled && phoneTo) {
    const result = await sendSms({
      to: phoneTo,
      message: `${notification.subject}: ${notification.message}`.slice(0, 160),
      notificationId: notification.id,
      userId: notification.user_id
    });
    smsStatus = result.status;
  }

  persistChannelStatus(notification.id, emailStatus, smsStatus);
  return db.prepare('SELECT * FROM notifications WHERE id = ?').get(notification.id);
}

export async function dispatchNotification(opts) {
  const target = notificationTarget(opts.relatedType, opts.relatedId, { paid: opts.paid });
  const row = notifyUser({
    ...opts,
    notificationType: opts.notificationType || opts.relatedType || 'system',
    targetUrl: opts.targetUrl || target.url
  });
  if (!row) return null;
  try {
    return mapNotification(await deliverChannels(row, opts));
  } catch {
    return mapNotification(row);
  }
}

export async function dispatchAlumniAudience(subject, message, relatedType, relatedId, extras = {}) {
  const users = notifyAlumniAudience(subject, message, relatedType, relatedId, extras);
  const results = [];
  for (const user of users) {
    const note = db.prepare(
      'SELECT * FROM notifications WHERE user_id = ? AND related_type = ? AND related_id = ? ORDER BY id DESC'
    ).get(user.id, relatedType || '', String(relatedId || ''));
    if (note) {
      results.push(await deliverChannels(note, { userId: user.id, email: user.email, phone: user.contact, sendSms: extras.sendSms }));
    }
  }
  return results;
}

export async function dispatchStaffAudience(subject, message, relatedType, relatedId) {
  const users = notifyStaffAudience(subject, message, relatedType, relatedId);
  return users.length;
}

export function mailAndSmsHealth() {
  return {
    mail: {
      configured: mailConfig().configured,
      message: mailConfig().configured
        ? 'SMTP is configured. Emails are accepted only after the provider accepts the message.'
        : 'SMTP is not configured. Add SMTP_HOST, SMTP_USER, and SMTP_PASS to server/.env.'
    },
    sms: {
      configured: smsConfig().configured,
      provider: smsConfig().provider || '',
      message: smsConfig().configured
        ? `SMS provider (${smsConfig().provider}) is configured.`
        : 'SMS provider is not configured.'
    }
  };
}
