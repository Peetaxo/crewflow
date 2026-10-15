import { strict as assert } from 'node:assert';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

// Explicitly local: never generate or modify invoices in a hosted project.
const demoDir = resolve(process.argv[2] ?? '');
const credentials = JSON.parse(await readFile(`${demoDir}/local-credentials.json`, 'utf8'));
const fixtures = JSON.parse(await readFile(`${demoDir}/demo-accounts.json`, 'utf8'));
const url = new URL(credentials.API_URL);
assert.equal(url.protocol, 'http:');
assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname), 'Integration tests require an isolated local backend');

async function login(key) {
  const account = fixtures.accounts.find((candidate) => candidate.key === key);
  assert.ok(account?.email.endsWith('@crewflow-demo.test'), 'Only disposable demo accounts are allowed');
  const client = createClient(credentials.API_URL, credentials.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const result = await client.auth.signInWithPassword({ email: account.email, password: account.password });
  if (result.error) throw result.error;
  return { client, token: result.data.session.access_token, account };
}

const [coo, crew, crewhead, other] = await Promise.all(['coo', 'crew', 'crewhead', 'other'].map(login));
const invoiceResult = await coo.client.from('invoices').select('*').eq('id', 'a87b8597-cd3e-4f71-afe4-9d899cfc2bd6').single();
if (invoiceResult.error) throw invoiceResult.error;
const invoice = invoiceResult.data;
assert.equal(invoice.total_amount, 2056, 'Use the existing fake billing demo');

async function generate(token, body = JSON.stringify({ invoiceId: invoice.id })) {
  const response = await fetch(`${credentials.API_URL}/functions/v1/generate-invoice-pdf`, {
    method: 'POST',
    headers: { apikey: credentials.ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body,
  });
  return { status: response.status, body: await response.json() };
}

const otherBefore = await coo.client.from('invoices').select('pdf_path,pdf_generated_at').eq('id', invoice.id).single();
assert.equal((await generate(other.token)).status, 404, 'Other Crew must not enter the renderer for an invisible invoice');
assert.equal((await generate(other.token, JSON.stringify({ invoiceId: '00000000-0000-4000-8000-000000000099' }))).status, 404);
assert.equal((await generate(credentials.ANON_KEY)).status, 401, 'Anonymous access must be rejected');
assert.equal((await generate('invalid-token')).status, 401, 'Invalid authentication must be rejected');
const otherAfter = await coo.client.from('invoices').select('pdf_path,pdf_generated_at').eq('id', invoice.id).single();
assert.deepEqual(otherAfter.data, otherBefore.data, 'Unauthorized requests must not change PDF metadata');
assert.equal((await generate(coo.token, '{')).status, 400, 'Malformed JSON must be an actionable request error');
assert.equal((await generate(coo.token, JSON.stringify({ invoiceId: 42 }))).status, 400);

for (const [role, session] of [['COO', coo], ['CH', crewhead], ['owner Crew', crew]]) {
  const generated = await generate(session.token);
  assert.equal(generated.status, 200, `${role}: ${JSON.stringify(generated.body)}`);
  assert.equal(generated.body.pdfPath, `invoices/${invoice.id}/${invoice.invoice_number}.pdf`);
}
const refreshed = await crew.client.from('invoices').select('pdf_path,pdf_generated_at').eq('id', invoice.id).single();
assert.ok(refreshed.data?.pdf_generated_at);
const signed = await crew.client.storage.from('invoice-pdfs').createSignedUrl(refreshed.data.pdf_path, 300, { download: true });
if (signed.error) throw signed.error;
const downloaded = await fetch(signed.data.signedUrl);
assert.equal(downloaded.status, 200);
assert.match(downloaded.headers.get('content-type') ?? '', /application\/pdf/);
const bytes = new Uint8Array(await downloaded.arrayBuffer());
assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), '%PDF-');
await writeFile(`${demoDir}/demo-fixed-invoice.pdf`, bytes);
const foreignDownload = await other.client.storage.from('invoice-pdfs').createSignedUrl(refreshed.data.pdf_path, 300);
assert.ok(foreignDownload.error, 'Other Crew must not obtain a signed PDF URL');
const summary = { result: 'passed', invoiceNumber: invoice.invoice_number, totalCZK: invoice.total_amount, pdfBytes: bytes.length, pdfPath: refreshed.data.pdf_path, allowed: ['COO','CH','owner Crew'], denied: ['other Crew generation','anonymous generation','invalid token','other Crew signed download'] };
await writeFile(`${demoDir}/pdf-repair-integration.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
