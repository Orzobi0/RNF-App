import React from 'react';
import { cn } from '@/lib/utils';

const PeakBadge = ({ peakStatus, isPeakDay, size = 'default', className = '' }) => {
  let label = null;
  let title = '';
  let colorClasses = 'border border-slate-200 bg-slate-100 text-slate-500';

  if (isPeakDay || peakStatus === 'P') {
    label = '✖';
    title = 'Día pico';
    colorClasses = 'border border-rose-200 bg-rose-100 text-rose-600';
  } else if (peakStatus === '1') {
    label = '+1';
    title = 'Post día pico +1';
    colorClasses = 'border border-rose-200 bg-rose-50 text-rose-500';
  } else if (peakStatus === '2') {
    label = '+2';
    title = 'Post día pico +2';
    colorClasses = 'border border-rose-200 bg-rose-50 text-rose-500';
  } else if (peakStatus === '3') {
    label = '+3';
    title = 'Post día pico +3';
    colorClasses = 'border border-rose-200 bg-rose-50 text-rose-500';
  }

  if (!label) {
    return null;
  }

  const sizeClasses =
    size === 'small'
      ? 'h-5 w-5 text-[0.6rem]'
      : size === 'large'
        ? 'h-8 w-8 text-sm'
        : 'h-6 w-6 text-xs';

  return (
    <span
      role="img"
      aria-label={title}
      title={title}
      className={cn(
        'flex items-center justify-center rounded-full font-semibold shadow-sm shadow-rose-200/40 transition-transform duration-200',
        sizeClasses,
        colorClasses,
        className
      )}
    >
      {label}
    </span>
  );
};

export default PeakBadge;