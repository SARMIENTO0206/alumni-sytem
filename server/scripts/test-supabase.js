import '../src/load-env.js';
import { pingSupabase } from '../src/supabase.js';

const result = await pingSupabase();
const safe = {
  configured: result.configured,
  urlConfigured: result.urlConfigured,
  keyConfigured: result.keyConfigured,
  authReachable: result.auth.ok,
  postgresConnected: result.postgres.ok,
  message: result.message
};
console.log(JSON.stringify(safe, null, 2));
process.exit(result.configured && result.postgres.ok && result.auth.ok ? 0 : 2);
