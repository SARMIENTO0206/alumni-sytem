/**
 * Philippine mobile number validation and storage normalization.
 * Accepted input: 09XXXXXXXXX, +639XXXXXXXXX, 639XXXXXXXXX, 9XXXXXXXXX
 * Stored format: +639XXXXXXXXX
 */

export function normalizePhMobile(input, { required = false } = {}) {
  const raw = String(input || '').trim();
  if (!raw) {
    if (required) {
      const err = new Error('Mobile number is required.');
      err.status = 400;
      throw err;
    }
    return '';
  }

  const digits = raw.replace(/[^\d+]/g, '');
  let local = digits;
  if (local.startsWith('+')) local = local.slice(1);
  if (local.startsWith('63') && local.length === 12) local = `0${local.slice(2)}`;
  if (local.startsWith('9') && local.length === 10) local = `0${local}`;

  if (!/^09\d{9}$/.test(local)) {
    const err = new Error('Enter a valid Philippine mobile number (09XXXXXXXXX or +639XXXXXXXXX).');
    err.status = 400;
    throw err;
  }

  return `+63${local.slice(1)}`;
}

export function displayPhMobile(stored) {
  const normalized = String(stored || '').trim();
  if (!normalized) return '';
  if (normalized.startsWith('+63') && normalized.length === 13) {
    return `0${normalized.slice(3)}`;
  }
  return normalized;
}
