'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown } from 'lucide-react';

type SelectOption = { value: string; label: string };

export function AppSelect({
  label, value, options, onChange, variant = 'field', align = 'start', className = '',
}: {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  variant?: 'heading' | 'field';
  align?: 'start' | 'end';
  className?: string;
}) {
  const id = useId();
  const rootRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);

  function select(index: number) {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'Tab') { setOpen(false); return; }
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex(!open ? selectedIndex : (activeIndex + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex(event.key === 'Home' ? 0 : options.length - 1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (open) select(activeIndex);
      else { setActiveIndex(selectedIndex); setOpen(true); }
    }
  }

  return (
    <span ref={rootRef} className={`relative inline-block min-w-0 ${className}`}>
      <button
        ref={triggerRef}
        aria-activedescendant={open ? `${id}-option-${activeIndex}` : undefined}
        aria-controls={`${id}-options`}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={label}
        className={`inline-flex min-h-10 w-full items-center justify-between gap-3 rounded-lg text-left transition focus:outline-none focus-visible:outline-2 focus-visible:outline-slate-500 ${variant === 'heading'
          ? 'bg-transparent py-1 text-base font-bold text-slate-900 hover:text-slate-700'
          : 'border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50'}`}
        onBlur={() => setOpen(false)}
        onClick={() => { setActiveIndex(selectedIndex); setOpen(!open); }}
        onKeyDown={handleKeyDown}
        role="combobox"
        style={{ fontFamily: 'inherit' }}
        type="button"
      >
        <span className="truncate">{options[selectedIndex]?.label}</span>
        <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? (
        <span
          id={`${id}-options`}
          aria-label={label}
          className={`absolute top-full z-40 mt-1.5 block max-h-60 w-max min-w-full max-w-[calc(100vw-3rem)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-[0_12px_30px_rgba(15,23,42,0.12)] ${align === 'end' ? 'right-0' : 'left-0'}`}
          role="listbox"
          style={{ fontFamily: 'inherit' }}
        >
          {options.map((option, index) => (
            <span
              id={`${id}-option-${index}`}
              key={option.value}
              aria-selected={option.value === value}
              className={`flex cursor-pointer items-center justify-between gap-6 rounded-lg px-3 py-2.5 text-sm font-medium ${option.value === value
                ? 'bg-[#EEF4FF] text-[#4F7EF7]'
                : activeIndex === index ? 'bg-slate-50 text-slate-900' : 'text-slate-600'}`}
              onClick={() => select(index)}
              onMouseMove={() => setActiveIndex(index)}
              onPointerDown={(event) => event.preventDefault()}
              role="option"
            >
              <span className="truncate">{option.label}</span>
              <Check aria-hidden="true" className={`h-4 w-4 shrink-0 ${option.value === value ? '' : 'invisible'}`} />
            </span>
          ))}
        </span>
      ) : null}
    </span>
  );
}
