import React, { useEffect, useMemo, useState } from 'react';
import { Star } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/button';
import type { Contractor, CrewRating, Event } from '../../../types';
import { upsertCrewRating } from '../services/crew-ratings.service';

interface EventCrewRatingPanelProps {
  event: Event;
  crew: Contractor[];
  ratings: CrewRating[];
  ratedByProfileId: string | null;
}

type RatingDraft = Record<string, { rating: string; note: string }>;

const formatRating = (rating?: CrewRating) => (
  rating ? `${rating.rating}/10` : 'Chybi hodnoceni'
);

const EventCrewRatingPanel = ({
  event,
  crew,
  ratings,
  ratedByProfileId,
}: EventCrewRatingPanelProps) => {
  const ratingsByProfileId = useMemo(() => new Map(
    ratings.map((rating) => [rating.profileId, rating]),
  ), [ratings]);
  const [drafts, setDrafts] = useState<RatingDraft>({});

  useEffect(() => {
    setDrafts((current) => {
      const nextDrafts: RatingDraft = {};
      for (const contractor of crew) {
        if (!contractor.profileId) continue;
        const existing = ratingsByProfileId.get(contractor.profileId);
        nextDrafts[contractor.profileId] = {
          rating: current[contractor.profileId]?.rating ?? (existing ? String(existing.rating) : ''),
          note: current[contractor.profileId]?.note ?? existing?.note ?? '',
        };
      }
      return nextDrafts;
    });
  }, [crew, ratingsByProfileId]);

  const missingCount = crew.filter((contractor) => (
    contractor.profileId && !ratingsByProfileId.has(contractor.profileId)
  )).length;

  const saveRating = async (contractor: Contractor) => {
    if (!contractor.profileId) {
      toast.error('Nepodarilo se dohledat UUID clena crew.');
      return;
    }

    const draft = drafts[contractor.profileId] ?? { rating: '', note: '' };
    const parsedRating = Number(draft.rating);

    try {
      await upsertCrewRating({
        profileId: contractor.profileId,
        eventId: event.id,
        eventSupabaseId: event.supabaseId ?? null,
        source: 'event',
        rating: parsedRating,
        note: draft.note,
        ratedByProfileId,
      });
      toast.success('Hodnoceni crew ulozeno.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Hodnoceni se nepodarilo ulozit.');
    }
  };

  if (crew.length === 0) return null;

  return (
    <div className="mt-4 rounded-[24px] border border-[color:var(--nodu-border)] bg-white p-4 shadow-[0_16px_34px_rgba(var(--nodu-text-rgb),0.05)]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-[color:var(--nodu-text)]">
            <Star size={16} className="text-[color:var(--nodu-accent)]" />
            Hodnoceni crew
          </div>
          <div className="mt-1 text-xs text-[color:var(--nodu-text-soft)]">
            {missingCount > 0 ? `${missingCount} chybi vyplnit` : 'Vsechna hodnoceni jsou vyplnena'}
          </div>
        </div>
        <div className="rounded-full border border-[color:var(--nodu-border)] px-3 py-1 text-xs font-semibold text-[color:var(--nodu-text-soft)]">
          0-10
        </div>
      </div>

      <div className="space-y-3">
        {crew.map((contractor) => {
          if (!contractor.profileId) return null;

          const existing = ratingsByProfileId.get(contractor.profileId);
          const draft = drafts[contractor.profileId] ?? { rating: '', note: '' };

          return (
            <div key={contractor.profileId} className="rounded-[18px] border border-[color:var(--nodu-border)] bg-[color:var(--nodu-paper-strong)] p-3">
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <div className="av h-8 w-8 text-[10px]" style={{ backgroundColor: contractor.bg, color: contractor.fg }}>
                  {contractor.ii}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-[color:var(--nodu-text)]">{contractor.name}</div>
                  <div className="text-xs text-[color:var(--nodu-text-soft)]">{formatRating(existing)}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-[96px_1fr_auto] md:items-end">
                <label className="block">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--nodu-text-soft)]">
                    Skore
                  </span>
                  <input
                    aria-label={`Hodnoceni ${contractor.name}`}
                    type="number"
                    min="0"
                    max="10"
                    step="1"
                    value={draft.rating}
                    onChange={(changeEvent) => setDrafts((current) => ({
                      ...current,
                      [contractor.profileId as string]: {
                        ...draft,
                        rating: changeEvent.target.value,
                      },
                    }))}
                    className="w-full rounded-xl border border-[color:var(--nodu-border)] bg-white px-3 py-2 text-sm font-semibold text-[color:var(--nodu-text)] outline-none transition focus:border-[color:var(--nodu-accent)] focus:ring-2 focus:ring-[rgba(var(--nodu-accent-rgb),0.16)]"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--nodu-text-soft)]">
                    Poznamka
                  </span>
                  <input
                    type="text"
                    value={draft.note}
                    onChange={(changeEvent) => setDrafts((current) => ({
                      ...current,
                      [contractor.profileId as string]: {
                        ...draft,
                        note: changeEvent.target.value,
                      },
                    }))}
                    className="w-full rounded-xl border border-[color:var(--nodu-border)] bg-white px-3 py-2 text-sm text-[color:var(--nodu-text)] outline-none transition focus:border-[color:var(--nodu-accent)] focus:ring-2 focus:ring-[rgba(var(--nodu-accent-rgb),0.16)]"
                    placeholder="Volitelny kontext"
                  />
                </label>

                <Button
                  type="button"
                  onClick={() => void saveRating(contractor)}
                  size="sm"
                  aria-label={`Ulozit hodnoceni pro ${contractor.name}`}
                >
                  Ulozit
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default EventCrewRatingPanel;
