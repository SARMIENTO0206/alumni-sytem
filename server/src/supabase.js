/**
 * Supabase client for the existing Node.js API.
 *
 * This module connects to the existing Supabase project using environment
 * variables only. It does not replace SQLite, bcrypt login, or any routes.
 * Application data continues to live in SQLite until PostgreSQL tables are
 * reviewed and approved separately.
 */
import { createClient } from '@supabase/supabase-js';

const DEFAULT_TIMEOUT_MS = 5000;

export function getSupabaseConfig() {
  return {
    configured: isSupabaseConfigured(),
    urlConfigured: Boolean(readUrl()),
    keyConfigured: Boolean(readAnonKey()),
    projectUrl: readUrl() || null
  };
}

function readUrl() {
  return String(process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
}

function readAnonKey() {
  return String(process.env.SUPABASE_ANON_KEY || '').trim();
}

let client = null;

export function isSupabaseConfigured() {
  return Boolean(readUrl() && readAnonKey());
}

export function getSupabase() {
  if (!isSupabaseConfigured()) return null;
  if (!client) {
    client = createClient(readUrl(), readAnonKey(), {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    });
  }
  return client;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Non-destructive connectivity check. Never logs keys.
 * Auth health can be probed without a key; REST/PostgreSQL needs the anon key.
 */
export async function pingSupabase() {
  const url = readUrl();
  const keyConfigured = Boolean(readAnonKey());
  const result = {
    configured: Boolean(url && keyConfigured),
    urlConfigured: Boolean(url),
    keyConfigured,
    projectUrl: url || null,
    rest: { ok: false, status: null },
    auth: { ok: false, status: null },
    postgres: { ok: false },
    message: null
  };

  if (!url) {
    result.message = 'SUPABASE_URL is missing. Add it to server/.env';
    return result;
  }

  if (!keyConfigured) {
    result.message = 'Add SUPABASE_ANON_KEY to server/.env (anon public key only, not service_role).';
    return result;
  }

  try {
    const restRes = await fetchWithTimeout(`${url}/rest/v1/`, {
      headers: {
        apikey: readAnonKey(),
        Authorization: `Bearer ${readAnonKey()}`
      }
    });
    result.rest.status = restRes.status;
    result.rest.ok = restRes.ok;
    result.postgres.ok = restRes.ok;
  } catch (err) {
    result.rest.ok = false;
    result.postgres.ok = false;
    result.rest.error = err.name === 'AbortError' ? 'Timed out' : (err.message || 'Network error');
  }

  if (result.configured && result.auth.ok && result.postgres.ok) {
    result.message = 'Supabase Auth and PostgreSQL REST are reachable.';
  } else if (result.rest.status === 401 || result.rest.status === 403) {
    result.message = 'Supabase rejected the anon key. Check SUPABASE_ANON_KEY in server/.env.';
  } else if (!result.auth.ok && !result.rest.ok) {
    result.message = 'Could not reach the Supabase project URL. Check the network and that the project is not paused.';
  }

  return result;
}

/**
 * Existing login stays on SQLite + bcrypt (roles: admin, registrar, alumni).
 * Switching to Supabase Auth later would require:
 *  - creating matching users in Supabase Auth
 *  - a public.profiles table for role / name / student_id
 *  - verifying the Supabase JWT in requireAuth instead of the sessions table
 * That switch is not enabled here so the current login page keeps working.
 */
export const SUPABASE_AUTH_MIGRATION_NOTES = {
  currentRoles: ['admin', 'registrar', 'alumni'],
  currentMechanism: 'SQLite users + bcrypt + bearer session tokens',
  futureMechanism: 'Supabase Auth JWT + public.profiles.role'
};
