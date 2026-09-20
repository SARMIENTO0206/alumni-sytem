/**
 * Optional write-through to the existing Supabase project.
 * SQLite remains the local working store when SUPABASE_ANON_KEY is not set.
 * This never seeds rows. It only mirrors records the user created through the API.
 */
import { getSupabase, isSupabaseConfigured } from './supabase.js';

export function supabaseWriteEnabled() {
  return isSupabaseConfigured();
}

export async function supabaseUpsert(table, row) {
  const sb = getSupabase();
  if (!sb || !row) return { skipped: true };
  const { error } = await sb.from(table).upsert(row, { onConflict: 'id' });
  if (error) {
    console.warn(`[supabase] upsert ${table}: ${error.message}`);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function supabaseInsert(table, row) {
  const sb = getSupabase();
  if (!sb || !row) return { skipped: true };
  const { error } = await sb.from(table).insert(row);
  if (error) {
    console.warn(`[supabase] insert ${table}: ${error.message}`);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function supabaseDelete(table, id) {
  const sb = getSupabase();
  if (!sb) return { skipped: true };
  const { error } = await sb.from(table).delete().eq('id', id);
  if (error) {
    console.warn(`[supabase] delete ${table}: ${error.message}`);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export function mirror(table, row) {
  supabaseInsert(table, row).catch(() => {});
}

export function mirrorUpdate(table, row) {
  supabaseUpsert(table, row).catch(() => {});
}

export function mirrorDelete(table, id) {
  supabaseDelete(table, id).catch(() => {});
}
