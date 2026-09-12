import { createContext, useContext } from 'react';
// A single dashboard clock keeps freshness badges and disabled actions in sync.
export const ClockContext = createContext(0);
export function useClock() { return useContext(ClockContext); }
