/** Compare validated database timestamps without dropping sub-millisecond precision. */
export function compareShiftWorkflowTimestamps(left: string, right: string): number {
  const fraction = /\.(\d+)(?=Z$|[+-]\d{2}:?\d{2}$)/;
  const parts = [left, right].map((value) => ({
    seconds: BigInt(Date.parse(value.replace(fraction, '')) / 1000),
    fraction: value.match(fraction)?.[1] ?? '',
  }));
  const precision = Math.max(...parts.map((part) => part.fraction.length));
  const values = parts.map((part) => part.seconds * (10n ** BigInt(precision))
    + BigInt(part.fraction.padEnd(precision, '0') || '0'));
  return values[0] < values[1] ? -1 : values[0] > values[1] ? 1 : 0;
}
