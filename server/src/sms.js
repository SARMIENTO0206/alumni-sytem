import { db } from './db.js';
import { normalizePhMobile } from './phone.js';

export function smsConfig() {
  const semaphoreKey = String(process.env.SEMAPHORE_API_KEY || '').trim();
  const twilioSid = String(process.env.TWILIO_ACCOUNT_SID || '').trim();
  const twilioToken = String(process.env.TWILIO_AUTH_TOKEN || '').trim();
  const twilioFrom = String(process.env.TWILIO_FROM || '').trim();
  const provider = semaphoreKey
    ? 'semaphore'
    : (twilioSid && twilioToken && twilioFrom ? 'twilio' : '');
  return {
    configured: Boolean(provider),
    provider,
    semaphoreKey,
    twilioSid,
    twilioToken,
    twilioFrom
  };
}

function writeSmsLog({ notificationId, userId, recipient, message, status, reason, providerRef }) {
  try {
    db.prepare(
      `INSERT INTO sms_logs (notification_id, user_id, recipient, message, status, reason, provider_ref)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      notificationId || 0,
      userId || 0,
      recipient || '',
      message || '',
      status || '',
      reason || '',
      providerRef || ''
    );
  } catch { /* logging must not break the request */ }
}

export async function sendSms({ to, message, notificationId, userId }) {
  let recipient = '';
  try {
    recipient = normalizePhMobile(to, { required: true });
  } catch (err) {
    const result = { sent: false, accepted: false, status: 'failed', reason: err.message || 'Invalid mobile number.' };
    writeSmsLog({ notificationId, userId, recipient: to, message, ...result });
    return result;
  }

  const cfg = smsConfig();
  if (!cfg.configured) {
    const result = {
      sent: false,
      accepted: false,
      status: 'not_configured',
      reason: 'SMS provider is not configured.'
    };
    writeSmsLog({ notificationId, userId, recipient, message, ...result });
    return result;
  }

  try {
    if (cfg.provider === 'semaphore') {
      const res = await fetch('https://api.semaphore.co/api/v4/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apikey: cfg.semaphoreKey,
          number: recipient,
          message
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const result = {
          sent: false,
          accepted: false,
          status: 'failed',
          reason: data?.message || data?.error || `SMS provider HTTP ${res.status}`
        };
        writeSmsLog({ notificationId, userId, recipient, message, ...result });
        return result;
      }
      const ref = Array.isArray(data) ? (data[0]?.message_id || data[0]?.id || '') : (data.message_id || data.id || '');
      const result = { sent: true, accepted: true, status: 'accepted', reason: '', providerRef: String(ref) };
      writeSmsLog({ notificationId, userId, recipient, message, ...result, providerRef: result.providerRef });
      return result;
    }

    const auth = Buffer.from(`${cfg.twilioSid}:${cfg.twilioToken}`).toString('base64');
    const body = new URLSearchParams({
      To: recipient,
      From: cfg.twilioFrom,
      Body: message
    });
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(cfg.twilioSid)}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const result = {
        sent: false,
        accepted: false,
        status: 'failed',
        reason: data?.message || `SMS provider HTTP ${res.status}`
      };
      writeSmsLog({ notificationId, userId, recipient, message, ...result });
      return result;
    }
    const result = { sent: true, accepted: true, status: 'accepted', reason: '', providerRef: data.sid || '' };
    writeSmsLog({ notificationId, userId, recipient, message, ...result, providerRef: result.providerRef });
    return result;
  } catch (err) {
    const result = {
      sent: false,
      accepted: false,
      status: 'failed',
      reason: err.message || 'Unable to send SMS.'
    };
    writeSmsLog({ notificationId, userId, recipient, message, ...result });
    return result;
  }
}
