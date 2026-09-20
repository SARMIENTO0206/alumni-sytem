-- PROPOSED / READY TO APPLY in the Supabase SQL editor.
-- Non-destructive: CREATE TABLE IF NOT EXISTS and ADD COLUMN IF NOT EXISTS only.
-- No DROP / DELETE / TRUNCATE.
--
-- The live application database is still SQLite (server/data/saa.db).
-- These tables let the optional write-through mirror work after SUPABASE_ANON_KEY
-- is set. They do not replace local login, sessions, or payments.

CREATE TABLE IF NOT EXISTS public.profiles (
  id            UUID PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'registrar', 'staff', 'alumni')),
  name          TEXT NOT NULL,
  title         TEXT DEFAULT '',
  avatar        TEXT DEFAULT '',
  student_id    TEXT DEFAULT '',
  batch         TEXT DEFAULT '',
  program       TEXT DEFAULT '',
  photo_url     TEXT DEFAULT '',
  email         TEXT DEFAULT '',
  contact       TEXT DEFAULT '',
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.alumni (
  id            BIGSERIAL PRIMARY KEY,
  profile_id    UUID REFERENCES public.profiles(id),
  user_id       BIGINT DEFAULT 0,
  name          TEXT NOT NULL,
  batch         TEXT DEFAULT '',
  program       TEXT DEFAULT '',
  status        TEXT DEFAULT 'Employed',
  company       TEXT DEFAULT '',
  job_title     TEXT DEFAULT '',
  contact       TEXT DEFAULT '',
  relevance     TEXT DEFAULT 'Not Related',
  time_to_first TEXT DEFAULT '',
  location      TEXT DEFAULT 'Local',
  student_id    TEXT DEFAULT '',
  last_updated  TEXT DEFAULT '',
  email         TEXT DEFAULT '',
  address       TEXT DEFAULT '',
  education_school TEXT DEFAULT '',
  education_program TEXT DEFAULT '',
  education_status TEXT DEFAULT '',
  education_year TEXT DEFAULT '',
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS alumni_batch_idx ON public.alumni (batch);
CREATE INDEX IF NOT EXISTS alumni_status_idx ON public.alumni (status);

ALTER TABLE public.alumni ADD COLUMN IF NOT EXISTS user_id BIGINT DEFAULT 0;
ALTER TABLE public.alumni ADD COLUMN IF NOT EXISTS email TEXT DEFAULT '';
ALTER TABLE public.alumni ADD COLUMN IF NOT EXISTS address TEXT DEFAULT '';
ALTER TABLE public.alumni ADD COLUMN IF NOT EXISTS education_school TEXT DEFAULT '';
ALTER TABLE public.alumni ADD COLUMN IF NOT EXISTS education_program TEXT DEFAULT '';
ALTER TABLE public.alumni ADD COLUMN IF NOT EXISTS education_status TEXT DEFAULT '';
ALTER TABLE public.alumni ADD COLUMN IF NOT EXISTS education_year TEXT DEFAULT '';

CREATE TABLE IF NOT EXISTS public.transcript_requests (
  id          BIGSERIAL PRIMARY KEY,
  alumni_id   BIGINT,
  user_id     BIGINT DEFAULT 0,
  name        TEXT DEFAULT '',
  email       TEXT DEFAULT '',
  contact     TEXT DEFAULT '',
  date        TEXT DEFAULT '',
  purpose     TEXT DEFAULT '',
  status      TEXT DEFAULT 'Pending',
  type        TEXT DEFAULT '',
  delivery    TEXT DEFAULT '',
  payment_ref TEXT DEFAULT '',
  remarks     TEXT DEFAULT '',
  copies      INTEGER DEFAULT 1,
  fee_centavos INTEGER DEFAULT 0,
  payment_status TEXT DEFAULT '',
  claim_window TEXT DEFAULT '',
  claim_notes TEXT DEFAULT '',
  approved_at TEXT DEFAULT '',
  processed_at TEXT DEFAULT '',
  released_at TEXT DEFAULT '',
  cancelled_at TEXT DEFAULT '',
  correction_notes TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.transcript_requests ADD COLUMN IF NOT EXISTS user_id BIGINT DEFAULT 0;
ALTER TABLE public.transcript_requests ADD COLUMN IF NOT EXISTS remarks TEXT DEFAULT '';
ALTER TABLE public.transcript_requests ADD COLUMN IF NOT EXISTS copies INTEGER DEFAULT 1;
ALTER TABLE public.transcript_requests ADD COLUMN IF NOT EXISTS fee_centavos INTEGER DEFAULT 0;
ALTER TABLE public.transcript_requests ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT '';
ALTER TABLE public.transcript_requests ADD COLUMN IF NOT EXISTS claim_window TEXT DEFAULT '';
ALTER TABLE public.transcript_requests ADD COLUMN IF NOT EXISTS claim_notes TEXT DEFAULT '';
ALTER TABLE public.transcript_requests ADD COLUMN IF NOT EXISTS approved_at TEXT DEFAULT '';
ALTER TABLE public.transcript_requests ADD COLUMN IF NOT EXISTS processed_at TEXT DEFAULT '';
ALTER TABLE public.transcript_requests ADD COLUMN IF NOT EXISTS released_at TEXT DEFAULT '';
ALTER TABLE public.transcript_requests ADD COLUMN IF NOT EXISTS cancelled_at TEXT DEFAULT '';
ALTER TABLE public.transcript_requests ADD COLUMN IF NOT EXISTS correction_notes TEXT DEFAULT '';

CREATE TABLE IF NOT EXISTS public.reprints (
  id         BIGSERIAL PRIMARY KEY,
  alumni_id  BIGINT,
  user_id    BIGINT DEFAULT 0,
  name       TEXT DEFAULT '',
  type       TEXT DEFAULT '',
  status     TEXT DEFAULT 'Pending',
  remarks    TEXT DEFAULT '',
  copies     INTEGER DEFAULT 1,
  fee_centavos INTEGER DEFAULT 0,
  payment_status TEXT DEFAULT '',
  claim_window TEXT DEFAULT '',
  claim_notes TEXT DEFAULT '',
  approved_at TEXT DEFAULT '',
  processed_at TEXT DEFAULT '',
  released_at TEXT DEFAULT '',
  cancelled_at TEXT DEFAULT '',
  correction_notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.reprints ADD COLUMN IF NOT EXISTS user_id BIGINT DEFAULT 0;
ALTER TABLE public.reprints ADD COLUMN IF NOT EXISTS remarks TEXT DEFAULT '';
ALTER TABLE public.reprints ADD COLUMN IF NOT EXISTS copies INTEGER DEFAULT 1;
ALTER TABLE public.reprints ADD COLUMN IF NOT EXISTS fee_centavos INTEGER DEFAULT 0;
ALTER TABLE public.reprints ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT '';
ALTER TABLE public.reprints ADD COLUMN IF NOT EXISTS claim_window TEXT DEFAULT '';
ALTER TABLE public.reprints ADD COLUMN IF NOT EXISTS claim_notes TEXT DEFAULT '';
ALTER TABLE public.reprints ADD COLUMN IF NOT EXISTS approved_at TEXT DEFAULT '';
ALTER TABLE public.reprints ADD COLUMN IF NOT EXISTS processed_at TEXT DEFAULT '';
ALTER TABLE public.reprints ADD COLUMN IF NOT EXISTS released_at TEXT DEFAULT '';
ALTER TABLE public.reprints ADD COLUMN IF NOT EXISTS cancelled_at TEXT DEFAULT '';
ALTER TABLE public.reprints ADD COLUMN IF NOT EXISTS correction_notes TEXT DEFAULT '';

CREATE TABLE IF NOT EXISTS public.placements (
  id         BIGSERIAL PRIMARY KEY,
  alumni_id  BIGINT,
  user_id    BIGINT DEFAULT 0,
  alumni     TEXT DEFAULT '',
  company    TEXT DEFAULT '',
  title      TEXT DEFAULT '',
  date       TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.placements ADD COLUMN IF NOT EXISTS user_id BIGINT DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.events (
  id         BIGSERIAL PRIMARY KEY,
  title      TEXT NOT NULL,
  date       TEXT DEFAULT '',
  location   TEXT DEFAULT '',
  rsvps      INTEGER DEFAULT 0,
  registered INTEGER DEFAULT 0,
  status     TEXT DEFAULT 'Upcoming',
  attendees  JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS registered INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.reunions (
  id           BIGSERIAL PRIMARY KEY,
  batch        TEXT DEFAULT '',
  date         TEXT DEFAULT '',
  venue        TEXT DEFAULT '',
  coordinators TEXT DEFAULT '',
  confirmed    INTEGER DEFAULT 0,
  attendees    JSONB DEFAULT '[]'::jsonb,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.donations (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT DEFAULT 0,
  alumni_id  BIGINT DEFAULT 0,
  campaign   TEXT DEFAULT '',
  donor      TEXT DEFAULT '',
  amount     NUMERIC DEFAULT 0,
  date       TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.donations ADD COLUMN IF NOT EXISTS user_id BIGINT DEFAULT 0;
ALTER TABLE public.donations ADD COLUMN IF NOT EXISTS alumni_id BIGINT DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.newsletters (
  id         BIGSERIAL PRIMARY KEY,
  subject    TEXT DEFAULT '',
  body       TEXT DEFAULT '',
  status     TEXT DEFAULT 'Draft',
  sent_at    TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.feedback (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT DEFAULT 0,
  alumni_id  BIGINT DEFAULT 0,
  name       TEXT DEFAULT '',
  rating     INTEGER DEFAULT 5,
  category   TEXT DEFAULT '',
  message    TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.feedback ADD COLUMN IF NOT EXISTS user_id BIGINT DEFAULT 0;
ALTER TABLE public.feedback ADD COLUMN IF NOT EXISTS alumni_id BIGINT DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.job_opportunities (
  id          BIGSERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  company     TEXT DEFAULT '',
  location    TEXT DEFAULT '',
  description TEXT DEFAULT '',
  status      TEXT DEFAULT 'Published',
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.job_applications (
  id            BIGSERIAL PRIMARY KEY,
  job_id        BIGINT DEFAULT 0,
  user_id       BIGINT DEFAULT 0,
  alumni_id     BIGINT DEFAULT 0,
  title         TEXT DEFAULT '',
  company       TEXT DEFAULT '',
  applicant     TEXT DEFAULT '',
  email         TEXT DEFAULT '',
  resume_name   TEXT DEFAULT '',
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.announcements (
  id         BIGSERIAL PRIMARY KEY,
  title      TEXT NOT NULL,
  body       TEXT DEFAULT '',
  status     TEXT DEFAULT 'Published',
  audience   TEXT DEFAULT 'alumni',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS audience TEXT DEFAULT 'alumni';

CREATE TABLE IF NOT EXISTS public.notifications (
  id         BIGSERIAL PRIMARY KEY,
  channel    TEXT DEFAULT '',
  recipient  TEXT DEFAULT '',
  subject    TEXT DEFAULT '',
  message    TEXT DEFAULT '',
  user_id    BIGINT DEFAULT 0,
  alumni_id  BIGINT DEFAULT 0,
  related_type TEXT DEFAULT '',
  related_id TEXT DEFAULT '',
  is_read    INTEGER DEFAULT 0,
  read_at    TEXT DEFAULT '',
  notification_type TEXT DEFAULT '',
  target_url TEXT DEFAULT '',
  email_status TEXT DEFAULT '',
  sms_status TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS user_id BIGINT DEFAULT 0;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS alumni_id BIGINT DEFAULT 0;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS related_type TEXT DEFAULT '';
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS related_id TEXT DEFAULT '';
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS is_read INTEGER DEFAULT 0;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS read_at TEXT DEFAULT '';
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS notification_type TEXT DEFAULT '';
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS target_url TEXT DEFAULT '';
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS email_status TEXT DEFAULT '';
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS sms_status TEXT DEFAULT '';

CREATE TABLE IF NOT EXISTS public.academic_records (
  id             BIGSERIAL PRIMARY KEY,
  alumni_id      BIGINT,
  program        TEXT DEFAULT '',
  year_graduated TEXT DEFAULT '',
  gwa            NUMERIC DEFAULT 0,
  status         TEXT DEFAULT 'Active'
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id         BIGSERIAL PRIMARY KEY,
  actor_id   TEXT DEFAULT '',
  actor_role TEXT DEFAULT '',
  action     TEXT DEFAULT '',
  entity     TEXT DEFAULT '',
  entity_id  TEXT DEFAULT '',
  detail     TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.request_history (
  id           BIGSERIAL PRIMARY KEY,
  request_type TEXT DEFAULT '',
  request_id   BIGINT DEFAULT 0,
  actor_id     BIGINT DEFAULT 0,
  actor_role   TEXT DEFAULT '',
  action       TEXT DEFAULT '',
  remarks      TEXT DEFAULT '',
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.request_attachments (
  id           BIGSERIAL PRIMARY KEY,
  request_type TEXT NOT NULL,
  request_id   BIGINT NOT NULL,
  user_id      BIGINT DEFAULT 0,
  file_name    TEXT DEFAULT '',
  mime_type    TEXT DEFAULT '',
  size_bytes   INTEGER DEFAULT 0,
  data_uri     TEXT DEFAULT '',
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payments (
  id                 BIGSERIAL PRIMARY KEY,
  user_id            BIGINT DEFAULT 0,
  alumni_id          BIGINT DEFAULT 0,
  related_type       TEXT DEFAULT '',
  related_id         BIGINT DEFAULT 0,
  reference_id       TEXT DEFAULT '',
  gateway            TEXT DEFAULT 'paymongo',
  gateway_payment_id TEXT DEFAULT '',
  gateway_intent_id  TEXT DEFAULT '',
  gateway_checkout_id TEXT DEFAULT '',
  payment_method     TEXT DEFAULT 'gcash',
  amount_centavos    INTEGER DEFAULT 0,
  currency           TEXT DEFAULT 'PHP',
  status             TEXT DEFAULT 'pending',
  description        TEXT DEFAULT '',
  livemode           INTEGER DEFAULT 0,
  paid_at            TEXT DEFAULT '',
  failed_at          TEXT DEFAULT '',
  metadata           TEXT DEFAULT '{}',
  qr_image           TEXT DEFAULT '',
  qr_expires_at      TEXT DEFAULT '',
  gateway_method_id  TEXT DEFAULT '',
  request_code       TEXT DEFAULT '',
  receipt_email_sent INTEGER DEFAULT 0,
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payment_events (
  id         BIGSERIAL PRIMARY KEY,
  event_id   TEXT UNIQUE NOT NULL,
  payment_id BIGINT DEFAULT 0,
  event_type TEXT DEFAULT '',
  processed  INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
