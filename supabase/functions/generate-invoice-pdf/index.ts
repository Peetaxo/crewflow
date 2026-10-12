import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.103.0';
import { renderInvoicePdf } from './invoice-pdf.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type InvoicePayload = {
  invoiceId?: unknown;
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return json({ error: 'Tento požadavek není podporovaný.' }, 405);
  }

  const authorization = request.headers.get('Authorization');
  const token = authorization?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token) return json({ error: 'Pro práci s fakturou se přihlaste.' }, 401);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json({ error: 'Generátor PDF není nakonfigurovaný.' }, 500);
    }

    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization! } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const userResult = await caller.auth.getUser(token);
    if (userResult.error || !userResult.data.user) {
      return json({ error: 'Přihlášení vypršelo. Přihlaste se znovu.' }, 401);
    }

    let payload: InvoicePayload | null;
    try {
      payload = await request.json() as InvoicePayload | null;
    } catch {
      return json({ error: 'Požadavek na vytvoření PDF není platný.' }, 400);
    }
    const invoiceId = payload?.invoiceId;
    if (typeof invoiceId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(invoiceId)) {
      return json({ error: 'Vyberte platnou fakturu.' }, 400);
    }

    // Apply the same invoice visibility as the app before privileged file writes.
    const invoiceResult = await caller
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .maybeSingle();

    if (invoiceResult.error) throw invoiceResult.error;
    if (!invoiceResult.data) {
      return json({ error: 'Faktura není dostupná.' }, 404);
    }

    const invoice = invoiceResult.data;
    if (!invoice.invoice_number) {
      return json({ error: 'Faktuře chybí číslo. Zkontrolujte její vystavení.' }, 400);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const itemsResult = await supabase.from('invoice_items').select('*').eq('invoice_id', invoice.id).order('created_at');
    if (itemsResult.error) throw itemsResult.error;
    const pdfBytes = await renderInvoicePdf({
      invoice,
      items: itemsResult.data ?? [],
    });
    const pdfPath = `invoices/${invoice.id}/${invoice.invoice_number}.pdf`;

    const uploadResult = await supabase
      .storage
      .from('invoice-pdfs')
      .upload(pdfPath, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadResult.error) {
      throw uploadResult.error;
    }

    const updateResult = await supabase
      .from('invoices')
      .update({
        pdf_path: pdfPath,
        pdf_generated_at: new Date().toISOString(),
      })
      .eq('id', invoice.id);

    if (updateResult.error) {
      throw updateResult.error;
    }

    return json({ pdfPath });
  } catch (error) {
    console.error('Invoice PDF generation failed:', error);
    return json({ error: 'PDF faktury se nepodařilo vytvořit. Zkuste to znovu.' }, 500);
  }
});

const json = (body: unknown, status = 200): Response => (
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
);
