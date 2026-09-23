import React from 'react';
import { Send, X } from 'lucide-react';
import { MEAL_CONFIG, PHASE_CONFIG } from '../../constants';
import { calculateDayHours, formatCurrency, normalizeMealSelection } from '../../utils';
import { getTimelogDayEntryKey } from '../timelogs/services/timelog-day-ui';
import type { TimelogDay, TimelogMeal, TimelogType } from '../../types';
import { Button } from '../../components/ui/button';
const formatSummaryDateLabel = (date: string) => {
  const [, month, day] = date.split('-');
  return `${day}.${month}.`;
};

const normalizeDay = (day: TimelogDay): TimelogDay => ({
  ...day,
  meals: normalizeMealSelection(day),
  meal: normalizeMealSelection(day)[0] ?? null,
  note: day.note ?? '',
});

const phaseOptions: Array<{ value: TimelogType; label: string }> = PHASE_CONFIG.map((phase) => ({
  value: phase.type,
  label: phase.label,
}));
const mealOptions = MEAL_CONFIG.map((meal) => ({
  value: meal.type,
  label: meal.label,
}));

const formatMealLabels = (meals: TimelogMeal[]): string => (
  meals
    .map((meal) => mealOptions.find((option) => option.value === meal)?.label ?? meal)
    .join(' + ')
);

type TimelogSummaryListProps = {
  days: TimelogDay[];
  mealAllowanceEnabled: boolean;
  showMealBadges?: boolean;
};

const TimelogSummaryList: React.FC<TimelogSummaryListProps> = ({
  days,
  mealAllowanceEnabled,
  showMealBadges = true,
}) => {
  if (days.length === 0) {
    return (
      <div className="nodu-mobile-timelog-summary-empty">
        Zatím nejsou zadané žádné hodiny.
      </div>
    );
  }

  return (
    <div className="nodu-mobile-timelog-summary-list">
      {days.map((day, index) => {
        const normalizedDay = normalizeDay(day);
        const meals = mealAllowanceEnabled ? normalizeMealSelection(normalizedDay) : [];
        const phaseLabel = phaseOptions.find((option) => option.value === normalizedDay.type)?.label ?? normalizedDay.type;

        return (
          <div
            key={getTimelogDayEntryKey(day, index)}
            className="nodu-mobile-timelog-summary-row"
          >
            <div className="nodu-mobile-timelog-summary-row-main">
              <div className="nodu-mobile-timelog-summary-row-meta">
                <span className="nodu-mobile-timelog-summary-row-date">
                  {formatSummaryDateLabel(normalizedDay.d)}
                </span>
                <span className="nodu-mobile-timelog-summary-row-separator">
                  ·
                </span>
                <span className="nodu-mobile-timelog-summary-row-time">
                  {normalizedDay.f} - {normalizedDay.t}
                </span>
                <span className="nodu-mobile-timelog-summary-row-phase">
                  {phaseLabel}
                </span>
              </div>
              {showMealBadges && meals.length > 0 && (
                <div className="nodu-mobile-timelog-summary-row-badges">
                  <span className="nodu-mobile-timelog-summary-row-meal">
                    {formatMealLabels(meals)}
                  </span>
                </div>
              )}
            </div>
            <div className="nodu-mobile-timelog-summary-row-hours">
              {calculateDayHours(normalizedDay.f, normalizedDay.t).toFixed(1)}h
            </div>
          </div>
        );
      })}
    </div>
  );
};

type TimelogReportSummaryProps = {
  days: TimelogDay[];
  totalHours: number;
  totalCompensation: number;
  km: number;
  note: string;
  mealAllowanceEnabled: boolean;
  mealAllowanceTotal: number;
};

export const TimelogReportSummary: React.FC<TimelogReportSummaryProps> = ({
  days,
  km,
  note,
  mealAllowanceEnabled,
  mealAllowanceTotal,
}) => {
  const trimmedNote = note.trim();
  const hasSupplementalTotals = km > 0 || (mealAllowanceEnabled && mealAllowanceTotal > 0);

  return (
    <section
      className="nodu-mobile-timelog-readonly-summary"
      role="region"
      aria-label="Souhrn hodin"
    >
      <div className="nodu-mobile-timelog-readonly-summary-header">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--nodu-accent)]">
            Souhrn hodin
          </div>
          <h4>Všechny záznamy</h4>
        </div>
        <span>{days.length} záznamů</span>
      </div>

      <TimelogSummaryList days={days} mealAllowanceEnabled={mealAllowanceEnabled} />

      {hasSupplementalTotals && (
        <div className="nodu-mobile-timelog-readonly-summary-totals">
          {km > 0 && (
            <div>
              <span>Cestovné</span>
              <strong>{km} km</strong>
            </div>
          )}
          {mealAllowanceEnabled && mealAllowanceTotal > 0 && (
            <div>
              <span>Jídlo</span>
              <strong>{formatCurrency(mealAllowanceTotal)}</strong>
            </div>
          )}
        </div>
      )}

      {trimmedNote && (
        <div className="nodu-mobile-timelog-readonly-summary-note">
          <span>Poznámka</span>
          <p>{trimmedNote}</p>
        </div>
      )}
    </section>
  );
};

type TimelogSubmitConfirmationDialogProps = TimelogReportSummaryProps & {
  title: string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: () => void;
};

export const TimelogSubmitConfirmationDialog: React.FC<TimelogSubmitConfirmationDialogProps> = ({
  title,
  confirmLabel,
  days,
  totalHours,
  totalCompensation,
  km,
  note,
  mealAllowanceEnabled,
  mealAllowanceTotal,
  onClose,
  onConfirm,
}) => {
  const trimmedNote = note.trim();

  return (
    <div className="nodu-mobile-timelog-submit-layer">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-timelog-submit-title"
        className="nodu-mobile-timelog-submit-dialog"
      >
        <div className="nodu-mobile-timelog-submit-header">
          <div>
            <h4 id="mobile-timelog-submit-title">{title}</h4>
            <p>Zkontroluj si ještě hodiny, cestovné a poznámku.</p>
          </div>
          <button
            type="button"
            aria-label="Zavřít potvrzení odeslání"
            className="nodu-mobile-timelog-submit-close"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        <div className="nodu-mobile-timelog-submit-summary">
          <TimelogSummaryList
            days={days}
            mealAllowanceEnabled={mealAllowanceEnabled}
            showMealBadges={false}
          />
          <div className="nodu-mobile-timelog-readonly-summary-totals">
            <div>
              <span>Celkem</span>
              <strong>{totalHours.toFixed(1)}h celkem</strong>
            </div>
            <div>
              <span>Odměna</span>
              <strong>{formatCurrency(totalCompensation)}</strong>
            </div>
            {km > 0 && (
              <div>
                <span>Cestovné</span>
                <strong>{km} km</strong>
              </div>
            )}
            {mealAllowanceEnabled && mealAllowanceTotal > 0 && (
              <div>
                <span>Jídlo</span>
                <strong>{formatCurrency(mealAllowanceTotal)}</strong>
              </div>
            )}
          </div>
          {trimmedNote && (
            <div className="nodu-mobile-timelog-readonly-summary-note">
              <span>Poznámka</span>
              <p>{trimmedNote}</p>
            </div>
          )}
        </div>

        <div className="nodu-mobile-timelog-submit-actions">
          <Button type="button" variant="outline" onClick={onClose}>
            Zpět
          </Button>
          <Button type="button" onClick={onConfirm}>
            <Send size={16} /> {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
};
