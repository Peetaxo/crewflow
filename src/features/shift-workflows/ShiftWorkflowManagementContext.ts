import { createContext } from 'react';
import type { ShiftWorkflowScope } from './shift-workflows.contract';
import type { ShiftWorkflowManagementData } from './shift-workflows.management';

export const ShiftWorkflowManagementContext = createContext<{
  scope: ShiftWorkflowScope;
  data: ShiftWorkflowManagementData | null;
  loading: boolean;
  error: boolean;
  open: (workflowId: string | null) => void;
  reload: () => void;
} | null>(null);
