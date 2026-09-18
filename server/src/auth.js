import { findByToken } from './db.js';

/** Requires a valid bearer token; attaches req.user (camelCase user row). */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) return res.status(401).json({ error: 'Authentication required.' });

  const user = findByToken(token);
  if (!user) return res.status(401).json({ error: 'Invalid or expired session.' });

  req.user = user;
  req.token = token;
  next();
}

/** Requires one of the given roles. Must be used AFTER requireAuth. */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (req.user && roles.includes(req.user.role)) return next();
    return res.status(403).json({ error: 'Insufficient permissions.' });
  };
}