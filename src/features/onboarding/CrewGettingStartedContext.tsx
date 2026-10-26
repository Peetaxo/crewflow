import { createContext } from 'react';

export const CrewGettingStartedContext = createContext<{ openGuide: () => void } | null>(null);
