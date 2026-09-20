import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = join(__dirname, '..');
const PROJECT_ROOT = join(SERVER_DIR, '..');

function loadIfExists(file) {
  if (!existsSync(file)) return;
  try {
    process.loadEnvFile(file);
  } catch (err) {
    console.warn(`  Could not read ${file}: ${err.message}`);
  }
}

/* Load server/.env first so local backend values win. Root .env is a fallback
 * and does not overwrite variables that are already set. */
loadIfExists(join(SERVER_DIR, '.env'));
loadIfExists(join(PROJECT_ROOT, '.env'));
