import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import { addMonths, startOfMonth } from 'date-fns';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  components: userComponents = {},
  enableSwipeNavigation = false,
  month,
  defaultMonth,
  onMonthChange,
  ...props
}) {
  const [internalMonth, setInternalMonth] = React.useState(
    startOfMonth(month ?? defaultMonth ?? new Date())
  );
  const touchStartXRef = React.useRef(null);

  React.useEffect(() => {
    if (month) {
      setInternalMonth(startOfMonth(month));
      return;
    }

    if (defaultMonth) {
      setInternalMonth(startOfMonth(defaultMonth));
    }
  }, [month, defaultMonth]);

  const visibleMonth = month ?? internalMonth;

  const handleMonthChange = (nextMonth) => {
    if (!month) {
      setInternalMonth(startOfMonth(nextMonth));
    }
    onMonthChange?.(nextMonth);
  };

  const handleTouchStart = (event) => {
    if (!enableSwipeNavigation) return;
    touchStartXRef.current = event.changedTouches?.[0]?.clientX ?? null;
  };

  const handleTouchEnd = (event) => {
    if (!enableSwipeNavigation || touchStartXRef.current === null) return;
    const endX = event.changedTouches?.[0]?.clientX;
    if (typeof endX !== 'number') return;

    const deltaX = endX - touchStartXRef.current;
    touchStartXRef.current = null;

    if (Math.abs(deltaX) < 50) return;

    const nextMonth = addMonths(visibleMonth, deltaX < 0 ? 1 : -1);
    handleMonthChange(nextMonth);
  };

  return (
     <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <DayPicker
        showOutsideDays={showOutsideDays}
        className={cn('p-3', className)}
        month={visibleMonth}
        onMonthChange={handleMonthChange}
        classNames={{
          months:
            'flex flex-col items-center sm:flex-row sm:items-center sm:justify-center space-y-4 sm:space-x-4 sm:space-y-0',
          month: 'space-y-4',
          caption: 'flex justify-center pt-1 relative items-center',
          caption_label: 'text-sm font-medium',
          nav: 'space-x-1 flex items-center',
          nav_button: cn(
            buttonVariants({ variant: 'outline' }),
            'h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100'
          ),
          nav_button_previous: 'absolute left-1',
          nav_button_next: 'absolute right-1',
          table: 'w-full border-collapse space-y-1',
          head_row: 'flex',
          head_cell:
            'text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]',
          row: 'flex w-full mt-2',
          cell: 'h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected])]:bg-transparent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20',
          day: cn(
            buttonVariants({ variant: 'ghost' }),
            'h-9 w-9 p-0 font-normal text-slate-700 aria-selected:opacity-100'
          ),
          day_selected:
            'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground',
          day_today: 'bg-pink-200 text-pink-800',
          day_outside: 'text-muted-foreground opacity-50',
          day_disabled: 'text-muted-foreground opacity-50',
          day_range_middle:
            'aria-selected:bg-accent aria-selected:text-accent-foreground',
          day_hidden: 'invisible',
          ...classNames,
        }}
        components={{
          IconLeft: ({ ...props }) => <ChevronLeft className="h-4 w-4" />,
          IconRight: ({ ...props }) => <ChevronRight className="h-4 w-4" />,
          ...userComponents,
        }}
        {...props}
      />
    </div>
  );
}
Calendar.displayName = 'Calendar';

export { Calendar };