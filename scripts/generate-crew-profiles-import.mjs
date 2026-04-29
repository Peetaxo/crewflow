import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import {
  buildProfilesInsertSql,
  parseBackupDataText,
  profilePayloadFromCrewMember,
} from './crew-import-utils.mjs';

const backupPath = resolve('src/backup/data-backup.ts');
const outputPath = resolve('supabase/generated/crew-profiles-import.sql');

const backupText = await readFile(backupPath, 'utf8');
const backupData = parseBackupDataText(backupText);
const crew = Array.isArray(backupData.crew) ? backupData.crew : [];
const payloads = crew.map(profilePayloadFromCrewMember);
const sql = buildProfilesInsertSql(payloads);

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, sql, 'utf8');

const uniqueEmails = new Set(crew.map((member) => member.email?.toLowerCase()).filter(Boolean));
const withoutContact = crew.filter((member) => !member.email && !member.phone);

console.log(JSON.stringify({
  outputPath,
  crewCount: crew.length,
  uniqueEmailCount: uniqueEmails.size,
  withoutContactCount: withoutContact.length,
}, null, 2));
