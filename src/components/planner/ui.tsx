'use client';

import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

/** iOS-style segmented control. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
  label,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  className?: string;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cx('flex p-1 rounded-xl bg-surface-2 border border-line', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'flex-1 min-h-[34px] px-3 rounded-[9px] text-[13px] font-medium transition-all flex items-center justify-center gap-1.5',
            value === o.value ? 'bg-surface dark:bg-surface-3 text-fg shadow-card' : 'text-muted hover:text-fg'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Bottom sheet on phones, centred dialog on larger screens. */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" role="dialog" aria-modal="true">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-fade-in" />
      <div className="relative w-full md:max-w-lg max-h-[88dvh] flex flex-col bg-surface md:rounded-3xl rounded-t-3xl border border-line shadow-2xl animate-sheet-up md:animate-pop-in">
        <div className="md:hidden flex justify-center pt-2.5">
          <span className="w-10 h-1.5 rounded-full bg-line-strong" />
        </div>
        {title !== undefined && (
          <div className="flex items-center justify-between gap-3 px-5 pt-3 pb-2">
            <h2 className="text-[17px] font-semibold text-fg truncate">{title}</h2>
            <button onClick={onClose} aria-label="Close" className="w-8 h-8 shrink-0 rounded-full bg-surface-2 text-muted flex items-center justify-center hover:text-fg">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-4">{children}</div>
        {footer && <div className="px-5 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-line">{footer}</div>}
        {!footer && <div className="pb-[env(safe-area-inset-bottom)]" />}
      </div>
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-1 mb-2 mt-6 first:mt-0">
      <h3 className="text-[13px] font-semibold uppercase tracking-wide text-subtle">{children}</h3>
      {action}
    </div>
  );
}

export function EmptyState({ icon, title, body }: { icon: ReactNode; title: string; body?: string }) {
  return (
    <div className="flex flex-col items-center text-center py-10 px-6 rounded-2xl border border-dashed border-line-strong">
      <div className="w-11 h-11 rounded-2xl bg-surface-2 text-muted flex items-center justify-center mb-3">{icon}</div>
      <p className="text-[15px] font-medium text-fg">{title}</p>
      {body && <p className="text-sm text-muted mt-1 max-w-xs">{body}</p>}
    </div>
  );
}
