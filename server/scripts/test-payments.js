import '../src/load-env.js';
import { createHmac } from 'node:crypto';
import { verifyPaymongoSignature } from '../src/paymongo.js';

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

assert(verifyPaymongoSignature('{}', '') === false, 'empty webhook signature must fail');

const health = await fetch(`${base}/api/health`).then((r) => r.json());
console.log('health payments', health.payments);

const alumni = await login('alumni', 'alumni123');
const staff = await login('staff', 'staff123');
const admin = await login('admin', 'admin123');

const documentQuote = await req(alumni.token, 'GET', '/api/payments/quote?relatedType=transcript&delivery=Courier%20Delivery');
assert(documentQuote.status === 400, 'document requests must not have a payment quote');
const donationQuote = await req(alumni.token, 'GET', '/api/payments/quote?relatedType=donation');
assert(donationQuote.status === 200, 'donation checkout quote should remain available');

const created = await req(alumni.token, 'POST', '/api/transcripts', {
  purpose: 'Employment',
  type: 'Transcript of Records',
  delivery: 'Courier Delivery (+₱150)',
  paymentRef: 'GCASH-2026-8043',
  amount: 1
});
assert(created.status === 201, `create transcript ${created.status} ${created.data?.error}`);
assert(created.data.request.status === 'Pending', `expected Pending, got ${created.data.request.status}`);
assert(!('paymentStatus' in created.data.request) && !('fee' in created.data.request), 'document requests must not expose payment fields');

const requestId = created.data.request.id;
const documentCheckout = await req(alumni.token, 'POST', '/api/payments/checkout', {
  relatedType: 'transcript',
  relatedId: requestId,
  amount: 1
});
assert(documentCheckout.status === 400, 'document request checkout must be disabled');

const still = await req(alumni.token, 'GET', `/api/transcripts/${requestId}`);
assert(still.data.request.status === 'Pending', 'document request must remain pending until Registrar review');

const staffSees = await req(staff.token, 'GET', '/api/transcripts');
assert((staffSees.data.requests || []).some((r) => r.id === requestId), 'staff must see the pending request');

const alumniSees = await req(alumni.token, 'GET', '/api/transcripts');
assert((alumniSees.data.requests || []).some((r) => r.id === requestId && r.status === 'Pending'), 'alumni must see request status');

const webhook = await fetch(`${base}/api/payments/webhook`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ data: { id: 'evt_fake', attributes: { type: 'checkout_session.payment.paid' } } })
});
assert(webhook.status === 400, `unsigned webhook must be rejected, got ${webhook.status}`);

const adminPay = await req(admin.token, 'GET', '/api/payments');
assert(adminPay.status === 403, 'payment history must be unavailable to admins');
const registrarPayments = await req(staff.token, 'GET', '/api/payments');
assert(registrarPayments.status === 403, 'payment history must be unavailable to Registrar staff');
const alumniPayments = await req(alumni.token, 'GET', '/api/payments');
assert(alumniPayments.status === 403, 'payment history must be unavailable to alumni');

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
