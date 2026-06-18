const normalizeIsoDate = (value) =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

export const normalizeFertileStartOverride = (override) => {
  const source = override?.fertileStart ?? override ?? null;
  const mode = source?.mode === 'manual' ? 'manual' : 'auto';

  return {
    mode,
    isoDate: normalizeIsoDate(source?.isoDate),
    updatedAt: typeof source?.updatedAt === 'string' ? source.updatedAt : null,
  };
};

export const createAutoFertileStartOverride = () => ({
  mode: 'auto',
  isoDate: null,
  updatedAt: new Date().toISOString(),
});

export const createManualFertileStartOverride = ({ isoDate }) => ({
  mode: 'manual',
  isoDate: normalizeIsoDate(isoDate),
  updatedAt: new Date().toISOString(),
});
