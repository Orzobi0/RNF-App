import React, {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useLayoutEffect,
} from 'react';
import CycleDatesEditor from '@/components/CycleDatesEditor';
import DataEntryForm from '@/components/DataEntryForm';
import DeletionDialog from '@/components/DeletionDialog';
import { useCycleData } from '@/hooks/useCycleData';
import { useToast } from '@/components/ui/use-toast';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Edit,
  Plus,
  FileText,
  Edit2,
  Trash2,
  Thermometer,
  Droplets,
  Edit3,
  Clock,
  CalendarDays,
  ChevronDown,
  Circle,
} from 'lucide-react';
import {
  format,
  parseISO,
  isValid,
  max,
  isBefore,
  isAfter,
  startOfDay,
  differenceInCalendarDays,
  addDays,
} from 'date-fns';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  motion,
  AnimatePresence,
  useScroll,
  useMotionValue,
  useMotionValueEvent,
} from 'framer-motion';
import { Calendar } from '@/components/ui/calendar';
import { es } from 'date-fns/locale';
import { FERTILITY_SYMBOL_OPTIONS } from '@/config/fertilitySymbols';
import computePeakStatuses from '@/lib/computePeakStatuses';
import { cn } from '@/lib/utils';

const getSymbolInfo = (symbolValue) =>
  FERTILITY_SYMBOL_OPTIONS.find((symbol) => symbol.value === symbolValue) || FERTILITY_SYMBOL_OPTIONS[0];
const CALENDAR_BOUNDARY_OFFSET = 10;

const FIELD_PALETTES = {
  default: {
    iconBg: 'bg-slate-50',
    iconBorder: 'border-slate-200',
    iconColor: 'text-slate-500',
    labelColor: 'text-slate-600',
    valueColor: 'text-slate-600',
    chipBorder: 'border-slate-200',
    chipBg: 'bg-white/80',
    hoverBg: 'hover:bg-slate-50',
    focusRing: 'focus-visible:ring-2 focus-visible:ring-slate-200',
  },
  temperature: {
    iconBg: 'bg-orange-50',
    iconBorder: 'border-orange-100',
    iconColor: 'text-orange-500',
    labelColor: 'text-orange-600',
    valueColor: 'text-orange-600',
    chipBorder: 'border-orange-100',
    hoverBg: 'hover:bg-orange-50',
    focusRing: 'focus-visible:ring-2 focus-visible:ring-orange-100',
  },
  time: {
    iconBg: 'bg-slate-50',
    iconBorder: 'border-slate-200',
    iconColor: 'text-slate-500',
    labelColor: 'text-slate-500',
    valueColor: 'text-slate-600',
    chipBorder: 'border-slate-200',
    hoverBg: 'hover:bg-slate-50',
    focusRing: 'focus-visible:ring-2 focus-visible:ring-slate-200',
  },
  mucusSensation: {
    iconBg: 'bg-sky-50',
    iconBorder: 'border-sky-100',
    iconColor: 'text-sky-500',
    labelColor: 'text-sky-600',
    valueColor: 'text-sky-600',
    chipBorder: 'border-sky-100',
    hoverBg: 'hover:bg-sky-50',
    focusRing: 'focus-visible:ring-2 focus-visible:ring-sky-100',
  },
  mucusAppearance: {
    iconBg: 'bg-emerald-50',
    iconBorder: 'border-emerald-100',
    iconColor: 'text-emerald-500',
    labelColor: 'text-emerald-600',
    valueColor: 'text-emerald-600',
    chipBorder: 'border-emerald-100',
    hoverBg: 'hover:bg-emerald-50',
    focusRing: 'focus-visible:ring-2 focus-visible:ring-emerald-100',
  },
  observations: {
    iconBg: 'bg-violet-50',
    iconBorder: 'border-violet-100',
    iconColor: 'text-violet-500',
    labelColor: 'text-violet-600',
    valueColor: 'text-violet-600',
    chipBorder: 'border-violet-100',
    hoverBg: 'hover:bg-violet-50',
    focusRing: 'focus-visible:ring-2 focus-visible:ring-violet-100',
  },
};

const getSymbolPalette = (symbolInfo = {}) => {
  const base = {
    ...FIELD_PALETTES.default,
    dotColor: 'bg-slate-300',
    patternClass: symbolInfo?.pattern ? 'pattern-bg' : '',
  };

  switch (symbolInfo?.value) {
    case 'red':
      return {
        ...base,
        iconBg: 'bg-rose-50',
        iconBorder: 'border-rose-100',
        iconColor: 'text-rose-500',
        labelColor: 'text-rose-600',
        valueColor: 'text-rose-600',
        chipBorder: 'border-rose-100',
        hoverBg: 'hover:bg-rose-50',
        focusRing: 'focus-visible:ring-2 focus-visible:ring-rose-100',
        dotColor: 'bg-rose-400',
      };
    case 'white':
      return {
        ...base,
        iconBg: 'bg-white',
        iconBorder: 'border-slate-200',
        iconColor: 'text-slate-500',
        labelColor: 'text-slate-600',
        valueColor: 'text-slate-600',
        chipBorder: 'border-slate-200',
        hoverBg: 'hover:bg-slate-50',
        focusRing: 'focus-visible:ring-2 focus-visible:ring-slate-200',
        dotColor: 'bg-white',
      };
    case 'green':
      return {
        ...base,
        iconBg: 'bg-emerald-50',
        iconBorder: 'border-emerald-100',
        iconColor: 'text-emerald-500',
        labelColor: 'text-emerald-600',
        valueColor: 'text-emerald-600',
        chipBorder: 'border-emerald-100',
        hoverBg: 'hover:bg-emerald-50',
        focusRing: 'focus-visible:ring-2 focus-visible:ring-emerald-100',
        dotColor: 'bg-emerald-400',
      };
    case 'yellow':
      return {
        ...base,
        iconBg: 'bg-yellow-50',
        iconBorder: 'border-yellow-100',
        iconColor: 'text-yellow-500',
        labelColor: 'text-yellow-600',
        valueColor: 'text-yellow-600',
        chipBorder: 'border-yellow-100',
        hoverBg: 'hover:bg-yellow-50',
        focusRing: 'focus-visible:ring-2 focus-visible:ring-yellow-100',
        dotColor: 'bg-yellow-300',
      };
    case 'spot':
      return {
        ...base,
        iconBg: 'bg-rose-50',
        iconBorder: 'border-rose-100',
        iconColor: 'text-rose-500',
        labelColor: 'text-rose-600',
        valueColor: 'text-rose-600',
        chipBorder: 'border-rose-100',
        hoverBg: 'hover:bg-rose-50',
        focusRing: 'focus-visible:ring-2 focus-visible:ring-rose-100',
        dotColor: 'bg-rose-400',
        patternClass: symbolInfo?.pattern ? 'pattern-bg' : '',
      };
    default:
      return base;
  }
};

const buildFieldPalette = (key) => ({ ...FIELD_PALETTES.default, ...(FIELD_PALETTES[key] || {}) });

const useCalendarFade = (
  calendarContainerRef,
  { dependencies = [], externalRef, scrollContainerRef } = {}
) => {
  const localRef = useRef(null);

  const rawOpacity = useMotionValue(1);
  const opacity = rawOpacity;
  const { scrollY } = useScroll();

  const updateOpacity = useCallback(() => {
    const element = localRef.current;
    const calendarRect = calendarContainerRef?.current?.getBoundingClientRect();

    if (!element || !calendarRect) {
      rawOpacity.set(1);
      return;
    }

    const fadeBoundary = calendarRect.bottom + CALENDAR_BOUNDARY_OFFSET;
    const rect = element.getBoundingClientRect();
    
    if (rect.bottom <= fadeBoundary) {
      rawOpacity.set(0);
      return;
    }

    rawOpacity.set(1);

  }, [calendarContainerRef, rawOpacity]);

  useMotionValueEvent(scrollY, 'change', updateOpacity);

    useEffect(() => {
    const container = scrollContainerRef?.current;
    if (!container) {
      return undefined;
    }

    const handleScroll = () => updateOpacity();
    container.addEventListener('scroll', handleScroll, { passive: true });
    updateOpacity();

    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [scrollContainerRef, updateOpacity, ...dependencies]);

  const setRefs = useCallback(
    (node) => {
      localRef.current = node;

      if (typeof externalRef === 'function') {
        externalRef(node);
      } else if (externalRef && typeof externalRef === 'object') {
        externalRef.current = node;
      }

      if (node) {
        requestAnimationFrame(() => updateOpacity());
      }
    },
    [externalRef, updateOpacity]
  );

  useEffect(() => {
    updateOpacity();

    const handleResize = () => updateOpacity();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [updateOpacity, ...dependencies]);

  useEffect(() => {
    const node = localRef.current;
    if (!node || typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const observer = new ResizeObserver(() => updateOpacity());
    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [updateOpacity, ...dependencies]);

  return { setRefs, opacity };
};

const RecordCard = ({
  isoDate,
  dayRef,
  onToggle,
  isSelected,
  displayDate,
  cycleDay,
  details,
  symbolLabel,
  isExpanded,
  onEdit,
  onDelete,
  isProcessing,
  calendarContainerRef,
  isCalendarOpen,
  scrollMarginTop,
  scrollContainerRef,
  onInlineEdit,
}) => {
  const { setRefs, opacity } = useCalendarFade(calendarContainerRef, {
    dependencies: [isExpanded, isCalendarOpen],
    externalRef: dayRef,
    scrollContainerRef,
  });

  const symbolPalette = getSymbolPalette(details.symbolInfo);
  const getFieldPalette = buildFieldPalette;
  const symbolValue = details?.symbolInfo?.value;
  const hasSymbolValue = symbolValue && symbolValue !== 'none';

  const fieldRows = [
    {
      key: 'temperatureTime',
      grouped: true,
      items: [
        {
          key: 'temperature',
          inlineKey: 'temperature',
          palette: getFieldPalette('temperature'),
          icon: Thermometer,
          title: details.hasTemperature ? `${details.displayTemp}°C` : '—',
          hasValue: details.hasTemperature,
          badge: details.showCorrectedIndicator ? (
            <Badge
              className="flex items-center justify-center rounded-full border border-amber-200 bg-amber-50 text-[0.65rem] font-semibold uppercase tracking-wide text-amber-500"
              title="Temperatura corregida"
            >
              <span aria-hidden="true">•</span>
              <span className="sr-only">Temperatura corregida</span>
            </Badge>
          ) : null,
        },
        {
          key: 'time',
          inlineKey: 'time',
          palette: getFieldPalette('time'),
          icon: Clock,
          title: details.timeValue || '—',
          hasValue: Boolean(details.timeValue),
        },
        ],
    },
    {
      key: 'sensationAppearance',
      grouped: true,
      items: [
        {
          key: 'mucusSensation',
          inlineKey: 'mucusSensation',
          palette: getFieldPalette('mucusSensation'),
          icon: Droplets,
          title: details.mucusSensation || '—',
          hasValue: Boolean(details.mucusSensation),
        },
        {
          key: 'mucusAppearance',
          inlineKey: 'mucusAppearance',
          palette: getFieldPalette('mucusAppearance'),
          icon: Circle,
          title: details.mucusAppearance || '—',
          hasValue: Boolean(details.mucusAppearance),
        },
      ],
    },
    {
      key: 'observationsAndSymbol',
      grouped: true,
      items: [
        {
          key: 'observations',
          inlineKey: 'observations',
          palette: getFieldPalette('observations'),
          icon: Edit3,
          title: details.observationsText?.trim() ? details.observationsText : '—',
          hasValue: Boolean(details.observationsText?.trim()),
          isMultiline: true,
          minWidthClass: 'min-w-[9rem]',
        },
        {
          key: 'fertilitySymbol',
          inlineKey: 'fertilitySymbol',
          palette: symbolPalette,
          title: symbolLabel || 'Sin símbolo',
          hasValue: Boolean(hasSymbolValue),
          minWidthClass: 'min-w-[7.5rem]',
        },
        {
          key: 'editAction',
          isAction: true,
          icon: Edit2,
          ariaLabel: 'Editar registro',
          onClick: (event) => {
            event.stopPropagation();
            onEdit(details.record);
          },
          disabled: isProcessing,
        },
        {
          key: 'deleteAction',
          isAction: true,
          icon: Trash2,
          ariaLabel: 'Eliminar registro',
          onClick: (event) => {
            event.stopPropagation();
            onDelete(details.record.id);
          },
          disabled: isProcessing,
        },
      ],
    },
  ];

  const renderFieldRow = (field, index) => {
    if (field.grouped) {
      return (
        <React.Fragment key={field.key}>
          {index > 0 && <div className="my-1.5 border-t border-slate-100" />}
          <div className="flex flex-wrap gap-1.5">
          {field.items.map((item) => {
            if (item.isAction) {
              const Icon = item.icon;

              return (
                  <button
                    key={item.key}
                    type="button"
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-rose-200 bg-white/80 text-rose-600 shadow-sm transition-colors hover:bg-rose-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      item.onClick?.(event);
                    }}
                    aria-label={item.ariaLabel}
                    disabled={item.disabled}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                );
              }

              const palette = item.palette || getFieldPalette(item.key);
              const Icon = item.icon;
              const hasValue = item.hasValue ?? Boolean(item.title);
              const displayValue = item.title || '-';
              const minWidthClass = item.minWidthClass || 'min-w-[8rem]';
              const iconElement = item.renderIcon
                ? item.renderIcon()
                : Icon
                  ? (
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${palette.iconBorder} ${palette.iconBg}`}
                      >
                        <Icon className={`h-3 w-3 ${palette.iconColor}`} />
                      </span>
                    )
                  : null;
              const gapClass = iconElement ? 'gap-2.5' : 'gap-1.5';

              return (
                <button
                  key={item.key}
                  type="button"
                  className={`flex ${minWidthClass} flex-1 items-center ${gapClass} rounded-2xl border ${palette.chipBorder} ${palette.chipBg} px-2.5 py-1.5 text-left transition-colors ${palette.hoverBg} focus:outline-none ${palette.focusRing}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    event.preventDefault();
                    if (typeof onInlineEdit === 'function') {
                      onInlineEdit(item.inlineKey || item.key);
                    }
                  }}
                >
                  {iconElement}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-1.5">
                      <span
                        className={`text-sm font-semibold leading-tight ${
                          hasValue ? palette.valueColor : 'text-slate-400'
                        } ${item.isMultiline ? 'whitespace-pre-line break-words' : 'truncate'}`}
                      >
                        {displayValue}
                      </span>
                      {item.badge && <span className="shrink-0">{item.badge}</span>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </React.Fragment>
      );
    }

    const palette = field.palette || getFieldPalette(field.key);
    const Icon = field.icon;
    const valueClass = field.value ? palette.valueColor : 'text-slate-400';
    const valueText = field.value ?? '—';
    const iconElement = Icon
      ? (
          <span
            className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${palette.iconBorder} ${palette.iconBg}`}
          >
            <Icon className={`h-3 w-3 ${palette.iconColor}`} />
          </span>
        )
      : null;
    const contentGapClass = iconElement ? 'gap-2.5' : 'gap-1.5';

    return (
      <React.Fragment key={field.key}>
        {index > 0 && <div className="my-1.5 border-t border-slate-100" />}
        <button
          type="button"
          className={`flex w-full items-start gap-3 rounded-2xl border ${palette.chipBorder} ${palette.chipBg} px-2.5 py-1.5 text-left transition-colors ${palette.hoverBg} focus:outline-none ${palette.focusRing}`}
          onClick={(event) => {
            event.stopPropagation();
            event.preventDefault();
            if (typeof onInlineEdit === 'function') {
              onInlineEdit(field.key);
            }
          }}
        >
          <div className={`flex min-w-0 flex-1 items-start ${contentGapClass} ${field.isMultiline ? 'pt-0.5' : ''}`}>
            {iconElement}
            <div className="min-w-0 flex-1">
              <span
                className={`block text-sm leading-snug ${valueClass} ${field.isMultiline ? 'whitespace-pre-line' : 'truncate'}`}
              >
                {valueText}
              </span>
            </div>
          </div>
          {field.badge && <span className="shrink-0 self-center">{field.badge}</span>}
        </button>
      </React.Fragment>
    );
  };

  return (
    <motion.div
      layout
      ref={setRefs}
      onClick={() => onToggle(isoDate)}
      className={`group relative mx-0.5 flex w-full cursor-pointer flex-col rounded-2xl border border-rose-100 bg-white/75 px-4 py-3 shadow-sm backdrop-blur-md transition-all duration-300 hover:shadow-lg sm:mx-1 sm:px-5 ${
        isSelected ? 'bg-white/90 ring-2 ring-rose-400 shadow-rose-200/70' : ''
      }`}
      whileHover={{ translateY: -2 }}
      style={{ opacity, scrollMarginTop }}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="flex items-center gap-1 text-sm font-semibold text-slate-700">
          <CalendarDays className="h-4 w-4 text-rose-400" />
          {displayDate}
        </div>
        <span className="text-sm font-semibold text-rose-600 ">D{cycleDay}</span>
        <FieldBadges
          hasTemperature={details.hasTemperature}
          hasMucusSensation={details.hasMucusSensation}
          hasMucusAppearance={details.hasMucusAppearance}
          hasObservations={details.hasObservations}
          peakStatus={details.peakStatus}
          isPeakDay={details.isPeakDay}
        />
        <div className="ml-auto flex items-center">
          <div
            className={`flex h-6 w-6 items-center justify-center rounded-full border border-slate-400 ${symbolPalette.dotColor} ${symbolPalette.patternClass} shadow-inner`}
            title={symbolLabel}
          >            
          </div>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="mt-1.5 overflow-hidden"
          >
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-2 shadow-sm">
              <div className="flex flex-wrap items-center gap-1 text-[0.65rem] font-semibold uppercase tracking-wide text-slate-500">
                <PeakBadge peakStatus={details.peakStatus} isPeakDay={details.isPeakDay} size="small" />
                {(details.isPeakDay || details.peakStatus === 'P') && (
                  <span className="text-rose-600">Día pico</span>
                )}
                {details.record?.ignored && (
                  <Badge
                    className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 text-[0.65rem] font-semibold uppercase tracking-wide text-slate-400"
                    title="Registro ignorado"
                  >
                    <span aria-hidden="true" className="h-2 w-2 rounded-full bg-slate-300" />
                    <span className="sr-only">Registro ignorado</span>
                  </Badge>
                )}
              </div>
              <div className="mt-1.5 space-y-1.5">
                {fieldRows.map((field, index) => renderFieldRow(field, index))}
              </div>
              
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const EmptyGroupRow = ({
  id,
  days,
  toggleEmptyGroup,
  isExpandedGroup,
  hasSelectedInGroup,
  calendarContainerRef,
  isCalendarOpen,
  children,
  scrollMarginTop,
  scrollContainerRef,
}) => {
  const { setRefs, opacity } = useCalendarFade(calendarContainerRef, {
    dependencies: [isExpandedGroup, isCalendarOpen, days.length],
    scrollContainerRef,
  });

  return (
    <motion.button
      type="button"
      ref={setRefs}
      onClick={() => toggleEmptyGroup(id)}
      className={`flex w-full items-center justify-between rounded-2xl border border-dashed border-rose-300 bg-white/40 px-4 py-3 text-sm font-medium text-slate-500 backdrop-blur-sm transition-all duration-200 hover:border-rose-500 hover:bg-white/70 ${
        hasSelectedInGroup ? 'ring-2 ring-rose-300 text-rose-500 shadow-rose-200/70' : ''
      }`}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      aria-expanded={isExpandedGroup}
      style={{ opacity, scrollMarginTop }}
    >
      {children}
    </motion.button>
  );
};

const formatTemperatureDisplay = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numeric = Number(String(value).replace(',', '.'));
  if (Number.isNaN(numeric)) {
    return null;
  }

  return numeric.toFixed(2);
};

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
      : 'h-6 w-6 text-xs';

  return (
    <span
      role="img"
      aria-label={title}
      title={title}
      className={`flex items-center justify-center rounded-full font-semibold shadow-sm shadow-rose-200/40 transition-transform duration-200 ${sizeClasses} ${colorClasses} ${className}`}
    >
      {label}
    </span>
  );
};

const FieldBadges = ({
  hasTemperature,
  hasMucusSensation,
  hasMucusAppearance,
  hasObservations,
  peakStatus,
  isPeakDay,
}) => {
  const badgeBase =
    'flex items-center justify-center w-5 h-5 rounded-full text-[0.6rem] shadow-sm transition-transform duration-200';
  const temperaturePalette = buildFieldPalette('temperature');
  const sensationPalette = buildFieldPalette('mucusSensation');
  const appearancePalette = buildFieldPalette('mucusAppearance');
  const observationsPalette = buildFieldPalette('observations');

  return (
    <div className="flex items-center gap-1.5">
      <PeakBadge peakStatus={peakStatus} isPeakDay={isPeakDay} size="small"/>
      {hasTemperature && (
        <span className={`${badgeBase} border ${temperaturePalette.iconBorder} ${temperaturePalette.iconBg}`}>
          <Thermometer className={`h-2.5 w-2.5 ${temperaturePalette.iconColor}`} />
        </span>
      )}
      {hasMucusSensation && (
        <span className={`${badgeBase} border ${sensationPalette.iconBorder} ${sensationPalette.iconBg}`}>
          <Droplets className={`h-2.5 w-2.5 ${sensationPalette.iconColor}`} />
        </span>
      )}
      {hasMucusAppearance && (
        <span className={`${badgeBase} border ${appearancePalette.iconBorder} ${appearancePalette.iconBg}`}>
          <Circle className={`h-2.5 w-2.5 ${appearancePalette.iconColor}`} />
        </span>
      )}
      {hasObservations && (
        <span className={`${badgeBase} border ${observationsPalette.iconBorder} ${observationsPalette.iconBg}`}>
          <Edit3 className={`h-2.5 w-2.5 ${observationsPalette.iconColor}`} />
        </span>
      )}
    </div>
  );
};

const RecordsPage = () => {
  const {
    currentCycle,
    addOrUpdateDataPoint,
    deleteRecord,
    isLoading,
    updateCycleDates,
    checkCycleOverlap,
    forceUpdateCycleStart,
    refreshData,
  } = useCycleData();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [recordToDelete, setRecordToDelete] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showStartDateEditor, setShowStartDateEditor] = useState(false);
  const [draftStartDate, setDraftStartDate] = useState(() => currentCycle?.startDate || '');
  const [startDateError, setStartDateError] = useState('');
  const [pendingStartDate, setPendingStartDate] = useState(null);
  const [overlapCycle, setOverlapCycle] = useState(null);
  const [showOverlapDialog, setShowOverlapDialog] = useState(false);
  const [isUpdatingStartDate, setIsUpdatingStartDate] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [expandedIsoDate, setExpandedIsoDate] = useState(null);
  const [defaultFormIsoDate, setDefaultFormIsoDate] = useState(null);
  const [focusedField, setFocusedField] = useState(null);
  const [isCalendarOpen, setIsCalendarOpen] = useState(true);
  const [expandedEmptyGroups, setExpandedEmptyGroups] = useState([]);
  const calendarContainerRef = useRef(null);
  const recordsScrollRef = useRef(null);
  const dayRefs = useRef({});
  const hasUserSelectedDateRef = useRef(false);
  const calendarHeightRef = useRef(0);
  const [calendarHeight, setCalendarHeight] = useState(0);

  const registerDayRef = useCallback(
    (isoDate) => (node) => {
      if (!isoDate) return;
      if (node) {
        dayRefs.current[isoDate] = node;
      } else {
        delete dayRefs.current[isoDate];
      }
    },
    []
  );

  const updateCalendarMetrics = useCallback(() => {
    const element = calendarContainerRef.current;

    if (!element) {
      calendarHeightRef.current = 0;
      setCalendarHeight(0);
      return;
    }

    const rect = element.getBoundingClientRect();
    const measuredHeight = rect.height;

    calendarHeightRef.current = measuredHeight;
    setCalendarHeight((prev) => (Math.abs(prev - measuredHeight) > 0.5 ? measuredHeight : prev));
  }, []);

  useLayoutEffect(() => {
    let animationFrame = window.requestAnimationFrame(updateCalendarMetrics);

    const handleResize = () => {
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
      }
      animationFrame = window.requestAnimationFrame(updateCalendarMetrics);
    };

    window.addEventListener('resize', handleResize);

    let observer;

    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => {
        if (animationFrame) {
          window.cancelAnimationFrame(animationFrame);
        }
        animationFrame = window.requestAnimationFrame(updateCalendarMetrics);
      });

      if (calendarContainerRef.current) {
        observer.observe(calendarContainerRef.current);
      }
    }

    return () => {
      window.removeEventListener('resize', handleResize);

      if (observer) {
        observer.disconnect();
      }

      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
      }
    };
  }, [updateCalendarMetrics]);

  const ensureElementBelowCalendar = useCallback(
    (element, { behavior = 'smooth', forceAlignTop = false } = {}) => {
      const container = recordsScrollRef.current;

      if (!element || !container) {
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();

      const elementTop = elementRect.top - containerRect.top + container.scrollTop;
      const elementBottom = elementTop + elementRect.height;
      const viewTop = container.scrollTop;
      const viewBottom = viewTop + container.clientHeight;
      const alignTopTarget = Math.max(elementTop - 12, 0);

      if (forceAlignTop || elementTop < viewTop) {
        container.scrollTo({ top: alignTopTarget, behavior });
        return;
      }

      if (elementBottom > viewBottom) {
        const alignBottomTarget = Math.max(elementBottom - container.clientHeight + 12, 0);
        const shouldAlignTop = elementRect.height <= container.clientHeight;
        container.scrollTo({ top: shouldAlignTop ? alignTopTarget : alignBottomTarget, behavior });
      }
    },
    []
  );

  const boundaryPx = useMemo(
    () => Math.max(Math.round(calendarHeight + CALENDAR_BOUNDARY_OFFSET), CALENDAR_BOUNDARY_OFFSET),
    [calendarHeight]
  );

    const calendarScrollMargin = useMemo(() => boundaryPx, [boundaryPx]);

  useEffect(() => {
    setDraftStartDate(currentCycle?.startDate || '');
  }, [currentCycle?.startDate]);

  const sortedRecordDates = useMemo(() => {
    if (!currentCycle?.data?.length) return [];

    return [...currentCycle.data]
      .filter((record) => record?.isoDate)
      .sort((a, b) => {
        const dateA = parseISO(a.isoDate);
        const dateB = parseISO(b.isoDate);
        return dateB - dateA;
      })
      .map((record) => record.isoDate);
  }, [currentCycle?.data]);

  useEffect(() => {
    if (!sortedRecordDates.length) {
      setSelectedDate(null);
      setExpandedIsoDate(null);
      return;
    }

    if (!selectedDate || !sortedRecordDates.includes(selectedDate)) {
      hasUserSelectedDateRef.current = false;
      setSelectedDate(sortedRecordDates[0]);
    }
  }, [sortedRecordDates, selectedDate]);

  useEffect(() => {
    if (!selectedDate || !hasUserSelectedDateRef.current) {
      return;
    }

    const targetNode = dayRefs.current[selectedDate];
    if (!targetNode) {
      return;
    }
    
      const rafId = window.requestAnimationFrame(() => {
      ensureElementBelowCalendar(targetNode, { behavior: 'smooth', forceAlignTop: true });
      hasUserSelectedDateRef.current = false;
    });

      return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [selectedDate, expandedEmptyGroups, isCalendarOpen, ensureElementBelowCalendar]);

  useEffect(() => {
    if (!expandedIsoDate) {
      return;
    }

    const targetNode = dayRefs.current[expandedIsoDate];
    if (!targetNode) {
      return;
    }

    const rafId = window.requestAnimationFrame(() => {
      ensureElementBelowCalendar(targetNode, { behavior: 'smooth', forceAlignTop: true });
    });

    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [expandedIsoDate, ensureElementBelowCalendar, isCalendarOpen, calendarHeight]);

  useEffect(() => {
    const priorityIso = expandedIsoDate || selectedDate;
    if (!priorityIso) {
      return;
    }

    const targetNode = dayRefs.current[priorityIso];
    if (!targetNode) {
      return;
    }

    ensureElementBelowCalendar(targetNode, { behavior: 'auto' });
  }, [calendarHeight, isCalendarOpen, expandedIsoDate, selectedDate, ensureElementBelowCalendar]);

  useEffect(() => {
    const container = recordsScrollRef.current;
    if (!container) {
      return;
    }

    container.scrollTo({ top: 0, behavior: 'auto' });
  }, []);


  const recordDateObjects = useMemo(() => {
    if (!currentCycle?.data?.length) return [];

    return currentCycle.data
      .map((record) => {
        if (!record?.isoDate) return null;
        const parsed = parseISO(record.isoDate);
        return isValid(parsed) ? parsed : null;
      })
      .filter(Boolean);
  }, [currentCycle?.data]);

  const recordDateSet = useMemo(() => new Set(sortedRecordDates), [sortedRecordDates]);

  const peakStatuses = useMemo(() => computePeakStatuses(currentCycle?.data ?? []), [currentCycle?.data]);

  const recordDetailsByIso = useMemo(() => {
    const details = new Map();
    if (!currentCycle?.data?.length) {
      return details;
    }

    currentCycle.data.forEach((record) => {
      if (!record?.isoDate) return;

      const selectedMeasurement =
        record.measurements?.find((measurement) => measurement?.selected) ||
        (record.temperature_chart || record.temperature_raw
          ? {
              temperature: record.temperature_chart ?? record.temperature_raw,
              temperature_corrected: record.temperature_corrected ?? null,
              time: record.timestamp ? format(parseISO(record.timestamp), 'HH:mm') : null,
              use_corrected: record.use_corrected ?? false,
            }
          : null);

      const usesCorrected = selectedMeasurement?.use_corrected ?? record.use_corrected ?? false;
      const correctedTemp =
        selectedMeasurement?.temperature_corrected ?? record.temperature_corrected ?? null;
      const rawTemp =
        selectedMeasurement?.temperature ?? record.temperature_chart ?? record.temperature_raw ?? null;
      const resolvedTemp =
        usesCorrected && correctedTemp !== null && correctedTemp !== undefined && correctedTemp !== ''
          ? correctedTemp
          : rawTemp ?? correctedTemp;

      const displayTemp = formatTemperatureDisplay(resolvedTemp);
      const hasTemperature = displayTemp !== null;
      const showCorrectedIndicator =
        usesCorrected && correctedTemp !== null && correctedTemp !== undefined && correctedTemp !== '';

      let timeValue = null;
      if (selectedMeasurement?.time) {
        timeValue = selectedMeasurement.time;
      } else if (record.timestamp && isValid(parseISO(record.timestamp))) {
        timeValue = format(parseISO(record.timestamp), 'HH:mm');
      }

      const mucusSensation = record.mucusSensation ?? record.mucus_sensation ?? '';
      const mucusAppearance = record.mucusAppearance ?? record.mucus_appearance ?? '';
      const hasMucusSensation = Boolean(mucusSensation);
      const hasMucusAppearance = Boolean(mucusAppearance);
      const hasMucus = hasMucusSensation || hasMucusAppearance;
      const observationsText = record.observations || '';
      const hasObservations = Boolean(observationsText);

      const peakStatus = peakStatuses[record.isoDate] || null;
      const isPeakDay = record.peak_marker === 'peak' || peakStatus === 'P';

      const symbolInfo = getSymbolInfo(record.fertility_symbol);

      details.set(record.isoDate, {
        record,
        symbolInfo,
        hasTemperature,
        displayTemp,
        showCorrectedIndicator,
        timeValue,
        hasMucus,
        hasMucusSensation,
        hasMucusAppearance,
        mucusSensation,
        mucusAppearance,
        hasObservations,
        observationsText,
        peakStatus,
        isPeakDay,
      });
    });

    return details;
  }, [currentCycle?.data, peakStatuses]);


  const cycleRange = useMemo(() => {
    if (!currentCycle?.startDate) return null;
    const start = parseISO(currentCycle.startDate);
    if (!isValid(start)) return null;

    let end;

    if (currentCycle?.endDate) {
      end = parseISO(currentCycle.endDate);
    } else {
      const today = startOfDay(new Date());
      const candidates = [start, today];

      if (recordDateObjects.length) {
        candidates.push(max(recordDateObjects));
      }

      end = max(candidates);
    }

    if (!isValid(end)) {
      return { from: start, to: start };
    }

    return { from: start, to: end };
  }, [currentCycle?.startDate, currentCycle?.endDate, recordDateObjects]);

  const calendarModifiers = useMemo(() => {
    const modifiers = {};
    if (cycleRange) {
      modifiers.outsideCycle = (day) =>
        isBefore(day, cycleRange.from) || isAfter(day, cycleRange.to);
      modifiers.insideCycleNoRecord = (day) => {
        if (isBefore(day, cycleRange.from) || isAfter(day, cycleRange.to)) {
          return false;
        }

        const iso = format(day, 'yyyy-MM-dd');
        return !recordDateSet.has(iso);
      };
    }
    if (recordDateObjects.length) {
      modifiers.hasRecord = recordDateObjects;
    }
    return modifiers;
  }, [cycleRange, recordDateObjects, recordDateSet]);

  const calendarClassNames = useMemo(
    () => ({
      months:
        'flex flex-col items-center sm:flex-row sm:items-center sm:justify-center space-y-3 sm:space-x-4 sm:space-y-0',
      month: 'space-y-3',
      table: 'w-full border-collapse space-y-0.5',
      row: 'flex w-full mt-1.5',
      head_cell: 'text-muted-foreground rounded-md w-8 font-medium text-[0.75rem]',
      cell:
        'h-8 w-8 text-center text-sm p-0 relative [&:has([aria-selected])]:bg-transparent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20',
      day: cn(
        buttonVariants({ variant: 'ghost', size: 'icon' }),
        '!h-8 !w-8 !p-0 font-medium text-slate-700 aria-selected:opacity-100'
      ),
      day_selected:
        'border border-rose-400 text-white hover:bg-rose-300 hover:text-white focus:bg-rose-300 focus:text-white',
      day_today: 'bg-rose-200 text-rose-700 font-semibold',
    }),
    []
  );

  const cycleDays = useMemo(() => {
    if (!currentCycle?.startDate) return [];

    const startDate = parseISO(currentCycle.startDate);
    if (!isValid(startDate)) {
      return [];
    }

    const cycleStartDay = startOfDay(startDate);
    const today = startOfDay(new Date());

    let rangeEnd = cycleRange?.to ? startOfDay(cycleRange.to) : today;
    if (isAfter(rangeEnd, today)) {
      rangeEnd = today;
    }
    if (isBefore(rangeEnd, cycleStartDay)) {
      rangeEnd = cycleStartDay;
    }

    const totalDays = differenceInCalendarDays(rangeEnd, cycleStartDay) + 1;
    if (totalDays <= 0) {
      return [];
    }

    const days = [];
    for (let offset = totalDays - 1; offset >= 0; offset -= 1) {
      const currentDate = addDays(cycleStartDay, offset);
      const isoDate = format(currentDate, 'yyyy-MM-dd');
      const cycleDay = differenceInCalendarDays(currentDate, cycleStartDay) + 1;
      const details = recordDetailsByIso.get(isoDate) || null;

      days.push({
        isoDate,
        date: currentDate,
        cycleDay,
        details,
      });
    }

    return days;
  }, [currentCycle?.startDate, cycleRange, recordDetailsByIso]);

  const processedCycleDays = useMemo(() => {
    if (!cycleDays.length) {
      return { items: [], isoToGroup: {} };
    }

    const items = [];
    const isoToGroup = {};

    for (let index = 0; index < cycleDays.length;) {
      const day = cycleDays[index];
      if (day.details) {
        items.push({ type: 'record', day });
        index += 1;
        continue;
      }

      let runEnd = index;
      while (runEnd < cycleDays.length && !cycleDays[runEnd].details) {
        runEnd += 1;
      }

      const runLength = runEnd - index;

      if (runLength > 3) {
        const groupDays = cycleDays.slice(index, runEnd);
        const groupId = `${groupDays[0].isoDate}_${groupDays[groupDays.length - 1].isoDate}`;
        groupDays.forEach(({ isoDate }) => {
          isoToGroup[isoDate] = groupId;
        });
        items.push({
          type: 'empty-group',
          id: groupId,
          days: groupDays,
        });
      } else {
        for (let offset = index; offset < runEnd; offset += 1) {
          items.push({ type: 'empty-day', day: cycleDays[offset] });
        }
      }

      index = runEnd;
    }

    return { items, isoToGroup };
  }, [cycleDays]);

  const { items: cycleDisplayItems, isoToGroup: isoToGroupMap } = processedCycleDays;

  const toggleEmptyGroup = useCallback((groupId) => {
    if (!groupId) return;
    setExpandedEmptyGroups((prev) =>
      prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId]
    );
  }, []);

  useEffect(() => {
    if (!selectedDate) return;
    const groupId = isoToGroupMap[selectedDate];
    if (!groupId) return;

    setExpandedEmptyGroups((prev) => (prev.includes(groupId) ? prev : [...prev, groupId]));
  }, [selectedDate, isoToGroupMap]);

  const handleCalendarSelect = useCallback(
    (day) => {
      if (!day) return;
      const iso = format(day, 'yyyy-MM-dd');

      if (cycleRange) {
        if (isBefore(day, cycleRange.from) || isAfter(day, cycleRange.to)) {
          return;
        }
      }

      hasUserSelectedDateRef.current = true;
      setSelectedDate(iso);

      if (!recordDetailsByIso.has(iso)) {
        setExpandedIsoDate(null);
      }
    },
    [cycleRange, recordDetailsByIso]
  );

  const resetStartDateFlow = useCallback(() => {
    setPendingStartDate(null);
    setOverlapCycle(null);
    setShowOverlapDialog(false);
  }, []);

  const openStartDateEditor = useCallback(() => {
    setDraftStartDate(currentCycle?.startDate || '');
    setStartDateError('');
    resetStartDateFlow();
    setShowStartDateEditor(true);
  }, [currentCycle?.startDate, resetStartDateFlow]);

  const closeStartDateEditor = useCallback(() => {
    setShowStartDateEditor(false);
    setStartDateError('');
    resetStartDateFlow();
    setDraftStartDate(currentCycle?.startDate || '');
  }, [currentCycle?.startDate, resetStartDateFlow]);

  const handleCancelOverlapStart = useCallback(() => {
    resetStartDateFlow();
  }, [resetStartDateFlow]);

  const handleSaveStartDate = useCallback(async () => {
    if (!draftStartDate) {
      setStartDateError('La fecha de inicio es obligatoria');
      return;
    }

    if (!currentCycle?.id) {
      return;
    }

    setStartDateError('');
    setIsUpdatingStartDate(true);

    try {
      const overlap = checkCycleOverlap
        ? await checkCycleOverlap(currentCycle.id, draftStartDate)
        : null;

      if (overlap) {
        setPendingStartDate(draftStartDate);
        setOverlapCycle(overlap);
        setShowOverlapDialog(true);
        setIsUpdatingStartDate(false);
        return;
      }

      await updateCycleDates(currentCycle.id, draftStartDate);
      await refreshData({ silent: true });
      toast({
        title: 'Fecha de inicio actualizada',
        description: 'El ciclo se ha ajustado a la nueva fecha de inicio.',
      });
      closeStartDateEditor();
    } catch (error) {
      console.error('Error updating start date from records page:', error);
      setStartDateError('No se pudo actualizar la fecha de inicio');
      toast({
        title: 'Error',
        description: 'No se pudo actualizar la fecha de inicio.',
        variant: 'destructive',
      });
    } finally {
      setIsUpdatingStartDate(false);
    }
  }, [
    draftStartDate,
    currentCycle?.id,
    checkCycleOverlap,
    updateCycleDates,
    refreshData,
    toast,
    closeStartDateEditor,
  ]);

  const handleConfirmOverlapStart = useCallback(async () => {
    if (!currentCycle?.id || !pendingStartDate) {
      resetStartDateFlow();
      return;
    }

    setIsUpdatingStartDate(true);
    setShowOverlapDialog(false);

    try {
      await forceUpdateCycleStart(currentCycle.id, pendingStartDate);
      await refreshData({ silent: true });
      toast({
        title: 'Fecha de inicio actualizada',
        description: 'El ciclo se ha ajustado a la nueva fecha de inicio.',
      });
      closeStartDateEditor();
    } catch (error) {
      console.error('Error forcing start date from records page:', error);
      setStartDateError('No se pudo actualizar la fecha de inicio');
      toast({
        title: 'Error',
        description: 'No se pudo actualizar la fecha de inicio.',
        variant: 'destructive',
      });
    } finally {
      setIsUpdatingStartDate(false);
      resetStartDateFlow();
    }
  }, [
    currentCycle?.id,
    pendingStartDate,
    forceUpdateCycleStart,
    refreshData,
    toast,
    closeStartDateEditor,
    resetStartDateFlow,
  ]);



  const handleCloseForm = useCallback(() => {
    setShowForm(false);
    setEditingRecord(null);
    setDefaultFormIsoDate(null);
    setFocusedField(null);
  }, []);

  const openRecordForm = useCallback(
    (record, fieldName = null) => {
      if (!record) return;

      setEditingRecord(record);
      setDefaultFormIsoDate(record.isoDate ?? null);
      setFocusedField(fieldName);

      if (record.isoDate) {
        hasUserSelectedDateRef.current = false;
        setSelectedDate(record.isoDate);
        setExpandedIsoDate(record.isoDate);
      }

      setShowForm(true);
    },
    []
  );

  const handleEdit = useCallback((record) => openRecordForm(record), [openRecordForm]);

  const handleInlineEdit = useCallback((record, fieldName) => openRecordForm(record, fieldName), [openRecordForm]);

  const handleDeleteRequest = (recordId) => {
    const record = currentCycle?.data?.find((r) => r.id === recordId);
    setRecordToDelete(record || null);
  };

  const handleDateSelect = useCallback((record) => {
    setEditingRecord(record);
  }, []);

  const handleToggleRecord = useCallback((isoDate, hasRecord) => {
    if (!isoDate) {
      return;
    }

    hasUserSelectedDateRef.current = false;
    setSelectedDate(isoDate);

    if (!hasRecord) {
      return;
    }

    setExpandedIsoDate((prev) => (prev === isoDate ? null : isoDate));
  }, []);

  const handleAddRecordForDay = useCallback((isoDate) => {
    if (!isoDate) {
      return;
    }

    hasUserSelectedDateRef.current = false;
    setSelectedDate(isoDate);
    setExpandedIsoDate(null);
    setEditingRecord(null);
    setDefaultFormIsoDate(isoDate);
    setFocusedField(null);
    setShowForm(true);
  }, []);

  const handleSave = async (data, { keepFormOpen = false } = {}) => {
    setIsProcessing(true);
    try {
      await addOrUpdateDataPoint(data, editingRecord);
      if (!keepFormOpen) {
        setShowForm(false);
        setEditingRecord(null);
        setDefaultFormIsoDate(null);
        setFocusedField(null);
      }
    } catch (error) {
      toast({ title: 'Error', description: 'No se pudo guardar el registro', variant: 'destructive' });
    } finally {
      setIsProcessing(false);
      if (keepFormOpen) {
        setDefaultFormIsoDate(data?.isoDate ?? null);
      }
    }
  };

  const confirmDelete = async () => {
    if (!recordToDelete) return;
    setIsProcessing(true);
    try {
      const deletedIso = recordToDelete.isoDate;
      await deleteRecord(recordToDelete.id);
      setRecordToDelete(null);
      setDefaultFormIsoDate(null);
      if (deletedIso) {
        setExpandedIsoDate((prev) => (prev === deletedIso ? null : prev));
        if (selectedDate === deletedIso) {
          setSelectedDate(deletedIso);
        }
      }
    } catch {
      toast({ title: 'Error', description: 'No se pudo eliminar el registro', variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  if (isLoading && !currentCycle?.id) {
    return (
      <div className="relative flex h-full flex-col items-center justify-center bg-gradient-to-br from-rose-100 via-pink-100 to-rose-100">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(65% 55% at 50% 32%, rgba(244,114,182,0.18) 0%, rgba(244,114,182,0.12) 35%, rgba(244,114,182,0.06) 60%, rgba(244,114,182,0) 100%)'
          }}
        />
        <p className="text-center text-slate-600 text-lg">Cargando...</p>
      </div>
    );
  }

  if (!currentCycle?.id) {
    return (
      <div className="relative flex h-full flex-col items-center justify-center bg-gradient-to-br from-rose-100 via-pink-100 to-rose-100">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(65% 55% at 50% 32%, rgba(244,114,182,0.18) 0%, rgba(244,114,182,0.12) 35%, rgba(244,114,182,0.06) 60%, rgba(244,114,182,0) 100%)'
          }}
        />
        <p className="text-center text-slate-600 text-lg">No hay ciclo activo.</p>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col bg-gradient-to-br from-rose-100 via-pink-100 to-rose-100">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(65% 55% at 50% 32%, rgba(244,114,182,0.18) 0%, rgba(244,114,182,0.12) 35%, rgba(244,114,182,0.06) 60%, rgba(244,114,182,0) 100%)'
        }}
      />
      
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-6 px-4 relative z-10">
        <div
          ref={calendarContainerRef}
          className="sticky top-1 z-50 w-full max-w-lg mx-auto"
        >
          <div className="relative overflow-hidden rounded-2xl ring-1 ring-rose-100/70">
            <div className="space-y-1.5 p-2 sm:p-2.5 relative z-10">
              {/* Header */}
              <motion.div
                className="flex flex-col gap-4"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
              >
                <div className="flex flex-wrap items-center gap-1 justify-between sm:justify-start">
                  <div className="flex items-center gap-1">
                    <FileText className="h-8 w-8 text-pink-500" />
                    <button
                      type="button"
                      onClick={() => setIsCalendarOpen((prev) => !prev)}
                      className="group flex items-center gap-1 rounded-full px-2 py-1 text-left shadow-sm transition-all hover:border-rose-800 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2 focus-visible:ring-offset-rose-50"
                      aria-expanded={isCalendarOpen}
                      aria-controls="records-calendar"
                    >
                      <span className="text-2xl sm:text-2xl font-bold text-slate-700">Mis Registros</span>
                      <span className="flex items-center gap-2">
                        <motion.span
                          animate={{ rotate: isCalendarOpen ? 180 : 0 }}
                          className="flex h-7 w-7 items-center justify-center rounded-full bg-rose-50 text-rose-400 shadow-inner"
                        >
                          <ChevronDown className="h-4 w-4" />
                        </motion.span>
                      </span>
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={openStartDateEditor}
                      className="border-pink-200 rounded-full text-pink-600 hover:bg-pink-500"
                      disabled={isProcessing || isUpdatingStartDate}
                      aria-label="Editar fecha de inicio"
                    >
                      <Edit className="h-4 w-4" />
                      <span className="sr-only">Editar fecha de inicio</span>
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      onClick={() => {
                        const fallbackIso = cycleDays.length ? cycleDays[0].isoDate : currentCycle.startDate;
                        const targetIso = selectedDate || fallbackIso || null;
                        setEditingRecord(null);
                        setDefaultFormIsoDate(targetIso);
                        hasUserSelectedDateRef.current = false;
                        if (targetIso) {
                          setSelectedDate(targetIso);
                          setExpandedIsoDate(null);
                        }
                        setShowForm(true);
                      }}
                      className="rounded-full bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white shadow-lg"
                      disabled={isProcessing}
                      style={{ filter: 'drop-shadow(0 6px 12px rgba(236, 72, 153, 0.3))' }}
                      aria-label="Añadir registro"
                    >
                      <Plus className="h-4 w-4" />
                      <span className="sr-only">Añadir registro</span>
                    </Button>
                  </div>
                </div>
              </motion.div>
            
            {showStartDateEditor && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
              >
                <CycleDatesEditor
                  cycle={currentCycle}
                  startDate={draftStartDate}
                  endDate={currentCycle.endDate}
                  onStartDateChange={(value) => setDraftStartDate(value)}
                  onSave={handleSaveStartDate}
                  onCancel={closeStartDateEditor}
                  isProcessing={isUpdatingStartDate}
                  dateError={startDateError}
                  includeEndDate={false}
                  showOverlapDialog={showOverlapDialog}
                  overlapCycle={overlapCycle}
                  onConfirmOverlap={handleConfirmOverlapStart}
                  onCancelOverlap={handleCancelOverlapStart}
                  onClearError={() => setStartDateError('')}
                  saveLabel="Guardar cambios"
                  title="Editar fecha de inicio"
                  description="Actualiza la fecha de inicio del ciclo actual. Los registros se reorganizarán automáticamente."
                />
              </motion.div>
            )}
            <AnimatePresence initial={false}>
              {isCalendarOpen && (
                <motion.div
                  key="records-calendar"
                  id="records-calendar"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3 }}
                  className="flex justify-center"
                >
                  <Calendar
                    mode="single"
                    locale={es}
                    defaultMonth={
                      selectedDate && isValid(parseISO(selectedDate))
                        ? parseISO(selectedDate)
                        : cycleRange?.to
                    }
                    selected={selectedDate && isValid(parseISO(selectedDate)) ? parseISO(selectedDate) : undefined}
                    onDayClick={handleCalendarSelect}
                    modifiers={calendarModifiers}
                    className="w-full max-w-xs sm:max-w-sm rounded-3xl bg-white/40 !p-2 sm:!p-2.5 mx-auto backdrop-blur-sm [&_button]:text-slate-900 [&_button:hover]:bg-rose-100 [&_button[aria-selected=true]]:bg-rose-400"
                    classNames={calendarClassNames}
                    modifiersClassNames={{
                      hasRecord:
                        "relative font-semibold after:absolute after:bottom-0.5 after:left-1/2 after:-translate-x-1/2 after:w-1.5 after:h-1.5 after:rounded-full after:bg-rose-400 after:content-['']",
                      outsideCycle: 'text-slate-300 opacity-50 hover:text-slate-300 hover:bg-transparent',
                      insideCycleNoRecord:
                        'text-slate-900 hover:text-slate-900 hover:bg-rose-50',
                    }}
                  />
                </motion.div>
              )}
            </AnimatePresence>
            </div>
            
          </div>
        </div>


        {/* Records List */}
        <div
          ref={recordsScrollRef}
          className="sticky overflow-y-auto overscroll-contain w-full max-w-4xl mx-auto"
          style={{
            top: boundaryPx,
            maxHeight: `calc(100dvh - ${boundaryPx}px - var(--bottom-nav-safe, 0px))`,
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="relative space-y-2 px-1.5 pt-2 pb-[calc(var(--bottom-nav-safe,0px))] sm:px-2 lg:px-4"
          >
         
          {cycleDays.length === 0 ? (
            <motion.div
              className="py-12 text-center"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="mx-auto max-w-md rounded-3xl border border-rose-100 bg-white/80 p-8 shadow-lg backdrop-blur-sm">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-rose-100 text-rose-500 shadow-inner">
                  <FileText className="h-8 w-8" />
                </div>
                <h3 className="text-lg font-semibold text-slate-700">Aún no hay días para mostrar</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Actualiza la fecha de inicio del ciclo o añade tu primer registro para comenzar a ver el historial.
                </p>
              </div>
            </motion.div>
          ) : (
            cycleDisplayItems.map((item) => {
              if (item.type === 'empty-group') {
                const { id, days } = item;
                if (!days.length) {
                  return null;
                }

                const newestDay = days[0];
                const oldestDay = days[days.length - 1];
                const rangeStartLabel = format(oldestDay.date, 'dd/MM', { locale: es });
                const rangeEndLabel = format(newestDay.date, 'dd/MM', { locale: es });
                const isExpandedGroup = expandedEmptyGroups.includes(id);
                const hasSelectedInGroup = selectedDate
                  ? days.some((day) => day.isoDate === selectedDate)
                  : false;

                return (
                  <motion.div key={id} layout className="space-y-2">
                    <EmptyGroupRow
                      id={id}
                      days={days}
                      toggleEmptyGroup={toggleEmptyGroup}
                      isExpandedGroup={isExpandedGroup}
                      hasSelectedInGroup={hasSelectedInGroup}
                      calendarContainerRef={calendarContainerRef}
                      isCalendarOpen={isCalendarOpen}
                      scrollMarginTop={calendarScrollMargin}
                      scrollContainerRef={recordsScrollRef}
                    >
                      <div className="flex items-center gap-2">
                        <CalendarDays className="h-4 w-4 text-rose-300" />
                        <span>{`${rangeStartLabel} --- ${rangeEndLabel} sin registro`}</span>
                      </div>
                      <motion.span
                        animate={{ rotate: isExpandedGroup ? 180 : 0 }}
                        className="rounded-2xl bg-rose-50 p-1 text-rose-400 shadow-inner"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </motion.span>
                    </EmptyGroupRow>
                    <AnimatePresence initial={false}>
                      {isExpandedGroup && (
                        <motion.div
                          key={`${id}-items`}
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2, ease: 'easeInOut' }}
                          className="space-y-2 pl-4 sm:pl-6"
                        >
                          {days.map(({ isoDate, date, cycleDay }) => {
                            const isSelectedDay = selectedDate === isoDate;
                            const displayDate = format(date, 'dd/MM/yyyy', { locale: es });
                            return (
                              <motion.button
                                key={isoDate}
                                type="button"
                                ref={registerDayRef(isoDate)}
                                onClick={() => handleAddRecordForDay(isoDate)}
                                className={`flex w-full items-center justify-between rounded-2xl border border-dashed border-rose-300 bg-white/40 px-4 py-3 text-sm font-medium text-slate-500 backdrop-blur-sm transition-all duration-200 hover:border-rose-500 hover:bg-white/70 ${
                                  isSelectedDay ? 'ring-2 ring-rose-300 text-rose-500 shadow-rose-200/70' : ''
                                }`}
                                whileHover={{ scale: 1.01 }}
                                whileTap={{ scale: 0.99 }}
                                style={{ scrollMarginTop: calendarScrollMargin }}
                              >
                                <div className="flex items-center gap-2">
                                  <CalendarDays className="h-4 w-4 text-rose-300" />
                                  <span>{`${displayDate} D${cycleDay} - Sin registro`}</span>
                                </div>
                                <span className="text-xs font-semibold uppercase tracking-wide text-rose-400">
                                  Añadir
                                </span>
                              </motion.button>
                            );
                          })}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              }

              const { isoDate, date, cycleDay, details } = item.day;
              const hasRecord = Boolean(details);
              const isSelected = selectedDate === isoDate;
              const isExpanded = hasRecord && expandedIsoDate === isoDate;
              const displayDate = format(date, 'dd/MM/yyyy', { locale: es });
              const symbolLabel = details?.symbolInfo?.label || '';
              
              if (!hasRecord) {
                return (
                  <motion.button
                    key={isoDate}
                    type="button"
                    ref={registerDayRef(isoDate)}
                    onClick={() => handleAddRecordForDay(isoDate)}
                    className={`flex w-full items-center justify-between rounded-2xl border border-dashed border-rose-300 bg-white/40 px-4 py-3 text-sm font-medium text-slate-500 backdrop-blur-sm transition-all duration-200 hover:border-rose-500 hover:bg-white/70 ${
                      isSelected ? 'ring-2 ring-rose-300 text-rose-500 shadow-rose-200/70' : ''
                    }`}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    style={{ scrollMarginTop: calendarScrollMargin }}
                  >
                    <div className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4 text-rose-300" />
                      <span>{`${displayDate} D${cycleDay} - Sin registro`}</span>
                    </div>
                    <span className="text-xs font-semibold uppercase tracking-wide text-rose-400">Añadir</span>
                  </motion.button>
                );
              }

              return (
                <RecordCard
                  key={isoDate}
                  isoDate={isoDate}
                  dayRef={registerDayRef(isoDate)}
                  onToggle={(date) => handleToggleRecord(date, true)}
                  isSelected={isSelected}
                  displayDate={displayDate}
                  cycleDay={cycleDay}
                  details={details}
                  symbolLabel={symbolLabel}
                  isExpanded={isExpanded}
                  onEdit={handleEdit}
                  onDelete={handleDeleteRequest}
                  isProcessing={isProcessing}
                  calendarContainerRef={calendarContainerRef}
                  isCalendarOpen={isCalendarOpen}
                  scrollMarginTop={calendarScrollMargin}
                  scrollContainerRef={recordsScrollRef}
                  onInlineEdit={(fieldName) => handleInlineEdit(details.record, fieldName)}
                />
              );
            })
          )}
        </motion.div>
        </div>
      </div>

      <Dialog
        open={showForm}
        onOpenChange={(open) => {
          if (open) {
            setShowForm(true);
          } else {
            handleCloseForm();
          }
        }}
      >
        <DialogContent hideClose className="bg-white border-pink-100 text-gray-800 w-[90vw] sm:w-auto max-w-md sm:max-w-lg md:max-w-xl max-h-[85vh] overflow-y-auto p-4 sm:p-6 rounded-2xl">
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
            defaultIsoDate={defaultFormIsoDate}
            focusedField={focusedField}
          />
        </DialogContent>
      </Dialog>

      <DeletionDialog
        isOpen={!!recordToDelete}
        onClose={() => setRecordToDelete(null)}
        onConfirm={confirmDelete}
        title="Eliminar registro"
        confirmLabel="Eliminar registro"
        description={
          recordToDelete
            ? `¿Estás seguro de que quieres eliminar el registro del ${format(parseISO(recordToDelete.isoDate), 'dd/MM/yyyy')}? Esta acción no se puede deshacer.`
            : ''
        }
        isProcessing={isProcessing}
      />
    </div>
  );
};

export default RecordsPage;