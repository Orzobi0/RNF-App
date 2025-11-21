import React, { forwardRef } from 'react';
import { X, RefreshCw, MinusCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const sizeClassMap = {
  sm: {
    container: 'h-10 w-10 text-[10px]',
    label: 'text-[10px] leading-tight',
  },
  md: {
    container: 'h-11 w-11 text-[11px]',
    label: 'text-[11px] leading-tight',
  },
};

const toneClassMap = {
  assign:
    'bg-pink-500 text-white border border-pink-600 shadow-[0_8px_18px_-6px_rgba(244,63,94,0.45)] hover:bg-pink-600 hover:shadow-[0_12px_24px_-8px_rgba(244,63,94,0.55)] focus-visible:ring-pink-300',
  update:
    'bg-slate-100 text-indigo-700 border border-indigo-400 shadow-[0_8px_18px_-6px_rgba(99,102,241,0.28)] hover:bg-indigo-50 hover:shadow-[0_12px_24px_-8px_rgba(99,102,241,0.35)] focus-visible:ring-indigo-300 ring-offset-1 ring-offset-white',
  remove:
    'bg-white text-pink-700 border border-pink-400 shadow-[0_8px_18px_-6px_rgba(244,63,94,0.28)] hover:bg-pink-50 hover:shadow-[0_12px_24px_-8px_rgba(244,63,94,0.35)] focus-visible:ring-pink-300',
};

const iconMap = {
  assign: X,
  update: RefreshCw,
  remove: MinusCircle,
};

const baseClasses =
  'inline-flex flex-col items-center justify-center gap-0.5 rounded-full font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-0 active:scale-95 disabled:cursor-not-allowed disabled:opacity-70';

const labelBaseClasses = 'font-semibold tracking-tight text-current';

const PeakModeButton = forwardRef(
  (
    {
      mode = 'assign',
      size = 'md',
      icon: IconProp,
      label = 'Pico',
      className,
      pending = false,
      disabled,
      children,
      ...props
    },
    ref,
  ) => {
    const toneClasses = toneClassMap[mode] ?? toneClassMap.assign;
    const sizeConfig = sizeClassMap[size] ?? sizeClassMap.md;
    const IconComponent = IconProp ?? iconMap[mode] ?? X;
    const isDisabled = disabled || pending;

    return (
      <button
        ref={ref}
        type="button"
        disabled={isDisabled}
        className={cn(
          baseClasses,
          sizeConfig.container,
          toneClasses,
          'ring-offset-transparent',
          className,
        )}
        {...props}
      >
        <IconComponent className="h-4 w-4 text-current" aria-hidden="true" />
        <span className={cn(labelBaseClasses, sizeConfig.label)}>{label}</span>
        {children}
      </button>
    );
  },
);

PeakModeButton.displayName = 'PeakModeButton';

export { PeakModeButton };