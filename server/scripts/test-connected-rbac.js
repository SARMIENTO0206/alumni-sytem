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

const admin = await login('admin', 'admin123');
const staff = await login('staff', 'staff123');
const alumni = await login('alumni', 'alumni123');
console.log('roles', admin.user.role, staff.user.role, alumni.user.role, 'alumniId', alumni.user.alumniId);

const created = await req(alumni.token, 'POST', '/api/transcripts', { purpose: 'Employment', type: 'Transcript of Records' });
console.log('alumni create transcript', created.status, created.data.request && created.data.request.id, created.data.request && created.data.request.status);

const requestId = created.data.request.id;
const staffList = await req(staff.token, 'GET', '/api/transcripts');
const seen = (staffList.data.requests || []).some((r) => r.id === requestId);
console.log('staff sees alumni request', staffList.status, seen);

const process = await req(staff.token, 'PUT', `/api/transcripts/${requestId}/status`, { status: 'Approved', remarks: 'Verified academic record.' });
console.log('staff approve', process.status, process.data.request && process.data.request.status);

const alumniAgain = await req(alumni.token, 'GET', `/api/transcripts/${requestId}`);
console.log('alumni sees updated status', alumniAgain.status, alumniAgain.data.request && alumniAgain.data.request.status, alumniAgain.data.request && alumniAgain.data.request.remarks);

const other = await req(alumni.token, 'GET', '/api/alumni');
console.log('alumni alumni list count', other.status, (other.data.alumni || []).length);

const usersForbidden = await req(alumni.token, 'GET', '/api/users');
const staffUsers = await req(staff.token, 'GET', '/api/users');
const adminUsers = await req(admin.token, 'GET', '/api/users');
console.log('users 403/403/200', usersForbidden.status, staffUsers.status, adminUsers.status);

const opsStaff = await req(staff.token, 'GET', '/api/reports/operational');
console.log('operational report for staff', opsStaff.status);

const steal = await req(alumni.token, 'GET', `/api/transcripts/${requestId + 999}`);
console.log('missing request', steal.status);

const job = await req(staff.token, 'POST', '/api/jobs', { title: 'Connected Test Role', company: 'SAA', status: 'Published' });
const jobsAlumni = await req(alumni.token, 'GET', '/api/jobs');
const jobSeen = (jobsAlumni.data.jobs || []).some((j) => j.id === job.data.job.id);
console.log('alumni sees staff job', job.status, jobSeen);

await req(alumni.token, 'POST', `/api/jobs/${job.data.job.id}/apply`, { name: alumni.user.name });
const appsStaff = await req(staff.token, 'GET', '/api/applications');
const appsAlumni = await req(alumni.token, 'GET', '/api/applications');
console.log('applications staff/alumni', (appsStaff.data.applications || []).length, (appsAlumni.data.applications || []).length);

const notes = await req(alumni.token, 'GET', '/api/notifications');
console.log('alumni notifications', notes.status, (notes.data.notifications || []).length);

await req(staff.token, 'DELETE', `/api/jobs/${job.data.job.id}`);
console.log('done');
