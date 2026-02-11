import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Thermometer,
  Droplets,
  Eye,
  EyeOff,
  CalendarDays,
  Sprout,
  Clock,
  Check,
  X,
  ChevronUp,
  ChevronDown,
  Circle,
  Plus,
  Heart,
  Edit3,
  RefreshCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { PeakModeButton } from '@/components/ui/peak-mode-button';
import { format, startOfDay, parseISO, addHours, parse } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  FERTILITY_SYMBOL_OPTIONS,
  getFertilitySymbolDockStyles,
  getFertilitySymbolTheme,
} from '@/config/fertilitySymbols';
import { AnimatePresence, motion } from 'framer-motion';
import {
  computePeakState,
  getToggleFeedback,
  SECTION_METADATA,
} from '@/components/dataEntryForm/sectionLogic';
const VIEW_ALL_STORAGE_KEY_PREFIX = 'dataEntryForm:viewAll:';
const DEFAULT_SECTION_STORAGE_KEY = '__default__';
const RADIUS = { field: 'rounded-3xl', dropdown: 'rounded-3xl' };
const isRecordsDataModelV1 = import.meta.env.VITE_DATA_MODEL === 'records_v1';
const DataEntryFormFields = ({
  date,
  setDate,
  measurements,
  addMeasurement,
  updateMeasurement,
  removeMeasurement,
  confirmMeasurement,
  selectMeasurement,
  mucusSensation,
  setMucusSensation,
  mucusAppearance,
  setMucusAppearance,
  fertilitySymbol,
  setFertilitySymbol,
  observations,
  setObservations,
  hadRelations,
  setHadRelations,
  ignored,
  setIgnored,
  peakTag,
  setPeakTag,
  existingPeakIsoDate,
  isProcessing,
  isEditing,
  cycleStartDate,
  cycleEndDate,
  recordedDates = [],
  submitCurrentState,
  initialSectionKey = null,
  onSyncTemperature = () => {},
  isSyncingTemperature = false,
  canSyncTemperature = false,
}) => {
  const [open, setOpen] = useState(false);
  const [correctionIndex, setCorrectionIndex] = useState(null);
  const [statusMessages, setStatusMessages] = useState({ peak: null, relations: null });
  const initializedSectionsRef = useRef(false);

  const sectionOrder = useMemo(
    () => [
      { ...SECTION_METADATA.temperature, icon: Thermometer },
      { ...SECTION_METADATA.moco, icon: Droplets },
      { ...SECTION_METADATA.observations, icon: Edit3 },
    ],
    []
  );

  const dockItems = useMemo(
    () => [
      { ...SECTION_METADATA.temperature, sectionKey: 'temperature', icon: Thermometer },
      { ...SECTION_METADATA.sensation, sectionKey: 'moco', icon: Droplets },
      { ...SECTION_METADATA.appearance, sectionKey: 'moco', icon: Circle },
      { ...SECTION_METADATA.symbol, sectionKey: 'moco', icon: Sprout },
      { ...SECTION_METADATA.observations, sectionKey: 'observations', icon: Edit3 },
    ],
    []
  );

  const sectionKeys = useMemo(() => sectionOrder.map((section) => section.key), [sectionOrder]);

  const [isViewAll, setIsViewAll] = useState(false);
  const [activeSection, setActiveSection] = useState(() => sectionKeys[0] ?? null);
  const dockRef = useRef(null);
  const sectionsContainerRef = useRef(null);
  const pendingScrollTargetRef = useRef(null);
  const userCollapsedRef = useRef(false);
  const lastPointerWasTouchRef = useRef(false);
  const lastActivePerDateRef = useRef(new Map());
  const previousIsoDateRef = useRef(null);

  const openSectionKeys = useMemo(
    () => (isViewAll ? sectionKeys : activeSection ? [activeSection] : []),
    [isViewAll, sectionKeys, activeSection]
  );

  const cycleStart = cycleStartDate ? startOfDay(parseISO(cycleStartDate)) : null;
  const cycleEnd = cycleEndDate ? startOfDay(parseISO(cycleEndDate)) : null;
  const disabledDateRanges = isRecordsDataModelV1
    ? undefined
    : cycleStart
      ? cycleEnd
        ? [{ before: cycleStart }, { after: cycleEnd }]
        : [{ before: cycleStart }]
      : undefined;
  const selectedIsoDate = date ? format(date, 'yyyy-MM-dd') : null;
  const [dockOffset, setDockOffset] = useState(0);
  const appearanceInputRef = useRef(null);
  const symbolTriggerRef = useRef(null);

  const normalizeSectionKey = useCallback((key) => {
    if (['symbol', 'sensation', 'appearance'].includes(key)) {
      return 'moco';
    }

    return key;
  }, []);

  const handleSensationKeyDown = useCallback((event) => {
    if (event.key !== 'Enter') {
      return;
    }

    event.preventDefault();
    appearanceInputRef.current?.focus();
  }, []);

  const handleAppearanceKeyDown = useCallback((event) => {
    if (event.key !== 'Enter') {
      return;
    }

    event.preventDefault();
    symbolTriggerRef.current?.focus();
  }, []);

  const recomputeDockOffset = useCallback(() => {
    const dock = dockRef.current;
    if (!dock) return;
    const rect = dock.getBoundingClientRect();
    const computedTop = parseFloat(getComputedStyle(dock).top || '0');
    const safeTop = Number.isNaN(computedTop) ? 0 : computedTop;
    setDockOffset((rect?.height || 0) + safeTop + 12); // 12px de margen
  }, []);

 useEffect(() => {
   recomputeDockOffset();
   const ro = new ResizeObserver(() => recomputeDockOffset());
   if (dockRef.current) ro.observe(dockRef.current);
   const onResize = () => recomputeDockOffset();
   window.addEventListener('resize', onResize);
   window.addEventListener('orientationchange', onResize);
   return () => {
     ro.disconnect();
     window.removeEventListener('resize', onResize);
     window.removeEventListener('orientationchange', onResize);
   };
 }, [recomputeDockOffset]);

  const triggerHapticFeedback = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (window.navigator?.vibrate) {
      window.navigator.vibrate(10);
    }
  }, []);

  const registerActiveSection = useCallback(
    (key) => {
      const normalizedKey = normalizeSectionKey(key);
      if (!normalizedKey) {
        return;
      }

      userCollapsedRef.current = false;
      setActiveSection((current) => (current === normalizedKey ? current : normalizedKey));

      const storageKey = selectedIsoDate ?? DEFAULT_SECTION_STORAGE_KEY;
      lastActivePerDateRef.current.set(storageKey, normalizedKey);
    },
    [normalizeSectionKey, selectedIsoDate]
  );


  useEffect(() => {
    if (!sectionKeys.length) {
      if (activeSection !== null) {
        setActiveSection(null);
      }
      return;
    }

    if (activeSection && sectionKeys.includes(activeSection)) {
      return;
    }

    if (!isViewAll && userCollapsedRef.current) {
      if (activeSection !== null) {
        setActiveSection(null);
      }
      return;
    }

    const storageKey = selectedIsoDate ?? DEFAULT_SECTION_STORAGE_KEY;
    const storedSection = normalizeSectionKey(lastActivePerDateRef.current.get(storageKey));
    const fallbackSection =
      (storedSection && sectionKeys.includes(storedSection) && storedSection) || sectionKeys[0] || null;

    if (!fallbackSection) {
      if (activeSection !== null) {
        setActiveSection(null);
      }
      return;
    }
  
    registerActiveSection(fallbackSection);
  }, [
    activeSection,
    isViewAll,
    normalizeSectionKey,
    registerActiveSection,
    sectionKeys,
    selectedIsoDate,
  ]);

 const scrollToSectionStart = useCallback((sectionKey) => {
   if (typeof window === 'undefined' || !sectionKey) return;
   const container = sectionsContainerRef.current;
   if (!container) return;
   const node = container.querySelector(`[data-section="${sectionKey}"]`);
   if (!(node instanceof HTMLElement)) return;
   const run = () => node.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
   // doble rAF: garantiza layout estable en iOS antes de medir/scroll
   if ('requestAnimationFrame' in window) {
     requestAnimationFrame(() => requestAnimationFrame(run));
   } else {
     setTimeout(run, 50);
   }
 }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const target = pendingScrollTargetRef.current;
    if (!target) {
      return;
    }

    pendingScrollTargetRef.current = null;
    const timeoutId = window.setTimeout(() => {
      scrollToSectionStart(target);
    }, 80);

    return () => window.clearTimeout(timeoutId);
  }, [openSectionKeys, scrollToSectionStart]);

  const handleSectionToggle = useCallback(
    (key) => {
      const normalizedKey = normalizeSectionKey(key);
      if (!normalizedKey) return;

      triggerHapticFeedback();

 if (isViewAll) {
        pendingScrollTargetRef.current = normalizedKey;
        registerActiveSection(normalizedKey);
        scrollToSectionStart(normalizedKey);
   return;
 }
      
      setActiveSection((current) => {
        if (current === normalizedKey) {
          userCollapsedRef.current = true;
          pendingScrollTargetRef.current = null;
          return null;
        }

        userCollapsedRef.current = false;
        pendingScrollTargetRef.current = normalizedKey;
        const storageKey = selectedIsoDate ?? DEFAULT_SECTION_STORAGE_KEY;
        lastActivePerDateRef.current.set(storageKey, normalizedKey);
        return normalizedKey;
      });
    },
    [
      isViewAll,
      normalizeSectionKey,
      registerActiveSection,
      scrollToSectionStart,
      selectedIsoDate,
      triggerHapticFeedback,
    ]
  );
  // 🔹 Si el pointer es táctil, ejecutamos aquí y marcamos para ignorar el click sintetizado
  const handleSectionPointerDown = useCallback(
    (event, key) => {
      if (!key) return;
      if (event.pointerType === 'touch') {
        lastPointerWasTouchRef.current = true;
        handleSectionToggle(key);
      } else {
        lastPointerWasTouchRef.current = false;
      }
    },
    [handleSectionToggle]
  );

  // 🔹 En escritorio/ratón se usa click; en táctil lo ignoramos (ya lo hicimos en pointerdown)
  const handleSectionClick = useCallback(
    (key) => {
      if (!key) return;
      if (lastPointerWasTouchRef.current) {
        lastPointerWasTouchRef.current = false;
        return;
      }
      handleSectionToggle(key);
    },
    [handleSectionToggle]
  );
  const handleViewAllToggle = useCallback(() => {
    triggerHapticFeedback();

    const nextViewAll = !isViewAll;
    if (nextViewAll) {
      userCollapsedRef.current = false;
    }
    setIsViewAll(nextViewAll);

    const storageKey = selectedIsoDate ?? DEFAULT_SECTION_STORAGE_KEY;
    const storedActive = normalizeSectionKey(lastActivePerDateRef.current.get(storageKey));
    const defaultTarget = storedActive ?? activeSection ?? sectionKeys[0];

    if (nextViewAll) {
      pendingScrollTargetRef.current = defaultTarget;
      return;
    }

    const fallback = defaultTarget ?? sectionKeys[0];
    registerActiveSection(fallback);
    pendingScrollTargetRef.current = fallback;
  }, [
    activeSection,
    isViewAll,
    registerActiveSection,
    sectionKeys,
    selectedIsoDate,
    triggerHapticFeedback,
  ]);

  useEffect(() => {
    setStatusMessages({ peak: null, relations: null });
    initializedSectionsRef.current = false;
  
    userCollapsedRef.current = false;

    if (!sectionKeys.length) {
      setActiveSection((current) => (current === null ? current : null));
      return;
    }

    const storageKey = selectedIsoDate ?? DEFAULT_SECTION_STORAGE_KEY;
    const storedSection = normalizeSectionKey(lastActivePerDateRef.current.get(storageKey));
    const isStoredValid = storedSection && sectionKeys.includes(storedSection);

    const previousIsoDate = previousIsoDateRef.current;
    const dateChanged = previousIsoDate !== selectedIsoDate;
    previousIsoDateRef.current = selectedIsoDate;

    const normalizedInitialSectionKey = normalizeSectionKey(initialSectionKey);
    const hasInitialSection = Boolean(
      normalizedInitialSectionKey && sectionKeys.includes(normalizedInitialSectionKey)
    );
    const shouldPreferInitial =
      hasInitialSection && (dateChanged || normalizedInitialSectionKey !== storedSection);

    let fallbackSection = null;

    if (shouldPreferInitial) {
      fallbackSection = normalizedInitialSectionKey;
      initializedSectionsRef.current = true;
    } else if (isStoredValid) {
      fallbackSection = storedSection;
    } else {
      fallbackSection = sectionKeys[0];
    }

    if (!fallbackSection) {
      setActiveSection((current) => (current === null ? current : null));
      return;
    }

    lastActivePerDateRef.current.set(storageKey, fallbackSection);
    setActiveSection((current) => (current === fallbackSection ? current : fallbackSection));
    pendingScrollTargetRef.current = fallbackSection;
  }, [date, sectionKeys, selectedIsoDate, initialSectionKey, normalizeSectionKey]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (!selectedIsoDate) {
      setIsViewAll(false);
      return;
    }

    const storageKey = `${VIEW_ALL_STORAGE_KEY_PREFIX}${selectedIsoDate}`;

    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored === 'true') {
        setIsViewAll(true);
      } else if (stored === 'false') {
        setIsViewAll(false);
      } else {
        setIsViewAll(false);
      }
    } catch (error) {
      setIsViewAll(false);
    }
  }, [selectedIsoDate]);

  useEffect(() => {
    if (typeof window === 'undefined' || !selectedIsoDate) {
      return;
    }

    const storageKey = `${VIEW_ALL_STORAGE_KEY_PREFIX}${selectedIsoDate}`;

    try {
      window.localStorage.setItem(storageKey, isViewAll ? 'true' : 'false');
    } catch (error) {
      // ignore storage failures silently
    }
  }, [isViewAll, selectedIsoDate]);

  useEffect(() => {
    if (correctionIndex !== null) {
      return;
    }

    const existingCorrectionIndex = measurements.findIndex((measurement) => {
      if (!measurement) return false;

      return Boolean(measurement.use_corrected);
    });

    if (existingCorrectionIndex !== -1) {
      setCorrectionIndex(existingCorrectionIndex);
    }
  }, [correctionIndex, measurements]);

  const handleTempAdjust = (index, delta) => {
    const originalTemp = parseFloat(measurements[index].temperature ?? 0);
    const current = parseFloat(measurements[index].temperature_corrected ?? originalTemp);
    const newTemp = (current + delta).toFixed(2);
    updateMeasurement(index, 'temperature_corrected', newTemp);
    
    const tempDiff = parseFloat(newTemp) - originalTemp;
    const hoursOffset = Math.round(tempDiff * 10);
    const originalTime = measurements[index].time || '00:00';
    const parsedTime = parse(originalTime, 'HH:mm', new Date());
    const newTime = format(addHours(parsedTime, hoursOffset), 'HH:mm');
    updateMeasurement(index, 'time_corrected', newTime);
    
    if (!measurements[index].use_corrected) {
      updateMeasurement(index, 'use_corrected', true);
    }
  };
  
  const { mode: peakMode, isPeakDay } = computePeakState({
    peakTag,
    existingPeakIsoDate,
    selectedIsoDate,
  });

    // Etiqueta accesible dinámica con fechas precisas
    const peakAriaLabel = (() => {
      if (!selectedIsoDate || !date) return 'Selecciona una fecha para marcar el día pico';
      const selectedFull = format(date, 'dd/MM/yyyy');
      const existingFull = existingPeakIsoDate
        ? format(parseISO(existingPeakIsoDate), 'dd/MM/yyyy')
        : null;
      if (peakMode === 'assign') {
        return `Marcar día pico en ${selectedFull}`;
      }
      if (peakMode === 'update') {
        return existingFull
          ? `Mover día pico a ${selectedFull} (desde ${existingFull})`
          : `Mover día pico a ${selectedFull}`;
      }
      // remove
      return existingFull
        ? `Quitar día pico del ${existingFull}`
        : `Quitar día pico`;
    })();

  const togglePeakTag = async () => {
    if (isProcessing || typeof submitCurrentState !== 'function' || !selectedIsoDate) {
      return;
    }

    const newPeakTag = isPeakDay ? null : 'peak';
    setPeakTag(newPeakTag);

    try {
      await submitCurrentState({
        peakTagOverride: newPeakTag,
        keepFormOpen: true,
        skipReset: true,
      });
      const message = getToggleFeedback('peak', isPeakDay, newPeakTag === 'peak');
      if (message) {
        setStatusMessages((prev) => ({
          ...prev,
          peak: message,
        }));
      }
    } catch (error) {
      // Restore previous peak marker if the submission fails
      setPeakTag(isPeakDay ? 'peak' : null);
    }
  };
  const handleIgnoredChange = (checked) => {
    const nextValue = checked === true;
    setIgnored(nextValue);
  };

  const handleUseCorrectedChange = (index, checked) => {
    const nextValue = checked === true;
    updateMeasurement(index, 'use_corrected', nextValue);

    if (!nextValue && correctionIndex === index) {
      setCorrectionIndex(null);
    }
  };
  const relationsButtonClasses = cn(
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-transparent disabled:cursor-not-allowed disabled:opacity-60',
    hadRelations
      ? 'text-rose-600' : 'text-slate-600'
  );
  const syncTemperatureClasses = cn(
    'inline-flex items-center gap-1 rounded-full border border-amber-200 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700 shadow-sm transition-colors',
    canSyncTemperature && !isSyncingTemperature
      ? 'hover:bg-amber-50'
      : 'cursor-not-allowed opacity-60'
  );

  const handleRelationsToggle = async () => {
    if (isProcessing || typeof submitCurrentState !== 'function' || !selectedIsoDate) {
      return;
    }

    const previousValue = hadRelations;
    const nextValue = !previousValue;

    setHadRelations(nextValue);

    try {
      await submitCurrentState({
        overrideHadRelations: nextValue,
        keepFormOpen: true,
        skipReset: true,
      });

      const message = getToggleFeedback('relations', previousValue, nextValue);
      if (message) {
        setStatusMessages((current) => ({
          ...current,
          relations: message,
        }));
      }
      } catch (error) {
      setHadRelations(previousValue);
    }
  };

  const filledState = useMemo(() => {
    const hasTemperature = measurements.some((measurement) => {
      if (!measurement) return false;
      const baseTemp = measurement.temperature;
      const correctedTemp = measurement.temperature_corrected;
      return [baseTemp, correctedTemp].some((value) => {
        if (value === undefined || value === null) return false;
        return String(value).trim() !== '';
      });
    });

    const hasSymbol = (() => {
      if (typeof fertilitySymbol === 'string') {
        const trimmed = fertilitySymbol.trim();
        if (!trimmed) return false;
        return trimmed !== 'none';
      }
      return Boolean(fertilitySymbol);
    })();
    const hasSensation = Boolean(mucusSensation && mucusSensation.trim());
    const hasAppearance = Boolean(mucusAppearance && mucusAppearance.trim());
    const hasObservations = Boolean(observations && observations.trim());
    const hasMoco = hasSymbol || hasSensation || hasAppearance;

    return {
      section: {
        temperature: hasTemperature,
        moco: hasMoco,
        observations: hasObservations,
      },
      dock: {
        temperature: hasTemperature,
        symbol: hasSymbol,
        sensation: hasSensation,
        appearance: hasAppearance,
        observations: hasObservations,
        moco: hasMoco,
      },
    };
  }, [
    fertilitySymbol,
    measurements,
    mucusAppearance,
    mucusSensation,
    observations,
  ]);

  const filledBySection = filledState.section;
  const filledByDockItem = filledState.dock;

  useEffect(() => {
    if (!isEditing) {
      initializedSectionsRef.current = false;
      return;
    }

    if (initializedSectionsRef.current) {
      return;
    }

    const filledKeys = sectionKeys.filter((key) => filledBySection[key]);

    if (filledKeys.length === 0) {
      initializedSectionsRef.current = true;
      return;
    }

    const preferredSection = filledKeys.includes(activeSection)
      ? activeSection
      : filledKeys[0];

    registerActiveSection(preferredSection);
    pendingScrollTargetRef.current = preferredSection;
    initializedSectionsRef.current = true;
  }, [
    activeSection,
    filledBySection,
    isEditing,
    registerActiveSection,
    sectionKeys,
  ]);

  useEffect(() => {
    if (!isEditing) {
      initializedSectionsRef.current = false;
    }
  }, [isEditing]);

  const sectionStyles = useMemo(() => {
    const symbolDockStyles = getFertilitySymbolDockStyles(fertilitySymbol);
    return {
      temperature: {
        activeBorder: 'border-temp',
        activeBg: 'bg-temp-suave',
        activeText: 'text-temp',
        filledText: 'text-temp',
        idleText: 'text-suave',
        focusRing: 'ring-temp',
      },
      moco: {
        activeBorder: 'border-moco',
        activeBg: 'bg-moco-suave',
        activeText: 'text-moco',
        filledText: 'text-moco',
        idleText: 'text-moco-suave',
        focusRing: 'ring-moco',
      },
      symbol: symbolDockStyles,
      sensation: {
        activeBorder: 'border-sensacion',
        activeBg: 'bg-sensacion-suave',
        activeText: 'text-sensacion',
        filledText: 'text-sensacion',
        idleText: 'text-suave',
        focusRing: 'ring-sensacion',
      },
      appearance: {
        activeBorder: 'border-apariencia',
        activeBg: 'bg-apariencia-suave',
        activeText: 'text-apariencia',
        filledText: 'text-apariencia',
        idleText: 'text-suave',
        focusRing: 'ring-apariencia',
      },
      observations: {
        activeBorder: 'border-observaciones',
        activeBg: 'bg-observaciones-suave',
        activeText: 'text-observaciones',
        filledText: 'text-observaciones',
        idleText: 'text-suave',
        focusRing: 'ring-observaciones',
      },
    };
  }, [fertilitySymbol]);


  const renderSectionContent = (key) => {
    switch (key) {
      case 'temperature':
        return (
          <div className="space-y-3 rounded-3xl border border-temp bg-temp-suave p-3 shadow-sm">
            {measurements.map((m, idx) => {
              const measurementSelectId = `measurement_select_${idx}`;
              return (
                <div key={idx} className="space-y-3 rounded-3xl border border-amber-200/60 bg-white/70 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <Label className="flex items-center text-amber-800 text-sm font-semibold">
                      <Thermometer className="mr-2 h-5 w-5 text-orange-500" />
                      Medición {idx + 1}
                    </Label>
                    <label
                      htmlFor={measurementSelectId}
                      className="flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700 shadow-sm"
                    >
                      <input
                        id={measurementSelectId}
                        type="radio"
                        checked={m.selected}
                        onChange={() => selectMeasurement(idx)}
                        disabled={isProcessing}
                        className="h-3 w-3 text-orange-500 focus:ring-orange-400"
                      />
                      <span>gráfica</span>
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      data-field={idx === 0 ? 'temperature' : undefined}
                      type="number"
                      step="0.01"
                      min="34.0"
                      max="40.0"
                      value={m.temperature}
                      onChange={(e) => updateMeasurement(idx, 'temperature', e.target.value)}
                      onInput={(e) => updateMeasurement(idx, 'temperature', e.target.value)}
                      placeholder="36.50"
                      className={cn("bg-white/70 border-amber-200 text-amber-800 font-semibold placeholder-gray-400 focus:border-orange-500 focus:ring-orange-500 ", RADIUS.field)}
                      disabled={isProcessing}
                    />
                    <Input
                      data-field={idx === 0 ? 'time' : undefined}
                      type="time"
                      value={m.time}
                      onChange={(e) => updateMeasurement(idx, 'time', e.target.value)}
                      className={cn("bg-white/70 border-amber-200 text-gray-600 font-semibold placeholder-gray-400 focus:border-orange-500 focus:ring-orange-500", RADIUS.field)}
                      disabled={isProcessing}
                    />
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        disabled={isProcessing}
                        className="bg-slate-100/50 text-slate-600 text-xs rounded-3xl"
                        onClick={() => {
                          if (correctionIndex === idx) {
                            setCorrectionIndex(null);
                          } else {
                            setCorrectionIndex(idx);
                            if (m.temperature_corrected === '' || m.temperature_corrected === undefined) {
                              updateMeasurement(idx, 'temperature_corrected', m.temperature);
                            }
                            if (!m.time_corrected) {
                              updateMeasurement(idx, 'time_corrected', m.time);
                            }
                          }
                        }}
                      >
                        Corregir
                      </Button>
                      {isEditing && Boolean(m.temperature) && (
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          disabled={isProcessing}
                          onClick={() => handleIgnoredChange(!ignored)}
                          className={cn(
                            'h-7 w-7 border-amber-200 text-amber-600 transition-colors',
                            ignored ? 'bg-slate-100 text-slate-500 hover:bg-slate-300/80 border-slate-300' : 'bg-white/70 hover:bg-slate-100'
                          )}
                          title={ignored ? 'Restaurar' : 'Despreciar'}
                          aria-label={ignored ? 'Restaurar medición ignorada' : 'Despreciar medición seleccionada'}
                        >
                          {ignored ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                        </Button>
                      )}
                      {!m.confirmed && (
                        <>
                          <Button
                            type="button"
                            size="icon"
                            onClick={() => confirmMeasurement(idx)}
                            disabled={isProcessing}
                            className="h-7 w-7 bg-green-600"
                            aria-label="Confirmar medición"
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            onClick={() => removeMeasurement(idx)}
                            disabled={isProcessing}
                            className="h-7 w-7"
                            aria-label="Eliminar medición"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      {m.confirmed && isEditing && (
                        (() => {
                          const isEmptyMeasurement =
                            String(m.temperature ?? '').trim() === '' &&
                            String(m.temperature_corrected ?? '').trim() === '';
                          const canRemove = measurements.length > 1 || isEmptyMeasurement;
                          if (!canRemove) return null;
                          return (
                            <Button
                              type="button"
                              size="icon"
                              onClick={() => removeMeasurement(idx)}
                              disabled={isProcessing}
                              className="h-8 w-8"
                              aria-label="Eliminar medición"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          );
                        })()
                      )}
                    </div>
                  </div>

                  {correctionIndex === idx && (
                    <div className="mt-2 space-y-2 rounded-3xl border border-temp bg-white/80 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Input
                          type="number"
                          step="0.01"
                          min="34.0"
                          max="40.0"
                          value={m.temperature_corrected}
                          onChange={(e) => {
                            const value = e.target.value;
                            updateMeasurement(idx, 'temperature_corrected', value);
                            if (!m.use_corrected) {
                              updateMeasurement(idx, 'use_corrected', true);
                            }
                          }}
                          className={cn("bg-white/70 border-amber-200 placeholder-gray-400 focus:border-orange-500 focus:ring-orange-500 text-orange-700 font-semibold", RADIUS.field)}
                          disabled={isProcessing}
                        />
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          disabled={isProcessing}
                          onClick={() => handleTempAdjust(idx, 0.1)}
                          aria-label="Aumentar temperatura corregida"
                        >
                          <ChevronUp className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          disabled={isProcessing}
                          onClick={() => handleTempAdjust(idx, -0.1)}
                          aria-label="Disminuir temperatura corregida"
                        >
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-orange-500" />
                          <Input
                            type="time"
                            value={m.time_corrected}
                            onChange={(e) => updateMeasurement(idx, 'time_corrected', e.target.value)}
                            className="bg-white/70 border-amber-200 text-gray-800 focus:border-orange-500 focus:ring-orange-500"
                            disabled={isProcessing}
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id={`use_corrected_${idx}`}
                          checked={m.use_corrected}
                          onCheckedChange={(checked) => handleUseCorrectedChange(idx, checked)}
                        />
                        <Label htmlFor={`use_corrected_${idx}`} className="text-xs">
                          Usar valor corregido
                        </Label>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            <Button
              type="button"
              onClick={addMeasurement}
              disabled={isProcessing}
              size="xs"
              variant="outline"
              className="ml-auto flex items-center gap-1 rounded-full border-amber-300/50 bg-amber-50/80 px-3 py-2 text-xs text-amber-600 shadow-sm transition-colors hover:bg-amber-100"
              aria-label="Añadir una nueva medición"
            >
              <Plus className="h-3 w-3" />
              Medición
            </Button>
          </div>
        );
      case 'moco': {
        const symbolTheme = getFertilitySymbolTheme(fertilitySymbol);
        return (
          <div className="space-y-3 rounded-3xl bg-moco-suave p-3 shadow-xs">
            <div className="space-y-2 rounded-3xl bg-white/80 border border-sensacion p-3 shadow-sm">
              <Label htmlFor="mucusSensation" className="flex items-center text-slate-800 text-sm font-semibold">
                <Droplets className="mr-2 h-5 w-5 text-sensacion" />
                Sensación del moco
              </Label>
              <Input
                data-field="mucusSensation"
                id="mucusSensation"
                value={mucusSensation}
                onChange={(e) => setMucusSensation(e.target.value)}
                onKeyDown={handleSensationKeyDown}
                className={cn(
                  'bg-white/70 border-sensacion text-gray-800 placeholder-gray-400 focus:border-sensacion ring-sensacion focus:ring-2 font-semibold text-sensacion-fuerte',
                  RADIUS.field
                )}
                disabled={isProcessing}
              />
            </div>

            <div className="space-y-2 rounded-3xl bg-white/80 p-3 border border-apariencia shadow-sm">
              <Label htmlFor="mucusAppearance" className="flex items-center text-slate-800 text-sm font-semibold">
                <Circle className="mr-2 h-5 w-5 text-apariencia" />
                Apariencia del moco
              </Label>
              <Input
                data-field="mucusAppearance"
                id="mucusAppearance"
                value={mucusAppearance}
                onChange={(e) => setMucusAppearance(e.target.value)}
                onKeyDown={handleAppearanceKeyDown}
                ref={appearanceInputRef}
                className={cn(
                  'bg-white/70 border-apariencia text-gray-800 placeholder-gray-400 focus:border-apariencia focus:ring-apariencia font-semibold text-apariencia-fuerte',
                  RADIUS.field
                )}
                disabled={isProcessing}
              />
            </div>

            <div
              className={cn(
                'space-y-3 rounded-3xl border bg-gradient-to-r p-3 shadow-sm transition-colors duration-300',
                symbolTheme.panelBorder,
                symbolTheme.panelBackground
              )}
            >
              <div className="flex flex-col gap-3">
                <Label htmlFor="fertilitySymbol" className="flex items-center text-slate-800 text-sm font-semibold">
                  <Sprout
                    className={cn('mr-2 h-5 w-5 transition-colors duration-300', symbolTheme.icon)}
                  />
                  Símbolo de Fertilidad
                </Label>
                <Select value={fertilitySymbol} onValueChange={setFertilitySymbol} disabled={isProcessing}>
                  <SelectTrigger
                    ref={symbolTriggerRef}
                    className={cn(
                      'w-full border bg-white text-gray-800 transition-colors duration-200',
                      symbolTheme.triggerBorder,
                      symbolTheme.triggerHover,
                      symbolTheme.triggerActive,
                      symbolTheme.triggerFocus,
                      RADIUS.field
                    )}
                    data-field="fertilitySymbol"
                  >
                    <SelectValue placeholder="Selecciona un símbolo" />
                  </SelectTrigger>
                  <SelectContent
                    className={cn('bg-white text-gray-800', symbolTheme.contentBorder, RADIUS.dropdown)}
                  >
                    {FERTILITY_SYMBOL_OPTIONS.map((symbol) => (
                      <SelectItem key={symbol.value} value={symbol.value} className="cursor-pointer rounded-3xl">
                        <div className="flex items-center">
                          <span
                            className={cn(
                              'mr-2 h-4 w-4 rounded-full border border-gray-300',
                              symbol.pattern === 'spotting-pattern' ? 'spotting-pattern-icon' : symbol.color
                            )}
                          />
                          {symbol.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        );
        }
      case 'observations':
        return (
          <div className="space-y-2 rounded-3xl border border-observaciones bg-observaciones-suave p-3 shadow-sm">
            <Label htmlFor="observations" className="flex items-center text-slate-800 text-sm font-semibold">
              <Edit3 className="mr-2 h-5 w-5 text-observaciones" />
              Observaciones
            </Label>
            <Textarea
              data-field="observations"
              id="observations"
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              className={cn("min-h-[40px] resize-none bg-white/70 border-observaciones text-gray-800 placeholder-gray-400 focus:border-observaciones focus:ring-observaciones font-semibold text-observaciones-fuerte", RADIUS.field)}
              disabled={isProcessing}
            />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <>
      <div className="space-y-2 rounded-3xl border border-fertiliapp bg-tarjeta p-3">
        <Label htmlFor="date" className="flex items-center text-titulo text-sm font-semibold">
          <CalendarDays className="mr-2 h-5 w-5 text-titulo" />
          Fecha del Registro
        </Label>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                'w-full justify-start text-left font-normal bg-white/70 border-fertiliapp-suave text-gray-800 hover:bg-white/70 hover:text-gray-800',
                !date && 'text-muted-foreground'
              )}
              disabled={isProcessing}
            >
              {date ? format(date, 'PPP', { locale: es }) : <span>Selecciona una fecha</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0 bg-white border-pink-200 text-gray-800 rounded-3xl" align="start">
            <Calendar
              mode="single"
              selected={date}
              onSelect={(selectedDate) => {
                if (!selectedDate) {
                  setOpen(false);
                  return;
                }

                setDate(startOfDay(selectedDate));
                setOpen(false);
              }}
              initialFocus
              locale={es}
              disabled={isProcessing ? () => true : disabledDateRanges}
              modifiers={{ hasRecord: recordedDates }}
              modifiersClassNames={{
                hasRecord:
                  'relative after:content-["" ] after:absolute after:inset-x-0 after:bottom-1 after:mx-auto after:w-1.5 after:h-1.5 after:rounded-full after:bg-fertiliapp-fuerte',
              }}
              className="[&_button]:text-gray-800 [&_button:hover]:bg-fertiliapp-suave [&_button[aria-selected=true]]:bg-fertiliapp-fuerte [&_button[aria-selected=true]]:text-white [&_button[aria-disabled=true]]:text-gray-400"
            />
          </PopoverContent>
        </Popover>
      </div>
      <div className="mt-2">
        <div
          ref={dockRef}
          className={cn(
            'sticky top-4 z-20 flex w-full items-center gap-2 rounded-3xl border border-pink-200/70 bg-white/80 px-2 py-2 shadow-sm transition-opacity duration-200 backdrop-blur supports-[backdrop-filter]:backdrop-blur-lg sm:top-6',
            isViewAll ? 'opacity-80' : 'opacity-100'
          )}
        >
          <div className="flex flex-1 items-center gap-1 sm:gap-2">
            {dockItems.map((item) => {
              const Icon = item.icon;
              const targetSectionKey = item.sectionKey;
              const isExpanded = openSectionKeys.includes(targetSectionKey);
              const isActive = !isViewAll && isExpanded;
              const styles = sectionStyles[item.key] || sectionStyles[targetSectionKey] || {};
              const isFilled = filledByDockItem[item.key] ?? filledBySection[targetSectionKey];
              const idleTextClass = styles.idleText ?? 'text-slate-500';
              const filledTextClass = styles.filledText ?? idleTextClass;
              return (
                <button
                  key={item.key}
                  type="button"
                  onPointerDown={(e) => handleSectionPointerDown(e, targetSectionKey)}
                  onClick={() => handleSectionClick(targetSectionKey)}
                  className={cn(
                    'flex h-11 w-11 items-center justify-center rounded-full border-2 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 touch-manipulation',
                    styles.focusRing,
                    isActive
                      ? cn(
                          'shadow-inner scale-105',
                          styles.activeBorder,
                          styles.activeBg,
                          styles.activeText
                        )
                      : cn(
                          'border-transparent bg-transparent hover:bg-slate-100',
                          isFilled ? filledTextClass : idleTextClass
                        ),
                    !isActive && isViewAll && 'opacity-70',
                    'min-h-[44px] min-w-[44px]'
                  )}
                  aria-label={item.ariaLabel}
                  aria-expanded={isExpanded}
                  aria-controls={`${targetSectionKey}-panel`}
                  data-active={isActive}
                >
                  <Icon
                    className={cn(
                      'h-5 w-5 transition-colors duration-200',
                      isActive
                        ? styles.activeText
                        : isFilled
                        ? filledTextClass
                        : idleTextClass
                    )}
                    aria-hidden="true"
                  />
                  <span className="sr-only">{item.srLabel}</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={handleViewAllToggle}
            className={cn(
              'ml-auto inline-flex min-h-[32px] min-w-[32px] items-center justify-center rounded-full border px-3 text-xs font-semibold uppercase tracking-wide transition-all duration-200',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-pink-200',
              isViewAll
                ? 'border-pink-200 bg-pink-50/80 text-pink-600 shadow-inner'
                : 'border-slate-300 bg-transparent text-slate-500 hover:border-slate-400 hover:text-slate-700'
            )}
            aria-pressed={isViewAll}
            aria-label={isViewAll ? 'Compactar secciones' : 'Ver todas las secciones'}
          >
            <span className="text-lg leading-none" aria-hidden="true">
              {isViewAll ? '⇤' : '⇵'}
              </span>
              <span className="sr-only">{isViewAll ? 'Compactar' : 'Todo'}</span>
          </button>
        </div>
      </div>
      <div className="mt-2 space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <PeakModeButton
            mode={peakMode}
            size="md"
            onClick={togglePeakTag}
            aria-pressed={isPeakDay}
            aria-label={peakAriaLabel}
            disabled={isProcessing || !selectedIsoDate}
          />
          {canSyncTemperature && (
            <button
              type="button"
              className={syncTemperatureClasses}
              onClick={onSyncTemperature}
              disabled={isProcessing || isSyncingTemperature || !canSyncTemperature}
              aria-label="Sincronizar temperaturas"
            >
              <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" />
              {isSyncingTemperature ? 'Sincronizando...' : '+ temperatura'}
            </button>
          )}
          <button
            type="button"
            className={relationsButtonClasses}
            onClick={handleRelationsToggle}
            disabled={isProcessing || !selectedIsoDate}
            aria-pressed={hadRelations}
            aria-label={hadRelations ? 'Desmarcar relaciones sexuales' : 'Marcar relaciones sexuales'}
          >
            <Heart className={cn('h-4 w-4', hadRelations ? 'text-rose-500 fill-current' : 'text-slate-400')} aria-hidden="true" />
            <span className="text-xs font-semibold uppercase tracking-wide">RS</span>
          </button>
        </div>
        {(existingPeakIsoDate || statusMessages.peak || statusMessages.relations) && (
  <div className="flex items-center justify-between gap-2 text-[11px]">
    <span className="text-slate-500">
      {existingPeakIsoDate ? `Día pico: ${format(parseISO(existingPeakIsoDate), 'dd/MM')}` : ''}
    </span>

    {(statusMessages.peak || statusMessages.relations) && (
      <span className="font-medium text-rose-600" role="status" aria-live="polite">
        {statusMessages.peak ?? statusMessages.relations}
      </span>
    )}
  </div>
)}

      </div>
      <div className="mt-2" ref={sectionsContainerRef}>
        <AnimatePresence initial={false}>
          {sectionOrder
            .filter((section) => openSectionKeys.includes(section.key))
            .map((section) => (
              <motion.div
                style={{ scrollMarginTop: dockOffset }}
                key={section.key}
                id={`${section.key}-panel`}
                data-section={section.key}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.18, ease: 'easeInOut' }}
                className="overflow-hidden"
              >
                <div className="pt-2">
                  {renderSectionContent(section.key)}
                </div>
              </motion.div>
            ))}
        </AnimatePresence>
      </div>

    </>
  );
};

export default DataEntryFormFields;
