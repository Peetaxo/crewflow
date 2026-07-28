import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readTimelogConstraintMigration = () => {
  const migrationsDir = resolve(process.cwd(), 'supabase/migrations');
  const migrationFile = readdirSync(migrationsDir)
    .find((file) => file.endsWith('_prevent_duplicate_timelogs_and_overlaps.sql'));

  if (!migrationFile) {
    throw new Error('Missing timelog duplicate and overlap constraint migration.');
  }

  return readFileSync(resolve(migrationsDir, migrationFile), 'utf8');
};

describe('Supabase timelog schema constraints', () => {
  it('prevents more than one timelog per event and contractor', () => {
    const sql = readTimelogConstraintMigration();

    expect(sql).toContain('timelogs_event_contractor_unique');
    expect(sql).toContain('unique (event_id, contractor_id)');
  });

  it('prevents overlapping timelog day intervals inside one timelog', () => {
    const sql = readTimelogConstraintMigration();

    expect(sql).toContain('prevent_overlapping_timelog_days');
    expect(sql).toContain('trg_prevent_overlapping_timelog_days');
    expect(sql).toContain('overlapping timelog days already exist');
    expect(sql).toContain('between 0 and 23');
    expect(sql).toContain('between 0 and 59');
    expect(sql).toContain('raise exception');
  });
});
