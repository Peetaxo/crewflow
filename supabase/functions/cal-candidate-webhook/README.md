# Cal.com candidate webhook

Endpoint pro prijem Cal.com booking udalosti do tabulky `public.candidates`.

## Nastaveni v Cal.com

- Subscriber URL: `https://gkxbluqkugprwcpdephk.functions.supabase.co/cal-candidate-webhook`
- Event triggers:
  - `Booking Created`
  - `Booking Rescheduled`
  - `Booking Cancelled`
- Secret: hodnota Supabase secretu `CAL_WEBHOOK_SECRET`

Webhook kandidata paruje podle e-mailu u attendee. Pokud kandidata nenajde, zalozi lehky zaznam se zdrojem `Cal.com`, aby se booking neztratil.
