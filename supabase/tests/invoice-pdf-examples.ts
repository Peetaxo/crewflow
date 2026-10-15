import { renderInvoicePdf } from "../functions/generate-invoice-pdf/invoice-pdf.ts";
const output = Deno.args[0];
if (!output?.startsWith("/private/tmp/crewflow-")) {
  throw new Error("Use the private local evidence directory");
}
await Deno.mkdir(output, { recursive: true });
const base = {
  invoice_number: "SF-2026-PDF-0001",
  issue_date: "2026-10-15",
  due_date: "2026-10-29",
  taxable_supply_date: "2026-10-12",
  currency: "CZK",
  supplier_snapshot: {
    name: "Žaneta Černá",
    ico: "12345678",
    bankAccount: "19-2000145399/0800",
    iban: "CZ6508000000192000145399",
    billingStreet: "Testovací 1",
    billingZip: "11000",
    billingCity: "Praha",
    billingCountry: "CZ",
  },
  customer_snapshot: {
    name: "Ukázková produkce s.r.o.",
    ico: "87654321",
    dic: "CZ87654321",
    street: "Ukázková 10",
    zip: "11000",
    city: "Praha",
    country: "CZ",
  },
};
for (
  const [name, count] of [["normal", 1], ["boundary", 5], [
    "thirty-one-rows",
    31,
  ], ["long-czech-identity", 2]] as const
) {
  const invoice = name === "long-czech-identity"
    ? {
      ...base,
      supplier_snapshot: {
        ...base.supplier_snapshot,
        name:
          "Žaneta Černá a spolupracovníci pro zajišťování odborných produkčních a technických služeb na kulturních akcích",
        billingStreet:
          "Velmi dlouhá ulice pojmenovaná podle českých kulturních a společenských osobností číslo popisné 1234 a orientační 567",
        billingCity: "Ústí nad Labem - městská část Severní Terasa",
      },
      customer_snapshot: {
        ...base.customer_snapshot,
        name:
          "Česká společnost pro pořádání rozsáhlých mezinárodních kulturních festivalů a veřejných společenských událostí s.r.o.",
        street:
          "Dlouhá reprezentativní adresa hlavního sídla společnosti na náměstí Českých kulturních osobností číslo 9876",
        city: "České Budějovice - historické centrum",
      },
    }
    : base;
  const items = Array.from({ length: count }, (_, i) => ({
    job_number: `EXPLICIT-${String(i + 1).padStart(3, "0")}`,
    hours: 8.333333333333,
    amount_hours: 2083.33,
    km: 10,
    amount_km: 56,
    amount_meals: 350,
    amount_receipts: 0,
    total_amount: 2489.33,
  }));
  const pdf = await renderInvoicePdf({
    invoice: {
      ...invoice,
      total_amount: Math.round(count * 2489.33 * 100) / 100,
    },
    items,
  });
  await Deno.writeFile(`${output}/${name}.pdf`, pdf);
}
