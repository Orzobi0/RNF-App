import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Calculator, ChevronLeft, Clock3, Heart, LineChart, Pencil, Bolt, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useCycleData } from '@/hooks/useCycleData';
import { useFertilityCalculatorsEditor } from '@/hooks/useFertilityCalculatorsEditor';
import FertilityCalculatorsEditorDialogs from '@/components/FertilityCalculatorsEditorDialogs';
import {
  PREFERENCE_DEFAULTS,
  mergeFertilityStartConfig,
  normalizeStoredPreferences,
  validatePreferenceField,
} from '@/lib/preferences';

const SECTION_TITLE_CLASS = 'mb-3 flex items-center gap-2 text-base font-semibold tracking-tight text-rose-700';

const SectionHeader = ({ icon: Icon, title }) => (
  <h2 className={SECTION_TITLE_CLASS}>
    {Icon ? <Icon className="h-4 w-4 text-rose-500" aria-hidden="true" /> : null}
    {title}
  </h2>
);

const SettingsToggleRow = ({
  title,
  description,
  checked,
  onChange,
  disabled = false,
  className = '',
  icon: Icon,
  id,
}) => {
  const handleToggle = () => {
    if (disabled) return;
    onChange(!checked);
  };

  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={handleToggle}
      className={`flex w-full items-center justify-between gap-3 rounded-xl border border-rose-100/70 bg-white/50 px-3 py-2.5 text-left shadow-sm backdrop-blur-sm transition hover:bg-white/70 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-medium text-slate-700">
          {Icon ? <Icon className="h-4 w-4 text-rose-500" aria-hidden="true" /> : null}
          <span>{title}</span>
        </p>
        {description ? <p className="mt-1 text-xs text-slate-500">{description}</p> : null}
      </div>

      <span
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${checked ? 'bg-rose-400' : 'bg-slate-300'}`}
        aria-hidden="true"
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition ${checked ? 'translate-x-5' : 'translate-x-0.5'}`}
        />
      </span>
    </button>
  );
};
const InlineSwitchRow = ({
  title,
  checked,
  onChange,
  disabled = false,
  id,
}) => {
  const handleToggle = () => {
    if (disabled) return;
    onChange(!checked);
  };

  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={handleToggle}
      className="flex w-full items-center justify-between gap-3 rounded-none bg-transparent px-0 py-1 text-left transition disabled:cursor-not-allowed disabled:opacity-60"
    >
      <p className="text-sm font-medium text-slate-700">{title}</p>

      <span
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${checked ? 'bg-rose-400' : 'bg-slate-300'}`}
        aria-hidden="true"
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition ${checked ? 'translate-x-5' : 'translate-x-0.5'}`}
        />
      </span>
    </button>
  );
};
const CalculatorPreferenceBlock = ({
  title,
  primaryLabel,
  primaryValue,
  secondaryLabel,
  secondaryValue,
  secondaryModeLabel,
  onEdit,
  editAriaLabel,
  toggleTitle,
  toggleChecked,
  onToggle,
  toggleId,
  disabled = false,
}) => {
  const displayPrimaryValue =
    primaryValue === null || primaryValue === undefined || primaryValue === ''
      ? '—'
      : primaryValue;

  const displaySecondaryValue =
    secondaryValue === null || secondaryValue === undefined || secondaryValue === ''
      ? '—'
      : secondaryValue;

  return (
    <div className="rounded-2xl border border-rose-100/70 bg-white/45 p-3 shadow-sm backdrop-blur-sm">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onEdit}
          aria-label={editAriaLabel}
          className="h-8 w-8 rounded-full text-rose-600 hover:bg-rose-100 hover:text-rose-700"
          title="Editar"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="mt-1 grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-rose-100/70 bg-white/75 px-3 py-2">
          <p className="text-[11px] font-medium text-slate-500">{primaryLabel}</p>
          <p className="mt-1 text-lg font-semibold leading-none tabular-nums text-rose-700">
            {displayPrimaryValue}
          </p>
        </div>

        <div className="rounded-xl border border-rose-100/70 bg-white/75 px-3 py-2">
          <div className="flex items-center gap-2">
            <p className="text-[11px] font-medium text-slate-500">{secondaryLabel}</p>
            {secondaryModeLabel ? (
              <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-rose-600">
                {secondaryModeLabel}
              </span>
            ) : null}
          </div>

          <p className="mt-1 text-lg font-semibold leading-none tabular-nums text-rose-700">
            {displaySecondaryValue}
          </p>
        </div>
      </div>

      <div className="mt-2 border-t border-rose-100/70 pt-2">
        <InlineSwitchRow
          id={toggleId}
          title={toggleTitle}
          checked={toggleChecked}
          onChange={onToggle}
          disabled={disabled}
        />
      </div>
    </div>
  );
};
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
      <div className="mb-6 flex items-center gap-1">
        <Button asChild variant="ghost" size="icon">
          <Link to="/settings" aria-label="Volver a ajustes">
            <ChevronLeft className="h-5 w-5" />
          </Link>
        </Button>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-700">
          <Bolt className="h-6 w-6 text-fertiliapp-fuerte" />
          Preferencias
        </h1>
      </div>

      <div className="space-y-5">
        <section>
  <SectionHeader icon={Clock3} title="Registro" />

  <div className="rounded-2xl border border-rose-100/70 bg-white/50 p-3 shadow-sm backdrop-blur-sm">
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-700">
          Hora de toma de temperatura
        </p>
      </div>

      <div className="flex items-center gap-2">
        <span className="inline-flex h-9 min-w-[96px] items-center justify-center gap-2 rounded-full border border-rose-100/70 bg-white/85 px-3 text-sm font-semibold tabular-nums text-rose-700">
          <Clock3 className="h-4 w-4 shrink-0 text-rose-500" aria-hidden="true" />
          <span>{uiPreferences.preferredTemperatureTime || '--:--'}</span>
        </span>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={openPreferredTimeEditor}
          disabled={Boolean(savingKeys.preferredTemperatureTime)}
          className="h-8 w-8 rounded-full text-rose-600 hover:bg-rose-100 hover:text-rose-700"
          aria-label="Editar hora de toma de temperatura"
          title="Editar hora"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>

    {isPreferredTimeEditorOpen && (
      <div className="mt-3 border-t border-rose-100/70 pt-3">
        <div className="grid grid-cols-[110px_auto_auto_auto] items-center gap-2">
          <Input
            id="preferred-time"
            type="time"
            value={preferredTimeDraft}
            onChange={(event) => setPreferredTimeDraft(event.target.value)}
            disabled={Boolean(savingKeys.preferredTemperatureTime)}
            className="h-8 min-w-0 rounded-xl border-rose-200 bg-white/90 px-3 text-sm font-semibold text-slate-700"
            aria-label="Hora de toma de temperatura"
          />

          <Button
            type="button"
            onClick={handleSavePreferredTime}
            disabled={Boolean(savingKeys.preferredTemperatureTime) || !preferredTimeDraft}
            className="h-8 rounded-full bg-rose-600 px-3 text-[11px] font-semibold text-white hover:bg-rose-700"
          >
            Guardar
          </Button>

          <Button
            type="button"
            variant="ghost"
            onClick={closePreferredTimeEditor}
            disabled={Boolean(savingKeys.preferredTemperatureTime)}
            className="h-8 rounded-full px-3 text-[11px] font-semibold text-rose-700 hover:bg-rose-100"
          >
            Cancelar
          </Button>

          {Boolean(uiPreferences.preferredTemperatureTime) ? (
            <Button
              type="button"
              variant="ghost"
              onClick={handleClearPreferredTime}
              disabled={Boolean(savingKeys.preferredTemperatureTime)}
              className="h-8 w-8 rounded-full p-0 text-rose-600 hover:bg-rose-100 hover:text-rose-700"
              aria-label="Eliminar hora preferida"
              title="Eliminar hora preferida"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : (
            <div className="h-8 w-8" />
          )}
        </div>

        {errors.preferredTemperatureTime ? (
          <p className="mt-2 text-xs text-red-500">{errors.preferredTemperatureTime}</p>
        ) : null}
      </div>
    )}
  </div>
</section>

    <section>
  <SectionHeader icon={Calculator} title="Cálculo" />

  <div className="space-y-3">
    <CalculatorPreferenceBlock
      title="CPM"
      primaryLabel="Ciclo más corto"
      primaryValue={calculatorEditor.cpmMetric?.baseFormatted ?? '—'}
      secondaryLabel="CPM"
      secondaryValue={calculatorEditor.cpmMetric?.finalFormatted ?? '—'}
      secondaryModeLabel={calculatorEditor.cpmMetric?.modeLabel ?? 'Auto'}
      onEdit={calculatorEditor.handleOpenCpmDialog}
      editAriaLabel="Editar CPM"
      toggleTitle="Usar CPM para inicio de fertilidad"
      toggleChecked={Boolean(uiPreferences.fertilityStartConfig?.calculators?.cpm)}
      onToggle={(checked) => handleFertilityCalculatorToggle('cpm', checked)}
      toggleId="toggle-use-cpm"
      disabled={Boolean(savingKeys.fertilityStartConfig)}
    />

    <CalculatorPreferenceBlock
      title="T-8"
      primaryLabel="Día de subida"
      primaryValue={calculatorEditor.t8Metric?.baseFormatted ?? '—'}
      secondaryLabel="T-8"
      secondaryValue={calculatorEditor.t8Metric?.finalFormatted ?? '—'}
      secondaryModeLabel={calculatorEditor.t8Metric?.modeLabel ?? 'Auto'}
      onEdit={calculatorEditor.handleOpenT8Dialog}
      editAriaLabel="Editar T-8"
      toggleTitle="Usar T-8 para inicio de fertilidad"
      toggleChecked={Boolean(uiPreferences.fertilityStartConfig?.calculators?.t8)}
      onToggle={(checked) => handleFertilityCalculatorToggle('t8', checked)}
      toggleId="toggle-use-t8"
      disabled={Boolean(savingKeys.fertilityStartConfig)}
    />

    {errors.fertilityStartConfig ? (
      <p className="px-1 text-xs text-red-500">{errors.fertilityStartConfig}</p>
    ) : null}
  </div>
</section>

      <section>
          <SectionHeader icon={LineChart} title="Gráfica" />
          <SettingsToggleRow
  title="Fila RS"
  description="Mostrar relaciones en la gráfica"
  icon={Heart}
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
