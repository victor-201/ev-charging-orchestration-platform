'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '@/core/utils/cn';

interface DropdownPos {
  top: number;
  left: number;
  width: number;
  /** render above the trigger when there is not enough space below */
  openUpward: boolean;
  maxHeight: number;
}

export default function CustomSelect({
  value,
  onChange,
  options,
  placeholder = 'Chọn...',
  className = '',
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [pos, setPos] = useState<DropdownPos | null>(null);
  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Set portal container lazily — never access document during SSR
  useEffect(() => { setPortalEl(document.body); }, []);

  const selectedOption = options.find((o) => o.value === value);

  /** Compute dropdown position from the trigger button's bounding rect */
  const calcPos = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const viewportH = window.innerHeight;
    const DROPDOWN_MAX_H = 192; // max-h-48 = 12rem = 192px
    const GAP = 4;

    const spaceBelow = viewportH - rect.bottom - GAP;
    const spaceAbove = rect.top - GAP;
    const openUpward = spaceBelow < Math.min(DROPDOWN_MAX_H, options.length * 36) && spaceAbove > spaceBelow;

    setPos({
      top: openUpward ? rect.top + window.scrollY - GAP : rect.bottom + window.scrollY + GAP,
      left: rect.left + window.scrollX,
      width: rect.width,
      openUpward,
      maxHeight: openUpward ? Math.min(DROPDOWN_MAX_H, spaceAbove) : Math.min(DROPDOWN_MAX_H, spaceBelow),
    });
  }, [options.length]);

  const openDropdown = () => {
    calcPos();
    setIsOpen(true);
  };

  const closeDropdown = () => setIsOpen(false);

  /** Reposition while scrolling / resizing */
  useEffect(() => {
    if (!isOpen) return;
    const handleScroll = () => calcPos();
    const handleResize = () => calcPos();
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [isOpen, calcPos]);

  const dropdown =
    isOpen && pos && portalEl
      ? createPortal(
          <>
            {/* Invisible backdrop to close on outside click */}
            <div className="fixed inset-0 z-[9998]" onClick={closeDropdown} />

            <div
              className={cn(
                'fixed z-[9999] rounded-xl border shadow-2xl overflow-y-auto py-1 animate-fade-in',
                'bg-white dark:bg-slate-900',
                'border-slate-200 dark:border-white/10',
                'text-slate-800 dark:text-slate-100',
              )}
              style={{
                top: pos.openUpward ? undefined : pos.top,
                bottom: pos.openUpward ? window.innerHeight - pos.top + window.scrollY : undefined,
                left: pos.left,
                width: pos.width,
                maxHeight: pos.maxHeight,
                scrollbarWidth: 'thin',
                scrollbarColor: 'rgba(16,191,201,0.35) transparent',
              }}
            >
              {options.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    closeDropdown();
                  }}
                  className={cn(
                    'w-full px-3 py-2 text-left text-xs transition-colors flex items-center justify-between gap-2',
                    'hover:bg-slate-100 dark:hover:bg-white/5',
                    opt.value === value
                      ? 'text-cyan font-bold bg-cyan/[0.04] dark:bg-cyan/[0.08]'
                      : 'text-slate-700 dark:text-slate-200',
                  )}
                >
                  <span className="truncate">{opt.label}</span>
                  {opt.value === value && <Check className="w-3 h-3 shrink-0 text-cyan" />}
                </button>
              ))}
            </div>
          </>,
          portalEl,
        )
      : null;

  return (
    <>
      <div className={cn('relative w-full', className)}>
        <button
          ref={triggerRef}
          type="button"
          disabled={disabled}
          onClick={disabled ? undefined : (isOpen ? closeDropdown : openDropdown)}
          className="ev-input w-full h-full min-h-[32px] px-3 text-xs flex items-center justify-between text-left focus:border-cyan transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <span className="truncate text-text-main">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <ChevronDown
            className={cn(
              'w-3.5 h-3.5 text-text-muted shrink-0 transition-transform duration-200',
              isOpen && 'rotate-180',
            )}
          />
        </button>
      </div>

      {dropdown}
    </>
  );
}
