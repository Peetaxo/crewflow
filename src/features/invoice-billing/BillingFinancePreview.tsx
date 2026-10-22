import { formatBillingHours, formatBillingMoney, type BillingFinance } from './contract';
import styles from './BillingPresentation.module.css';
import { formatBillingDate, formatBillingDateRange } from './billing-presentation';
export function BillingFinancePreview({ finance }: { finance: BillingFinance }) {
  return <div className={styles.preview}>{finance.reports.map((report) => <section key={report.timelogId} className={styles.report}>
    <header className={styles.reportHeader}>
      <h3>{report.eventName} · {report.jobNumber || 'Bez čísla zakázky'}</h3>
      <p>{formatBillingDateRange(report.dateFrom, report.dateTo)}</p>
    </header>
    <div className={styles.parties}>
      <div><strong>Dodavatel</strong><p>{report.supplierSnapshot.name}</p><p>IČO {report.supplierSnapshot.ico || 'Neuvedeno'}{report.supplierSnapshot.dic ? ` · DIČ ${report.supplierSnapshot.dic}` : ''}</p>
        <p>{report.supplierSnapshot.billingStreet}, {report.supplierSnapshot.billingZip} {report.supplierSnapshot.billingCity}, {report.supplierSnapshot.billingCountry}</p>
        <p>Účet: {report.supplierSnapshot.bankAccount || 'Neuveden'}</p><p>IBAN: {report.supplierSnapshot.iban || 'Neuveden · bez QR platby'}</p></div>
      <div><strong>Odběratel</strong><p>{report.customerSnapshot.name || 'Chybí odběratel'}</p><p>IČO {report.customerSnapshot.ico || 'Neuvedeno'}{report.customerSnapshot.dic ? ` · DIČ ${report.customerSnapshot.dic}` : ''}</p>
        <p>{report.customerSnapshot.street}, {report.customerSnapshot.zip} {report.customerSnapshot.city}, {report.customerSnapshot.country}</p></div>
    </div>
    <table className={styles.days}><caption className="sr-only">Schválené dny a stravné</caption><thead><tr><th scope="col">Den</th><th scope="col">Čas</th><th scope="col">Hodiny</th><th scope="col">Stravné</th></tr></thead>
      <tbody>{report.days.map((day) => <tr key={day.id}><td data-label="Den">{formatBillingDate(day.date)}<span>{day.dayType}{day.note ? ` · ${day.note}` : ''}</span></td><td data-label="Čas">{day.timeFrom || '?'}–{day.timeTo || '?'}</td><td data-label="Hodiny">{formatBillingHours(day.hours)}</td><td data-label="Stravné">{formatBillingMoney(day.amountMeals)}</td></tr>)}</tbody></table>
    <div className={styles.calculation}>
      <p>Práce: {formatBillingHours(report.hours)} × {formatBillingMoney(report.hourlyRate)}/h = {formatBillingMoney(report.amountHours)}</p>
      <p>Cestovné: {report.km ?? 'Neznámé'} km × {formatBillingMoney(report.kmRate)}/km = {formatBillingMoney(report.amountKm)}</p>
      <p>Stravné: {formatBillingMoney(report.amountMeals)}</p>
      <p>Účtenky: {formatBillingMoney(report.amountReceipts)}</p>
      <p className={styles.reportTotal}>Celkem za výkaz: {formatBillingMoney(report.totalAmount)}</p>
    </div>
  </section>)}</div>;
}
