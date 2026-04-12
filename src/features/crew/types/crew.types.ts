import { Contractor } from '../../../types';

export type CrewMember = Contractor;

export interface CrewListFilters {
  search?: string;
  city?: string;
  reliable?: boolean;
  tag?: string;
}

export type CreateCrewInput = CrewMember;

export type UpdateCrewInput = CrewMember;

export interface DeleteCrewResult {
  id: number;
}
