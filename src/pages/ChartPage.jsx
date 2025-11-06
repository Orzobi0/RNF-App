import React, { useState, useLayoutEffect, useRef, useEffect, useMemo } from 'react';
import FertilityChart from '@/components/FertilityChart';
import { useCycleData } from '@/hooks/useCycleData';
import { differenceInDays, format, parseISO, startOfDay } from 'date-fns';
import generatePlaceholders from '@/lib/generatePlaceholders';
import { RotateCcw, Eye, EyeOff, ArrowLeft, Settings } from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';
import DataEntryForm from '@/components/DataEntryForm';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useParams, Link } from 'react-router-dom';

const CHART_SETTINGS_STORAGE_KEY = 'fertility-chart-settings';
const DEFAULT_CHART_SETTINGS = { showRelationsRow: false };

const ChartPage = () => {
  const { cycleId } = useParams();
  const {
    currentCycle,
    archivedCycles,
    isLoading,
    addOrUpdateDataPoint,
    toggleIgnoreRecord,
    getCycleById
  } = useCycleData();

  const [fetchedCycle, setFetchedCycle] = useState(null);
  const [externalLoading, setExternalLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const isViewingCurrentCycle = !cycleId || cycleId === currentCycle.id;
  const archivedMatch = !isViewingCurrentCycle
    ? archivedCycles.find((cycle) => cycle.id === cycleId)
    : null;

  useEffect(() => {
    if (isViewingCurrentCycle) {
      setFetchedCycle(null);
      setExternalLoading(false);
      setNotFound(false);
      return;
    }

    if (archivedMatch) {
      setFetchedCycle(null);
      setExternalLoading(false);
      setNotFound(false);
      return;
    }

    let isMounted = true;
    setExternalLoading(true);
    getCycleById(cycleId)
      .then((cycle) => {
        if (!isMounted) return;
        if (cycle) {
          setFetchedCycle(cycle);
          setNotFound(false);
        } else {
          setFetchedCycle(null);
          setNotFound(true);
        }
      })
      .catch(() => {
        if (!isMounted) return;
        setFetchedCycle(null);
        setNotFound(true);
      })
      .finally(() => {
        if (isMounted) {
          setExternalLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isViewingCurrentCycle, archivedMatch, getCycleById, cycleId]);

  const targetCycle = isViewingCurrentCycle ? currentCycle : archivedMatch || fetchedCycle;
  const isUsingFallbackCycle = !isViewingCurrentCycle && !archivedMatch;
  const showBackToCycleRecords = !isViewingCurrentCycle && targetCycle?.id;
  const showLoading = isViewingCurrentCycle
    ? isLoading && !currentCycle?.id
    : externalLoading || (isLoading && !archivedMatch && !fetchedCycle);
  // Orientación controlada por UI, independiente del dispositivo
  const [orientation, setOrientation] = useState(
    typeof window !== 'undefined' && window.innerWidth > window.innerHeight ? 'landscape' : 'portrait'
  );
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showInterpretation, setShowInterpretation] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chartSettings, setChartSettings] = useState(() => {
    if (typeof window === 'undefined') {
      return DEFAULT_CHART_SETTINGS;
    }
    try {
      const stored = window.localStorage.getItem(CHART_SETTINGS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return { ...DEFAULT_CHART_SETTINGS, ...parsed };
      }
    } catch (error) {
      console.warn('No se pudieron cargar los ajustes del gráfico.', error);
    }
    return DEFAULT_CHART_SETTINGS;
  });

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      window.localStorage.setItem(
        CHART_SETTINGS_STORAGE_KEY,
        JSON.stringify(chartSettings)
      );
    } catch (error) {
      console.warn('No se pudieron guardar los ajustes del gráfico.', error);
    }
  }, [chartSettings]);

  const ignoreNextClickRef = useRef(false);
  const isPlaceholderRecord = Boolean(
    editingRecord && String(editingRecord.id || '').startsWith('placeholder-')
  );
  
  useEffect(() => {
    const handleFullScreenChange = async () => {
      const isCurrentlyFullScreen = Boolean(
        document.fullscreenElement ||
          document.webkitFullscreenElement ||
          document.mozFullScreenElement ||
          document.msFullscreenElement
      );

      setIsFullScreen(isCurrentlyFullScreen);

      if (!isCurrentlyFullScreen) {
        try {
          const screenOrientation =
            typeof window !== 'undefined' ? window.screen?.orientation : null;
          await screenOrientation?.unlock?.();
        } catch (error) {
          // ignored
        }
        setOrientation('portrait');
      }
    };

    document.addEventListener('fullscreenchange', handleFullScreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullScreenChange);
    document.addEventListener('mozfullscreenchange', handleFullScreenChange);
    document.addEventListener('MSFullscreenChange', handleFullScreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullScreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullScreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullScreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullScreenChange);
    };
  }, []);

  useLayoutEffect(() => {
    window.dispatchEvent(new Event('resize'));
  }, [orientation, isFullScreen]);
  if (showLoading) {
    return (
      <MainLayout>
        <div className="flex h-full flex-col items-center justify-center space-y-4 bg-gradient-to-br from-rose-100 via-pink-100 to-rose-100 px-4 py-8 text-center text-pink-600">
          <p>Cargando…</p>
        </div>
      </MainLayout>
    );
  }

  if (!targetCycle?.id) {
    if (cycleId && notFound) {
      return (
        <MainLayout>
          <div className="flex h-full flex-col items-center justify-center space-y-4 px-4 py-8 text-center text-pink-600">
            <p>No se encontró el ciclo solicitado.</p>
            <Button asChild className="bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow">
              <Link to="/archived-cycles">Volver a Mis Ciclos</Link>
            </Button>
          </div>
        </MainLayout>
      );
    }
    return (
      <MainLayout>
        <div className="flex h-full flex-col items-center justify-center space-y-4 px-4 py-8 text-center text-pink-600">
          <p>No hay ciclo activo.</p>
          <Button asChild className="bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow">
            <Link to="/records">Ir a Mis Registros</Link>
          </Button>
        </div>
      </MainLayout>
    );
  }

  const CYCLE_DURATION_DAYS = 28;
  const VISIBLE_DAYS_FULLSCREEN_PORTRAIT = 10;
  const VISIBLE_DAYS_FULLSCREEN_LANDSCAPE = 25;

  const cycleStartDate = parseISO(targetCycle.startDate);
  const cycleEntries = targetCycle.data || [];
  const currentPeakIsoDate = useMemo(() => {
    const peakRecord = Array.isArray(cycleEntries)
      ? cycleEntries.find((record) => record?.peak_marker === 'peak')
      : null;
    return peakRecord?.isoDate || null;
  }, [cycleEntries]);

  const lastRecordDate = cycleEntries.reduce((maxDate, record) => {
    const recDate = parseISO(record.isoDate);
    return recDate > maxDate ? recDate : maxDate;
  }, cycleStartDate);

  const today = startOfDay(new Date());
  const lastRelevantDate = lastRecordDate > today ? lastRecordDate : today;
  const daysSinceStart = differenceInDays(startOfDay(lastRelevantDate), cycleStartDate);
  const daysInCycle = Math.max(CYCLE_DURATION_DAYS, daysSinceStart + 1);

  const fullCyclePlaceholders = generatePlaceholders(cycleStartDate, daysInCycle);
  const mergedData = fullCyclePlaceholders.map((placeholder) => {
    const existingRecord = cycleEntries.find((d) => d.isoDate === placeholder.isoDate);
    return existingRecord ? { ...existingRecord, date: placeholder.date } : placeholder;
  });

  const visibleDays = isFullScreen
    ? (orientation === 'portrait'
        ? VISIBLE_DAYS_FULLSCREEN_PORTRAIT
        : VISIBLE_DAYS_FULLSCREEN_LANDSCAPE)
    : (orientation === 'portrait'
      ? VISIBLE_DAYS_FULLSCREEN_PORTRAIT
      : CYCLE_DURATION_DAYS);
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
    background: 'linear-gradient(to br, #fff1f2 0%, #fce7f3 50%, #ffe4e6 100%)'
  };
  const NAVBAR_SAFE_VAR = 'var(--bottom-nav-safe)';
  const containerStyle = isFullScreen
    ? {
        ...baseStyle,
        height: '100dvh',
        maxHeight: '100dvh',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)'
        }
    : {
        ...baseStyle,
        height: `calc(100dvh - ${NAVBAR_SAFE_VAR})`,
        maxHeight: `calc(100dvh - ${NAVBAR_SAFE_VAR})`,
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)'
      };

  const handleEdit = (record) => {
    setEditingRecord(record);
    setShowForm(true);
  };

  const handleToggleIgnore = async (cId, recordId) => {
    try {
      await toggleIgnoreRecord(cId, recordId);
      if (isUsingFallbackCycle) {
        const refreshed = await getCycleById(cId);
        if (refreshed) {
          setFetchedCycle(refreshed);
        }
      }
    } catch (error) {
      console.error('Error toggling ignore state:', error);
    }
  };
  const handleRelationsSettingChange = (checked) => {
    setChartSettings((prev) => ({
      ...prev,
      showRelationsRow: checked === true,
    }));
  };
  const handleTogglePeak = async (record, shouldMarkAsPeak = true) => {
    if (!targetCycle?.id || !record?.isoDate) {
      return;
    }

    const normalizeMeasurementValue = (value) => {
      if (value === null || value === undefined || value === '') {
        return null;
      }
      const parsed = parseFloat(String(value).replace(',', '.'));
      return Number.isFinite(parsed) ? parsed : null;
    };

    const markAsPeak = shouldMarkAsPeak ?? !(
      record.peak_marker === 'peak' || record.peakStatus === 'P'
    );

    setIsProcessing(true);
    try {
      const fallbackTime = record.timestamp
        ? format(parseISO(record.timestamp), 'HH:mm')
        : format(new Date(), 'HH:mm');

      let measurementsSource = Array.isArray(record.measurements) && record.measurements.length > 0
        ? record.measurements
        : [
            {
              temperature: record.temperature_chart ?? record.temperature_raw ?? null,
              temperature_corrected: record.temperature_corrected ?? null,
              time: fallbackTime,
              time_corrected: record.time_corrected ?? fallbackTime,
              selected: true,
              use_corrected: record.use_corrected ?? false,
            },
          ];

      if (measurementsSource.length === 0) {
        measurementsSource = [
          {
            temperature: null,
            temperature_corrected: null,
            time: fallbackTime,
            time_corrected: fallbackTime,
            selected: true,
            use_corrected: false,
          },
        ];
      }

      const normalizedMeasurements = measurementsSource.map((measurement, index) => {
        const timeValue = measurement.time || fallbackTime;
        const correctedTime = measurement.time_corrected || timeValue;

        return {
          temperature: normalizeMeasurementValue(
            measurement.temperature ?? measurement.temperature_raw
          ),
          time: timeValue,
          selected: index === 0 ? true : !!measurement.selected,
          temperature_corrected: normalizeMeasurementValue(
            measurement.temperature_corrected
          ),
          time_corrected: correctedTime,
          use_corrected: !!measurement.use_corrected,
        };
      });

      if (!normalizedMeasurements.some((measurement) => measurement.selected)) {
        normalizedMeasurements[0].selected = true;
      }

      const payload = {
        isoDate: record.isoDate,
        measurements: normalizedMeasurements,
        mucusSensation: record.mucus_sensation ?? record.mucusSensation ?? '',
        mucusAppearance: record.mucus_appearance ?? record.mucusAppearance ?? '',
        fertility_symbol: record.fertility_symbol ?? 'none',
        observations: record.observations ?? '',
        had_relations: record.had_relations ?? record.hadRelations ?? false,
        ignored: record.ignored ?? false,
        peak_marker: markAsPeak ? 'peak' : null,
      };

      const existingRecord =
        record?.id && !String(record.id).startsWith('placeholder-') ? record : null;

      await addOrUpdateDataPoint(payload, existingRecord, targetCycle.id);
    } catch (error) {
      console.error('Error toggling peak marker:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSave = async (data, { keepFormOpen = false } = {}) => {
    if (!targetCycle?.id) return;
    setIsProcessing(true);
    try {
      await addOrUpdateDataPoint(data, editingRecord, targetCycle.id);
      if (isUsingFallbackCycle) {
        const refreshed = await getCycleById(targetCycle.id);
        if (refreshed) {
          setFetchedCycle(refreshed);
        }
      }
      if (!keepFormOpen) {
        setShowForm(false);
        setEditingRecord(null);
      }
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
  const toggleInterpretation = () => {
    setShowInterpretation((v) => !v);
  };
  const handleInterpretationClick = (event) => {
    event.preventDefault();
    if (ignoreNextClickRef.current) {
      ignoreNextClickRef.current = false;
      return;
    }
    toggleInterpretation();
  };

  const handleInterpretationPointerUp = (event) => {
    if (event.pointerType === 'touch') {
      event.preventDefault();
      ignoreNextClickRef.current = true;
      toggleInterpretation();
    }
  };


  const handleToggleFullScreen = async () => {
    const rootElement = document.documentElement;
    const screenOrientation =
      typeof window !== 'undefined' ? window.screen?.orientation : null;

    if (!isFullScreen) {
      let enteredFullScreen = false;
      let hasRequestFullScreen = false;

      try {
        const requestFullScreen =
          rootElement.requestFullscreen ||
          rootElement.webkitRequestFullscreen ||
          rootElement.mozRequestFullScreen ||
          rootElement.msRequestFullscreen;

        hasRequestFullScreen = Boolean(requestFullScreen);

        if (requestFullScreen) {
          await requestFullScreen.call(rootElement);
          enteredFullScreen = true;
        }
      } catch (err) {
        console.error(err);
      }
      if (screenOrientation?.lock) {
        try {
          await screenOrientation.lock('landscape');
        } catch (err) {
          console.error(err);
        }
      }

      setOrientation('landscape');
      setIsFullScreen(enteredFullScreen || !hasRequestFullScreen);
      
    } else {
      if (screenOrientation?.unlock) {
        try {
          await screenOrientation.unlock();
        } catch (err) {
          console.error(err);
        }
      }
      try {
        const exitFullScreen =
          document.exitFullscreen ||
          document.webkitExitFullscreen ||
          document.mozCancelFullScreen ||
          document.msExitFullscreen;

        const isAnyElementFullScreen =
          document.fullscreenElement ||
          document.webkitFullscreenElement ||
          document.mozFullScreenElement ||
          document.msFullscreenElement;

        if (exitFullScreen && isAnyElementFullScreen) {
          await exitFullScreen.call(document);
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
            ? 'fixed inset-0 z-50 h-[100dvh] w-[100dvw] overflow-y-auto overflow-x-hidden'
            : 'relative w-full h-full overflow-y-auto overflow-x-hidden'}
        style={containerStyle}
      >
        {showBackToCycleRecords && !isFullScreen && (
          <Button
            asChild
            variant="ghost"
            className="absolute top-4 left-4 z-10 bg-white/80 text-slate-700 hover:bg-[#E27DBF]/20"
          >
            <Link to={`/cycle/${targetCycle.id}`} className="flex items-center gap-1">
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline"></span>
            </Link>
          </Button>
        )}
        <Button
          onClick={() => setSettingsOpen((prev) => !prev)}
          variant="ghost"
          size="icon"
          className="absolute top-4 right-36 z-10 p-2 rounded-full bg-white/80 shadow-lg shadow-slate-300/50 text-slate-700 hover:bg-[#E27DBF]/20"
          aria-label="Ajustes del gráfico"
        >
          <Settings className="h-4 w-4" />
        </Button>
        <Button
          onClick={handleInterpretationClick}
          onPointerUp={handleInterpretationPointerUp}
          variant="ghost"
          size="icon"
          className={`absolute top-4 right-20 z-10 p-2 rounded-full transition-colors ${showInterpretation 
            ? 'bg-gradient-to-br from-pink-500 to-rose-500 text-white shadow-lg shadow-pink-300/50 border-pink-400' 
            : 'bg-white/80 text-slate-600 hover:bg-pink-50/80 shadow-md border-pink-200/50'}`}
        >
          {showInterpretation ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
        <Button
          onClick={handleToggleFullScreen}
          className="absolute top-4 right-4 z-10 bg-white/80 rounded-full text-slate-600 hover:bg-pink-50/80 shadow-md border border-pink-200/50 backdrop-blur-sm"
          aria-label={isFullScreen ? 'Salir de pantalla completa' : 'Rotar gráfico'}
        >
          <RotateCcw className="w-4 h-4" />
        </Button>
        <FertilityChart
          data={mergedData}
          isFullScreen={isFullScreen}
          orientation={orientation}
          onToggleIgnore={handleToggleIgnore}
          onEdit={handleEdit}
          onTogglePeak={handleTogglePeak}
          cycleId={targetCycle.id}
          initialScrollIndex={scrollStart}
          visibleDays={visibleDays}
          showInterpretation={showInterpretation}
          reduceMotion={true}
          forceLandscape={orientation === 'landscape'}
          currentPeakIsoDate={currentPeakIsoDate}
          showRelationsRow={chartSettings.showRelationsRow}
        />
        
        {/* Backdrop */}
        {settingsOpen && (
            <div className="fixed inset-0 z-40 bg-black/30"
            onClick={() => setSettingsOpen(false)}
            aria-hidden="true"
            />
            )}
            {/* Drawer fijo */}
            <div className={`fixed top-0 right-0 z-50 h-dvh w-72 sm:w-80 transform transition-transform duration-300 ease-in-out ${
              settingsOpen ? 'translate-x-0' : 'translate-x-full'
            }`}
            role="dialog"
            aria-modal="true"
            >
            <div className="flex h-full flex-col gap-6 border-l border-rose-100/60 bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-700">Ajustes del gráfico</h2>
                <p className="text-sm text-slate-500">
                  Personaliza la visualización de filas adicionales en la gráfica.
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-slate-400 hover:text-slate-600"
                onClick={() => setSettingsOpen(false)}
                aria-label="Cerrar ajustes del gráfico"
              >
                ×
              </Button>
            </div>
            <div className="space-y-4 overflow-y-auto">
              <div className="flex items-start justify-between gap-3 p-3">
                <div className="max-w-xs">
                  <Label htmlFor="toggle-relations-row" className="text-sm font-semibold text-slate-700">
                    Mostrar fila de Relaciones (RS)
                  </Label>                  
                </div>
                <Checkbox
                  id="toggle-relations-row"
                  checked={chartSettings.showRelationsRow}
                  onCheckedChange={handleRelationsSettingChange}
                  className="mt-1"
                />
              </div>
            </div> 
            </div>
        </div>
        <Dialog open={showForm} onOpenChange={(open) => { if (!open) handleCloseForm(); }}>
          <DialogContent
            hideClose
            className="bg-transparent border-none p-0 text-gray-800 w-[90vw] sm:w-auto max-w-md sm:max-w-lg md:max-w-xl max-h-[85vh] overflow-y-auto"
          >
            <DataEntryForm
              onSubmit={handleSave}
              onCancel={handleCloseForm}
              initialData={editingRecord}
              cycleStartDate={targetCycle.startDate}
              cycleEndDate={targetCycle.endDate}
              isProcessing={isProcessing}
              isEditing={!!editingRecord && !isPlaceholderRecord}
              cycleData={targetCycle.data}
              onDateSelect={handleDateSelect}
            />
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
};

export default ChartPage;
