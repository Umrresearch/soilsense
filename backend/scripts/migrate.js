/**
 * Apply database/schema.sql.
 *   npm run db:migrate            → apply schema (fails if tables already exist)
 *   npm run db:migrate -- --reset → DROP everything in the public schema first (destructive!)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/db.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = [path.join(here, '../../database/schema.sql'), path.join(here, '../schema.sql')]
  .find((p) => fs.existsSync(p));

async function main() {
  const reset = process.argv.includes('--reset');
  if (reset) {
    console.log('⚠  Dropping all tables in schema "public"…');
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  } else {
    const { rows } = await pool.query(`SELECT to_regclass('public.farmers') AS t`);
    if (rows[0].t) {
      console.log('Schema already present — nothing to do. Use --reset to rebuild.');
      return;
    }
  }
  await pool.query(fs.readFileSync(schemaPath, 'utf8'));
  console.log(`✓ Schema applied from ${path.relative(process.cwd(), schemaPath)}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => pool.end());
