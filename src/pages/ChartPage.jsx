import React, { useEffect, useState } from 'react';
import FertilityChart from '@/components/FertilityChart';
import { useCycleData } from '@/hooks/useCycleData';
import { differenceInDays, parseISO, startOfDay } from 'date-fns';
import generatePlaceholders from '@/lib/generatePlaceholders';
import { RotateCcw } from 'lucide-react';

const ChartPage = () => {
  const { currentCycle } = useCycleData();
  // Orientación controlada por UI, independiente del dispositivo
  const [orientation, setOrientation] = useState(
    typeof window !== 'undefined' && window.innerWidth > window.innerHeight ? 'landscape' : 'portrait'
  );

  if (!currentCycle?.id) {
    return <p className="text-center text-gray-500">No hay ciclo activo.</p>;
  }

  const CYCLE_DURATION_DAYS = 28;
  const VISIBLE_DAYS_FULLSCREEN_PORTRAIT = 10;

  const cycleStartDate = parseISO(currentCycle.startDate);

  const lastRecordDate = currentCycle.data.reduce((maxDate, record) => {
    const recDate = parseISO(record.isoDate);
    return recDate > maxDate ? recDate : maxDate;
  }, cycleStartDate);

  const today = startOfDay(new Date());
  const lastRelevantDate = lastRecordDate > today ? lastRecordDate : today;
  const daysSinceStart = differenceInDays(startOfDay(lastRelevantDate), cycleStartDate);
  const daysInCycle = Math.max(CYCLE_DURATION_DAYS, daysSinceStart + 1);

  const fullCyclePlaceholders = generatePlaceholders(cycleStartDate, daysInCycle);
  const mergedData = fullCyclePlaceholders.map((placeholder) => {
    const existingRecord = currentCycle.data.find((d) => d.isoDate === placeholder.isoDate);
    return existingRecord ? { ...existingRecord, date: placeholder.date } : placeholder;
  });

  const visibleDays = orientation === 'portrait' ? VISIBLE_DAYS_FULLSCREEN_PORTRAIT : daysInCycle;
  let scrollStart = 0;

  if (orientation !== 'landscape') {
    const daysSinceCycleStart = differenceInDays(new Date(), startOfDay(cycleStartDate));
    const currentDayIndex = Math.min(Math.max(daysSinceCycleStart, 0), daysInCycle - 1);
    let endIndex = Math.min(daysInCycle, currentDayIndex + 1);
    if (currentDayIndex < visibleDays - 1) {
      endIndex = Math.min(daysInCycle, visibleDays);
    }
    scrollStart = Math.max(0, endIndex - visibleDays);
  }

  return (
    <div 
    className="relative w-full overflow-hidden"
    style={{ height: 'calc(100dvh - 4rem)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <button
        onClick={() => setOrientation(orientation === 'portrait' ? 'landscape' : 'portrait')}
        className="absolute top-4 right-4 z-10 bg-white/80 hover:bg-white text-gray-700 p-2 rounded-full shadow"
        aria-label="Rotar gráfico"
      >
        <RotateCcw className="w-5 h-5" />
      </button>
      <FertilityChart
        data={mergedData}
        isFullScreen={true}
        orientation={orientation}
        cycleId={currentCycle.id}
        initialScrollIndex={scrollStart}
        visibleDays={visibleDays}
        reduceMotion={true}
        forceLandscape={orientation === 'landscape'}
      />
    </div>
  );
};

export default ChartPage;
