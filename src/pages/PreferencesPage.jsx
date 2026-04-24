import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Calculator, ChevronLeft, Clock3, Heart, LineChart, Bolt, Trash2 } from 'lucide-react';
import useBackClose from '@/hooks/useBackClose';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useCycleData } from '@/hooks/useCycleData';
import { useFertilityCalculatorsEditor } from '@/hooks/useFertilityCalculatorsEditor';
import { cn } from '@/lib/utils';
import FertilityCalculatorsEditorDialogs from '@/components/FertilityCalculatorsEditorDialogs';
import {
  PREFERENCE_DEFAULTS,
  mergeFertilityStartConfig,
  normalizeStoredPreferences,
  validatePreferenceField,
} from '@/lib/preferences';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const SECTION_TITLE_CLASS =
  'mb-2.5 mt-1.5 flex items-center gap-1 px-0.5 text-[15px] font-semibold tracking-tight text-slate-700';
const getSectionAccentClasses = (tone = 'rose') => {
  switch (tone) {
    case 'warm':
      return {
        iconWrap: 'text-alerta-2',
        lineStyle: {
          backgroundImage:
            'linear-gradient(to right, rgba(246, 180, 92, 0.34), rgba(246, 180, 92, 0.10), transparent)',
        },
      };
    case 'cool':
      return {
        iconWrap: 'text-secundario-fuerte',
        lineStyle: {
          backgroundImage:
            'linear-gradient(to right, rgba(51, 124, 139, 0.30), rgba(51, 124, 139, 0.09), transparent)',
        },
      };
    case 'medium':
      return {
        iconWrap: 'text-fertiliapp-fuerte',
        lineStyle: {
          backgroundImage:
            'linear-gradient(to right, rgba(216, 92, 112, 0.28), rgba(216, 92, 112, 0.08), transparent)',
        },
      };
    case 'rose':
    default:
      return {
        iconWrap: 'text-rose-500',
        lineStyle: {
          backgroundImage:
            'linear-gradient(to right, rgba(227, 121, 136, 0.30), rgba(227, 121, 136, 0.08), transparent)',
        },
      };
  }
};

const getPreferenceIconToneClasses = (tone = 'rose') => {
  switch (tone) {
    case 'warm':
      return 'bg-temp-suave text-alerta-2';
    case 'cool':
      return 'bg-secundario-suave text-secundario-fuerte';
    case 'medium':
      return 'bg-rose-50 text-fertiliapp-fuerte';
    case 'rose':
    default:
      return 'bg-rose-50 text-rose-500';
  }
};

const normalizeModeMeta = (rawLabel) => {
  const value = String(rawLabel || '').trim().toLowerCase();

  if (value.includes('manual')) {
    return { label: 'Manual', tone: 'auto' };
  }

  if (value.includes('sin usar')) {
    return { label: 'Sin usar', tone: 'muted' };
  }

  return { label: 'Automático', tone: 'auto' };
};
const SectionHeader = ({ icon: Icon, title, tone = 'rose' }) => {
  const accent = getSectionAccentClasses(tone);

  return (
    <div className={SECTION_TITLE_CLASS}>
      {Icon ? (
        <span
          className={cn(
            'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
            accent.iconWrap
          )}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      ) : null}

      <span className="shrink-0 text-slate-700">{title}</span>

      <div
        className="ml-1.5 h-px flex-1 rounded-full"
        style={accent.lineStyle}
      />
    </div>
  );
};

const PREFERENCE_ROW_CLASS =
  'flex w-full items-center justify-between gap-3 rounded-[26px] border border-rose-100/70 bg-white/80 px-4 py-2.5 text-left shadow-sm backdrop-blur-sm transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60';

const PreferenceIcon = ({ icon: Icon, tone = 'rose' }) =>
  Icon ? (
    <span
      className={cn(
        'mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl',
        getPreferenceIconToneClasses(tone)
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </span>
  ) : null;

const PreferenceValuePill = ({ children }) => (
  <span className="inline-flex h-8 min-w-[74px] shrink-0 items-center justify-center rounded-full border border-rose-100/70 bg-white/90 px-3 text-sm font-semibold tabular-nums text-rose-700">
    {children}
  </span>
);

const PreferenceActionRow = ({
  icon,
  title,
  description,
  onClick,
  trailing = null,
  headerTrailing = null,
  ariaLabel,
  disabled = false,
  children,
  iconTone = 'rose',
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={ariaLabel ?? title}
    disabled={disabled}
    className={PREFERENCE_ROW_CLASS}
  >
    <div className="flex min-w-0 flex-1 items-start gap-3">
      <PreferenceIcon icon={icon} tone={iconTone} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-base font-semibold text-slate-700">{title}</p>
          {headerTrailing ? <div className="shrink-0">{headerTrailing}</div> : null}
        </div>

        {description ? <p className="mt-0.5 text-sm text-slate-500">{description}</p> : null}
        {children ? <div className={description ? 'mt-2' : 'mt-1'}>{children}</div> : null}
      </div>
    </div>

    {trailing ? <div className="shrink-0">{trailing}</div> : null}
  </button>
);

const PreferenceInlineSwitchRow = ({
  title,
  checked,
  onChange,
  disabled = false,
  id,
}) => (
  <button
    id={id}
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={() => {
      if (disabled) return;
      onChange(!checked);
    }}
    className="flex w-full items-center justify-between gap-3 px-0 py-0 text-left transition disabled:cursor-not-allowed disabled:opacity-60"
  >
    <p className="text-sm font-medium leading-tight text-slate-700">{title}</p>

    <span
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${
        checked ? 'bg-rose-400' : 'bg-slate-300'
      }`}
      aria-hidden="true"
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </span>
  </button>
);
const PreferenceModeChip = ({ label, tone = 'manual' }) => (
  <span
    className={cn(
      'inline-flex h-6 items-center rounded-full border px-2.5 text-[11px] font-semibold',
      tone === 'manual' && 'border-rose-200 bg-rose-50 text-rose-700',
      tone === 'auto' && 'border-secundario-suave bg-secundario-suave text-secundario-fuerte',
      tone === 'muted' && 'border-slate-200 bg-white/90 text-slate-700'
    )}
  >
    {label}
  </span>
);

const PreferenceMetricGrid = ({ items, valueTone = 'rose' }) => (
  <div className="grid grid-cols-2 gap-2">
    {items.map((item) => (
      <div
        key={item.label}
        className="rounded-xl border border-rose-100/70 bg-white/90 px-3 py-1.5"
      >
        <p className="text-[10px] font-medium leading-none text-slate-500">
          {item.label}
        </p>
        <p
          className={cn(
            'mt-1 text-lg font-semibold leading-none tabular-nums',
            valueTone === 'cool' ? 'text-secundario-fuerte' : 'text-rose-700'
          )}
        >
          {item.value}
        </p>
      </div>
    ))}
  </div>
);
const CalculatorPreferenceCard = ({
  title,
  modeLabel,
  modeTone = 'accent',
  metrics,
  onEdit,
  editAriaLabel,
  switchTitle,
  checked,
  onToggle,
  toggleId,
  disabled = false,
}) => (
  <div
    className={`rounded-[24px] border border-rose-100/70 bg-white/80 px-4 py-2.5 shadow-sm backdrop-blur-sm ${
      disabled ? 'opacity-60' : ''
    }`}
  >
    <button
      type="button"
      onClick={onEdit}
      disabled={disabled}
      aria-label={editAriaLabel ?? `Editar ${title}`}
      className="block w-full text-left disabled:cursor-not-allowed"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-base font-semibold text-slate-700">{title}</p>
        <PreferenceModeChip label={modeLabel} tone={modeTone} />
      </div>

      <div className="mt-2">
        <PreferenceMetricGrid items={metrics} valueTone="cool" />
      </div>
    </button>

    <div className="mt-2 border-t border-rose-100/70 pt-2">
      <PreferenceInlineSwitchRow
        title={switchTitle}
        checked={checked}
        onChange={onToggle}
        id={toggleId}
        disabled={disabled}
      />
    </div>
  </div>
);
const PreferenceSwitchRow = ({
  icon,
  title,
  description,
  checked,
  onChange,
  disabled = false,
  id,
  iconTone = 'rose',
}) => (
  <button
    id={id}
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={() => {
      if (disabled) return;
      onChange(!checked);
    }}
    className={PREFERENCE_ROW_CLASS}
  >
    <div className="flex min-w-0 items-start gap-3">
      <PreferenceIcon icon={icon} tone={iconTone} />
      <div className="min-w-0">
        <p className="text-base font-semibold text-slate-700">{title}</p>
        {description ? <p className="mt-0.5 text-sm text-slate-500">{description}</p> : null}
      </div>
    </div>

    <span
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${
        checked ? 'bg-rose-400' : 'bg-slate-300'
      }`}
      aria-hidden="true"
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </span>
  </button>
);


const PreferencesPage = () => {
  const navigate = useNavigate();
  const { preferences, savePreferences } = useAuth();
  const { currentCycle, archivedCycles, setCycleIgnoreForAutoCalculations } = useCycleData();
  const { toast } = useToast();
  
  const normalizedPreferences = useMemo(
    () => normalizeStoredPreferences(preferences ?? PREFERENCE_DEFAULTS),
    [preferences],
  );

  const [uiPreferences, setUiPreferences] = useState(normalizedPreferences);
  const [errors, setErrors] = useState({});
  const [savingKeys, setSavingKeys] = useState({});
  const [isPreferredTimeEditorOpen, setIsPreferredTimeEditorOpen] = useState(false);
  const [preferredTimeDraft, setPreferredTimeDraft] = useState(normalizedPreferences.preferredTemperatureTime || '');
  const lastToastAtRef = useRef({});

  const calculatorEditor = useFertilityCalculatorsEditor({
    currentCycle,
    archivedCycles,
    setCycleIgnoreForAutoCalculations,
    toast,
  });

  const cpmMetrics = [
  {
    label: 'Ciclo más corto',
    value: calculatorEditor.cpmMetric?.baseFormatted ?? '—',
  },
  {
    label: 'CPM',
    value: calculatorEditor.cpmMetric?.finalFormatted ?? '—',
  },
];

const t8Metrics = [
  {
    label: 'Día de subida',
    value: calculatorEditor.t8Metric?.baseFormatted ?? '—',
  },
  {
    label: 'T-8',
    value: calculatorEditor.t8Metric?.finalFormatted ?? '—',
  },
];

const cpmMode = normalizeModeMeta(calculatorEditor.cpmMetric?.modeLabel);
const t8Mode = normalizeModeMeta(calculatorEditor.t8Metric?.modeLabel);


  useEffect(() => {
  setUiPreferences(normalizedPreferences);
  setPreferredTimeDraft(normalizedPreferences.preferredTemperatureTime || '');
  setIsPreferredTimeEditorOpen(false);
  setErrors({});
}, [normalizedPreferences]);

  const maybeToastSaved = useCallback(
    (toastKey, title) => {
      const now = Date.now();
      const last = lastToastAtRef.current[toastKey] ?? 0;
      if (now - last < 900) return;
      lastToastAtRef.current[toastKey] = now;
      toast({ title });
    },
    [toast],
  );

  const persistPatch = useCallback(
    async ({ key, patch, optimisticState, successTitle = 'Preferencia guardada', errorTitle = 'No se pudo guardar la preferencia' }) => {
      if (!savePreferences) return;

  setSavingKeys((prev) => ({ ...prev, [key]: true }));
      const previous = uiPreferences;
      setUiPreferences((prev) => ({ ...prev, ...optimisticState }));

      try {
        await savePreferences(patch);
        maybeToastSaved(key, successTitle);
      } catch (error) {
        setUiPreferences(previous);
        toast({
          title: errorTitle,
          description: error?.message || 'Inténtalo de nuevo.',
          variant: 'destructive',
        });
      } finally {
        setSavingKeys((prev) => ({ ...prev, [key]: false }));
      }
    },
    [maybeToastSaved, savePreferences, toast, uiPreferences],
  );

  const handleSimpleFieldChange = useCallback(
    async ({ key, value, successTitle, errorTitle }) => {
      const validationError = validatePreferenceField(key, value, { ...uiPreferences, [key]: value });
      setErrors((prev) => {
        const next = { ...prev };
        if (validationError) next[key] = validationError;
        else delete next[key];
        return next;
      });
      if (validationError) return;
      if (normalizedPreferences[key] === value) return;

      await persistPatch({
        key,
        patch: { [key]: value },
        optimisticState: { [key]: value },
        successTitle,
        errorTitle,
      });
    },
    [normalizedPreferences, persistPatch, uiPreferences],
  );

  const openPreferredTimeEditor = useCallback(() => {
  setPreferredTimeDraft(uiPreferences.preferredTemperatureTime || '');
  setErrors((prev) => {
    const next = { ...prev };
    delete next.preferredTemperatureTime;
    return next;
  });
  setIsPreferredTimeEditorOpen(true);
}, [uiPreferences.preferredTemperatureTime]);

const closePreferredTimeEditor = useCallback(() => {
  setPreferredTimeDraft(uiPreferences.preferredTemperatureTime || '');
  setErrors((prev) => {
    const next = { ...prev };
    delete next.preferredTemperatureTime;
    return next;
  });
  setIsPreferredTimeEditorOpen(false);
}, [uiPreferences.preferredTemperatureTime]);

useBackClose(isPreferredTimeEditorOpen, closePreferredTimeEditor);

const handleSavePreferredTime = useCallback(async () => {
  const nextValue = preferredTimeDraft || '';

  const validationError = validatePreferenceField('preferredTemperatureTime', nextValue, {
    ...uiPreferences,
    preferredTemperatureTime: nextValue,
  });

  setErrors((prev) => {
    const next = { ...prev };
    if (validationError) next.preferredTemperatureTime = validationError;
    else delete next.preferredTemperatureTime;
    return next;
  });

  if (validationError) return;

  if (normalizedPreferences.preferredTemperatureTime === nextValue) {
    setIsPreferredTimeEditorOpen(false);
    return;
  }

  await persistPatch({
    key: 'preferredTemperatureTime',
    patch: { preferredTemperatureTime: nextValue },
    optimisticState: { preferredTemperatureTime: nextValue },
    successTitle: nextValue ? 'Hora actualizada' : 'Hora eliminada',
    errorTitle: nextValue ? 'No se pudo actualizar la hora' : 'No se pudo eliminar la hora',
  });

  setIsPreferredTimeEditorOpen(false);
}, [normalizedPreferences.preferredTemperatureTime, persistPatch, preferredTimeDraft, uiPreferences]);

const handleClearPreferredTime = useCallback(async () => {
  if (!uiPreferences.preferredTemperatureTime) {
    setPreferredTimeDraft('');
    return;
  }

  setPreferredTimeDraft('');
  setErrors((prev) => {
    const next = { ...prev };
    delete next.preferredTemperatureTime;
    return next;
  });

  await persistPatch({
    key: 'preferredTemperatureTime',
    patch: { preferredTemperatureTime: '' },
    optimisticState: { preferredTemperatureTime: '' },
    successTitle: 'Hora eliminada',
    errorTitle: 'No se pudo eliminar la hora',
  });

  setIsPreferredTimeEditorOpen(false);
}, [persistPatch, uiPreferences.preferredTemperatureTime]);

  const handleFertilityCalculatorToggle = useCallback(
    async (calculatorKey, checked) => {
      const nextConfig = mergeFertilityStartConfig({
        incoming: {
          ...uiPreferences.fertilityStartConfig,
          calculators: {
            ...uiPreferences.fertilityStartConfig?.calculators,
            [calculatorKey]: checked,
          },
        },
      });

      const validationError = validatePreferenceField('fertilityStartConfig', nextConfig, {
        ...uiPreferences,
        fertilityStartConfig: nextConfig,
      });

      if (validationError) {
        setErrors((prev) => ({ ...prev, fertilityStartConfig: validationError }));
        return;
      }

      setErrors((prev) => {
        const next = { ...prev };
        delete next.fertilityStartConfig;
        return next;
      });

      if (JSON.stringify(normalizedPreferences.fertilityStartConfig) === JSON.stringify(nextConfig)) return;

      await persistPatch({
        key: 'fertilityStartConfig',
        patch: { fertilityStartConfig: nextConfig },
        optimisticState: { fertilityStartConfig: nextConfig },
        successTitle: 'Configuración actualizada',
        errorTitle: 'No se pudo actualizar la configuración',
      });
    },
    [normalizedPreferences.fertilityStartConfig, persistPatch, uiPreferences],
  );

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <div className="mb-5">
  <div className="flex items-center gap-1">
    <Button asChild variant="ghost" size="icon" className="-ml-2 text-slate-600 hover:bg-white/50">
      <Link to="/settings" aria-label="Volver a ajustes">
        <ChevronLeft className="h-5 w-5" />
      </Link>
    </Button>
    <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-700">
      <Bolt className="h-6 w-6 text-[#3a8a6e]" />
      Preferencias
    </h1>
  </div>

  <div className="mt-3 h-px w-full bg-rose-800/70" />
</div>

      <div className="space-y-4">
  <section className="space-y-2.5">
    <SectionHeader icon={Clock3} title="Registro" tone="warm" />

    <PreferenceActionRow
  icon={Clock3}
  iconTone="warm"
  title="Hora de toma de temperatura"
  trailing={
    <PreferenceValuePill>
      {uiPreferences.preferredTemperatureTime || '--:--'}
    </PreferenceValuePill>
  }
  onClick={openPreferredTimeEditor}
  ariaLabel="Editar hora de toma de temperatura"
  disabled={Boolean(savingKeys.preferredTemperatureTime)}
/>

    {errors.preferredTemperatureTime ? (
      <p className="px-1 text-xs text-red-500">{errors.preferredTemperatureTime}</p>
    ) : null}
  </section>

  <section className="space-y-2">
  <SectionHeader icon={Calculator} title="Cálculo" tone="cool" />

  <CalculatorPreferenceCard
  title="CPM"
  modeLabel={cpmMode.label}
modeTone={cpmMode.tone}
metrics={cpmMetrics}
  onEdit={calculatorEditor.handleOpenCpmDialog}
  editAriaLabel="Editar CPM"
  switchTitle="Usar CPM para inicio de fertilidad"
  checked={Boolean(uiPreferences.fertilityStartConfig?.calculators?.cpm)}
  onToggle={(checked) => handleFertilityCalculatorToggle('cpm', checked)}
  toggleId="toggle-use-cpm"
  disabled={Boolean(savingKeys.fertilityStartConfig)}
/>

<CalculatorPreferenceCard
  title="T-8"
  modeLabel={t8Mode.label}
modeTone={t8Mode.tone}
metrics={t8Metrics}
  onEdit={calculatorEditor.handleOpenT8Dialog}
  editAriaLabel="Editar T-8"
  switchTitle="Usar T-8 para inicio de fertilidad"
  checked={Boolean(uiPreferences.fertilityStartConfig?.calculators?.t8)}
  onToggle={(checked) => handleFertilityCalculatorToggle('t8', checked)}
  toggleId="toggle-use-t8"
  disabled={Boolean(savingKeys.fertilityStartConfig)}
/>

    {errors.fertilityStartConfig ? (
      <p className="px-1 text-xs text-red-500">{errors.fertilityStartConfig}</p>
    ) : null}
  </section>

  <section className="space-y-2.5">
    <SectionHeader icon={LineChart} title="Gráfica" tone="medium" />

    <PreferenceSwitchRow
      icon={Heart}
      iconTone="medium"
      title="Mostrar relaciones"
      description="Mostrar relaciones en la gráfica"
      checked={Boolean(uiPreferences.showRelationsRow)}
      onChange={(checked) =>
        handleSimpleFieldChange({
          key: 'showRelationsRow',
          value: checked,
          successTitle: 'Preferencia guardada',
          errorTitle: 'No se pudo actualizar la gráfica',
        })
      }
      disabled={Boolean(savingKeys.showRelationsRow)}
      id="toggle-show-rs-row"
    />
  </section>
</div>

<Dialog
  open={isPreferredTimeEditorOpen}
  onOpenChange={(open) => {
    if (!open) {
      closePreferredTimeEditor();
      return;
    }
    setIsPreferredTimeEditorOpen(true);
  }}
>
  <DialogContent className="sm:max-w-md">
    <DialogHeader>
      <DialogTitle>Hora de toma de temperatura</DialogTitle>
      <DialogDescription>
        Define una hora preferida para el registro.
      </DialogDescription>
    </DialogHeader>

    <div className="space-y-2">
      <Input
        id="preferred-time"
        type="time"
        value={preferredTimeDraft}
        onChange={(event) => setPreferredTimeDraft(event.target.value)}
        disabled={Boolean(savingKeys.preferredTemperatureTime)}
        className="h-10 rounded-2xl border-rose-200 bg-white/90 text-base font-semibold text-slate-700"
        aria-label="Hora de toma de temperatura"
      />

      {errors.preferredTemperatureTime ? (
        <p className="text-xs text-red-500">{errors.preferredTemperatureTime}</p>
      ) : null}
    </div>

    <DialogFooter className="flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="w-full sm:w-auto">
        {Boolean(uiPreferences.preferredTemperatureTime) ? (
          <Button
            type="button"
            variant="ghost"
            onClick={handleClearPreferredTime}
            disabled={Boolean(savingKeys.preferredTemperatureTime)}
            className="w-full justify-center text-rose-700 hover:bg-rose-100 sm:w-auto"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Eliminar hora
          </Button>
        ) : null}
      </div>

      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
        <Button
          type="button"
          variant="outline"
          onClick={closePreferredTimeEditor}
          disabled={Boolean(savingKeys.preferredTemperatureTime)}
          className="w-full sm:w-auto"
        >
          Cancelar
        </Button>
        <Button
          type="button"
          onClick={handleSavePreferredTime}
          disabled={Boolean(savingKeys.preferredTemperatureTime) || !preferredTimeDraft}
          className="w-full sm:w-auto"
        >
          Guardar
        </Button>
      </div>
    </DialogFooter>
  </DialogContent>
</Dialog>
      <FertilityCalculatorsEditorDialogs
        editor={calculatorEditor}
        onNavigateToCycleDetails={(cycle) => {
          const cycleId = cycle?.cycleId || cycle?.id;
          if (!cycleId) return;
          if (currentCycle?.id && cycleId === currentCycle.id) {
            navigate('/');
            return;
          }
          navigate(`/cycle/${cycleId}`);
        }}
      />
    </div>
  );
};

export default PreferencesPage;
