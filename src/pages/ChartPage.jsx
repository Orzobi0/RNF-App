import React, { useState, useLayoutEffect } from 'react';
import FertilityChart from '@/components/FertilityChart';
import { useCycleData } from '@/hooks/useCycleData';
import { differenceInDays, parseISO, startOfDay } from 'date-fns';
import generatePlaceholders from '@/lib/generatePlaceholders';
import { RotateCcw, Eye } from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';
import DataEntryForm from '@/components/DataEntryForm';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const ChartPage = () => {
const { currentCycle, isLoading, addOrUpdateDataPoint, toggleIgnoreRecord } = useCycleData();
  // Orientación controlada por UI, independiente del dispositivo
  const [orientation, setOrientation] = useState(
    typeof window !== 'undefined' && window.innerWidth > window.innerHeight ? 'landscape' : 'portrait'
  );
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showInterpretation, setShowInterpretation] = useState(false);
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

  const handleEdit = (record) => {
    setEditingRecord(record);
    setShowForm(true);
  };

  const handleToggleIgnore = (cId, recordId) => {
    toggleIgnoreRecord(cId, recordId);
  };

  const handleSave = async (data) => {
    setIsProcessing(true);
    try {
      await addOrUpdateDataPoint(data, editingRecord);
      setShowForm(false);
      setEditingRecord(null);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingRecord(null);
  };

  const handleDateSelect = (record) => {
    setEditingRecord(record);
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
        <Button
          onClick={() => setShowInterpretation(v => !v)}
          variant="ghost"
          size="icon"
          className={`absolute top-4 right-20 z-10 p-2 rounded-full transition-colors bg-white/80 hover:bg-[#E27DBF]/20 ${showInterpretation ? 'text-[#E27DBF]' : 'text-slate-700'}`}
        >
          <Eye className="h-4 w-4" />
        </Button>
        <Button
          onClick={handleToggleFullScreen}
          className="absolute top-4 right-4 z-10 bg-white/80 hover:bg-white text-gray-700 p-2 rounded-full shadow"
          aria-label={isFullScreen ? 'Salir de pantalla completa' : 'Rotar gráfico'}
        >
          <RotateCcw className="w-5 h-5" />
        </Button>
        <FertilityChart
          data={mergedData}
          isFullScreen={isFullScreen}
          orientation={orientation}
          onToggleIgnore={handleToggleIgnore}
          onEdit={handleEdit}
          cycleId={currentCycle.id}
          initialScrollIndex={scrollStart}
          visibleDays={visibleDays}
          showInterpretation={showInterpretation}
          reduceMotion={true}
          forceLandscape={orientation === 'landscape'}
        />
        <Dialog open={showForm} onOpenChange={(open) => { if (!open) handleCloseForm(); }}>
          <DialogContent
            hideClose
            className="bg-transparent border-none p-0 text-gray-800 w-[90vw] sm:w-auto max-w-md sm:max-w-lg md:max-w-xl max-h-[85vh] overflow-y-auto"
          >
            <DataEntryForm
              onSubmit={handleSave}
              onCancel={handleCloseForm}
              initialData={editingRecord}
              cycleStartDate={currentCycle.startDate}
              cycleEndDate={currentCycle.endDate}
              isProcessing={isProcessing}
              isEditing={!!editingRecord}
              cycleData={currentCycle.data}
              onDateSelect={handleDateSelect}
            />
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
};

export default ChartPage;
