import { describe, expect, it } from 'vitest';
import { compareShiftWorkflowTimestamps } from './shift-workflow-time';

describe('database timestamp ordering', () => {
  it('compares precise instants across offsets and differing fractional spellings', () => {
    expect(compareShiftWorkflowTimestamps('2026-09-20T00:00:00.000001Z', '2026-09-20T02:00:00.000002+02:00')).toBe(-1);
    expect(compareShiftWorkflowTimestamps('2026-09-20T02:00:00.120000+02:00', '2026-09-20T00:00:00.12Z')).toBe(0);
    expect(compareShiftWorkflowTimestamps('2026-09-20T00:00:01Z', '2026-09-20T00:00:00.999999Z')).toBe(1);
  });
});
