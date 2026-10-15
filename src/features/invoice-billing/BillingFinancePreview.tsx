import { formatBillingHours, formatBillingMoney, type BillingFinance } from './contract';
export function BillingFinancePreview({ finance }: { finance: BillingFinance }) {
  return <div className="space-y-4">{finance.reports.map((report) => <section key={report.timelogId} className="rounded-xl border p-3 text-sm">
    <h3 className="font-semibold">{report.eventName} · {report.jobNumber || 'Bez čísla zakázky'}</h3>
    <p>{report.dateFrom || 'Neznámé datum'} – {report.dateTo || 'Neznámé datum'}</p>
    <div className="my-2 grid gap-3 sm:grid-cols-2">
      <div><strong>Dodavatel</strong><p>{report.supplierSnapshot.name}</p><p>IČO {report.supplierSnapshot.ico || 'Neuvedeno'}{report.supplierSnapshot.dic ? ` · DIČ ${report.supplierSnapshot.dic}` : ''}</p>
        <p>{report.supplierSnapshot.billingStreet}, {report.supplierSnapshot.billingZip} {report.supplierSnapshot.billingCity}, {report.supplierSnapshot.billingCountry}</p>
        <p>Účet: {report.supplierSnapshot.bankAccount || 'Neuveden'}</p><p>IBAN: {report.supplierSnapshot.iban || 'Neuveden · bez QR platby'}</p></div>
      <div><strong>Odběratel</strong><p>{report.customerSnapshot.name || 'Chybí odběratel'}</p><p>IČO {report.customerSnapshot.ico || 'Neuvedeno'}{report.customerSnapshot.dic ? ` · DIČ ${report.customerSnapshot.dic}` : ''}</p>
        <p>{report.customerSnapshot.street}, {report.customerSnapshot.zip} {report.customerSnapshot.city}, {report.customerSnapshot.country}</p></div>
    </div>
    <div className="overflow-x-auto"><table className="w-full text-left text-xs"><caption className="sr-only">Schválené dny a stravné</caption><thead><tr><th>Den</th><th>Čas</th><th>Hodiny</th><th>Stravné</th></tr></thead>
      <tbody>{report.days.map((day) => <tr key={day.id}><td>{day.date}<span className="block">{day.dayType}{day.note ? ` · ${day.note}` : ''}</span></td><td>{day.timeFrom || '?'}–{day.timeTo || '?'}</td><td>{formatBillingHours(day.hours)}</td><td>{formatBillingMoney(day.amountMeals)}</td></tr>)}</tbody></table></div>
    <p className="mt-2">Práce: {formatBillingHours(report.hours)} × {formatBillingMoney(report.hourlyRate)}/h = {formatBillingMoney(report.amountHours)}</p>
    <p>Cestovné: {report.km ?? 'Neznámé'} km × {formatBillingMoney(report.kmRate)}/km = {formatBillingMoney(report.amountKm)}</p>
    <p>Stravné: {formatBillingMoney(report.amountMeals)}</p><p className="font-semibold">Celkem za výkaz: {formatBillingMoney(report.totalAmount)}</p>
  </section>)}</div>;
}
