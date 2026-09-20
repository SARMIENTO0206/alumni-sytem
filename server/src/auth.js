import { findByToken } from './db.js';

export function normalizeRole(role) {
  if (role === 'registrar') return 'staff';
  return String(role || '');
}

export function isAdmin(user) {
  return normalizeRole(user?.role) === 'admin';
}

export function isStaff(user) {
  return normalizeRole(user?.role) === 'staff';
}

export function isAlumni(user) {
  return normalizeRole(user?.role) === 'alumni';
}

/** Requires a valid bearer token; attaches req.user (camelCase user row). */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) return res.status(401).json({ error: 'Authentication required. Please log in again.' });

  const user = findByToken(token);
  if (!user) return res.status(401).json({ error: 'Your session has expired. Please log in again.' });

  req.user = user;
  req.token = token;
  next();
}

/** Requires one of the given roles. Must be used AFTER requireAuth.
 *  `staff` and legacy `registrar` are treated as the same operational role. */
export function requireRole(...roles) {
  const wanted = roles.map(normalizeRole);
  return (req, res, next) => {
    if (req.user && wanted.includes(normalizeRole(req.user.role))) return next();
    return res.status(403).json({ error: 'You do not have permission to perform this action.' });
  };
}

export function ownsAlumniRecord(user, alumniRow) {
  if (!user || !alumniRow) return false;
  if (isAdmin(user) || isStaff(user)) return true;
  if (!isAlumni(user)) return false;
  if (user.alumniId && Number(user.alumniId) === Number(alumniRow.id)) return true;
  const studentMatch = user.studentId && alumniRow.student_id && String(user.studentId) === String(alumniRow.student_id);
  const nameMatch = user.name && alumniRow.name && String(user.name).toLowerCase() === String(alumniRow.name).toLowerCase();
  const userIdMatch = user.id && alumniRow.user_id && Number(user.id) === Number(alumniRow.user_id);
  return Boolean(studentMatch || nameMatch || userIdMatch);
}

/** Ownership for requests/applications linked by user_id or alumni_id. */
export function ownsLinkedRow(user, row) {
  if (!user || !row) return false;
  if (isAdmin(user) || isStaff(user)) return true;
  if (!isAlumni(user)) return false;
  if (row.user_id && Number(row.user_id) === Number(user.id)) return true;
  if (row.alumni_id && user.alumniId && Number(row.alumni_id) === Number(user.alumniId)) return true;
  return false;
}
