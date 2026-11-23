type RowsResult<T> = { data: T[] | null; count: number | null; error: { message: string } | null };
type OrderedRowsQuery<T> = PromiseLike<RowsResult<T>> & {
  range(from: number, to: number): PromiseLike<RowsResult<T>>;
};

/** Read a select with count: 'exact' and deterministic ordering, including rows beyond the API limit. */
export async function readCompleteRows<T>(query: () => OrderedRowsQuery<T>, key?: (row: T) => string) {
  const first = await query();
  if (first.error) throw new Error(first.error.message);
  if (first.count === null || !first.data) throw new Error('Nepodařilo se ověřit úplnost načtených údajů.');
  const rows = first.data;
  const count = first.count;
  if (count != null && count !== rows.length) {
    const changed = () => new Error('Seznam se během načítání změnil. Obnovte data a zkuste to znovu.');
    if (!rows.length || rows.length > count) throw changed();
    const pageSize = rows.length;
    while (rows.length < count) {
      const page = await query().range(rows.length, Math.min(rows.length + pageSize, count) - 1);
      if (page.error) throw new Error(page.error.message);
      if (page.count !== count || !page.data?.length || rows.length + page.data.length > count) throw changed();
      rows.push(...page.data);
    }
    if (key && new Set(rows.map(key)).size !== count) throw changed();
  }
  return { data: rows, error: null };
}
