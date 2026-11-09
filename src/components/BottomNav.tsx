'use client';

import React from 'react';
import { CalendarDays, Calendar, ListTodo, Settings, Plus } from 'lucide-react';

export type TabId = 'today' | 'calendar' | 'tasks' | 'upcoming' | 'inbox' | 'review' | 'settings';

interface BottomNavProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  onAddPress: () => void;
  taskBadge?: number;
  inboxBadge?: number;
}

const NAV_ITEMS = [
  { id: 'today' as TabId, label: 'Today', icon: CalendarDays },
  { id: 'calendar' as TabId, label: 'Calendar', icon: Calendar },
  // Centre slot = fab (placeholder)
  { id: 'tasks' as TabId, label: 'Tasks', icon: ListTodo },
  { id: 'settings' as TabId, label: 'Settings', icon: Settings },
] as const;

/**
 * iOS-style fixed bottom tab bar.
 * Four tabs with a floating "+" in the middle.
 * Respects safe-area-inset-bottom so it clears the iPhone home indicator.
 */
export function BottomNav({ activeTab, onTabChange, onAddPress, taskBadge, inboxBadge }: BottomNavProps) {
  const badges: Partial<Record<TabId, number>> = {
    tasks: taskBadge,
    inbox: inboxBadge,
  };

  const left = NAV_ITEMS.slice(0, 2);
  const right = NAV_ITEMS.slice(2);

  return (
    <nav
      aria-label="Main navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#141721]/95 backdrop-blur-xl border-t border-slate-800/60"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-stretch h-14">
        {/* Left two tabs */}
        {left.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          const badge = badges[item.id];
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[44px] relative transition-colors ${
                isActive ? 'text-indigo-400' : 'text-slate-500 active:text-slate-300'
              }`}
            >
              <Icon className="w-5 h-5" aria-hidden="true" />
              <span className="text-[10px] font-medium">{item.label}</span>
              {badge !== undefined && badge > 0 && (
                <span className="absolute top-2 right-[calc(50%-16px)] w-4 h-4 text-[9px] font-bold bg-indigo-600 text-white rounded-full flex items-center justify-center leading-none">
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </button>
          );
        })}

        {/* Centre FAB */}
        <div className="flex-shrink-0 w-16 flex items-center justify-center">
          <button
            onClick={onAddPress}
            aria-label="Quick add task or event"
            className="w-12 h-12 rounded-full bg-indigo-600 active:bg-indigo-700 shadow-lg shadow-indigo-600/40 flex items-center justify-center transition-transform active:scale-95"
          >
            <Plus className="w-6 h-6 text-white" aria-hidden="true" />
          </button>
        </div>

        {/* Right two tabs */}
        {right.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          const badge = badges[item.id];
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[44px] relative transition-colors ${
                isActive ? 'text-indigo-400' : 'text-slate-500 active:text-slate-300'
              }`}
            >
              <Icon className="w-5 h-5" aria-hidden="true" />
              <span className="text-[10px] font-medium">{item.label}</span>
              {badge !== undefined && badge > 0 && (
                <span className="absolute top-2 right-[calc(50%-16px)] w-4 h-4 text-[9px] font-bold bg-indigo-600 text-white rounded-full flex items-center justify-center leading-none">
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
