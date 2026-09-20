import '../src/load-env.js';
import { createHmac } from 'node:crypto';
import { documentFeeCentavos, verifyPaymongoSignature } from '../src/paymongo.js';

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

async function req(token, method, path, body, raw = false) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (!raw) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body == null ? undefined : (raw ? body : JSON.stringify(body))
  });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

assert(documentFeeCentavos('Pick-up at Registrar Window') === 15000, 'base fee should be 15000');
assert(documentFeeCentavos('Courier Delivery (+₱150)') === 30000, 'courier fee should be 30000');
assert(verifyPaymongoSignature('{}', '') === false, 'empty webhook signature must fail');

const health = await fetch(`${base}/api/health`).then((r) => r.json());
console.log('health payments', health.payments);

const alumni = await login('alumni', 'alumni123');
const staff = await login('staff', 'staff123');
const admin = await login('admin', 'admin123');

const quote = await req(alumni.token, 'GET', '/api/payments/quote?relatedType=transcript&delivery=Courier%20Delivery');
assert(quote.status === 200 && Number(quote.data.amount) === 300, `quote courier should be 300, got ${JSON.stringify(quote.data)}`);

const created = await req(alumni.token, 'POST', '/api/transcripts', {
  purpose: 'Employment',
  type: 'Transcript of Records',
  delivery: 'Courier Delivery (+₱150)',
  paymentRef: 'GCASH-2026-8043',
  amount: 1
});
assert(created.status === 201, `create transcript ${created.status} ${created.data?.error}`);
assert(created.data.request.status === 'Payment Required', `expected Payment Required, got ${created.data.request.status}`);
assert(created.data.request.paymentStatus === 'pending', 'new request payment must be pending');
assert(created.data.request.paymentRef !== 'GCASH-2026-8043', 'client paymentRef must be ignored');
assert(Number(created.data.request.fee) === 300, `backend fee should be 300, got ${created.data.request.fee}`);

const requestId = created.data.request.id;
const checkout = await req(alumni.token, 'POST', '/api/payments/checkout', {
  relatedType: 'transcript',
  relatedId: requestId,
  amount: 1
});
console.log('checkout without/with keys', checkout.status, checkout.data && (checkout.data.error || checkout.data.payment?.status));
assert(checkout.status === 201, `checkout should create a local payment, got ${checkout.status}`);
assert(checkout.data.payment.status !== 'paid', 'checkout must not mark paid immediately');
assert(Number(checkout.data.payment.amount) === 300, 'checkout must use backend fee, not frontend amount=1');
assert(checkout.data.payment.requestCode === `TR-${requestId}`, 'request code should be TR-{id}');
if (!health.payments?.configured) {
  assert(checkout.data.payment.qrSource !== 'paymongo', 'unconfigured PayMongo must not claim a gateway QR');
} else {
  assert(checkout.data.payment.qrImage, 'configured PayMongo should return a gateway QR image');
}

const paymentId = checkout.data.payment.id;
const status = await req(alumni.token, 'GET', `/api/payments/${paymentId}/status`);
assert(status.status === 200 && status.data.status !== 'paid', 'status poll must not report paid before confirmation');

const receiptEarly = await req(alumni.token, 'GET', `/api/payments/${paymentId}/receipt`);
assert(receiptEarly.status === 409, 'unpaid receipt must be blocked');

const staffReceipt = await req(staff.token, 'GET', `/api/payments/${paymentId}/receipt`);
assert(staffReceipt.status === 409, 'staff also cannot open a receipt before confirmation');

const reports = await req(staff.token, 'GET', '/api/reports/payments');
assert(reports.status === 200 && reports.data.summary, 'staff can view payment reports');
const alumniReports = await req(alumni.token, 'GET', '/api/reports/payments');
assert(alumniReports.status === 403, 'alumni cannot open staff payment reports');

const still = await req(alumni.token, 'GET', `/api/transcripts/${requestId}`);
assert(still.data.request.paymentStatus !== 'paid', 'request must not be paid before gateway confirmation');
assert(still.data.request.status !== 'Approved', 'unpaid request must not be approved automatically');

const staffSees = await req(staff.token, 'GET', '/api/transcripts');
assert((staffSees.data.requests || []).some((r) => r.id === requestId), 'staff must see the unpaid request');

const alumniSees = await req(alumni.token, 'GET', '/api/transcripts');
assert((alumniSees.data.requests || []).some((r) => r.id === requestId && r.paymentStatus === 'pending'), 'alumni must see pending payment');

const webhook = await fetch(`${base}/api/payments/webhook`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ data: { id: 'evt_fake', attributes: { type: 'checkout_session.payment.paid' } } })
});
assert(webhook.status === 400, `unsigned webhook must be rejected, got ${webhook.status}`);

const adminPay = await req(admin.token, 'GET', '/api/payments');
assert(adminPay.status === 200, 'admin can list payments');

const donateBlocked = await req(alumni.token, 'POST', '/api/donations', { campaign: 'Alumni Foundation', amount: 150 });
assert(donateBlocked.status === 400, 'alumni cannot insert a donation without PayMongo');

if (process.env.PAYMONGO_WEBHOOK_SECRET) {
  const body = JSON.stringify({ data: { id: 'evt_dup_test', attributes: { type: 'payment.failed', data: { id: 'pay_none' } } } });
  const ts = Math.floor(Date.now() / 1000);
  const sig = createHmac('sha256', process.env.PAYMONGO_WEBHOOK_SECRET).update(`${ts}.${body}`).digest('hex');
  const signed = await fetch(`${base}/api/payments/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Paymongo-Signature': `t=${ts},te=${sig},li=${sig}` },
    body
  });
  const first = await signed.json();
  const signed2 = await fetch(`${base}/api/payments/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Paymongo-Signature': `t=${ts},te=${sig},li=${sig}` },
    body
  });
  const second = await signed2.json();
  assert(first.ok === true, 'signed webhook should be accepted');
  assert(second.duplicate === true, 'second identical webhook must be idempotent');
}

console.log('payment tests passed');
