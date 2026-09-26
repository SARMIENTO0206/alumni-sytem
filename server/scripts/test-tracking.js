const base = process.env.SAA_TEST_API_BASE || 'http://localhost:3000';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

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
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
}

const [admin, registrar, alumni] = await Promise.all([
  login('admin', 'admin123'),
  login('registrar', 'registrar123'),
  login('alumni', 'alumni123')
]);

const alumniRecords = await req(alumni.token, 'GET', '/api/tracking');
assert(alumniRecords.status === 200 && alumniRecords.data.alumni.length >= 1, 'alumni should see their linked tracking record');
const ownRecord = alumniRecords.data.alumni.find((record) =>
  Number(record.userId) === Number(alumni.user.id) ||
  Number(record.id) === Number(alumni.user.alumniId)
);
assert(ownRecord, 'alumni should only receive their linked tracking record');

const adminRecords = await req(admin.token, 'GET', '/api/tracking');
assert(adminRecords.status === 200 && adminRecords.data.alumni.length >= 1, 'Admin can monitor all tracking records');
assert(!('fieldAlignment' in adminRecords.data.summary), 'tracking summary must not report degree field alignment');
const created = await req(registrar.token, 'POST', '/api/alumni', {
  name: `Tracking Test Other Alumni ${Date.now()}`,
  batch: '2022',
  program: 'SHS',
  studentId: 'TRACKING-TEST-2022'
});
assert(created.status === 201 && created.data.alumni.status === 'No Data', 'new alumni records must preserve unknown status');
assert(!created.data.alumni.lastUpdated, 'new alumni without status data must be considered stale');
const otherRecordId = created.data.alumni.id;

const alumniUpdateOther = await req(alumni.token, 'PUT', `/api/tracking/${otherRecordId}/employment`, {
  status: 'Employed',
  company: 'Test Company',
  title: 'Assistant'
});
assert(alumniUpdateOther.status === 403, 'alumni cannot update another alumnus');

const adminUpdateOwn = await req(admin.token, 'PUT', `/api/tracking/${ownRecord.id}/employment`, { status: 'Seeking Employment' });
const registrarUpdateOwn = await req(registrar.token, 'PUT', `/api/tracking/${ownRecord.id}/employment`, { status: 'Seeking Employment' });
assert(adminUpdateOwn.status === 403 && registrarUpdateOwn.status === 403, 'staff roles cannot submit alumni tracking updates');

const invalidStatus = await req(alumni.token, 'PUT', `/api/tracking/${ownRecord.id}/employment`, { status: 'Directly Related' });
assert(invalidStatus.status === 400, 'invalid tracking status should be rejected');

const update = await req(alumni.token, 'PUT', `/api/tracking/${ownRecord.id}/employment`, {
  status: 'Further Studies',
  educationSchool: 'St. Agnes Test College',
  educationProgram: 'Information Technology'
});
assert(update.status === 200 && update.data.alumni.status === 'Further Studies', 'alumni can submit their own further-studies status');
assert(update.data.alumni.trackingReviewStatus === 'Pending', 'alumni updates must return to Registrar review');

const registrarReview = await req(registrar.token, 'PUT', `/api/tracking/${ownRecord.id}/review`, {
  status: 'Verified',
  note: 'Record matched.'
});
assert(registrarReview.status === 200 && registrarReview.data.alumni.trackingReviewStatus === 'Verified', 'Registrar can verify alumni status information');
const adminReview = await req(admin.token, 'PUT', `/api/tracking/${ownRecord.id}/review`, { status: 'Verified' });
assert(adminReview.status === 403, 'Admin monitors tracking data but cannot perform Registrar review');

const alumniSettings = await req(alumni.token, 'GET', '/api/tracking/settings');
assert(alumniSettings.status === 403, 'reminder configuration must not be visible to Alumni');
const staffSettings = await req(registrar.token, 'GET', '/api/tracking/settings');
assert(staffSettings.status === 200, 'Registrar can see the reminder period');
const staffChangesSettings = await req(registrar.token, 'PUT', '/api/tracking/settings', { reminderMonths: 4 });
assert(staffChangesSettings.status === 403, 'only Admin can change the reminder period');
const invalidSettings = await req(admin.token, 'PUT', '/api/tracking/settings', { reminderMonths: 0 });
assert(invalidSettings.status === 400, 'invalid reminder periods should be rejected');
const savedSettings = await req(admin.token, 'PUT', '/api/tracking/settings', { reminderMonths: 4 });
assert(savedSettings.status === 200 && savedSettings.data.reminderMonths === 4, 'Admin can save a reminder period');
const settingsSavedElsewhere = await req(admin.token, 'PUT', '/api/settings', { general: { contact: 'tracking-test@example.test' } });
assert(settingsSavedElsewhere.status === 200, 'Admin system settings save should succeed');
const settingsAfterUpdate = await req(admin.token, 'GET', '/api/tracking/settings');
assert(settingsAfterUpdate.data.reminderMonths === 4, 'general settings updates must preserve tracking reminder settings');

const adminSendsAlumniStatus = await req(alumni.token, 'POST', '/api/tracking/reminders/sweep');
const registrarSendsReminders = await req(registrar.token, 'POST', '/api/tracking/reminders/sweep');
assert(adminSendsAlumniStatus.status === 403 && registrarSendsReminders.status === 403, 'only Admin may dispatch profile reminders');

const job = await req(registrar.token, 'POST', '/api/jobs', {
  title: `Career Test ${Date.now()}`,
  company: 'Test Employer',
  industry: 'BPO / Customer Service',
  employment_type: 'Full-time',
  qualifications: 'Clear communication skills',
  application_method: 'Link',
  application_details: 'https://example.test/apply',
  target_education_level: 'All Alumni',
  status: 'Published'
});
assert(job.status === 201 && job.data.job.industry === 'BPO / Customer Service', 'Registrar can publish a job with career details');
const alumniJobs = await req(alumni.token, 'GET', '/api/jobs');
assert(alumniJobs.status === 200 && alumniJobs.data.jobs.some((item) => item.id === job.data.job.id), 'alumni can see published opportunities');
const alumniPostJob = await req(alumni.token, 'POST', '/api/jobs', { title: 'Unauthorized job' });
assert(alumniPostJob.status === 403, 'alumni cannot publish job opportunities');
const invalidJobLink = await req(registrar.token, 'POST', '/api/jobs', {
  title: 'Invalid Link Test',
  application_method: 'Link',
  application_details: 'javascript:alert(1)'
});
assert(invalidJobLink.status === 400, 'job application links must use HTTPS');
const archivedJob = await req(registrar.token, 'PUT', `/api/jobs/${job.data.job.id}`, { status: 'Archived' });
assert(archivedJob.status === 200 && archivedJob.data.job.status === 'Archived', 'Registrar can archive a job');
const alumniJobsAfterArchive = await req(alumni.token, 'GET', '/api/jobs');
assert(!alumniJobsAfterArchive.data.jobs.some((item) => item.id === job.data.job.id), 'alumni cannot see archived opportunities');
await req(registrar.token, 'DELETE', `/api/jobs/${job.data.job.id}`);

console.log('Graduate tracking and Career Management role, status, review, and listing checks passed.');
