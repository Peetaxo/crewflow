import { describe, expectTypeOf, it } from 'vitest';
import type { Database, Json } from './database.types';

type ApprovalFunctions = Database['public']['Functions'];

describe('targeted approval database function contracts', () => {
  it('models SQL jsonb mutation returns as generated Json types', () => {
    expectTypeOf<ApprovalFunctions['handoff_timelogs_for_approval_atomic']['Returns']>()
      .toEqualTypeOf<Json>();
    expectTypeOf<ApprovalFunctions['resolve_timelog_approvals_atomic']['Returns']>()
      .toEqualTypeOf<Json>();
  });
});
