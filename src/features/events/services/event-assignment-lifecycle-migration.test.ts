import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationDirectory = join(process.cwd(), 'supabase', 'migrations');
const migrationFiles = readdirSync(migrationDirectory)
  .filter((name) => name.endsWith('_timelog_assignment_lifecycle.sql'));

const readMigration = () => {
  expect(migrationFiles).toHaveLength(1);
  return readFileSync(join(migrationDirectory, migrationFiles[0]), 'utf8').toLowerCase();
};

const repairPairs = [
  ['5e062036-278f-4e39-b0cd-8d02d33ced13', 'c55d4794-42d3-46be-aba4-931c40e495c0'],
  ['5e062036-278f-4e39-b0cd-8d02d33ced13', 'ead03ebc-bc28-49ea-9297-86da3b64fcfa'],
  ['0a75d458-e4e2-441e-8827-5b3d7778b186', '9c5a8932-fb1c-4439-a6d9-955df5c12748'],
  ['34807683-1ab8-4772-aa2d-ce8c5b55a720', 'ce599341-ec8f-4d07-9e6d-32af0afbaa9a'],
  ['b7a6497e-44ff-4f55-bf89-629adb02bb88', '33beefe4-98d0-493f-b621-42699dd99107'],
  ['b7a6497e-44ff-4f55-bf89-629adb02bb88', '84dc508f-82b7-4ecd-a099-c95016a77741'],
  ['b7a6497e-44ff-4f55-bf89-629adb02bb88', 'b51d25df-4415-4951-9f99-fea599d33ab5'],
  ['7e6ab2b5-261b-4a12-b7e0-3fdd5c0afe63', 'f550a5a3-9ea8-4e4d-9265-6fa377b99d5b'],
  ['ddfaf624-b422-48bf-889e-c43ecd4bc8b5', '0ee6341d-ecc3-444d-bf4c-740392e13ac1'],
  ['1489bcb7-b4fa-4c93-a92d-5433e725ba03', 'b4e14c6a-90f4-415a-b822-f20ce51736d8'],
  ['286d8093-4c9f-4762-ad27-a04ad6291591', '623e3ece-5240-4d99-a354-0061e303ba3d'],
  ['286d8093-4c9f-4762-ad27-a04ad6291591', '696327a8-8b93-4ffa-9bc8-f2eb084e5744'],
  ['c5190763-785c-4f7b-b96b-c0c29c960e0b', 'd2c42270-64ab-46a8-94f3-bc61fe0f4162'],
] as const;

const canonicalIds = [...new Set(repairPairs.map(([canonicalId]) => canonicalId))];
const duplicateIds = repairPairs.map(([, duplicateId]) => duplicateId);

describe('timelog assignment lifecycle migration', () => {
  it('contains the complete explicit production repair map', () => {
    const sql = readMigration();

    expect(repairPairs).toHaveLength(13);
    expect(canonicalIds).toHaveLength(9);
    expect(duplicateIds).toHaveLength(13);
    expect(new Set(canonicalIds).size).toBe(9);
    expect(new Set(duplicateIds).size).toBe(13);
    expect(new Set([...canonicalIds, ...duplicateIds]).size).toBe(22);

    repairPairs.forEach(([canonicalId, duplicateId]) => {
      expect(sql).toMatch(
        new RegExp(`\\(\\s*'${canonicalId}'\\s*,\\s*'${duplicateId}'\\s*,`),
      );
    });
    expect(sql).toContain("assert v_present_count = 22");
    expect(sql).toContain("assert v_mapping_count = 13");
    expect(sql).toMatch(/assert\s+v_present_count\s*=\s*22\b/);
    expect(sql).toMatch(/assert\s+v_mapping_count\s*=\s*13\b/);
    expect(sql).toContain("to_regclass('public.invoice_timelogs')");
    expect(sql).toContain('from public.invoice_timelogs');
    expect(sql).toContain('where it.timelog_id in');
    expect(sql).toContain('assert not v_has_invoice_link');
  });

  it('verifies normalized content before deleting and adds uniqueness last', () => {
    const sql = readMigration();
    expect(sql).toContain('timelog_duplicate_repair_map');
    expect(sql).toContain('normalized_timelog_days');
    expect(sql).toContain('pg_temp.normalized_timelog_days(c.id)');
    expect(sql).toContain('pg_temp.normalized_timelog_days(d.id)');
    expect(sql).toContain('is distinct from');
    expect(sql).toContain(
      "pg_temp.normalized_timelog_days('ddfaf624-b422-48bf-889e-c43ecd4bc8b5')",
    );
    expect(sql).toContain(
      "pg_temp.normalized_timelog_days('0ee6341d-ecc3-444d-bf4c-740392e13ac1')",
    );
    expect(sql).toContain('delete from public.timelogs');
    expect(sql).toMatch(/add\s+constraint\s+timelogs_event_contractor_unique\b/);
    expect(sql.indexOf('delete from public.timelogs'))
      .toBeLessThan(sql.search(/add\s+constraint\s+timelogs_event_contractor_unique\b/));
  });
});
