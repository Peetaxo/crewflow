import { createContext } from 'react';
import type { ShiftWorkflowScope } from './shift-workflows.contract';
import type { ShiftWorkflowManagementData } from './shift-workflows.management';

export const ShiftWorkflowManagementContext = createContext<{
  scope: ShiftWorkflowScope;
  profileId: string;
  data: ShiftWorkflowManagementData | null;
  loading: boolean;
  error: boolean;
  reload: () => void;
} | null>(null);
