import { Router } from 'express';
import { db, writeAudit, writeRequestHistory, linkAlumniAccount, findAlumniForUser } from '../db.js';
import { isAlumni, ownsLinkedRow, requireRole } from '../auth.js';
import { mirror, mirrorUpdate } from '../sync-supabase.js';
import { documentFeeCentavos, pesosFromCentavos } from '../paymongo.js';
import { dispatchNotification, dispatchStaffAudience } from '../notify.js';
import {
  ALUMNI_CANCEL_FROM,
  ALUMNI_UPLOAD_FROM,
  DOCUMENT_STATUSES,
  assertAlumniCannotProcess,
  assertProcessorTransition,
  isDocumentProcessor,
  mapAttachment,
  paidRequiredFor,
  requestIsPaid,
  stampForStatus,
  validateAttachment
} from '../request-workflow.js';

const router = Router();

const mapTranscript = (r) => ({
  id: r.id, name: r.name, email: r.email, contact: r.contact, date: r.date,
  purpose: r.purpose, status: r.status, type: r.type, delivery: r.delivery,
  paymentRef: r.payment_ref, remarks: r.remarks || '', userId: r.user_id || 0, alumniId: r.alumni_id || 0,
  feeCentavos: r.fee_centavos || 0, fee: pesosFromCentavos(r.fee_centavos || 0),
  paymentStatus: r.payment_status || '',
  copies: r.copies || 1,
  claimWindow: r.claim_window || '',
  claimNotes: r.claim_notes || '',
  approvedAt: r.approved_at || '',
  processedAt: r.processed_at || '',
  releasedAt: r.released_at || '',
  cancelledAt: r.cancelled_at || '',
  correctionNotes: r.correction_notes || '',
  canCancel: ALUMNI_CANCEL_FROM.includes(r.status),
  canUpload: ALUMNI_UPLOAD_FROM.includes(r.status)
});

const mapReprint = (r) => ({
  id: r.id, name: r.name, type: r.type, status: r.status, remarks: r.remarks || '',
  userId: r.user_id || 0, alumniId: r.alumni_id || 0,
  feeCentavos: r.fee_centavos || 0, fee: pesosFromCentavos(r.fee_centavos || 0),
  paymentStatus: r.payment_status || '',
  copies: r.copies || 1,
  claimWindow: r.claim_window || '',
  claimNotes: r.claim_notes || '',
  approvedAt: r.approved_at || '',
  processedAt: r.processed_at || '',
  releasedAt: r.released_at || '',
  cancelledAt: r.cancelled_at || '',
  correctionNotes: r.correction_notes || '',
  canCancel: ALUMNI_CANCEL_FROM.includes(r.status),
  canUpload: ALUMNI_UPLOAD_FROM.includes(r.status)
});

const mapPlacement = (p) => ({
  id: p.id, alumni: p.alumni, company: p.company, title: p.title, date: p.date,
  alumniId: p.alumni_id || 0, userId: p.user_id || 0
});

function ownerIds(user, name) {
  if (isAlumni(user)) {
    const linked = findAlumniForUser(user) || linkAlumniAccount(user);
    return { userId: user.id, alumniId: linked ? linked.id : (user.alumniId || 0) };
  }
  const named = name
    ? db.prepare('SELECT * FROM alumni WHERE LOWER(name) = LOWER(?)').get(name)
    : null;
  return { userId: named?.user_id || 0, alumniId: named?.id || 0 };
}

function scopeOwn(user, rows) {
  if (!isAlumni(user)) return rows;
  return rows.filter((row) => ownsLinkedRow(user, row));
}

function denyIfNotOwner(req, res, row, label) {
  if (!row) {
    res.status(404).json({ error: `${label} not found.` });
    return true;
  }
  if (!ownsLinkedRow(req.user, row)) {
    res.status(403).json({ error: `You can only view your own ${label.toLowerCase()}.` });
    return true;
  }
  return false;
}

function notifyStatusChange(row, kind, status, remarks) {
  const relatedType = kind === 'Transcript' ? 'transcript' : 'reprint';
  const subject = `${kind} request ${status}`;
  const message = remarks
    ? `Your ${kind.toLowerCase()} request #${row.id} is now ${status}. ${remarks}`
    : `Your ${kind.toLowerCase()} request #${row.id} is now ${status}.`;
  dispatchNotification({
    userId: row.user_id,
    alumniId: row.alumni_id,
    recipient: row.email || row.name,
    channel: 'SYSTEM',
    subject,
    message,
    relatedType,
    relatedId: row.id,
    email: row.email,
    phone: row.contact
  }).catch(() => { /* delivery must not block status updates */ });
}

function loadAttachments(kind, id) {
  return db.prepare(
    'SELECT * FROM request_attachments WHERE request_type = ? AND request_id = ? ORDER BY id DESC'
  ).all(kind, id).map(mapAttachment);
}

function loadHistory(kind, id) {
  return db.prepare(
    'SELECT * FROM request_history WHERE request_type = ? AND request_id = ? ORDER BY id DESC'
  ).all(kind, id).map((h) => ({
    id: h.id, action: h.action, remarks: h.remarks, actorRole: h.actor_role, createdAt: h.created_at
  }));
}

function applyStatusStamp(table, id, status, extra = {}) {
  const stamp = stampForStatus(status);
  const sets = ['status = ?'];
  const values = [status];
  if (extra.remarks !== undefined) {
    sets.push('remarks = ?');
    values.push(extra.remarks);
  }
  if (extra.correction_notes !== undefined) {
    sets.push('correction_notes = ?');
    values.push(extra.correction_notes);
  }
  if (extra.claim_window !== undefined) {
    sets.push('claim_window = ?');
    values.push(extra.claim_window);
  }
  if (extra.claim_notes !== undefined) {
    sets.push('claim_notes = ?');
    values.push(extra.claim_notes);
  }
  Object.entries(stamp).forEach(([col, val]) => {
    sets.push(`${col} = ?`);
    values.push(val);
  });
  values.push(id);
  db.prepare(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = ?`).run(...values);
}

function saveAttachments(kind, requestId, userId, files) {
  const list = Array.isArray(files) ? files : (files ? [files] : []);
  const saved = [];
  for (const file of list.slice(0, 3)) {
    const valid = validateAttachment(file);
    const info = db.prepare(
      `INSERT INTO request_attachments (request_type, request_id, user_id, file_name, mime_type, size_bytes, data_uri)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(kind, requestId, userId, valid.fileName, valid.mimeType, valid.sizeBytes, valid.dataUri);
    saved.push(db.prepare('SELECT * FROM request_attachments WHERE id = ?').get(info.lastInsertRowid));
  }
  return saved.map(mapAttachment);
}

/* ------------------------------- Transcripts ------------------------------ */

router.get('/transcripts', (req, res) => {
  const rows = scopeOwn(req.user, db.prepare('SELECT * FROM transcript_requests ORDER BY id DESC').all());
  const status = String(req.query.status || '').trim();
  const filtered = status ? rows.filter((r) => r.status === status) : rows;
  res.json({ requests: filtered.map(mapTranscript) });
});

router.get('/transcripts/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM transcript_requests WHERE id = ?').get(Number(req.params.id));
  if (denyIfNotOwner(req, res, row, 'Transcript request')) return;
  res.json({
    request: mapTranscript(row),
    history: loadHistory('transcript', row.id),
    attachments: loadAttachments('transcript', row.id)
  });
});

router.post('/transcripts', (req, res) => {
  const { email, contact, purpose, type, delivery, copies, attachments } = req.body || {};
  const name = isAlumni(req.user) ? (req.user.name || req.body?.name) : req.body?.name;
  const owner = ownerIds(req.user, name);
  if (!name || !purpose) return res.status(400).json({ error: 'Name and purpose are required.' });

  const fee = documentFeeCentavos(delivery);
  const initialStatus = fee > 0 ? 'Payment Required' : 'Pending';
  const info = db.prepare(
    `INSERT INTO transcript_requests (name, email, contact, date, purpose, status, type, delivery, payment_ref, user_id, alumni_id, remarks, fee_centavos, payment_status, copies)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, '', ?, 'pending', ?)`
  ).run(
    name,
    email || req.user.email || '',
    contact || req.user.contact || '',
    new Date().toISOString().split('T')[0],
    purpose,
    initialStatus,
    type || 'Transcript of Records',
    delivery || 'Pick-up at Registrar Window',
    owner.userId,
    owner.alumniId,
    fee,
    Math.max(1, Math.min(10, Number(copies) || 1))
  );

  const row = db.prepare('SELECT * FROM transcript_requests WHERE id = ?').get(info.lastInsertRowid);
  if (attachments) {
    try { saveAttachments('transcript', row.id, req.user.id, attachments); } catch (err) {
      return res.status(err.status || 400).json({ error: err.message, request: mapTranscript(row) });
    }
  }
  writeAudit(req.user, 'create', 'transcript', row.id, name);
  writeRequestHistory(req.user, 'transcript', row.id, 'Submitted', purpose);
  const payNote = fee > 0
    ? `Payment of PHP ${pesosFromCentavos(row.fee_centavos)} is required before the Registrar can review it.`
    : 'The Registrar will review this request.';
  dispatchNotification({
    userId: owner.userId,
    alumniId: owner.alumniId,
    recipient: email || req.user.email || name,
    channel: 'SYSTEM',
    subject: 'Transcript request received',
    message: `Transcript request #${row.id} was submitted. Status is ${initialStatus}. ${payNote}`,
    relatedType: 'transcript',
    relatedId: row.id,
    email: email || req.user.email,
    phone: contact || req.user.contact
  }).catch(() => {});
  dispatchStaffAudience(
    `New transcript request #${row.id}`,
    `${name} submitted a transcript request. Status: ${initialStatus}.`,
    'transcript',
    row.id
  ).catch(() => {});
  mirror('transcript_requests', row);
  res.status(201).json({
    request: mapTranscript(row),
    attachments: loadAttachments('transcript', row.id)
  });
});

router.put('/transcripts/:id/status', requireRole('admin', 'staff'), (req, res) => {
  const id = Number(req.params.id);
  const { status, remarks, claimWindow, claimNotes } = req.body || {};
  if (!DOCUMENT_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status value.' });
  assertAlumniCannotProcess(req.user);

  const existing = db.prepare('SELECT * FROM transcript_requests WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Request not found.' });
  try {
    assertProcessorTransition(existing.status, status, remarks);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }
  if (paidRequiredFor(status) && !requestIsPaid(existing)) {
    return res.status(400).json({ error: 'This request cannot be processed until GCash payment is confirmed by PayMongo.' });
  }

  applyStatusStamp('transcript_requests', id, status, {
    remarks: remarks ?? existing.remarks ?? '',
    correction_notes: status === 'For Correction' ? (remarks || '') : existing.correction_notes,
    claim_window: claimWindow ?? existing.claim_window,
    claim_notes: claimNotes ?? existing.claim_notes
  });
  const row = db.prepare('SELECT * FROM transcript_requests WHERE id = ?').get(id);
  writeAudit(req.user, 'status', 'transcript', id, status);
  writeRequestHistory(req.user, 'transcript', id, status, remarks || '');
  notifyStatusChange(row, 'Transcript', status, remarks);
  mirrorUpdate('transcript_requests', row);
  res.json({ request: mapTranscript(row), history: loadHistory('transcript', id) });
});

router.post('/transcripts/:id/cancel', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM transcript_requests WHERE id = ?').get(id);
  if (denyIfNotOwner(req, res, existing, 'Transcript request')) return;
  if (!isAlumni(req.user) || Number(existing.user_id) !== Number(req.user.id)) {
    if (!isDocumentProcessor(req.user)) {
      return res.status(403).json({ error: 'You can only cancel your own request.' });
    }
  }
  if (!ALUMNI_CANCEL_FROM.includes(existing.status) && isAlumni(req.user) && !isDocumentProcessor(req.user)) {
    return res.status(400).json({ error: 'This request can no longer be cancelled. Contact the Registrar.' });
  }
  if (['Released', 'Cancelled'].includes(existing.status)) {
    return res.status(400).json({ error: 'This request cannot be cancelled.' });
  }
  const remarks = String(req.body?.remarks || 'Cancelled by requester.');
  applyStatusStamp('transcript_requests', id, 'Cancelled', { remarks });
  const row = db.prepare('SELECT * FROM transcript_requests WHERE id = ?').get(id);
  writeAudit(req.user, 'cancel', 'transcript', id, remarks);
  writeRequestHistory(req.user, 'transcript', id, 'Cancelled', remarks);
  notifyStatusChange(row, 'Transcript', 'Cancelled', remarks);
  dispatchStaffAudience(
    `Transcript request #${id} cancelled`,
    `${row.name} cancelled transcript request #${id}.`,
    'transcript',
    id
  ).catch(() => {});
  res.json({ request: mapTranscript(row) });
});

router.post('/transcripts/:id/attachments', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM transcript_requests WHERE id = ?').get(id);
  if (denyIfNotOwner(req, res, existing, 'Transcript request')) return;
  if (isAlumni(req.user) && !ALUMNI_UPLOAD_FROM.includes(existing.status)) {
    return res.status(400).json({ error: 'Supporting documents can only be added while the request is awaiting payment, pending review, or returned for correction.' });
  }
  try {
    const saved = saveAttachments('transcript', id, req.user.id, req.body?.attachments || req.body?.file);
    writeRequestHistory(req.user, 'transcript', id, 'Attachment uploaded', saved.map((f) => f.fileName).join(', '));
    res.status(201).json({ request: mapTranscript(existing), attachments: loadAttachments('transcript', id) });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

router.post('/transcripts/:id/correction-response', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM transcript_requests WHERE id = ?').get(id);
  if (denyIfNotOwner(req, res, existing, 'Transcript request')) return;
  if (!isAlumni(req.user)) return res.status(403).json({ error: 'Only the alumni requester can submit a correction response.' });
  if (existing.status !== 'For Correction') {
    return res.status(400).json({ error: 'This request is not waiting for a correction response.' });
  }
  const notes = String(req.body?.notes || req.body?.remarks || '').trim();
  if (!notes) return res.status(400).json({ error: 'Describe the updated or missing information.' });
  if (req.body?.attachments) {
    try { saveAttachments('transcript', id, req.user.id, req.body.attachments); } catch (err) {
      return res.status(err.status || 400).json({ error: err.message });
    }
  }
  if (req.body?.purpose) {
    db.prepare('UPDATE transcript_requests SET purpose = ? WHERE id = ?').run(String(req.body.purpose).trim(), id);
  }
  applyStatusStamp('transcript_requests', id, 'Pending', {
    remarks: existing.remarks || '',
    correction_notes: notes
  });
  const row = db.prepare('SELECT * FROM transcript_requests WHERE id = ?').get(id);
  writeRequestHistory(req.user, 'transcript', id, 'Correction submitted', notes);
  dispatchStaffAudience(
    `Transcript request #${id} updated`,
    `${row.name} submitted the requested correction. The request is Pending for Registrar review.`,
    'transcript',
    id
  ).catch(() => {});
  res.json({ request: mapTranscript(row), attachments: loadAttachments('transcript', id), history: loadHistory('transcript', id) });
});

/* ------------------------------- Reprints --------------------------------- */

router.get('/reprints', (req, res) => {
  const rows = scopeOwn(req.user, db.prepare('SELECT * FROM reprints ORDER BY id DESC').all());
  const status = String(req.query.status || '').trim();
  const filtered = status ? rows.filter((r) => r.status === status) : rows;
  res.json({ reprints: filtered.map(mapReprint) });
});

router.get('/reprints/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM reprints WHERE id = ?').get(Number(req.params.id));
  if (denyIfNotOwner(req, res, row, 'Certificate reprint request')) return;
  res.json({
    reprint: mapReprint(row),
    history: loadHistory('reprint', row.id),
    attachments: loadAttachments('reprint', row.id)
  });
});

router.post('/reprints', (req, res) => {
  const type = req.body?.type;
  const name = isAlumni(req.user) ? (req.user.name || req.body?.name) : req.body?.name;
  const owner = ownerIds(req.user, name);
  if (!name || !type) return res.status(400).json({ error: 'Name and certificate type are required.' });
  const fee = documentFeeCentavos('');
  const initialStatus = fee > 0 ? 'Payment Required' : 'Pending';
  const info = db.prepare(
    "INSERT INTO reprints (name, type, status, user_id, alumni_id, remarks, fee_centavos, payment_status, copies) VALUES (?, ?, ?, ?, ?, '', ?, 'pending', ?)"
  ).run(name, type, initialStatus, owner.userId, owner.alumniId, fee, Math.max(1, Math.min(10, Number(req.body?.copies) || 1)));
  const row = db.prepare('SELECT * FROM reprints WHERE id = ?').get(info.lastInsertRowid);
  if (req.body?.attachments) {
    try { saveAttachments('reprint', row.id, req.user.id, req.body.attachments); } catch (err) {
      return res.status(err.status || 400).json({ error: err.message, reprint: mapReprint(row) });
    }
  }
  writeAudit(req.user, 'create', 'reprint', row.id, name);
  writeRequestHistory(req.user, 'reprint', row.id, 'Submitted', type);
  dispatchNotification({
    userId: owner.userId,
    alumniId: owner.alumniId,
    recipient: req.user.email || name,
    channel: 'SYSTEM',
    subject: 'Certificate reprint request received',
    message: `Certificate reprint request #${row.id} was submitted. Status is ${initialStatus}.`,
    relatedType: 'reprint',
    relatedId: row.id,
    email: req.user.email,
    phone: req.user.contact
  }).catch(() => {});
  dispatchStaffAudience(
    `New certificate reprint #${row.id}`,
    `${name} submitted a certificate reprint request. Status: ${initialStatus}.`,
    'reprint',
    row.id
  ).catch(() => {});
  mirror('reprints', row);
  res.status(201).json({ reprint: mapReprint(row), attachments: loadAttachments('reprint', row.id) });
});

router.put('/reprints/:id/status', requireRole('admin', 'staff'), (req, res) => {
  const id = Number(req.params.id);
  const { status, remarks, claimWindow, claimNotes } = req.body || {};
  if (!DOCUMENT_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status value.' });
  assertAlumniCannotProcess(req.user);

  const existing = db.prepare('SELECT * FROM reprints WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Reprint request not found.' });
  try {
    assertProcessorTransition(existing.status, status, remarks);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }
  if (paidRequiredFor(status) && !requestIsPaid(existing)) {
    return res.status(400).json({ error: 'This reprint cannot be processed until GCash payment is confirmed by PayMongo.' });
  }
  applyStatusStamp('reprints', id, status, {
    remarks: remarks ?? existing.remarks ?? '',
    correction_notes: status === 'For Correction' ? (remarks || '') : existing.correction_notes,
    claim_window: claimWindow ?? existing.claim_window,
    claim_notes: claimNotes ?? existing.claim_notes
  });
  const row = db.prepare('SELECT * FROM reprints WHERE id = ?').get(id);
  writeAudit(req.user, 'status', 'reprint', id, status);
  writeRequestHistory(req.user, 'reprint', id, status, remarks || '');
  notifyStatusChange(row, 'Certificate reprint', status, remarks);
  mirrorUpdate('reprints', row);
  res.json({ reprint: mapReprint(row), history: loadHistory('reprint', id) });
});

router.post('/reprints/:id/cancel', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM reprints WHERE id = ?').get(id);
  if (denyIfNotOwner(req, res, existing, 'Certificate reprint request')) return;
  if (isAlumni(req.user) && !isDocumentProcessor(req.user) && !ALUMNI_CANCEL_FROM.includes(existing.status)) {
    return res.status(400).json({ error: 'This request can no longer be cancelled. Contact the Registrar.' });
  }
  if (['Released', 'Cancelled'].includes(existing.status)) {
    return res.status(400).json({ error: 'This request cannot be cancelled.' });
  }
  const remarks = String(req.body?.remarks || 'Cancelled by requester.');
  applyStatusStamp('reprints', id, 'Cancelled', { remarks });
  const row = db.prepare('SELECT * FROM reprints WHERE id = ?').get(id);
  writeAudit(req.user, 'cancel', 'reprint', id, remarks);
  writeRequestHistory(req.user, 'reprint', id, 'Cancelled', remarks);
  notifyStatusChange(row, 'Certificate reprint', 'Cancelled', remarks);
  res.json({ reprint: mapReprint(row) });
});

router.post('/reprints/:id/attachments', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM reprints WHERE id = ?').get(id);
  if (denyIfNotOwner(req, res, existing, 'Certificate reprint request')) return;
  if (isAlumni(req.user) && !ALUMNI_UPLOAD_FROM.includes(existing.status)) {
    return res.status(400).json({ error: 'Supporting documents can only be added while the request is awaiting payment, pending review, or returned for correction.' });
  }
  try {
    saveAttachments('reprint', id, req.user.id, req.body?.attachments || req.body?.file);
    writeRequestHistory(req.user, 'reprint', id, 'Attachment uploaded', '');
    res.status(201).json({ reprint: mapReprint(existing), attachments: loadAttachments('reprint', id) });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

router.delete('/transcripts/:id', (req, res) => {
  res.status(403).json({ error: 'Official requests cannot be permanently deleted. Cancel the request instead so the history is preserved.' });
});

router.delete('/reprints/:id', (req, res) => {
  res.status(403).json({ error: 'Official requests cannot be permanently deleted. Cancel the request instead so the history is preserved.' });
});

/* ------------------------------- Placements ------------------------------- */

router.get('/placements', (req, res) => {
  const rows = scopeOwn(req.user, db.prepare('SELECT * FROM placements ORDER BY id DESC').all());
  res.json({ placements: rows.map(mapPlacement) });
});

router.post('/placements', requireRole('admin', 'staff'), (req, res) => {
  const { alumni, company, title, alumniId, userId } = req.body || {};
  if (!alumni || !company || !title) {
    return res.status(400).json({ error: 'Alumnus name, company and job title are required.' });
  }
  const linked = alumniId
    ? db.prepare('SELECT * FROM alumni WHERE id = ?').get(Number(alumniId))
    : db.prepare('SELECT * FROM alumni WHERE LOWER(name) = LOWER(?)').get(alumni);
  const info = db.prepare(
    'INSERT INTO placements (alumni, company, title, date, alumni_id, user_id) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(
    alumni, company, title, new Date().toISOString().split('T')[0],
    linked?.id || Number(alumniId) || 0,
    linked?.user_id || Number(userId) || 0
  );
  const row = db.prepare('SELECT * FROM placements WHERE id = ?').get(info.lastInsertRowid);
  writeAudit(req.user, 'create', 'placement', row.id, alumni);
  mirror('placements', row);
  res.status(201).json({ placement: mapPlacement(row) });
});

router.put('/placements/:id', requireRole('admin', 'staff'), (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM placements WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Placement record not found.' });
  const { alumni, company, title, date } = req.body || {};
  db.prepare('UPDATE placements SET alumni = ?, company = ?, title = ?, date = ? WHERE id = ?').run(
    alumni ?? existing.alumni,
    company ?? existing.company,
    title ?? existing.title,
    date ?? existing.date,
    id
  );
  res.json({ placement: mapPlacement(db.prepare('SELECT * FROM placements WHERE id = ?').get(id)) });
});

router.delete('/placements/:id', requireRole('admin', 'staff'), (req, res) => {
  const info = db.prepare('DELETE FROM placements WHERE id = ?').run(Number(req.params.id));
  if (info.changes === 0) return res.status(404).json({ error: 'Placement record not found.' });
  res.status(204).end();
});

export default router;
