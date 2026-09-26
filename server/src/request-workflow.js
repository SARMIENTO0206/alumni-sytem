import { isAdmin, isAlumni, isStaff } from './auth.js';

export const DOCUMENT_STATUSES = [
  'Payment Required',
  'Pending',
  'For Correction',
  'Approved',
  'Processing',
  'Ready for Release',
  'Released',
  'Rejected',
  'Cancelled'
];

const PROCESSOR_TRANSITIONS = {
  'Payment Required': ['Pending', 'Approved', 'Rejected', 'For Correction'],
  Pending: ['Approved', 'Rejected', 'For Correction'],
  'For Correction': ['Pending', 'Rejected'],
  Approved: ['Processing'],
  Processing: ['Ready for Release'],
  'Ready for Release': ['Released']
};

export const ALUMNI_CANCEL_FROM = ['Payment Required', 'Pending', 'For Correction'];
export const ALUMNI_UPLOAD_FROM = ['Payment Required', 'Pending', 'For Correction'];

export function isDocumentProcessor(user) {
  return isStaff(user) || isAdmin(user);
}

export function paidRequiredFor(status) {
  return ['Processing', 'Ready for Release', 'Released'].includes(status);
}

export function requestIsPaid(row) {
  if (!row) return false;
  if (!Number(row.fee_centavos || 0)) return true;
  return String(row.payment_status || '') === 'paid';
}

export function assertProcessorTransition(fromStatus, toStatus, remarks) {
  const allowed = PROCESSOR_TRANSITIONS[fromStatus] || [];
  if (!allowed.includes(toStatus)) {
    const err = new Error(`Cannot change status from ${fromStatus} to ${toStatus}.`);
    err.status = 400;
    throw err;
  }
  if ((toStatus === 'Rejected' || toStatus === 'For Correction') && !String(remarks || '').trim()) {
    const err = new Error(toStatus === 'Rejected'
      ? 'A reason is required when rejecting a request.'
      : 'Describe the missing information or correction needed.');
    err.status = 400;
    throw err;
  }
}

export function assertAlumniCannotProcess(user) {
  if (isAlumni(user) && !isDocumentProcessor(user)) {
    const err = new Error('Alumni cannot approve, reject, or change the official status of a request.');
    err.status = 403;
    throw err;
  }
}

export function mapAttachment(row) {
  if (!row) return null;
  return {
    id: row.id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    dataUri: row.data_uri,
    createdAt: row.created_at,
    userId: row.user_id
  };
}

export function validateAttachment(file) {
  const name = String(file?.fileName || file?.name || '').trim();
  const dataUri = String(file?.dataUri || file?.dataURL || '').trim();
  const mime = String(file?.mimeType || file?.type || '').trim() || 'application/octet-stream';
  if (!name || !dataUri.startsWith('data:')) {
    const err = new Error('Each supporting document must include a file name and file data.');
    err.status = 400;
    throw err;
  }
  const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
  const mimeFromUri = dataUri.slice(5, dataUri.indexOf(';')) || mime;
  if (!allowed.includes(mime) && !allowed.includes(mimeFromUri)) {
    const err = new Error('Supporting documents must be PDF, JPG, or PNG.');
    err.status = 400;
    throw err;
  }
  const comma = dataUri.indexOf(',');
  const b64 = comma >= 0 ? dataUri.slice(comma + 1) : '';
  const sizeBytes = Math.floor((b64.length * 3) / 4);
  if (sizeBytes > 1024 * 1024) {
    const err = new Error('Each supporting document must be 1 MB or smaller.');
    err.status = 400;
    throw err;
  }
  return { fileName: name.slice(0, 180), mimeType: mimeFromUri || mime, sizeBytes, dataUri };
}

export function stampForStatus(status) {
  const now = new Date().toISOString();
  if (status === 'Approved') return { approved_at: now };
  if (status === 'Processing') return { processed_at: now };
  if (status === 'Released') return { released_at: now };
  if (status === 'Cancelled') return { cancelled_at: now };
  return {};
}
