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

const communicationRecipients = await req(registrar.token, 'GET', '/api/notifications/communications/recipients');
assert(communicationRecipients.status === 200 && communicationRecipients.data.recipients.length >= 1, 'Registrar can load the active Alumni recipient list');
const alumniCommunicationRecipients = await req(alumni.token, 'GET', '/api/notifications/communications/recipients');
assert(alumniCommunicationRecipients.status === 403, 'Alumni cannot access the communications recipient list');
const communicationsHistory = await req(admin.token, 'GET', '/api/notifications/communications/history');
assert(communicationsHistory.status === 200 && Array.isArray(communicationsHistory.data.messages), 'Admin can load communications delivery history');
const alumniCommunicationsHistory = await req(alumni.token, 'GET', '/api/notifications/communications/history');
assert(alumniCommunicationsHistory.status === 403, 'Alumni cannot access communications delivery history');
const invalidCommunicationSend = await req(registrar.token, 'POST', '/api/notifications/communications/send', {
  channel: 'SMS',
  recipientMode: 'selected',
  userIds: [],
  message: 'Validation test'
});
assert(invalidCommunicationSend.status === 400, 'communications send rejects an empty recipient selection');
const invalidEmailAttachment = await req(registrar.token, 'POST', '/api/notifications/communications/send', {
  channel: 'EMAIL',
  recipientMode: 'individual',
  userIds: [alumni.user.id],
  subject: 'Attachment validation test',
  message: 'This message must not be sent.',
  attachment: { filename: 'not-a-pdf.pdf', contentType: 'application/pdf', contentBase64: 'bm90IGEgcGRm' }
});
assert(invalidEmailAttachment.status === 400, 'communications endpoint rejects non-PDF attachments');
const announcementDraft = await req(registrar.token, 'POST', '/api/announcements', {
  title: `Communications Draft ${Date.now()}`,
  body: 'Draft announcement for workflow testing.',
  status: 'Draft',
  sendInApp: false,
  sendEmail: false,
  sendSms: false
});
assert(announcementDraft.status === 201 && announcementDraft.data.announcement.status === 'Draft', 'Registrar can save an announcement draft without selecting delivery channels');
const alumniAnnouncementsBeforePublish = await req(alumni.token, 'GET', '/api/announcements');
assert(!alumniAnnouncementsBeforePublish.data.announcements.some((item) => item.id === announcementDraft.data.announcement.id), 'Alumni cannot see an unpublished announcement');
const invalidScheduledAnnouncement = await req(registrar.token, 'POST', '/api/announcements', {
  title: 'Past Scheduled Announcement',
  body: 'This should be rejected.',
  status: 'Scheduled',
  publishAt: new Date(Date.now() - 60000).toISOString(),
  sendInApp: true
});
assert(invalidScheduledAnnouncement.status === 400, 'scheduled announcements must use a future publish time');
const noChannelAnnouncement = await req(registrar.token, 'POST', '/api/announcements', {
  title: 'No Channel Announcement',
  body: 'This should be rejected.',
  status: 'Published',
  sendInApp: false,
  sendEmail: false,
  sendSms: false
});
assert(noChannelAnnouncement.status === 400, 'published announcements must select at least one notification channel');
const publishedAnnouncement = await req(registrar.token, 'POST', '/api/announcements', {
  title: `Communications Published ${Date.now()}`,
  body: 'Published announcement for in-app delivery testing.',
  status: 'Published',
  sendInApp: true,
  sendEmail: false,
  sendSms: false
});
assert(publishedAnnouncement.status === 201 && publishedAnnouncement.data.notification.attempted >= 1, 'publishing an announcement dispatches its selected in-app notification');
const alumniPublishedAnnouncements = await req(alumni.token, 'GET', '/api/announcements');
assert(alumniPublishedAnnouncements.data.announcements.some((item) => item.id === publishedAnnouncement.data.announcement.id), 'Alumni can view a published announcement');
const scheduledAnnouncement = await req(registrar.token, 'POST', '/api/announcements', {
  title: `Communications Scheduled ${Date.now()}`,
  body: 'Scheduled announcement for activation testing.',
  status: 'Scheduled',
  publishAt: new Date(Date.now() + 1200).toISOString(),
  sendInApp: true,
  sendEmail: false,
  sendSms: false
});
assert(scheduledAnnouncement.status === 201 && scheduledAnnouncement.data.announcement.status === 'Scheduled', 'Registrar can schedule a future announcement');
await new Promise((resolve) => setTimeout(resolve, 1500));
const activatedAnnouncements = await req(alumni.token, 'GET', '/api/announcements');
assert(activatedAnnouncements.data.announcements.some((item) => item.id === scheduledAnnouncement.data.announcement.id), 'scheduled announcements publish and become visible to Alumni when due');

const alumniRecords = await req(alumni.token, 'GET', '/api/tracking');
assert(alumniRecords.status === 200 && alumniRecords.data.alumni.length >= 1, 'alumni should see their linked tracking record');
const ownRecord = alumniRecords.data.alumni.find((record) =>
  Number(record.userId) === Number(alumni.user.id) ||
  Number(record.id) === Number(alumni.user.alumniId)
);
assert(ownRecord, 'alumni should only receive their linked tracking record');
const profileBeforeTampering = await req(alumni.token, 'GET', '/api/auth/me');
const protectedProfileAttempt = await req(alumni.token, 'PUT', '/api/auth/profile', {
  name: 'Unauthorized Name Change',
  title: 'Unauthorized Role Change',
  batch: '2099',
  program: 'Unauthorized Program Change',
  employment: 'Employed',
  company: 'Unauthorized Company Change',
  jobTitle: 'Unauthorized Job Change'
});
assert(protectedProfileAttempt.status === 200, 'Alumni can save allowed personal profile fields');
assert(protectedProfileAttempt.data.user.name === profileBeforeTampering.data.user.name, 'Alumni cannot change their official name from My Profile');
assert(protectedProfileAttempt.data.user.title === profileBeforeTampering.data.user.title, 'Alumni cannot change their account role title from My Profile');
assert(protectedProfileAttempt.data.user.batch === profileBeforeTampering.data.user.batch, 'Alumni cannot change their batch from My Profile');
assert(protectedProfileAttempt.data.user.program === profileBeforeTampering.data.user.program, 'Alumni cannot change their program from My Profile');
if (profileBeforeTampering.data.alumni) {
  assert(protectedProfileAttempt.data.alumni.status === profileBeforeTampering.data.alumni.status, 'Career status must be updated through My Graduate Status');
  assert(protectedProfileAttempt.data.alumni.company === profileBeforeTampering.data.alumni.company, 'Career information must not be updated from My Profile');
}

const adminRecords = await req(admin.token, 'GET', '/api/tracking');
assert(adminRecords.status === 200 && adminRecords.data.alumni.length >= 1, 'Admin can monitor all tracking records');
assert(!('fieldAlignment' in adminRecords.data.summary), 'tracking summary must not report degree field alignment');
const testTimestamp = Date.now();
const adminCreateAlumni = await req(admin.token, 'POST', '/api/alumni', {
  name: `Admin Must Not Create ${testTimestamp}`,
  batch: '2022',
  program: 'SHS',
  studentId: `ADMIN-CREATE-${testTimestamp}`
});
assert(adminCreateAlumni.status === 403, 'only Registrar can create an alumni record');
const created = await req(registrar.token, 'POST', '/api/alumni', {
  name: `Tracking Test Other Alumni ${testTimestamp}`,
  batch: '2022',
  program: 'SHS',
  studentId: `TRACKING-TEST-${testTimestamp}`
});
assert(created.status === 201 && created.data.alumni.status === 'No Data', 'new alumni records must preserve unknown status');
assert(created.data.alumni.verificationStatus === 'Pending Verification', 'manually added alumni records must require school record verification');
assert(!created.data.alumni.lastUpdated, 'new alumni without status data must be considered stale');
const otherRecordId = created.data.alumni.id;
const adminEditAlumni = await req(admin.token, 'PUT', `/api/alumni/${otherRecordId}`, { program: 'Admin Edit Attempt' });
assert(adminEditAlumni.status === 403, 'Admin cannot edit alumni records');
const adminVerifyRecord = await req(admin.token, 'POST', `/api/alumni/${otherRecordId}/verify`);
assert(adminVerifyRecord.status === 403, 'only Registrar staff can verify manually added alumni records');
const registrarVerifyRecord = await req(registrar.token, 'POST', `/api/alumni/${otherRecordId}/verify`);
assert(registrarVerifyRecord.status === 200 && registrarVerifyRecord.data.alumni.verificationStatus === 'Verified', 'Registrar can verify a school-matched alumni record');
const staffArchiveRecord = await req(registrar.token, 'POST', `/api/alumni/${otherRecordId}/archive`);
assert(staffArchiveRecord.status === 403, 'only Admin can archive alumni records');
const reportsBeforeArchive = await req(admin.token, 'GET', '/api/reports/summary');
const adminArchiveRecord = await req(admin.token, 'POST', `/api/alumni/${otherRecordId}/archive`);
assert(adminArchiveRecord.status === 200 && adminArchiveRecord.data.alumni.verificationStatus === 'Archived', 'Admin can archive without deleting alumni history');
const archivedMissingFromActiveList = await req(admin.token, 'GET', `/api/alumni?q=TRACKING-TEST-${testTimestamp}`);
assert(!archivedMissingFromActiveList.data.alumni.some((record) => Number(record.id) === Number(otherRecordId)), 'archived records are excluded from the active alumni list');
const trackingAfterArchive = await req(admin.token, 'GET', '/api/tracking');
assert(!trackingAfterArchive.data.alumni.some((record) => Number(record.id) === Number(otherRecordId)), 'archived records are excluded from graduate tracking');
const reportsAfterArchive = await req(admin.token, 'GET', '/api/reports/summary');
assert(reportsAfterArchive.data.alumni.total === reportsBeforeArchive.data.alumni.total - 1, 'archived alumni are excluded from active reporting totals');
const archivedRecords = await req(admin.token, 'GET', '/api/alumni?recordStatus=Archived');
assert(archivedRecords.status === 200 && archivedRecords.data.alumni.some((record) => Number(record.id) === Number(otherRecordId)), 'Admin can view archived alumni records');
const registrarArchivedRecords = await req(registrar.token, 'GET', '/api/alumni?recordStatus=Archived');
assert(registrarArchivedRecords.status === 403, 'Registrar cannot access the Admin-only archive view');
const registrarArchivedDetail = await req(registrar.token, 'GET', `/api/alumni/${otherRecordId}`);
assert(registrarArchivedDetail.status === 404, 'Registrar cannot open an archived alumni record by ID');
const permanentDelete = await req(admin.token, 'DELETE', `/api/alumni/${otherRecordId}`);
assert(permanentDelete.status === 404, 'the alumni API no longer exposes permanent deletion');
const restoredRecord = await req(admin.token, 'POST', `/api/alumni/${otherRecordId}/restore`);
assert(restoredRecord.status === 200 && restoredRecord.data.alumni.verificationStatus === 'Verified', 'Admin can restore an archived alumni record');

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
const placementsBeforeEmploymentUpdate = await req(registrar.token, 'GET', '/api/placements');
const employmentUpdate = await req(alumni.token, 'PUT', `/api/tracking/${ownRecord.id}/employment`, {
  status: 'Employed',
  company: 'Reported Employer',
  title: 'Service Associate',
  industry: 'Business/Retail',
  employmentType: 'Full-time'
});
assert(employmentUpdate.status === 200, 'alumni can update their own employment record');
const placementsAfterEmploymentUpdate = await req(registrar.token, 'GET', '/api/placements');
assert(
  placementsAfterEmploymentUpdate.data.placements.length === placementsBeforeEmploymentUpdate.data.placements.length,
  'alumni-reported employment must not be recorded as a school placement'
);

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

const newsletter = await req(registrar.token, 'POST', '/api/newsletters', {
  title: `Newsletter Test ${Date.now()}`,
  subject: 'School and alumni updates',
  body: 'A newsletter draft for approval-flow testing.',
  sendInApp: true,
  sendEmail: false,
  sendSms: false
});
assert(newsletter.status === 201 && newsletter.data.newsletter.status === 'Draft', 'Registrar creates a newsletter draft');
const alumniNewslettersBeforeApproval = await req(alumni.token, 'GET', '/api/newsletters');
assert(!alumniNewslettersBeforeApproval.data.newsletters.some((item) => item.id === newsletter.data.newsletter.id), 'Alumni cannot view an unpublished newsletter');
const registrarApprovesNewsletter = await req(registrar.token, 'POST', `/api/newsletters/${newsletter.data.newsletter.id}/approve`);
assert(registrarApprovesNewsletter.status === 403, 'Registrar cannot approve or publish a newsletter');
const newsletterSubmitted = await req(registrar.token, 'POST', `/api/newsletters/${newsletter.data.newsletter.id}/submit`);
assert(newsletterSubmitted.status === 200 && newsletterSubmitted.data.newsletter.status === 'For Approval', 'Registrar can submit a draft for Admin approval');
const newsletterWithoutReturnNote = await req(admin.token, 'POST', `/api/newsletters/${newsletter.data.newsletter.id}/return`, {});
assert(newsletterWithoutReturnNote.status === 400, 'Admin must provide a return-for-editing note');
const newsletterReturned = await req(admin.token, 'POST', `/api/newsletters/${newsletter.data.newsletter.id}/return`, {
  note: 'Please add a short alumni highlight.'
});
assert(newsletterReturned.status === 200 && newsletterReturned.data.newsletter.status === 'Changes Requested', 'Admin can return a newsletter with guidance');
const newsletterEdited = await req(registrar.token, 'PUT', `/api/newsletters/${newsletter.data.newsletter.id}`, {
  title: newsletter.data.newsletter.title,
  subject: 'School, alumni, and community updates',
  body: 'Updated newsletter content with an alumni highlight.',
  sendInApp: true,
  sendEmail: false,
  sendSms: false
});
assert(newsletterEdited.status === 200 && newsletterEdited.data.newsletter.reviewNote === '', 'author can update returned newsletter content');
const newsletterResubmitted = await req(registrar.token, 'POST', `/api/newsletters/${newsletter.data.newsletter.id}/submit`);
assert(newsletterResubmitted.status === 200, 'author can resubmit returned newsletter');
const publishedNewsletter = await req(admin.token, 'POST', `/api/newsletters/${newsletter.data.newsletter.id}/approve`);
assert(publishedNewsletter.status === 200 && publishedNewsletter.data.newsletter.status === 'Published', 'Admin approval publishes a newsletter');
assert(publishedNewsletter.data.delivery.inAppDelivered >= 1, 'selected in-app notifications are sent to the active alumni audience');
const publishedAlumniNewsletters = await req(alumni.token, 'GET', '/api/newsletters');
assert(publishedAlumniNewsletters.data.newsletters.some((item) => item.id === newsletter.data.newsletter.id), 'Alumni can read published newsletters');
const newsletterNotifications = await req(alumni.token, 'GET', '/api/notifications');
const newsletterNotification = newsletterNotifications.data.notifications.find((item) => Number(item.relatedId) === Number(newsletter.data.newsletter.id));
assert(newsletterNotification && newsletterNotification.targetUrl === '/#/newsletter', 'published newsletter notifications link to the newsletter page');
const registrarArchivesNewsletter = await req(registrar.token, 'POST', `/api/newsletters/${newsletter.data.newsletter.id}/archive`);
assert(registrarArchivesNewsletter.status === 403, 'Registrar cannot archive published newsletters');
const archivedNewsletter = await req(admin.token, 'POST', `/api/newsletters/${newsletter.data.newsletter.id}/archive`);
assert(archivedNewsletter.status === 200 && archivedNewsletter.data.newsletter.status === 'Archived', 'Admin can archive published newsletters');

const job = await req(registrar.token, 'POST', '/api/jobs', {
  title: `Career Test ${Date.now()}`,
  company: 'Test Employer',
  location: 'Caloocan City',
  industry: 'BPO / Customer Service',
  employment_type: 'Full-time',
  description: 'Provide customer support to clients.',
  qualifications: 'Clear communication skills',
  application_method: 'Link',
  application_details: 'https://example.test/apply',
  status: 'Published',
  notify_in_app: true,
  notify_email: false
});
assert(job.status === 201 && job.data.job.industry === 'BPO / Customer Service', 'Registrar can publish a job with career details');
assert(job.data.job.posted_by === registrar.user.name, 'published jobs identify their author for Admin oversight');
const alumniJobs = await req(alumni.token, 'GET', '/api/jobs');
assert(alumniJobs.status === 200 && alumniJobs.data.jobs.some((item) => item.id === job.data.job.id), 'alumni can see published opportunities');
const alumniNotifications = await req(alumni.token, 'GET', '/api/notifications');
assert(alumniNotifications.data.notifications.some((item) => Number(item.relatedId) === Number(job.data.job.id)), 'selected in-app job notifications are delivered to Alumni');
const adminJobs = await req(admin.token, 'GET', '/api/jobs');
assert(adminJobs.data.jobs.some((item) => item.id === job.data.job.id && item.posted_by === registrar.user.name), 'Admin sees all jobs and their authors');
const alumniPostJob = await req(alumni.token, 'POST', '/api/jobs', { title: 'Unauthorized job' });
assert(alumniPostJob.status === 403, 'alumni cannot publish job opportunities');
const invalidJobLink = await req(registrar.token, 'POST', '/api/jobs', {
  title: 'Invalid Link Test',
  company: 'Test Employer',
  location: 'Caloocan City',
  industry: 'BPO',
  employment_type: 'Full-time',
  description: 'Test description',
  application_method: 'Link',
  application_details: 'javascript:alert(1)'
});
assert(invalidJobLink.status === 400, 'job application links must use HTTPS');
const archivedJob = await req(registrar.token, 'PUT', `/api/jobs/${job.data.job.id}`, { status: 'Archived' });
assert(archivedJob.status === 200 && archivedJob.data.job.status === 'Archived', 'Registrar can archive a job');
const alumniJobsAfterArchive = await req(alumni.token, 'GET', '/api/jobs');
assert(!alumniJobsAfterArchive.data.jobs.some((item) => item.id === job.data.job.id), 'alumni cannot see archived opportunities');
const registrarDelete = await req(registrar.token, 'DELETE', `/api/jobs/${job.data.job.id}`);
assert(registrarDelete.status === 403, 'Registrar can archive but cannot delete job listings');
const adminDelete = await req(admin.token, 'DELETE', `/api/jobs/${job.data.job.id}`);
assert(adminDelete.status === 204, `Admin can delete job listings (received ${adminDelete.status}: ${JSON.stringify(adminDelete.data)})`);

const archiveLinkedAccount = await req(admin.token, 'POST', `/api/alumni/${ownRecord.id}/archive`);
assert(archiveLinkedAccount.status === 200, 'Admin can archive an alumni record linked to an account');
const loginWhileArchived = await fetch(`${base}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'alumni', password: 'alumni123' })
});
assert(loginWhileArchived.status === 403, 'archiving a linked alumni record deactivates its account');
const restoreLinkedAccount = await req(admin.token, 'POST', `/api/alumni/${ownRecord.id}/restore`);
assert(restoreLinkedAccount.status === 200, 'Admin can restore a linked alumni record');
const loginAfterRestore = await login('alumni', 'alumni123');
assert(loginAfterRestore.user.status === 'Active', 'restoring an alumni record restores its previous account status');

console.log('Alumni Database, Graduate Tracking, Communications, Career Management, and Newsletter role checks passed.');
