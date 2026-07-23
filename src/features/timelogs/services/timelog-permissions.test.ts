import { describe, expect, it } from 'vitest';
import type { Role, TimelogStatus } from '../../../types';
import { canEditTimelog, canSeeTimelogNote, canSubmitTimelog } from './timelog-permissions';

const timelogWithStatus = (status: TimelogStatus) => ({ status });

describe('timelog permissions', () => {
  it.each([
    ['crew', 'draft', true],
    ['crew', 'rejected', true],
    ['crew', 'pending_ch', false],
    ['crewhead', 'draft', true],
    ['crewhead', 'pending_ch', true],
    ['crewhead', 'pending_coo', false],
    ['coo', 'draft', false],
    ['coo', 'pending_ch', false],
    ['coo', 'pending_coo', false],
  ] satisfies [Role, TimelogStatus, boolean][])('returns edit permission for %s and %s', (role, status, expected) => {
    expect(canEditTimelog(timelogWithStatus(status), role)).toBe(expected);
  });

  it('keeps timelog notes hidden from COO while visible to Crew and CrewHead', () => {
    expect(canSeeTimelogNote('crew')).toBe(true);
    expect(canSeeTimelogNote('crewhead')).toBe(true);
    expect(canSeeTimelogNote('coo')).toBe(false);
  });

  it.each([
    ['crew', 'draft', true],
    ['crew', 'rejected', true],
    ['crew', 'pending_ch', false],
    ['crewhead', 'draft', true],
    ['crewhead', 'rejected', false],
    ['coo', 'draft', false],
  ] satisfies [Role, TimelogStatus, boolean][])('returns submit permission for %s and %s', (role, status, expected) => {
    expect(canSubmitTimelog(timelogWithStatus(status), role)).toBe(expected);
  });
});
