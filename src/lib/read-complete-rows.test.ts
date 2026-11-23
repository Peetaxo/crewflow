import { describe, expect, it, vi } from 'vitest';
import { readCompleteRows } from './read-complete-rows';

const page = (data: string[], count: number) => ({ data, count, error: null });
function queries(next = page(['c'], 3)) {
  const range = vi.fn().mockResolvedValue(next);
  return { range, query: () => Object.assign(Promise.resolve(page(['a', 'b'], 3)), { range }) };
}
describe('readCompleteRows', () => {
  it('includes the last row when the API returns only part of the requested table', async () => {
    const { query, range } = queries();
    expect((await readCompleteRows(query, id => id)).data).toEqual(['a', 'b', 'c']);
    expect(range).toHaveBeenCalledWith(2, 2);
  });
  it.each([page([], 3), page(['b'], 3), page(['c'], 4)])('rejects an inconsistent continuation', async next => {
    await expect(readCompleteRows(queries(next).query, id => id)).rejects.toThrow('Obnovte data');
  });
});
