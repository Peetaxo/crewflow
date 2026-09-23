// Runs SQL through the fixed local container socket; no remote configuration.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const args=['--context','colima','exec','-i','-e','PGOPTIONS=-c supautils.hint_roles=',
 'crewflow-event-form-db','psql','-U','postgres','-d','crewflow_shared_shift_tests','-X','-q','-v','ON_ERROR_STOP=1','-o','/dev/null'];
const sql=name=>readFileSync(new URL(name,import.meta.url),'utf8');
for(const name of ['shared-shift-workflows.schema.sql','shared-shift-foundation-fixtures.sql','shared-shift-rounds.sql','targeted-event-approval.sql','event-schedule-drafts.sql']) {
 let input=sql(name);
 if(name==='shared-shift-foundation-fixtures.sql') input=input.replace('\\ir shared-shift-workflows.sql',()=>sql('shared-shift-workflows.sql'));
 const result=spawnSync('docker',args,{input,encoding:'utf8',timeout:30000});
 if(result.status!==0) throw new Error(`${name} failed (${result.status}): ${result.stderr}`);
 const unexpected=result.stderr.split('\n').filter(line=>line && !line.includes('supautils.hint_roles') && !line.includes('there is already a transaction in progress'));
 if(unexpected.length) throw new Error(`${name}: ${unexpected.join('\n')}`);
 console.log(`PASS: ${name}`);
}
