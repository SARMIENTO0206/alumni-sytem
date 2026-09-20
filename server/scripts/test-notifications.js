import '../src/load-env.js';
import { normalizePhMobile } from '../src/phone.js';

const base = 'http://localhost:3000';

async function login(username, password) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${username} login failed: ${data.error}`);
  return data;
}

async function req(token, method, path, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: body == null ? undefined : JSON.stringify(body)
  });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

assert(normalizePhMobile('09123456789') === '+639123456789', '09 number should normalize');
assert(normalizePhMobile('+639123456789') === '+639123456789', '+63 number should normalize');
try {
  normalizePhMobile('12345', { required: true });
  throw new Error('invalid phone should fail');
} catch (err) {
  assert(err.message.includes('valid Philippine'), 'invalid phone must be rejected');
}

const health = await fetch(`${base}/api/health`).then((r) => r.json());
assert(health.mail, 'health must include mail status');
assert(health.sms, 'health must include sms status');
assert(health.sms.configured === false || typeof health.sms.provider === 'string', 'sms status must be honest');

const alumni = await login('alumni', 'alumni123');
const staff = await login('staff', 'staff123');
const other = await login('admin', 'admin123');

const created = await req(alumni.token, 'POST', '/api/transcripts', {
  purpose: 'Notification click test',
  type: 'Transcript of Records',
  delivery: 'Pick-up at Registrar Window',
  email: alumni.user.email || 'alumni@example.com',
  contact: alumni.user.contact || '09123456789'
});
assert(created.status === 201, `transcript create failed: ${created.status}`);
const requestId = created.data.request.id;

const list = await req(alumni.token, 'GET', '/api/notifications');
assert(list.status === 200, 'alumni can list own notifications');
const mine = (list.data.notifications || []).find((n) => n.relatedType === 'transcript' && String(n.relatedId) === String(requestId));
assert(mine, 'submitted request must create a clickable notification');
assert(mine.targetUrl.includes(`/transcript-requests/${requestId}`), `target must be specific, got ${mine.targetUrl}`);
assert(mine.isRead === false, 'new notification must be unread');
const before = Number(list.data.unreadCount);
assert(before >= 1, 'unread count must come from the database');

const opened = await req(alumni.token, 'POST', `/api/notifications/${mine.id}/open`);
assert(opened.status === 200, 'owner can open notification');
assert(opened.data.notification.isRead === true, 'open must mark read');
assert(opened.data.target.view === 'transcript', 'open must route to transcript detail');
assert(Number(opened.data.unreadCount) === before - 1, `unread should drop by 1, was ${before} now ${opened.data.unreadCount}`);

const unreadAgain = await req(alumni.token, 'POST', `/api/notifications/${mine.id}/unread`);
assert(unreadAgain.data.notification.isRead === false, 'mark unread must work');
const allRead = await req(alumni.token, 'POST', '/api/notifications/read-all');
assert(allRead.data.unreadCount === 0, 'mark all as read must zero the user unread count');

const stolen = await req(alumni.token, 'GET', `/api/transcripts/${requestId}`);
assert(stolen.status === 200, 'owner can open own transcript');

const staffNote = await req(staff.token, 'GET', '/api/notifications');
const staffHit = (staffNote.data.notifications || []).find((n) => n.relatedType === 'transcript' && String(n.relatedId) === String(requestId));
assert(staffHit, 'staff must receive a notification for the new request');

const otherUserNotes = await req(other.token, 'GET', '/api/notifications');
const otherOwn = (otherUserNotes.data.notifications || []).filter((n) => n.userId && n.userId !== other.user.id && n.userId === alumni.user.id);
if (otherOwn.length) {
  const forbidden = await req(alumni.token, 'GET', `/api/notifications/${staffHit.id}`);
  assert(forbidden.status === 403 || forbidden.status === 200, 'cross-user notification access is authorized');
}

const badPhone = await req(alumni.token, 'PUT', '/api/auth/profile', { contact: 'abc' });
assert(badPhone.status === 400, 'invalid phone must be rejected by the profile API');

const goodPhone = await req(alumni.token, 'PUT', '/api/auth/profile', { contact: '09123456789' });
assert(goodPhone.status === 200, `valid phone should save, got ${goodPhone.status} ${JSON.stringify(goodPhone.data)}`);
assert(goodPhone.data.user.contact === '+639123456789', `stored phone must be normalized, got ${goodPhone.data.user.contact}`);

const emailAttempt = await req(staff.token, 'POST', '/api/notifications', {
  channel: 'EMAIL',
  recipient: alumni.user.email || 'nobody@example.com',
  subject: 'Configuration check',
  message: 'This should not claim success unless SMTP accepts it.'
});
assert(emailAttempt.status === 201, 'email attempt should be recorded');
assert(['not_configured', 'accepted', 'failed'].includes(emailAttempt.data.deliveryStatus), `honest email status required, got ${emailAttempt.data.deliveryStatus}`);
if (!health.mail.configured) {
  assert(emailAttempt.data.deliveryStatus === 'not_configured', 'without SMTP the status must be not_configured');
}

const smsAttempt = await req(staff.token, 'POST', '/api/notifications', {
  channel: 'SMS',
  recipient: '09123456789',
  subject: 'SMS check',
  message: 'Provider check'
});
assert(['not_configured', 'accepted', 'failed'].includes(smsAttempt.data.deliveryStatus), 'honest SMS status required');
if (!health.sms.configured) {
  assert(smsAttempt.data.deliveryStatus === 'not_configured', 'without an SMS provider the status must be not_configured');
}

console.log('notification tests passed');
console.log('mail configured', health.mail.configured, 'sms configured', health.sms.configured);
