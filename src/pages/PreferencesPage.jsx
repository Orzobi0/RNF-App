import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useCycleData } from '@/hooks/useCycleData';
import { useFertilityCalculatorsEditor } from '@/hooks/useFertilityCalculatorsEditor';
import FertilityCalculatorsEditorDialogs from '@/components/FertilityCalculatorsEditorDialogs';
import {
  PREFERENCE_DEFAULTS,
  PREFERENCES_UI_FIELDS,
  buildPreferencesDiff,
  mergeFertilityStartConfig,
  normalizeStoredPreferences,
  validatePreferenceField,
  validatePreferences,
} from '@/lib/preferences';

const PreferencesPage = () => {
  const navigate = useNavigate();
  const { preferences, savePreferences } = useAuth();
  const { currentCycle, archivedCycles, setCycleIgnoreForAutoCalculations } = useCycleData();
  const { toast } = useToast();
  const normalizedPreferences = useMemo(() => normalizeStoredPreferences(preferences ?? PREFERENCE_DEFAULTS), [preferences]);
  const [draft, setDraft] = useState(normalizedPreferences);
  const [errors, setErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  const calculatorEditor = useFertilityCalculatorsEditor({ currentCycle, archivedCycles, setCycleIgnoreForAutoCalculations, toast });

  useEffect(() => {
    setDraft(normalizedPreferences);
    setErrors({});
  }, [normalizedPreferences]);

  const diff = useMemo(() => buildPreferencesDiff(normalizedPreferences, draft, PREFERENCES_UI_FIELDS), [draft, normalizedPreferences]);
  const hasChanges = Object.keys(diff).length > 0;

  const updateField = (key, value) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      const error = validatePreferenceField(key, value, { ...draft, [key]: value });
      if (error) next[key] = error; else delete next[key];
      return next;
    });
  };

  const updateFertilityCalculator = (calculatorKey, checked) => {
    const currentConfig = mergeFertilityStartConfig({ incoming: draft.fertilityStartConfig });
    updateField('fertilityStartConfig', {
      ...currentConfig,
      calculators: { ...currentConfig.calculators, [calculatorKey]: checked === true },
    });
  };

  const handleCancel = () => { setDraft(normalizedPreferences); setErrors({}); };
  const handleSave = async () => {
    const validationErrors = validatePreferences(draft);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0 || !hasChanges) return;
    setIsSaving(true);
    try { await savePreferences(diff); toast({ title: 'Preferencias guardadas' }); }
    catch (error) { toast({ title: 'No se pudieron guardar las preferencias', description: error?.message || 'Inténtalo de nuevo.', variant: 'destructive' }); }
    finally { setIsSaving(false); }
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 pb-24">
      <div className="mb-4 flex items-center gap-2">
        <Button asChild variant="ghost" size="icon"><Link to="/settings" aria-label="Volver a ajustes"><ChevronLeft className="h-5 w-5" /></Link></Button>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-700"><SlidersHorizontal className="h-6 w-6 text-fertiliapp-fuerte" />Preferencias</h1>
      </div>

      <div className="space-y-4">
        <section className="rounded-3xl bg-white/80 p-4 shadow">
          <h2 className="text-base font-semibold text-slate-700">Registro</h2>
          <div className="mt-3 space-y-2"><Label htmlFor="preferred-time">Hora preferida de temperatura</Label><Input id="preferred-time" type="time" value={draft.preferredTemperatureTime || ''} onChange={(event) => updateField('preferredTemperatureTime', event.target.value)} />{errors.preferredTemperatureTime && <p className="text-xs text-red-500">{errors.preferredTemperatureTime}</p>}</div>
        </section>

        <section className="rounded-3xl bg-white/80 p-4 shadow">
          <h2 className="text-base font-semibold text-slate-700">Cálculo (CPM / T-8)</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={calculatorEditor.handleOpenCpmDialog} className="rounded-xl border border-slate-200 bg-white p-3 text-left">
              <p className="text-xs text-slate-500">CPM</p>
              <p className="text-lg font-semibold text-slate-800">{calculatorEditor.cpmMetric?.finalFormatted ?? '—'}</p>
            </button>
            <button type="button" onClick={calculatorEditor.handleOpenT8Dialog} className="rounded-xl border border-slate-200 bg-white p-3 text-left">
              <p className="text-xs text-slate-500">T-8</p>
              <p className="text-lg font-semibold text-slate-800">{calculatorEditor.t8Metric?.finalFormatted ?? '—'}</p>
            </button>
          </div>
        </section>

        <section className="rounded-3xl bg-white/80 p-4 shadow">
          <h2 className="text-base font-semibold text-slate-700">Visualización del gráfico</h2>
          <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3"><div><p className="font-medium text-slate-700">Mostrar fila de relaciones</p></div><Checkbox checked={Boolean(draft.showRelationsRow)} onCheckedChange={(checked) => updateField('showRelationsRow', checked === true)} /></div>
        </section>

        <section className="rounded-3xl bg-white/80 p-4 shadow">
          <h2 className="text-base font-semibold text-slate-700">Inicio de fertilidad</h2>
          <div className="mt-3 space-y-3">
            <div className="flex items-center justify-between rounded-xl border border-slate-200 p-3"><Label htmlFor="pref-calc-cpm">Usar CPM</Label><Checkbox id="pref-calc-cpm" checked={Boolean(draft.fertilityStartConfig?.calculators?.cpm)} onCheckedChange={(checked) => updateFertilityCalculator('cpm', checked)} /></div>
            <div className="flex items-center justify-between rounded-xl border border-slate-200 p-3"><Label htmlFor="pref-calc-t8">Usar T-8</Label><Checkbox id="pref-calc-t8" checked={Boolean(draft.fertilityStartConfig?.calculators?.t8)} onCheckedChange={(checked) => updateFertilityCalculator('t8', checked)} /></div>
            {errors.fertilityStartConfig && <p className="text-xs text-red-500">{errors.fertilityStartConfig}</p>}
          </div>
        </section>
      </div>

      <div className="sticky bottom-0 mt-6 flex gap-2 bg-gradient-to-t from-pink-50 to-transparent py-3"><Button variant="outline" className="flex-1" onClick={handleCancel}>Cancelar</Button><Button className="flex-1" disabled={!hasChanges || isSaving} onClick={handleSave}>Guardar cambios</Button></div>

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
