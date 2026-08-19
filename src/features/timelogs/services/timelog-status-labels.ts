import { TimelogStatus } from '../../../types';

export interface TimelogStatusLabelOptions {
  isCrewOwner?: boolean;
}

export const getTimelogStatusLabel = (
  status: TimelogStatus,
  options: TimelogStatusLabelOptions = {},
): string => {
  switch (status) {
    case 'draft':
      return 'Koncept';
    case 'pending_crew_confirmation':
      return options.isCrewOwner ? 'Čeká na tvoje potvrzení' : 'Čeká na souhlas Crew';
    case 'pending_ch':
      return 'Čeká na kontrolu';
    case 'pending_coo':
      return 'Čeká na schválení';
    case 'approved':
      return 'Schváleno';
    case 'invoiced':
      return 'Vyúčtováno';
    case 'paid':
      return 'Zaplaceno';
    case 'rejected':
      return 'Vráceno k opravě';
  }
};
