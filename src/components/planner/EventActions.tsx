'use client';

import { createContext, useContext } from 'react';
import type { CalendarEvent } from '@/lib/types';

/** Lets any EventCard (Today, Calendar, detail sheet) open the editor without prop drilling. */
export const EventActionsContext = createContext<{ onEditEvent?: (e: CalendarEvent) => void }>({});

export const useEventActions = () => useContext(EventActionsContext);

/** Events created in Apex can be edited; Google/Apple events are read-only mirrors. */
export function isEditableEvent(e: CalendarEvent): boolean {
  return e.source !== 'google' && e.source !== 'apple';
}
