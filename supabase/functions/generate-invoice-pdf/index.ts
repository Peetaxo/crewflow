import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.103.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type InvoicePayload = {
  invoiceId?: string;
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { invoiceId } = await request.json() as InvoicePayload;
    if (!invoiceId) {
      return json({ error: 'invoiceId is required' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ error: 'Supabase environment is not configured' }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const invoiceResult = await supabase
      .from('invoices')
      .select('*, invoice_items(*)')
      .eq('id', invoiceId)
      .single();

    if (invoiceResult.error || !invoiceResult.data) {
      return json({ error: invoiceResult.error?.message ?? 'Invoice not found' }, 404);
    }

    const invoice = invoiceResult.data;
    if (!invoice.invoice_number) {
      return json({ error: 'Invoice number is missing' }, 400);
    }

    const pdfBytes = new TextEncoder().encode(
      `Faktura ${invoice.invoice_number}\nVystaveno odberatelem\nDodavatel neni platcem DPH\n`,
    );
    const pdfPath = `invoices/${invoice.id}/${invoice.invoice_number}.pdf`;

    const uploadResult = await supabase
      .storage
      .from('invoice-pdfs')
      .upload(pdfPath, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadResult.error) {
      return json({ error: uploadResult.error.message }, 500);
    }

    const updateResult = await supabase
      .from('invoices')
      .update({
        pdf_path: pdfPath,
        pdf_generated_at: new Date().toISOString(),
      })
      .eq('id', invoice.id);

    if (updateResult.error) {
      return json({ error: updateResult.error.message }, 500);
    }

    return json({ pdfPath });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unexpected error' }, 500);
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
