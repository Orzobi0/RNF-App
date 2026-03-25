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
  Trash2,
  Minus,
  Circle,
  Plus,
  Heart,
  Edit3,
  RefreshCcw,
  CalendarPlus,
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
const VIEW_ALL_STORAGE_KEY = 'dataEntryForm:viewAll:global';
const DEFAULT_SECTION_STORAGE_KEY = '__default__';
const RADIUS = { field: 'rounded-3xl', dropdown: 'rounded-3xl' };

const readStoredViewAllPreference = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    return window.localStorage.getItem(VIEW_ALL_STORAGE_KEY) === 'true';
  } catch (error) {
    return false;
  }
};

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
  onOpenNewCycle = null,
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

  const normalizeInitialSectionKey = useCallback((key) => {
  if (['symbol', 'sensation', 'appearance'].includes(key)) {
    return 'moco';
  }
  return key;
}, []);

const [isViewAll, setIsViewAll] = useState(readStoredViewAllPreference);
const [activeSection, setActiveSection] = useState(() => {
  const normalizedInitial = normalizeInitialSectionKey(initialSectionKey);
  return sectionKeys.includes(normalizedInitial)
    ? normalizedInitial
    : sectionKeys[0] ?? null;
});
  const stickyHeaderRef = useRef(null);  
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

  const cycleStart = startOfDay(parseISO(cycleStartDate));
  const cycleEnd = cycleEndDate ? startOfDay(parseISO(cycleEndDate)) : null;
  const disabledDateRanges = cycleEnd ? [{ before: cycleStart }, { after: cycleEnd }] : [{ before: cycleStart }];
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
  const stickyHeader = stickyHeaderRef.current;
  if (!stickyHeader) return;

  const rect = stickyHeader.getBoundingClientRect();
  setDockOffset((rect?.height || 0) + 12);
}, []);

 useEffect(() => {
  recomputeDockOffset();
  const ro = new ResizeObserver(() => recomputeDockOffset());

  if (stickyHeaderRef.current) {
    ro.observe(stickyHeaderRef.current);
  }

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

  const preventPressFocus = useCallback((event) => {
  event.preventDefault();
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

  const lastStatusIsoRef = useRef(selectedIsoDate);

useEffect(() => {
  if (lastStatusIsoRef.current === selectedIsoDate) return;
  lastStatusIsoRef.current = selectedIsoDate;
  setStatusMessages({ peak: null, relations: null });
}, [selectedIsoDate]);

useEffect(() => {
  if (typeof window === 'undefined') return;
  if (!statusMessages.peak && !statusMessages.relations) return;

  const id = window.setTimeout(() => {
    setStatusMessages({ peak: null, relations: null });
  }, 4500);

  return () => window.clearTimeout(id);
}, [statusMessages.peak, statusMessages.relations]);

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

    try {
      window.localStorage.setItem(VIEW_ALL_STORAGE_KEY, isViewAll ? 'true' : 'false');
    } catch (error) {
      // ignore storage failures silently
    }
  }, [isViewAll]);

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

  const normalizedInitialSectionKey = normalizeSectionKey(initialSectionKey);
  const hasExplicitInitialSection = Boolean(
    normalizedInitialSectionKey && sectionKeys.includes(normalizedInitialSectionKey)
  );

  if (hasExplicitInitialSection) {
    registerActiveSection(normalizedInitialSectionKey);
    pendingScrollTargetRef.current = normalizedInitialSectionKey;
    initializedSectionsRef.current = true;
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
  initialSectionKey,
  isEditing,
  normalizeSectionKey,
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
          <div className="space-y-2 rounded-3xl border border-temp bg-temp-suave p-2.5 shadow-sm">
            {measurements.map((m, idx) => {
              const measurementSelectId = `measurement_select_${idx}`;
              const isCorrectionOpen = correctionIndex === idx;
              const isCorrected = Boolean(m.use_corrected);
              return (
                <div
   key={idx}
   className={cn(
     'space-y-2 rounded-3xl border bg-white/70 p-2.5 transition-colors',
     m.selected && ignored
       ? 'border-[#3A2430]/30 bg-[#e6d4dd]/40'
       : 'border-amber-200/60'
   )}
 >
                  <div className="flex items-start justify-between gap-2">
                    <Label className="flex items-center text-amber-800 text-[13px] font-semibold">
                    <Thermometer className="mr-1 h-4 w-4 text-orange-500" />
                      Medición {idx + 1}
                    </Label>
                    <label
                      htmlFor={measurementSelectId}
                      className={cn(
    'flex items-center gap-2 rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide shadow-sm',
    m.selected && ignored
      ? 'border-[#3A2430]/30 bg-[#e6d4dd]/70 text-[#3A2430]'
      : 'border-amber-200 bg-amber-50/70 text-amber-700'
  )}
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
                      {m.selected && ignored && <EyeOff className="h-3 w-3" aria-hidden="true" />}
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
                      className={cn(
  "h-9 bg-white/70 border-amber-200 text-amber-800 font-semibold placeholder-gray-400 focus:border-orange-500 focus:ring-orange-500",
  RADIUS.field
)}
                      disabled={isProcessing}
                    />
                    <Input
                      data-field={idx === 0 ? 'time' : undefined}
                      type="time"
                      value={m.time}
                      onChange={(e) => updateMeasurement(idx, 'time', e.target.value)}
                      className={cn(
  "h-9 bg-white/70 border-amber-200 text-gray-600 font-semibold placeholder-gray-400 focus:border-orange-500 focus:ring-orange-500",
  RADIUS.field
)}
                      disabled={isProcessing}
                    />
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
  <div className="flex flex-wrap items-center gap-2">
    <Button
      type="button"
      size="xs"
      variant="outline"
      disabled={isProcessing}
      aria-pressed={correctionIndex === idx}
      className={cn(
        'rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-colors',
        isCorrectionOpen
          ? 'border-amber-500 bg-amber-600 text-white shadow-inner hover:bg-amber-600'
          : isCorrected
          ? 'border-amber-400 bg-amber-200/80 text-amber-900 hover:bg-amber-200'
          : 'border-amber-200 bg-white/70 text-amber-700 hover:bg-amber-50'
      )}
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
      {isCorrected ? (
        <Check className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        <Edit3 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
      )}
      {isCorrected ? 'Corregida' : 'Corregir'}
    </Button>

    {isEditing && Boolean(m.temperature) && (
      <Button
        type="button"
        size="icon"
        variant="outline"
        disabled={isProcessing || !m.selected}
        onClick={() => handleIgnoredChange(!ignored)}
        className={cn(
          'h-9 w-9 rounded-full border transition-colors',
          !m.selected && 'opacity-40 cursor-not-allowed',
          m.selected && ignored
            ? 'border-[#3A2430] bg-[#3A2430] text-white shadow-sm ring-2 ring-[#e6d4dd]'
            : 'border-amber-200 bg-white/80 text-amber-700 hover:bg-amber-50'
        )}
        aria-pressed={m.selected ? ignored : false}
        title={m.selected ? (ignored ? 'Restaurar' : 'Despreciar') : 'Selecciona esta medición para la gráfica'}
        aria-label={m.selected ? (ignored ? 'Restaurar medición despreciada' : 'Despreciar medición de la gráfica') : 'Selecciona esta medición para la gráfica'}
      >
        {m.selected && ignored ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </Button>
    )}

    {!m.confirmed && (
      <>
        <Button
          type="button"
          size="icon"
          onClick={() => confirmMeasurement(idx)}
          disabled={isProcessing}
          className="h-7 w-7 bg-white text-green-600"
          aria-label="Confirmar medición"
        >
          <Check className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          onClick={() => removeMeasurement(idx)}
          disabled={isProcessing}
          className="h-7 w-7 rounded-full bg-white text-rose-600 shadow-sm"
          aria-label="Eliminar medición"
        >
          <Trash2 className="h-4 w-4" />
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
            className="h-7 w-7 rounded-full bg-white text-rose-600 hover:bg-rose-700 shadow-sm"
            aria-label="Eliminar medición"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        );
      })()
    )}
  </div>

  {idx === measurements.length - 1 && (
    <Button
      type="button"
      onClick={addMeasurement}
      disabled={isProcessing}
      size="xs"
      variant="outline"
      className="ml-auto flex items-center gap-1 rounded-full border-amber-300/50 bg-amber-50/80 px-2.5 py-1 text-[11px] text-amber-600 shadow-sm transition-colors hover:bg-amber-100"
      aria-label="Añadir una nueva medición"
    >
      <Plus className="h-3 w-3" />
      Medición
    </Button>
  )}
</div>

                  
                {correctionIndex === idx && (
  <div className="mt-1.5 space-y-2 rounded-3xl border border-temp bg-white/80 p-2.5">
    <div className="grid grid-cols-2 gap-2">
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
        className={cn(
          "h-9 bg-white/70 border-amber-200 placeholder-gray-400 focus:border-orange-500 focus:ring-orange-500 text-orange-700 font-semibold",
          RADIUS.field
        )}
        disabled={isProcessing}
      />

      <Input
        type="time"
        value={m.time_corrected}
        onChange={(e) => updateMeasurement(idx, 'time_corrected', e.target.value)}
        className={cn(
          "h-9 bg-white/70 border-amber-200 text-gray-800 focus:border-orange-500 focus:ring-orange-500",
          RADIUS.field
        )}
        disabled={isProcessing}
      />
    </div>
<div className="flex items-center gap-2">
  <div className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50/70 p-[2px] shadow-sm">
    <Button
  type="button"
  variant="ghost"
  disabled={isProcessing}
  onMouseDown={preventPressFocus}
  onClick={() => handleTempAdjust(idx, -0.1)}
  className="relative h-7 w-10 rounded-full px-0 text-orange-700 hover:bg-white/90 hover:text-orange-800"
  aria-label="Disminuir temperatura corregida 0,10 grados"
  title="Bajar 0,10 °C"
>
  <span className="leading-none text-base text-app-base font-semibold">−</span>
</Button>

<Button
  type="button"
  variant="ghost"
  disabled={isProcessing}
  onMouseDown={preventPressFocus}
  onClick={() => handleTempAdjust(idx, 0.1)}
  className="relative h-7 w-10 rounded-full px-0 text-orange-800 hover:bg-white/90 hover:text-orange-900"
  aria-label="Aumentar temperatura corregida 0,10 grados"
  title="Subir 0,10 °C"
>
  <span className="leading-none text-base text-app-base font-semibold">+</span>
</Button>
  </div>


      <div className="ml-auto flex items-center gap-2">
        <Checkbox
          id={`use_corrected_${idx}`}
          checked={m.use_corrected}
          onCheckedChange={(checked) => handleUseCorrectedChange(idx, checked)}
        />
        <Label
          htmlFor={`use_corrected_${idx}`}
          className="text-xs font-medium text-slate-700"
        >
          Usar valor corregido
        </Label>
      </div>
    </div>
  </div>
)}
                </div>
              );
            })}

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
      <div
  ref={stickyHeaderRef}
  className="sticky top-0 z-30 isolate -mx-1 overflow-hidden rounded-b-3xl bg-form-surface px-1 pb-2 pt-1"
>
  <div className="absolute inset-0 z-0 rounded-3xl bg-form-surface" />
  <div className="absolute inset-x-0 bottom-0 z-0 h-6 bg-form-surface" />
  <div className="relative z-10 rounded-b-3xl bg-form-surface">
    <div className="space-y-2">
      <div className="col-span-3 space-y-2 rounded-3xl border border-fertiliapp bg-tarjeta shadow-sm p-3">
        <Label htmlFor="date" className="flex items-center text-titulo text-sm font-semibold">
          <CalendarDays className="mr-2 h-5 w-5 text-titulo" />
          Fecha del Registro
        </Label>

        <div className="flex items-stretch gap-2">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  'h-11 min-w-0 flex-[3.5] justify-start text-left font-normal bg-white border-fertiliapp-suave text-gray-800 hover:bg-white hover:text-gray-800',
                  !date && 'text-muted-foreground'
                )}
                disabled={isProcessing}
              >
                <span className="truncate">
                  {date ? format(date, 'PPP', { locale: es }) : 'Selecciona una fecha'}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 bg-white border-pink-200 text-gray-800 rounded-3xl" align="start">
              <Calendar
                mode="single"
                selected={date}
                defaultMonth={date ?? undefined}
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
                    'relative after:content-[""] after:absolute after:inset-x-0 after:bottom-1 after:mx-auto after:w-1.5 after:h-1.5 after:rounded-full after:bg-fertiliapp-fuerte',
                }}
                className="[&_button]:text-gray-800 [&_button:hover]:bg-fertiliapp-suave [&_button[aria-selected=true]]:bg-fertiliapp-fuerte [&_button[aria-selected=true]]:text-white [&_button[aria-disabled=true]]:text-gray-400"
              />
            </PopoverContent>
          </Popover>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenNewCycle?.(selectedIsoDate)}
            disabled={isProcessing || !selectedIsoDate || typeof onOpenNewCycle !== 'function'}
            className="h-11 flex-[1.15] rounded-2xl border-fertiliapp-suave bg-white px-2 text-[10px] font-semibold text-fertiliapp-fuerte hover:bg-fertiliapp-suave/60"
            aria-label="Iniciar nuevo ciclo"
          >
            <CalendarPlus className="mr-1 h-4 w-4 shrink-0" />
            <span className="flex flex-col leading-[11px] text-left">
              <span>Nuevo</span>
              <span>ciclo</span>
            </span>
          </Button>
        </div>
      </div>
    </div>
                

    <div className="mt-1 space-y-0.5 px-2 sm:px-3">
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
            className={cn(
              'inline-flex items-center gap-1 rounded-full border border-amber-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700 shadow-sm transition-colors',
              canSyncTemperature && !isSyncingTemperature
                ? 'hover:bg-amber-50'
                : 'cursor-not-allowed opacity-60'
            )}
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
        <div className="mt-1 grid grid-cols-[1fr_auto] items-start gap-2 text-[11px]">
          <div className="min-w-0">
            {existingPeakIsoDate && (
              <div className="text-slate-500">
                {`Día pico: ${format(parseISO(existingPeakIsoDate), 'dd/MM')}`}
              </div>
            )}
            {statusMessages.peak && (
              <div className="font-medium text-rose-600" role="status" aria-live="polite">
                {statusMessages.peak}
              </div>
            )}
          </div>

          <div className="text-right">
            {statusMessages.relations && (
              <div className="font-medium text-rose-600" role="status" aria-live="polite">
                {statusMessages.relations}
              </div>
            )}
          </div>
        </div>
      )}
    </div>

    <div className="mt-2">
      <motion.div
        ref={dockRef}
        animate={{
          width: isViewAll ? '70%' : '100%',
        }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        className="mx-auto"
      >
        <div
  className={cn(
    'flex w-full items-center rounded-3xl border border-pink-200 bg-white shadow-sm transition-all duration-200',
    isViewAll
      ? 'min-h-[36px] gap-1 px-1 py-[2px] opacity-90'
      : 'min-h-[50px] gap-1.5 px-2 py-1.5 opacity-100'
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
  'flex items-center justify-center rounded-full border-2 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 touch-manipulation',
  isViewAll
    ? 'h-7 w-7 min-h-[20px] min-w-[36px]'
    : 'h-11 w-11 min-h-[44px] min-w-[44px]',
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
  !isActive && isViewAll && 'opacity-70'
)}
                  aria-label={item.ariaLabel}
                  aria-expanded={isExpanded}
                  aria-controls={`${targetSectionKey}-panel`}
                  data-active={isActive}
                >
                  <Icon
                    className={cn(
                      'transition-all duration-200',
                      isViewAll ? 'h-3 w-3' : 'h-5 w-5',
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
              'ml-auto inline-flex items-center justify-center rounded-full border text-xs font-semibold uppercase tracking-wide transition-all duration-200',
              isViewAll
                ? 'min-h-[28px] min-w-[28px] px-2'
                : 'min-h-[32px] min-w-[32px] px-3',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-pink-200',
              isViewAll
                ? 'border-pink-200 bg-pink-50/80 text-pink-600 shadow-inner'
                : 'border-slate-300 bg-transparent text-slate-500 hover:border-slate-400 hover:text-slate-700'
            )}
            aria-pressed={isViewAll}
            aria-label={isViewAll ? 'Compactar secciones' : 'Ver todas las secciones'}
          >
            <span
              className={cn(
                'leading-none transition-all duration-200',
                isViewAll ? 'text-base' : 'text-lg'
              )}
              aria-hidden="true"
            >
              {isViewAll ? '⇤' : '⇵'}
            </span>
            <span className="sr-only">{isViewAll ? 'Compactar' : 'Todo'}</span>
          </button>
        </div>
      </motion.div>
    </div>
  </div>
</div>

<div className="relative z-0 mt-1" ref={sectionsContainerRef}>
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
                <div className="pt-1">
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
