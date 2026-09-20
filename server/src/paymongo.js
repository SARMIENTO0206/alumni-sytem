/**
 * Official PayMongo API client (https://api.paymongo.com).
 * Secret key stays on the server. Never sent to the browser.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

const DEFAULT_API = 'https://api.paymongo.com';

export function paymongoConfig() {
  const secretKey = String(process.env.PAYMONGO_SECRET_KEY || '').trim();
  const publicKey = String(process.env.PAYMONGO_PUBLIC_KEY || '').trim();
  const webhookSecret = String(process.env.PAYMONGO_WEBHOOK_SECRET || '').trim();
  const apiBase = String(process.env.PAYMONGO_API_BASE || DEFAULT_API).replace(/\/$/, '');
  const livemode = secretKey.startsWith('sk_live_');
  return {
    secretKey,
    publicKey,
    webhookSecret,
    apiBase,
    configured: Boolean(secretKey),
    livemode,
    mode: !secretKey ? 'unconfigured' : (livemode ? 'live' : 'test')
  };
}

function authHeader(secretKey) {
  return `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`;
}

export async function paymongoRequest(method, path, body) {
  const cfg = paymongoConfig();
  if (!cfg.configured) {
    const err = new Error('PayMongo is not configured. Add PAYMONGO_SECRET_KEY to server/.env.');
    err.status = 503;
    throw err;
  }
  const res = await fetch(`${cfg.apiBase}${path}`, {
    method,
    headers: {
      Authorization: authHeader(cfg.secretKey),
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data?.errors?.[0]?.detail || data?.error || `PayMongo HTTP ${res.status}`;
    const err = new Error(detail);
    err.status = res.status >= 400 && res.status < 500 ? 400 : 502;
    err.payload = data;
    throw err;
  }
  return data;
}

function authFor(kind) {
  const cfg = paymongoConfig();
  const key = kind === 'public' && cfg.publicKey ? cfg.publicKey : cfg.secretKey;
  if (!key) {
    const err = new Error('PayMongo is not configured. Add PAYMONGO_SECRET_KEY to server/.env.');
    err.status = 503;
    throw err;
  }
  return `Basic ${Buffer.from(`${key}:`).toString('base64')}`;
}

async function paymongoRequestWith(kind, method, path, body) {
  const cfg = paymongoConfig();
  if (!cfg.configured && kind !== 'public') {
    const err = new Error('PayMongo is not configured. Add PAYMONGO_SECRET_KEY to server/.env.');
    err.status = 503;
    throw err;
  }
  const res = await fetch(`${cfg.apiBase}${path}`, {
    method,
    headers: {
      Authorization: authFor(kind),
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data?.errors?.[0]?.detail || data?.error || `PayMongo HTTP ${res.status}`;
    const err = new Error(detail);
    err.status = res.status >= 400 && res.status < 500 ? 400 : 502;
    err.payload = data;
    throw err;
  }
  return data;
}

export const QRPH_EXPIRY_SECONDS = 1800;

/**
 * Official QR Ph Payment Acceptance:
 * https://docs.paymongo.com/docs/payment-acceptance-qr-ph-api
 * 1. Create Payment Intent (secret key, payment_method_allowed: qrph)
 * 2. Create Payment Method type qrph
 * 3. Attach method — next_action.code.image_url is the gateway QR image
 */
export async function createQrPhPayment({ amountCentavos, description, metadata }) {
  const intent = await paymongoRequest('POST', '/v1/payment_intents', {
    data: {
      attributes: {
        amount: amountCentavos,
        currency: 'PHP',
        payment_method_allowed: ['qrph'],
        description: description || 'Alumni Management System payment',
        metadata: metadata || {}
      }
    }
  });
  const intentId = intent?.data?.id;
  const clientKey = intent?.data?.attributes?.client_key;
  const methodAuth = paymongoConfig().publicKey ? 'public' : 'secret';
  const method = await paymongoRequestWith(methodAuth, 'POST', '/v1/payment_methods', {
    data: {
      attributes: {
        type: 'qrph',
        expiry_seconds: QRPH_EXPIRY_SECONDS
      }
    }
  });
  const methodId = method?.data?.id;
  const attached = await paymongoRequestWith(methodAuth, 'POST', `/v1/payment_intents/${encodeURIComponent(intentId)}/attach`, {
    data: {
      attributes: {
        payment_method: methodId,
        client_key: clientKey
      }
    }
  });
  const next = attached?.data?.attributes?.next_action || {};
  const code = next.code || {};
  const imageUrl = code.image_url || code.image || '';
  const qrPayload = code.value || code.data || '';
  const expiresAt = new Date(Date.now() + QRPH_EXPIRY_SECONDS * 1000).toISOString();
  return {
    intent: attached,
    intentId,
    methodId,
    imageUrl: await persistQrImage(imageUrl),
    qrPayload,
    expiresAt,
    status: attached?.data?.attributes?.status || 'awaiting_next_action'
  };
}

export async function persistQrImage(imageUrl) {
  const raw = String(imageUrl || '').trim();
  if (!raw) return '';
  if (raw.startsWith('data:')) return raw;
  try {
    const res = await fetch(raw);
    if (!res.ok) return raw;
    const buf = Buffer.from(await res.arrayBuffer());
    const mime = res.headers.get('content-type') || 'image/png';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return raw;
  }
}

export function retrievePaymentIntent(intentId) {
  return paymongoRequest('GET', `/v1/payment_intents/${encodeURIComponent(intentId)}`);
}

export function localStatusFromIntent(intent) {
  const status = String(intent?.data?.attributes?.status || intent?.attributes?.status || '').toLowerCase();
  if (status === 'succeeded') return 'paid';
  if (status === 'processing') return 'processing';
  if (status === 'awaiting_next_action') return 'awaiting_payment';
  if (status === 'awaiting_payment_method') return 'expired';
  if (['failed', 'cancelled', 'canceled'].includes(status)) return status === 'canceled' ? 'cancelled' : status;
  return 'awaiting_payment';
}

export function qrImageSrc(imageUrl) {
  const raw = String(imageUrl || '').trim();
  if (!raw) return '';
  if (raw.startsWith('data:') || raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  return `data:image/png;base64,${raw}`;
}

/** Official Checkout Session. payment_method_types includes gcash. */
export function createGcashCheckout({ amountCentavos, description, name, email, phone, successUrl, cancelUrl, reference, metadata }) {
  return paymongoRequest('POST', '/v1/checkout_sessions', {
    data: {
      attributes: {
        billing: {
          name: name || 'Alumni',
          email: email || undefined,
          phone: phone || undefined
        },
        send_email_receipt: false,
        show_description: true,
        show_line_items: true,
        description: description || 'Alumni Management System payment',
        line_items: [{
          currency: 'PHP',
          amount: amountCentavos,
          name: description || 'Document request fee',
          quantity: 1
        }],
        payment_method_types: ['gcash'],
        reference_number: reference || undefined,
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: metadata || {}
      }
    }
  });
}

export function retrieveCheckout(checkoutId) {
  return paymongoRequest('GET', `/v1/checkout_sessions/${encodeURIComponent(checkoutId)}`);
}

export function retrievePayment(paymentId) {
  return paymongoRequest('GET', `/v1/payments/${encodeURIComponent(paymentId)}`);
}

/**
 * Official webhook signature: Paymongo-Signature t=, te=, li=
 * https://developers.paymongo.com/docs/webhook-signature
 */
export function verifyPaymongoSignature(rawBody, signatureHeader) {
  const cfg = paymongoConfig();
  if (!cfg.webhookSecret) return false;
  const header = String(signatureHeader || '');
  const parts = Object.fromEntries(
    header.split(',').map((part) => {
      const idx = part.indexOf('=');
      return [part.slice(0, idx).trim(), part.slice(idx + 1).trim()];
    })
  );
  const timestamp = parts.t;
  const testSig = parts.te;
  const liveSig = parts.li;
  const expected = cfg.livemode ? liveSig : (testSig || liveSig);
  if (!timestamp || !expected) return false;
  const digest = createHmac('sha256', cfg.webhookSecret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');
  const a = Buffer.from(digest);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export const DOCUMENT_BASE_FEE_CENTAVOS = 15000;
export const COURIER_FEE_CENTAVOS = 15000;

export function documentFeeCentavos(delivery) {
  const text = String(delivery || '').toLowerCase();
  let amount = DOCUMENT_BASE_FEE_CENTAVOS;
  if (text.includes('courier')) amount += COURIER_FEE_CENTAVOS;
  return amount;
}

export function pesosFromCentavos(centavos) {
  return (Number(centavos || 0) / 100).toFixed(2);
}
