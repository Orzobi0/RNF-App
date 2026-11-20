// Public descriptive data only. Native bindings remain the sole BLE authority.
const textFields = new Set(['customName', 'commercialName', 'name', 'model', 'manufacturer', 'protocol', 'compatibility', 'firmware', 'software']);
const preferences = { volume: ['low', 'medium', 'high'], measurementMode: ['quick', 'normal', 'precise'], temperatureUnit: ['C', 'F'],
  automaticConsent: ['v2'], automationPromptVersion: ['v2'], incorporationMode: ['manual', 'automatic'], automationPrompt: ['shown', 'chosen'] };
export const sanitizeThermometerMetadata = values => Object.fromEntries(Object.entries(values ?? {}).filter(([field, value]) => {
  if (field === 'customName' && value === null) return true; // explicit removal, not unloaded
  if (textFields.has(field)) return typeof value === 'string' && value.trim().length > 0 && value.length <= (field === 'customName' ? 40 : 100)
    && !/(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}/i.test(value);
  if (preferences[field]) return preferences[field].includes(value);
  if (field === 'batteryLevel') return Number.isInteger(value) && value >= 0 && value <= 100;
  return ['batteryCheckedAt', 'infoCheckedAt'].includes(field) && Number.isFinite(value) && value > 0;
}));
export const mergeThermometerFields = (left = {}, right = {}) => {
  const result = {};
  for (const [key, field] of [...Object.entries(left), ...Object.entries(right)]) {
    if (!Object.hasOwn(sanitizeThermometerMetadata({ [key]: field?.value }), key) || !Number.isFinite(field.updatedAt) || typeof field.revision !== 'string') continue;
    const old = result[key];
    if (!old || field.updatedAt > old.updatedAt || (field.updatedAt === old.updatedAt && field.revision > old.revision)) result[key] = field;
  }
  return result;
};
export const thermometerMetadataValues = fields => Object.fromEntries(Object.entries(fields ?? {}).map(([key, field]) => [key, field.value]));

// Durable per-account outbox: Firestore transactions cannot run offline. Cache
// reads still use Firestore persistence; reconnect retries only outstanding edits.
export function createThermometerMetadataStore({ userId, storage, remote, changed, now = Date.now, uuid = () => crypto.randomUUID() }) {
  const key = `fertiliapp:thermometer-metadata:v1:${encodeURIComponent(userId)}`;
  let state = JSON.parse(storage.getItem(key) || '{"devices":{},"pending":{}}');
  let disposed = false, flushing = false, requested = false;
  const emit = error => { if (!disposed) changed({ devices: Object.fromEntries(Object.entries(state.devices).map(([id, fields]) => [id, thermometerMetadataValues(fields)])), error: error || null }); };
  const commit = next => { storage.setItem(key, JSON.stringify(next)); state = next; emit(); };
  const flush = async () => {
    if (disposed) return;
    if (flushing) { requested = true; return; }
    flushing = true; requested = false;
    let failed = false;
    try {
      for (const [id, sent] of Object.entries(state.pending)) {
        if (disposed) break;
        const merged = await remote.merge(id, sent);
        if (disposed) break;
        const remaining = Object.fromEntries(Object.entries(state.pending[id] ?? {}).filter(([field, value]) => value.revision !== sent[field]?.revision));
        const pending = { ...state.pending }; if (Object.keys(remaining).length) pending[id] = remaining; else delete pending[id];
        commit({ devices: { ...state.devices, [id]: mergeThermometerFields(mergeThermometerFields(state.devices[id], merged), remaining) }, pending });
      }
    } catch { failed = true; emit('Cambios conservados en este móvil. Se sincronizarán al recuperar la conexión.'); }
    finally { flushing = false; if (requested && !failed && !disposed) void flush(); }
  };
  emit();
  const unsubscribe = remote.subscribe((entries, fromServer = false) => {
    if (disposed) return;
    const devices = { ...state.devices };
    for (const [id, fields] of entries) devices[id] = mergeThermometerFields(devices[id], fields);
    try { commit({ ...state, devices }); if (fromServer && Object.keys(state.pending).length) void flush(); } catch { emit('No se pudieron conservar los metadatos en este móvil.'); }
  }, () => emit('No se pudieron consultar los nombres y ajustes sincronizados.'));
  return {
    // These choices need a server acknowledgement, unlike the ordinary offline outbox.
    chooseIncorporationMode: async (id, mode) => {
      if (disposed || !id || !preferences.incorporationMode.includes(mode)) throw new Error('Preferencia no disponible.');
      const fields = Object.fromEntries(Object.entries({ incorporationMode: mode, automationPrompt: 'chosen', automaticConsent: 'v2', automationPromptVersion: 'v2' }).map(([field, value]) =>
        [field, { value, updatedAt: Math.max(now(), (state.devices[id]?.[field]?.updatedAt ?? 0) + 1), revision: uuid() }]));
      const merged = await remote.merge(id, fields);
      if (disposed) throw new Error('La cuenta ha cambiado.');
      if (merged.incorporationMode?.value !== mode) throw new Error('La preferencia cambió en otro dispositivo.');
      commit({ ...state, devices: { ...state.devices, [id]: mergeThermometerFields(state.devices[id], merged) } });
    },
    claimAutomationPrompt: async id => {
      if (disposed || !id) return false;
      const fields = state.devices[id];
      const legacy = fields?.incorporationMode?.value === 'automatic' && fields?.automaticConsent?.value !== 'v2' && fields?.automationPromptVersion?.value !== 'v2';
      if (!legacy && (fields?.automationPrompt || fields?.incorporationMode)) return false;
      const result = await remote.claimAutomationPrompt(id, { value: 'shown', updatedAt: now(), revision: uuid() });
      if (disposed) return false;
      commit({ ...state, devices: { ...state.devices, [id]: mergeThermometerFields(state.devices[id], result.fields) } });
      return result.claimed === true;
    },
    get: id => thermometerMetadataValues(state.devices[id]),
    patch: (id, values, migration = false) => {
      if (disposed || !id) return;
      const current = state.devices[id] ?? {}, patch = {};
      for (const [field, value] of Object.entries(sanitizeThermometerMetadata(values))) {
        if ((migration && current[field]) || current[field]?.value === value) continue;
        patch[field] = { value, updatedAt: migration ? 0 : Math.max(now(), (current[field]?.updatedAt ?? 0) + 1), revision: uuid() };
      }
      if (!Object.keys(patch).length) return;
      commit({ devices: { ...state.devices, [id]: { ...current, ...patch } }, pending: { ...state.pending, [id]: { ...state.pending[id], ...patch } } });
      void flush();
    },
    flush,
    dispose: () => { disposed = true; unsubscribe(); },
  };
}
