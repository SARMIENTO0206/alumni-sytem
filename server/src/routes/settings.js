import { Router } from 'express';
import { getSetting, setSetting, db, writeAudit } from '../db.js';
import { requireRole, isAdmin } from '../auth.js';

const router = Router();

const DEFAULTS = {
  general: {
    systemName: 'St. Agnes Academy Alumni Management System',
    systemDescription: 'Alumni records, document requests, graduate tracking, and engagement.',
    institution: 'St. Agnes Academy of Caloocan',
    contact: '',
    address: '',
    language: 'English',
    dateFormat: 'YYYY-MM-DD',
    timeFormat: '12-hour',
    timeZone: 'Asia/Manila'
  },
  notifications: {
    system: true,
    email: true,
    sms: false,
    documents: true,
    events: true,
    jobs: true,
    surveys: true,
    announcements: true
  },
  documents: {
    transcriptEnabled: true,
    reprintEnabled: true,
    releaseMethods: 'Pick-up at Registrar Window, Authorized Representative, Delivery'
  },
  alumni: {
    allowSelfRegistration: true,
    requiredFields: 'name, batch, program'
  },
  security: {
    minPasswordLength: 6,
    sessionNote: 'Sessions expire when the user logs out or the server restarts.'
  }
};

router.get('/', (req, res) => {
  const stored = getSetting('system_settings', {});
  const merged = {
    general: { ...DEFAULTS.general, ...(stored.general || {}) },
    notifications: { ...DEFAULTS.notifications, ...(stored.notifications || {}) },
    documents: { ...DEFAULTS.documents, ...(stored.documents || {}) },
    alumni: { ...DEFAULTS.alumni, ...(stored.alumni || {}) },
    security: { ...DEFAULTS.security, ...(stored.security || {}) }
  };
  if (!isAdmin(req.user)) {
    return res.json({
      notifications: merged.notifications,
      accountOnly: true
    });
  }
  res.json({ settings: merged });
});

router.put('/', requireRole('admin'), (req, res) => {
  const current = getSetting('system_settings', {});
  const next = {
    general: { ...DEFAULTS.general, ...(current.general || {}), ...(req.body?.general || {}) },
    notifications: { ...DEFAULTS.notifications, ...(current.notifications || {}), ...(req.body?.notifications || {}) },
    documents: { ...DEFAULTS.documents, ...(current.documents || {}), ...(req.body?.documents || {}) },
    alumni: { ...DEFAULTS.alumni, ...(current.alumni || {}), ...(req.body?.alumni || {}) },
    security: { ...DEFAULTS.security, ...(current.security || {}), ...(req.body?.security || {}) }
  };
  setSetting('system_settings', next);
  writeAudit(req.user, 'update', 'settings', 'system_settings', req.user.username);
  res.json({ settings: next });
});

router.get('/history', requireRole('admin'), (req, res) => {
  const rows = db.prepare(
    "SELECT * FROM audit_logs WHERE entity = 'settings' ORDER BY id DESC LIMIT 50"
  ).all();
  res.json({
    history: rows.map((r) => ({
      id: r.id,
      action: r.action,
      detail: r.detail,
      actorRole: r.actor_role,
      createdAt: r.created_at
    }))
  });
});

export default router;
