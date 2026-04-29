import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import {
  buildProfilesInsertSql,
  parseBackupDataText,
  profilePayloadFromCrewMember,
} from './crew-import-utils.mjs';

const selectedNames = [
  'Marek Rebros',
  'Jaroslav Macháč',
  'Michal Balner',
  'Ondřej Šafařík',
  'Albert Cibulka',
  'Vilém Cibulka',
  'Jan Dubský',
  'Ondřej Novotný',
  'Tomáš Macášek',
  'Jakub Škorec',
  'Jan Ledvina',
];

const missingNames = [
  'Klára Staňková',
];

const backupPath = resolve('src/backup/data-backup.ts');
const outputPath = resolve('supabase/generated/selected-crew-profiles-import.sql');

const backupText = await readFile(backupPath, 'utf8');
const backupData = parseBackupDataText(backupText);
const crew = Array.isArray(backupData.crew) ? backupData.crew : [];
const selectedCrew = selectedNames.map((name) => {
  const member = crew.find((candidate) => candidate.name === name);
  if (!member) {
    throw new Error(`Missing selected crew member in backup: ${name}`);
  }
  return member;
});

const sql = [
  '-- Generated from screenshots with green confirmation marks only.',
  `-- Included: ${selectedNames.join(', ')}`,
  `-- Missing in backup, add manually if needed: ${missingNames.join(', ')}`,
  buildProfilesInsertSql(selectedCrew.map(profilePayloadFromCrewMember)),
].join('\n');

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, sql, 'utf8');

console.log(JSON.stringify({
  outputPath,
  selectedCount: selectedCrew.length,
  selectedNames,
  missingNames,
}, null, 2));
