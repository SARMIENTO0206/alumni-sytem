import { Router } from 'express';
import { db, findAlumniForUser, writeAudit, writeRequestHistory, getSetting } from '../db.js';
import { dispatchNotification, dispatchStaffAudience } from '../notify.js';
import { isAdmin, isAlumni, isStaff, ownsLinkedRow } from '../auth.js';
import {
  createQrPhPayment,
  documentFeeCentavos,
  localStatusFromIntent,
  paymongoConfig,
  pesosFromCentavos,
  qrImageSrc,
  retrieveCheckout,
  retrievePayment,
  retrievePaymentIntent,
  verifyPaymongoSignature
} from '../paymongo.js';
import { sendPaymentReceiptEmail } from '../mail.js';
import { identifierQrDataUri, paymentQrPayload } from '../localQr.js';
import { mirror } from '../sync-supabase.js';

const router = Router();

function publicUrl() {
  return String(process.env.APP_PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
}

export function requestCode(type, id) {
  if (type === 'transcript') return `TR-${id}`;
  if (type === 'reprint') return `CR-${id}`;
  if (type === 'donation') return `DN-${id}`;
  return `PAY-${id}`;
}

function purposeLabel(type) {
  if (type === 'transcript') return 'Transcript Request';
  if (type === 'reprint') return 'Certificate Reprint';
  if (type === 'donation') return 'Alumni Donation';
  return 'Payment';
}

function mapPayment(row, extras = {}) {
  if (!row) return null;
  const includeQr = extras.includeQr === true;
  return {
    id: row.id,
    userId: row.user_id,
    alumniId: row.alumni_id,
    relatedType: row.related_type,
    relatedId: row.related_id,
    requestCode: row.request_code || requestCode(row.related_type, row.related_id || row.id),
    purpose: purposeLabel(row.related_type),
    referenceId: row.reference_id || row.gateway_payment_id || row.gateway_intent_id,
    gateway: row.gateway,
    gatewayPaymentId: row.gateway_payment_id,
    gatewayIntentId: row.gateway_intent_id,
    gatewayCheckoutId: row.gateway_checkout_id,
    paymentMethod: row.payment_method || 'qrph',
    amountCentavos: row.amount_centavos,
    amount: pesosFromCentavos(row.amount_centavos),
    currency: row.currency,
    status: row.status,
    description: row.description,
    livemode: Boolean(row.livemode),
    paidAt: row.paid_at,
    failedAt: row.failed_at,
    qrExpiresAt: row.qr_expires_at || '',
    qrImage: includeQr ? qrImageSrc(row.qr_image) : '',
    qrPayload: paymentQrPayload(row),
    qrSource: row.gateway_intent_id ? 'paymongo' : (row.qr_image ? 'local' : ''),
    hasQr: Boolean(row.qr_image),
    paidBy: extras.paidBy || '',
    email: extras.email || '',
    contact: extras.contact || '',
    alumniId: extras.alumniId || '',
    studentId: extras.studentId || '',
    institution: extras.institution || 'St. Agnes Academy of Caloocan',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function hydratePayment(row, includeQr = false) {
  const user = row ? db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id) : null;
  const alumni = row?.alumni_id ? db.prepare('SELECT * FROM alumni WHERE id = ?').get(row.alumni_id) : null;
  const settings = getSetting('system_settings', {});
  return mapPayment(row, {
    includeQr,
    paidBy: user?.name || alumni?.name || '',
    email: user?.email || alumni?.email || '',
    contact: user?.contact || alumni?.contact || '',
    alumniId: user?.student_id || alumni?.student_id || '',
    studentId: user?.student_id || alumni?.student_id || '',
    institution: settings?.general?.institution || 'St. Agnes Academy of Caloocan'
  });
}

function canViewPayment(user, row) {
  if (!row) return false;
  if (isAdmin(user) || isStaff(user)) return true;
  return Number(row.user_id) === Number(user.id);
}

function applyPaidToRelated(payment) {
  const now = new Date().toISOString();
  const ref = payment.gateway_payment_id || payment.reference_id || payment.gateway_intent_id;
  if (payment.related_type === 'transcript') {
    db.prepare(
      "UPDATE transcript_requests SET payment_status = 'paid', payment_ref = ?, status = CASE WHEN status IN ('Payment Required','Pending') THEN 'Pending' ELSE status END WHERE id = ?"
    ).run(ref, payment.related_id);
    writeRequestHistory({ id: 0, role: 'system' }, 'transcript', payment.related_id, 'Paid', `PayMongo ${ref}`);
    const doc = db.prepare('SELECT * FROM transcript_requests WHERE id = ?').get(payment.related_id);
    if (doc) {
      dispatchNotification({
        userId: doc.user_id,
        alumniId: doc.alumni_id,
        recipient: doc.email || doc.name,
        channel: 'SYSTEM',
        subject: 'Transcript request is pending Registrar review',
        message: `Payment for transcript request #${doc.id} was confirmed. The Registrar will now review and validate your request.`,
        relatedType: 'transcript',
        relatedId: doc.id,
        email: doc.email,
        phone: doc.contact
      }).catch(() => {});
      dispatchStaffAudience(
        `Transcript request #${doc.id} is Pending`,
        `${doc.name} completed payment. The request is ready for Registrar review.`,
        'transcript',
        doc.id
      ).catch(() => {});
    }
  } else if (payment.related_type === 'reprint') {
    db.prepare(
      "UPDATE reprints SET payment_status = 'paid', status = CASE WHEN status IN ('Payment Required','Pending') THEN 'Pending' ELSE status END WHERE id = ?"
    ).run(payment.related_id);
    writeRequestHistory({ id: 0, role: 'system' }, 'reprint', payment.related_id, 'Paid', `PayMongo ${ref}`);
  } else if (payment.related_type === 'donation') {
    const exists = db.prepare('SELECT id FROM donations WHERE id = ?').get(payment.related_id);
    if (!exists) {
      let meta = {};
      try { meta = JSON.parse(payment.metadata || '{}'); } catch { meta = {}; }
      const info = db.prepare(
        'INSERT INTO donations (campaign, donor, amount, date, user_id, alumni_id, payment_status, payment_ref, dedication, is_anonymous) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        meta.campaign || 'Alumni Foundation',
        meta.donor || '',
        Number(payment.amount_centavos || 0) / 100,
        now.slice(0, 10),
        payment.user_id,
          payment.alumni_id,
          'paid',
          ref || '',
          String(meta.dedication || ''),
          meta.anonymous ? 1 : 0
        );
        db.prepare('UPDATE payments SET related_id = ? WHERE id = ?').run(info.lastInsertRowid, payment.id);
        const donation = db.prepare('SELECT * FROM donations WHERE id = ?').get(info.lastInsertRowid);
        mirror('donations', Object.fromEntries(Object.entries(donation).filter(([key]) =>
          !['payment_status', 'payment_ref', 'dedication', 'is_anonymous'].includes(key)
        )));
    }
  }
}

async function sendConfirmedReceipt(row) {
  if (!row || row.receipt_email_sent) return;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id);
  const code = row.request_code || requestCode(row.related_type, row.related_id || row.id);
  const receiptUrl = `${publicUrl()}/#/payment-receipt/${row.id}`;
  await sendPaymentReceiptEmail({ user, payment: row, requestCode: code, receiptUrl });
  db.prepare('UPDATE payments SET receipt_email_sent = 1 WHERE id = ?').run(row.id);
}

export function markPaymentStatus(paymentId, status, extras = {}) {
  const existing = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);
  if (!existing) return null;
  const paidAt = status === 'paid' ? (extras.paidAt || new Date().toISOString()) : existing.paid_at;
  const failedAt = ['failed', 'cancelled', 'expired'].includes(status)
    ? (extras.failedAt || new Date().toISOString())
    : existing.failed_at;
  db.prepare(
    `UPDATE payments SET status = ?, gateway_payment_id = ?, gateway_intent_id = ?, reference_id = ?,
     paid_at = ?, failed_at = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(
    status,
    extras.gatewayPaymentId || existing.gateway_payment_id,
    extras.gatewayIntentId || existing.gateway_intent_id,
    extras.referenceId || extras.gatewayPaymentId || existing.reference_id,
    paidAt,
    failedAt,
    paymentId
  );
  const row = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);
  if (status === 'paid' && existing.status !== 'paid') {
    applyPaidToRelated(row);
    const payer = db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id);
    dispatchNotification({
      userId: row.user_id,
      alumniId: row.alumni_id,
      recipient: payer?.email || payer?.name || '',
      channel: 'SYSTEM',
      subject: 'Payment confirmed',
      message: `Payment #${row.id} of PHP ${pesosFromCentavos(row.amount_centavos)} was confirmed by PayMongo.`,
      relatedType: 'payment',
      relatedId: row.id,
      paid: true,
      email: payer?.email,
      phone: payer?.contact
    }).catch(() => {});
    sendConfirmedReceipt(row).catch(() => { /* receipt email must not break confirmation */ });
  }
  return row;
}

async function syncFromGateway(row) {
  if (!row || row.status === 'paid') return row;
  if (row.gateway_intent_id) {
    const intent = await retrievePaymentIntent(row.gateway_intent_id);
    const status = localStatusFromIntent(intent);
    const attrs = intent?.data?.attributes || {};
    const payments = attrs.payments || [];
    const paidPayment = payments.find((p) => (p.attributes?.status || p.status) === 'paid') || payments[0];
    const mappedStatus = status === 'awaiting_payment' && row.status === 'pending' ? 'awaiting_payment' : status;
    if (mappedStatus !== row.status || paidPayment?.id) {
      return markPaymentStatus(row.id, mappedStatus, {
        gatewayPaymentId: paidPayment?.id || '',
        gatewayIntentId: intent?.data?.id || row.gateway_intent_id,
        referenceId: paidPayment?.id || attrs.metadata?.local_payment_id || row.reference_id,
        paidAt: paidPayment?.attributes?.paid_at
          ? new Date(Number(paidPayment.attributes.paid_at) * 1000).toISOString()
          : undefined
      });
    }
    return db.prepare('SELECT * FROM payments WHERE id = ?').get(row.id);
  }
  if (row.gateway_checkout_id) {
    const session = await retrieveCheckout(row.gateway_checkout_id);
    const attrs = session?.data?.attributes || {};
    const payments = attrs.payments || [];
    const paid = payments.some((p) => (p.attributes?.status || p.status) === 'paid') || attrs.status === 'paid';
    if (paid) {
      const paidPayment = payments.find((p) => (p.attributes?.status || p.status) === 'paid') || payments[0];
      return markPaymentStatus(row.id, 'paid', {
        gatewayPaymentId: paidPayment?.id || '',
        referenceId: paidPayment?.id || attrs.reference_number || row.reference_id
      });
    }
  }
  if (row.qr_expires_at && new Date(row.qr_expires_at).getTime() < Date.now() && ['pending', 'awaiting_payment'].includes(row.status)) {
    return markPaymentStatus(row.id, 'expired', { failedAt: new Date().toISOString() });
  }
  return row;
}

async function saveIdentifierQr(paymentRow) {
  const image = await identifierQrDataUri(paymentQrPayload(paymentRow));
  if (!image) return paymentRow;
  db.prepare("UPDATE payments SET qr_image = ?, updated_at = datetime('now') WHERE id = ?").run(image, paymentRow.id);
  return db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentRow.id);
}

async function attachQrToPayment(paymentRow) {
  const qr = await createQrPhPayment({
    amountCentavos: paymentRow.amount_centavos,
    description: paymentRow.description,
    metadata: {
      local_payment_id: String(paymentRow.id),
      related_type: paymentRow.related_type,
      related_id: String(paymentRow.related_id || '')
    }
  });
  db.prepare(
    `UPDATE payments SET gateway_intent_id = ?, gateway_method_id = ?, qr_image = ?, qr_expires_at = ?,
     status = 'awaiting_payment', payment_method = 'qrph', updated_at = datetime('now') WHERE id = ?`
  ).run(qr.intentId, qr.methodId, qr.imageUrl || qr.qrPayload || '', qr.expiresAt, paymentRow.id);
  let row = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentRow.id);
  if (!row.qr_image) row = await saveIdentifierQr(row);
  return row;
}

function resolveChargeable(req) {
  const { relatedType, relatedId, campaign, donor, dedication, anonymous } = req.body || {};
  let resolvedDonor = donor;
  let amount = 0;
  let description = '';
  let related = Number(relatedId) || 0;
  let alumniId = req.user.alumniId || 0;
  let code = '';

  if (relatedType === 'transcript' || relatedType === 'reprint') {
    const table = relatedType === 'reprint' ? 'reprints' : 'transcript_requests';
    const record = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(related);
    if (!record) {
      const err = new Error('Document request not found.');
      err.status = 404;
      throw err;
    }
    if (isAlumni(req.user) && !ownsLinkedRow(req.user, record)) {
      const err = new Error('You can only pay for your own request.');
      err.status = 403;
      throw err;
    }
    if (record.payment_status === 'paid') {
      const err = new Error('This request is already paid.');
      err.status = 400;
      throw err;
    }
    if (!['Approved', 'Payment Required'].includes(record.status)) {
      const err = new Error('Payment becomes available after the Registrar approves the request.');
      err.status = 400;
      throw err;
    }
    amount = record.fee_centavos || documentFeeCentavos(record.delivery);
    description = `${relatedType === 'reprint' ? 'Certificate reprint' : 'Transcript request'} #${record.id}`;
    alumniId = record.alumni_id || alumniId;
    code = requestCode(relatedType, record.id);
  } else if (relatedType === 'donation') {
    if (!isAlumni(req.user)) {
      const err = new Error('Only alumni accounts can contribute through the donation portal.');
      err.status = 403;
      throw err;
    }
    const savedCampaign = getSetting('donation_campaign', {});
    const activeCampaign = {
      title: 'Campus Chapel & Library Modernization',
      status: 'Active',
      startDate: '2026-09-01',
      endDate: '2026-12-31',
      ...(savedCampaign && typeof savedCampaign === 'object' ? savedCampaign : {})
    };
    const today = new Date().toISOString().slice(0, 10);
    if (
      activeCampaign.status !== 'Active' ||
      today < activeCampaign.startDate ||
      today > activeCampaign.endDate ||
      String(campaign || '') !== String(activeCampaign.title || '')
    ) {
      const err = new Error('This donation campaign is not currently accepting contributions.');
      err.status = 400;
      throw err;
    }
    const pesos = Number(req.body?.amount);
    if (!Number.isFinite(pesos) || pesos < 1 || pesos > 500000) {
      const err = new Error('Donation amount must be between PHP 1.00 and PHP 500,000.00.');
      err.status = 400;
      throw err;
    }
    if (dedication != null && (typeof dedication !== 'string' || dedication.length > 200)) {
      const err = new Error('Dedication must be 200 characters or fewer.');
      err.status = 400;
      throw err;
    }
    amount = Math.round(pesos * 100);
    description = `Donation — ${campaign || 'Alumni Foundation'}`;
    code = '';
    resolvedDonor = req.user.name || '';
    alumniId = Number(req.user.alumniId || findAlumniForUser(req.user)?.id || 0);
  } else {
    const err = new Error('Unsupported payment type.');
    err.status = 400;
    throw err;
  }

  if (amount < 100) {
    const err = new Error('Amount is below the PayMongo minimum of PHP 1.00.');
    err.status = 400;
    throw err;
  }

  return {
    relatedType, related, alumniId, amount, description, code,
    campaign,
    donor: relatedType === 'donation' ? req.user.name || '' : resolvedDonor,
    dedication: relatedType === 'donation' ? String(dedication || '').trim() : '',
    anonymous: relatedType === 'donation' && anonymous === true
  };
}

function receiptRows(payment) {
  return [
    ['Institution', payment.institution || 'St. Agnes Academy of Caloocan'],
    ['Payment Status', String(payment.status || '').toUpperCase()],
    ['Transaction Reference', payment.referenceId || ''],
    ['PayMongo Payment ID', payment.gatewayPaymentId || ''],
    ['Document Request ID', payment.requestCode || ''],
    ['Purpose', payment.purpose || payment.description || ''],
    ['Alumni Name', payment.paidBy || ''],
    ['Alumni ID', payment.alumniId || payment.studentId || ''],
    ['Email', payment.email || ''],
    ['Mobile Number', payment.contact || ''],
    ['Payment Method', 'QR Ph'],
    ['Amount Paid', `PHP ${payment.amount}`],
    ['Payment Date/Time', payment.paidAt ? new Date(payment.paidAt).toLocaleString('en-PH') : '']
  ];
}

function receiptHtml(payment) {
  const rows = receiptRows(payment).map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Payment Receipt</title>
  <style>body{font-family:Segoe UI,Arial,sans-serif;padding:40px;color:#1e293b;max-width:640px;margin:auto}
  h1{font-size:20px;letter-spacing:.12em;text-align:center;margin:0}
  h2{font-size:16px;text-align:center;margin:8px 0 24px}
  table{width:100%;border-collapse:collapse}td{padding:8px 0;border-bottom:1px solid #e2e8f0;font-size:13px}
  td:last-child{text-align:right;font-weight:700}
  .note{margin-top:24px;font-size:12px;color:#64748b;text-align:center}</style></head><body>
  <h1>${payment.institution || 'ALUMNI MANAGEMENT SYSTEM'}</h1>
  <h2>PAYMENT RECEIPT</h2>
  <table>${rows}</table>
  <p class="note">Payment confirmed successfully. This is a payment confirmation, not an official BIR tax receipt.</p>
  </body></html>`;
}

function pdfEscape(text) {
  return String(text || '').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function receiptPdf(payment) {
  const lines = ['PAYMENT RECEIPT', payment.institution || 'St. Agnes Academy of Caloocan', '']
    .concat(receiptRows(payment).map(([k, v]) => `${k}: ${v}`));
  const commands = ['BT', '/F1 12 Tf', '50 750 Td', '16 TL'];
  lines.forEach((line, idx) => {
    commands.push(idx === 0 ? `(${pdfEscape(line)}) Tj` : `T* (${pdfEscape(line)}) Tj`);
  });
  commands.push('ET');
  const stream = commands.join('\n');
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj',
    `4 0 obj << /Length ${Buffer.byteLength(stream)} >> stream\n${stream}\nendstream endobj`,
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj'
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((obj) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${obj}\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}

router.get('/config', (req, res) => {
  const cfg = paymongoConfig();
  res.json({
    configured: cfg.configured,
    mode: cfg.mode,
    gateway: 'paymongo',
    methods: ['qrph']
  });
});

router.get('/quote', (req, res) => {
  const relatedType = String(req.query.relatedType || '');
  if (relatedType === 'donation') {
    return res.json({ currency: 'PHP', method: 'qrph', note: 'Donation amount is entered by the donor and validated at checkout.' });
  }
  const amount = documentFeeCentavos(req.query.delivery);
  res.json({
    amountCentavos: amount,
    amount: pesosFromCentavos(amount),
    currency: 'PHP',
    method: 'qrph',
    relatedType: relatedType || 'transcript'
  });
});

router.get('/', (req, res) => {
  let rows = db.prepare('SELECT * FROM payments ORDER BY id DESC LIMIT 200').all();
  if (isAlumni(req.user)) rows = rows.filter((r) => Number(r.user_id) === Number(req.user.id));
  else if (!isAdmin(req.user) && !isStaff(req.user)) {
    return res.status(403).json({ error: 'You do not have permission to view payments.' });
  }
  res.json({ payments: rows.map((r) => hydratePayment(r, false)) });
});

router.get('/:id/status', async (req, res) => {
  const row = db.prepare('SELECT * FROM payments WHERE id = ?').get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Payment not found.' });
  if (!canViewPayment(req.user, row)) return res.status(403).json({ error: 'You can only view your own payment.' });
  let current = row;
  try {
    current = await syncFromGateway(row);
  } catch { /* keep last known local status */ }
  if (!current.qr_image && !['paid', 'expired', 'failed', 'cancelled'].includes(current.status)) {
    current = await saveIdentifierQr(current);
  }
  const mapped = hydratePayment(current, true);
  let qrStatus = 'waiting';
  if (mapped.status === 'paid') qrStatus = 'paid';
  else if (mapped.status === 'failed') qrStatus = 'failed';
  else if (mapped.status === 'expired') qrStatus = 'expired';
  else if (mapped.status === 'cancelled') qrStatus = 'cancelled';
  else if (mapped.status === 'processing') qrStatus = 'processing';
  else if (mapped.status === 'awaiting_payment' || mapped.status === 'pending') qrStatus = 'waiting';
  res.json({
    status: mapped.status,
    qrStatus,
    payment: mapped
  });
});

router.get('/:id/receipt', (req, res) => {
  const row = db.prepare('SELECT * FROM payments WHERE id = ?').get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Payment not found.' });
  if (!canViewPayment(req.user, row)) return res.status(403).json({ error: 'You can only view your own receipt.' });
  if (row.status !== 'paid') {
    return res.status(409).json({ error: 'A receipt is available only after PayMongo confirms the payment.' });
  }
  const payment = hydratePayment(row, false);
  res.json({ payment, receipt: payment });
});

router.get('/:id/receipt.html', (req, res) => {
  const row = db.prepare('SELECT * FROM payments WHERE id = ?').get(Number(req.params.id));
  if (!row) return res.status(404).send('Payment not found.');
  if (!canViewPayment(req.user, row)) return res.status(403).send('You can only view your own receipt.');
  if (row.status !== 'paid') return res.status(409).send('Receipt is available only after confirmed payment.');
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(receiptHtml(hydratePayment(row, false)));
});

router.get('/:id/receipt.pdf', (req, res) => {
  const row = db.prepare('SELECT * FROM payments WHERE id = ?').get(Number(req.params.id));
  if (!row) return res.status(404).send('Payment not found.');
  if (!canViewPayment(req.user, row)) return res.status(403).send('You can only view your own receipt.');
  if (row.status !== 'paid') return res.status(409).send('Receipt is available only after confirmed payment.');
  const pdf = receiptPdf(hydratePayment(row, false));
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="payment-receipt-${row.id}.pdf"`
  });
  res.send(pdf);
});

router.post('/:id/qr', async (req, res) => {
  const existing = db.prepare('SELECT * FROM payments WHERE id = ?').get(Number(req.params.id));
  if (!existing) return res.status(404).json({ error: 'Payment not found.' });
  if (!canViewPayment(req.user, existing)) return res.status(403).json({ error: 'You can only pay for your own transaction.' });
  if (existing.status === 'paid') return res.status(400).json({ error: 'This payment is already confirmed.' });

  const cfg = paymongoConfig();
  if (!cfg.configured) {
    const withQr = await saveIdentifierQr(existing);
    return res.json({
      payment: hydratePayment(withQr, true),
      configured: false,
      error: 'PayMongo is not configured. A real QR cannot be generated.'
    });
  }

  try {
    if (['expired', 'failed', 'cancelled'].includes(existing.status)) {
      const info = db.prepare(
        `INSERT INTO payments (user_id, alumni_id, related_type, related_id, request_code, gateway, payment_method, amount_centavos, currency, status, description, livemode, metadata)
         VALUES (?, ?, ?, ?, ?, 'paymongo', 'qrph', ?, 'PHP', 'pending', ?, ?, ?)`
      ).run(
        existing.user_id,
        existing.alumni_id,
        existing.related_type,
        existing.related_id,
        existing.request_code,
        existing.amount_centavos,
        existing.description,
        cfg.livemode ? 1 : 0,
        existing.metadata || '{}'
      );
      const created = db.prepare('SELECT * FROM payments WHERE id = ?').get(info.lastInsertRowid);
      const withQr = await attachQrToPayment(created);
      writeAudit(req.user, 'create', 'payment', withQr.id, 'Regenerated QR Ph');
      return res.status(201).json({ payment: hydratePayment(withQr, true), mode: cfg.mode });
    }
    const withQr = await attachQrToPayment(existing);
    res.json({ payment: hydratePayment(withQr, true), mode: cfg.mode });
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message || 'Unable to generate a PayMongo QR.' });
  }
});

router.get('/:id', async (req, res) => {
  const row = db.prepare('SELECT * FROM payments WHERE id = ?').get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Payment not found.' });
  if (!canViewPayment(req.user, row)) return res.status(403).json({ error: 'You can only view your own payment.' });
  let current = row;
  if (!current.qr_image && !['paid', 'expired', 'failed', 'cancelled'].includes(current.status)) {
    current = await saveIdentifierQr(current);
  }
  res.json({ payment: hydratePayment(current, true) });
});

router.post('/:id/sync', async (req, res) => {
  const row = db.prepare('SELECT * FROM payments WHERE id = ?').get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Payment not found.' });
  if (!canViewPayment(req.user, row)) return res.status(403).json({ error: 'You can only view your own payment.' });
  try {
    const updated = await syncFromGateway(row);
    res.json({ payment: hydratePayment(updated, true), synced: true });
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message || 'Unable to verify payment with PayMongo.' });
  }
});

router.post('/checkout', async (req, res) => {
  let charge;
  try {
    charge = resolveChargeable(req);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }

  const cfg = paymongoConfig();
  const code = charge.code || requestCode(charge.relatedType, charge.related);
  const info = db.prepare(
    `INSERT INTO payments (user_id, alumni_id, related_type, related_id, request_code, gateway, payment_method, amount_centavos, currency, status, description, livemode, metadata)
     VALUES (?, ?, ?, ?, ?, 'paymongo', 'qrph', ?, 'PHP', 'pending', ?, ?, ?)`
  ).run(
    req.user.id,
    charge.alumniId,
    charge.relatedType,
    charge.related,
    code,
    charge.amount,
    charge.description,
    cfg.livemode ? 1 : 0,
    JSON.stringify({
      campaign: charge.campaign || '',
      donor: charge.donor || req.user.name || '',
      dedication: charge.dedication || '',
      anonymous: charge.anonymous === true
    })
  );
  let payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(info.lastInsertRowid);
  writeAudit(req.user, 'create', 'payment', payment.id, charge.description);

  if (!cfg.configured) {
    payment = await saveIdentifierQr(payment);
    return res.status(201).json({
      payment: hydratePayment(payment, true),
      configured: false,
      mode: cfg.mode,
      error: 'PayMongo is not configured. A real QR Ph code cannot be generated until PAYMONGO_SECRET_KEY is added.'
    });
  }

  try {
    payment = await attachQrToPayment(payment);
    res.status(201).json({
      payment: hydratePayment(payment, true),
      configured: true,
      mode: cfg.mode
    });
  } catch (err) {
    payment = await saveIdentifierQr(payment);
    res.status(201).json({
      payment: hydratePayment(payment, true),
      configured: true,
      mode: cfg.mode,
      error: err.message || 'PayMongo did not return a QR image.'
    });
  }
});

export async function handlePaymongoWebhook(req, res) {
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body || '');
  if (!verifyPaymongoSignature(raw, req.headers['paymongo-signature'])) {
    return res.status(400).json({ error: 'Invalid PayMongo webhook signature.' });
  }
  let event;
  try { event = JSON.parse(raw); } catch {
    return res.status(400).json({ error: 'Invalid webhook payload.' });
  }
  const eventId = event?.data?.id || '';
  const eventType = event?.data?.attributes?.type || '';
  if (eventId) {
    const seen = db.prepare('SELECT * FROM payment_events WHERE event_id = ?').get(eventId);
    if (seen && seen.processed) return res.json({ ok: true, duplicate: true });
    if (!seen) {
      db.prepare('INSERT OR IGNORE INTO payment_events (event_id, payment_id, event_type, processed) VALUES (?, 0, ?, 0)').run(eventId, eventType);
    }
  }

  const payload = event?.data?.attributes?.data || {};
  const metadata = payload?.attributes?.metadata || {};
  let localId = Number(metadata.local_payment_id || 0);
  const checkoutId = payload?.id && String(payload.id).startsWith('cs_') ? payload.id : '';
  const intentId = payload?.id && String(payload.id).startsWith('pi_')
    ? payload.id
    : (payload?.attributes?.payment_intent_id || payload?.attributes?.payment_intent?.id || '');
  let paymentId = payload?.id && String(payload.id).startsWith('pay_') ? payload.id : '';
  if (!paymentId) paymentId = payload?.attributes?.payments?.[0]?.id || '';
  if (!localId && checkoutId) localId = db.prepare('SELECT id FROM payments WHERE gateway_checkout_id = ?').get(checkoutId)?.id || 0;
  if (!localId && paymentId) localId = db.prepare('SELECT id FROM payments WHERE gateway_payment_id = ?').get(paymentId)?.id || 0;
  if (!localId && intentId) localId = db.prepare('SELECT id FROM payments WHERE gateway_intent_id = ?').get(intentId)?.id || 0;

  let nextStatus = '';
  if (eventType.includes('paid') || eventType.includes('succeeded')) nextStatus = 'paid';
  else if (eventType.includes('failed')) nextStatus = 'failed';
  else if (eventType.includes('expired')) nextStatus = 'expired';
  else if (eventType.includes('cancel')) nextStatus = 'cancelled';

  if (localId && nextStatus === 'paid') {
    let confirmed = false;
    try {
      if (paymentId) {
        const remote = await retrievePayment(paymentId);
        confirmed = remote?.data?.attributes?.status === 'paid';
      } else if (intentId) {
        const intent = await retrievePaymentIntent(intentId);
        confirmed = localStatusFromIntent(intent) === 'paid';
      }
    } catch {
      confirmed = false;
    }
    if (confirmed) {
      markPaymentStatus(localId, 'paid', {
        gatewayPaymentId: paymentId,
        gatewayIntentId: intentId,
        referenceId: paymentId || intentId
      });
    }
  } else if (localId && nextStatus) {
    markPaymentStatus(localId, nextStatus, {
      gatewayPaymentId: paymentId,
      gatewayIntentId: intentId,
      referenceId: paymentId || intentId
    });
  }

  if (eventId) {
    db.prepare('UPDATE payment_events SET processed = 1, payment_id = ? WHERE event_id = ?').run(localId || 0, eventId);
  }
  res.json({ ok: true });
}

export default router;
