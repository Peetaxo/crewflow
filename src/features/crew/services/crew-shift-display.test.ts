import { describe, expect, it } from 'vitest';
import { categorizeCrewTimelogs, resolveShiftProject } from './crew-shift-display';
import type { Event, Project, Timelog } from '../../../types';

const event: Event = {
  id: 1,
  supabaseId: 'event-uuid-1',
  projectId: null,
  name: 'Prevoz tisku do Estila',
  job: '',
  startDate: '2026-04-20',
  endDate: '2026-04-20',
  city: 'Praha',
  needed: 1,
  filled: 1,
  status: 'past',
  client: 'NEXT LEVEL',
};

describe('crew shift display helpers', () => {
  it('returns a fallback project for event timelogs without linked project', () => {
    expect(resolveShiftProject(event, [])).toEqual({
      id: 'Bez projektu',
      name: 'Prevoz tisku do Estila',
      client: 'NEXT LEVEL',
      createdAt: '2026-04-20',
      note: '',
    });
  });

  it('resolves linked projects by Supabase project id', () => {
    const project: Project = {
      id: 'EIT018',
      supabaseId: 'project-uuid-1',
      name: 'EIT018',
      client: 'JCHP s.r.o.',
      createdAt: '2026-04-10',
    };

    expect(resolveShiftProject({ ...event, projectId: 'project-uuid-1', job: '' }, [project])).toBe(project);
  });

  it('keeps only future draft shifts in upcoming and moves past drafts to processing', () => {
    const futureEvent: Event = {
      ...event,
      id: 2,
      startDate: '2999-04-30',
      endDate: '2999-04-30',
      status: 'upcoming',
    };
    const pastDraft: Timelog = {
      id: 1,
      eid: event.id,
      contractorProfileId: 'profile-1',
      days: [],
      km: 0,
      note: '',
      status: 'draft',
    };
    const futureDraft: Timelog = {
      ...pastDraft,
      id: 2,
      eid: futureEvent.id,
    };
    const pending: Timelog = {
      ...pastDraft,
      id: 3,
      status: 'pending_ch',
    };
    const approved: Timelog = {
      ...pastDraft,
      id: 4,
      status: 'approved',
    };

    expect(categorizeCrewTimelogs([pastDraft, futureDraft, pending, approved], [event, futureEvent])).toEqual({
      upcoming: [futureDraft],
      processing: [pastDraft, pending],
      invoiced: [approved],
    });
  });
});
