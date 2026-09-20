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
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined
  });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

const alumni = await login('alumni', 'alumni123');
const staff = await login('registrar', 'registrar123');
const admin = await login('admin', 'admin123');

const created = await req(alumni.token, 'POST', '/api/transcripts', {
  purpose: 'Board Exam / PRC Application',
  type: 'Transcript of Records',
  delivery: 'Pick-up at Registrar Window'
});
assert(created.status === 201, `create failed ${created.status} ${created.data?.error}`);
assert(created.data.request.status === 'Payment Required', 'new request must start Payment Required while a fee is due');
const id = created.data.request.id;

const alumniApprove = await req(alumni.token, 'PUT', `/api/transcripts/${id}/status`, { status: 'Approved' });
assert(alumniApprove.status === 403, `alumni must not approve, got ${alumniApprove.status}`);

const alumniDelete = await req(alumni.token, 'DELETE', `/api/transcripts/${id}`);
assert(alumniDelete.status === 403, `alumni must not delete, got ${alumniDelete.status}`);

const staffUnpaid = await req(staff.token, 'PUT', `/api/transcripts/${id}/status`, { status: 'Approved' });
assert(staffUnpaid.status === 400, `registrar must not approve unpaid request, got ${staffUnpaid.status}`);

const { db } = await import('../src/db.js');
db.prepare("UPDATE transcript_requests SET payment_status = 'paid', status = 'Pending' WHERE id = ?").run(id);

const staffRejectNoReason = await req(staff.token, 'PUT', `/api/transcripts/${id}/status`, { status: 'Rejected' });
assert(staffRejectNoReason.status === 400, 'rejection without reason must fail');

const correction = await req(staff.token, 'PUT', `/api/transcripts/${id}/status`, {
  status: 'For Correction',
  remarks: 'Please attach a valid ID and confirm your batch year.'
});
assert(correction.status === 200 && correction.data.request.status === 'For Correction', 'registrar can return for correction');

const alumniResubmit = await req(alumni.token, 'POST', `/api/transcripts/${id}/correction-response`, {
  notes: 'Valid ID attached. Batch year is 2018.'
});
assert(alumniResubmit.status === 200 && alumniResubmit.data.request.status === 'Pending', 'alumni correction returns request to Pending');

const approved = await req(staff.token, 'PUT', `/api/transcripts/${id}/status`, {
  status: 'Approved',
  remarks: 'Records verified.'
});
assert(approved.status === 200 && approved.data.request.status === 'Approved', `approve failed ${approved.status} ${approved.data?.error}`);

const alumniCancelLate = await req(alumni.token, 'POST', `/api/transcripts/${id}/cancel`, { remarks: 'changed mind' });
assert(alumniCancelLate.status === 400, 'alumni cannot cancel after approval');

const processing = await req(staff.token, 'PUT', `/api/transcripts/${id}/status`, { status: 'Processing' });
assert(processing.status === 200 && processing.data.request.status === 'Processing', 'processing step failed');

const ready = await req(staff.token, 'PUT', `/api/transcripts/${id}/status`, {
  status: 'Ready for Release',
  claimWindow: 'Registrar window, Mon-Fri 8AM-4PM',
  claimNotes: 'Bring valid ID.'
});
assert(ready.status === 200 && ready.data.request.status === 'Ready for Release', 'ready for release failed');
assert(ready.data.request.claimWindow.includes('Registrar'), 'claim window should be stored');

const released = await req(staff.token, 'PUT', `/api/transcripts/${id}/status`, { status: 'Released' });
assert(released.status === 200 && released.data.request.status === 'Released', 'released failed');

const cancelable = await req(alumni.token, 'POST', '/api/transcripts', {
  purpose: 'Personal Copy',
  type: 'Transcript of Records'
});
const cancelId = cancelable.data.request.id;
const cancelled = await req(alumni.token, 'POST', `/api/transcripts/${cancelId}/cancel`, { remarks: 'No longer needed.' });
assert(cancelled.status === 200 && cancelled.data.request.status === 'Cancelled', 'alumni may cancel before review');
const stillThere = await req(alumni.token, 'GET', `/api/transcripts/${cancelId}`);
assert(stillThere.status === 200 && stillThere.data.request.status === 'Cancelled', 'cancelled request must remain in history');

const adminUsers = await req(admin.token, 'GET', '/api/users');
assert(adminUsers.status === 200, 'admin manages users');
const staffUsers = await req(staff.token, 'GET', '/api/users');
assert(staffUsers.status === 403, 'registrar cannot manage all user accounts');

console.log('request workflow ok', { id, cancelId, released: released.data.request.status });
