import React, { useState, useLayoutEffect } from 'react';
import FertilityChart from '@/components/FertilityChart';
import { useCycleData } from '@/hooks/useCycleData';
import { differenceInDays, parseISO, startOfDay } from 'date-fns';
import generatePlaceholders from '@/lib/generatePlaceholders';
import { RotateCcw } from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';

const ChartPage = () => {
  const { currentCycle, isLoading } = useCycleData();
  // Orientación controlada por UI, independiente del dispositivo
  const [orientation, setOrientation] = useState(
    typeof window !== 'undefined' && window.innerWidth > window.innerHeight ? 'landscape' : 'portrait'
  );
  const [isFullScreen, setIsFullScreen] = useState(false);
  useLayoutEffect(() => {
    window.dispatchEvent(new Event('resize'));
  }, [orientation, isFullScreen]);
  if (isLoading) {
    return <p className="text-center text-gray-500">Cargando…</p>;
  }

  if (!currentCycle?.id) {
    return <p className="text-center text-pink-600">No hay ciclo activo.</p>;
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
  const baseStyle = {
    background: 'linear-gradient(135deg, #FFFAFC 0%, #f7eaef 100%)'
  };
  const containerStyle = isFullScreen
    ? baseStyle
    : {
        ...baseStyle,
        height:
          orientation === 'landscape'
            ? 'calc(min(100dvh, 100dvw) - var(--bottom-nav-safe))'
            : 'calc(100dvh - var(--bottom-nav-safe))',
        maxHeight: '100vh',
        paddingBottom: 'env(safe-area-inset-bottom)'
      };

    const handleToggleFullScreen = async () => {
    if (!isFullScreen) {
      try {
        await document.documentElement.requestFullscreen();
        await screen.orientation.lock('landscape');
        setOrientation('landscape');
        setIsFullScreen(true);
      } catch (err) {
        console.error(err);
      }
    } else {
      try {
        await screen.orientation.unlock();
      } catch (err) {
        console.error(err);
      }
      try {
        if (document.fullscreenElement) {
          await document.exitFullscreen();
        }
      } catch (err) {
        console.error(err);
      }
      setOrientation('portrait');
      setIsFullScreen(false);
    }
  };

  return (
    <MainLayout hideBottomNav={isFullScreen}>
      <div
        className={
          isFullScreen
            ? 'fixed inset-0 z-50 h-[100dvh] w-[100dvw] overflow-x-auto overflow-y-auto'
            : 'relative w-full overflow-x-auto overflow-y-auto'
        }
        style={containerStyle}
      >
        <button
          onClick={handleToggleFullScreen}
          className="absolute top-4 right-4 z-10 bg-white/80 hover:bg-white text-gray-700 p-2 rounded-full shadow"
          aria-label={isFullScreen ? 'Salir de pantalla completa' : 'Rotar gráfico'}
        >
          <RotateCcw className="w-5 h-5" />
        </button>
        <FertilityChart
          data={mergedData}
          isFullScreen={isFullScreen}
          orientation={orientation}
          cycleId={currentCycle.id}
          initialScrollIndex={scrollStart}
          visibleDays={visibleDays}
          reduceMotion={true}
          forceLandscape={orientation === 'landscape'}
        />
      </div>
    </MainLayout>
  );
};

export default ChartPage;
