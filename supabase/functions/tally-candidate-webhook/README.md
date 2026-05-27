# Tally candidate webhook

Endpoint pro prijem Tally formulare do tabulky `public.candidates`.

## Environment variables

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TALLY_WEBHOOK_SECRET`

## Tally setup

V Tally formuláři nastav Webhooks integration:

- Endpoint URL: `https://<project-ref>.functions.supabase.co/tally-candidate-webhook`
- Signing secret: stejná hodnota jako `TALLY_WEBHOOK_SECRET`
- Event: `FORM_RESPONSE`

Webhook mapuje odpovědi podle labelů polí, ne podle interních Tally question IDs.
