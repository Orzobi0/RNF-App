import { measurementsFromRecord } from './temperatureMeasurements.js';

// Form editing needs a complete read, even when a partial array is available.
export async function loadFormMeasurements(record, cycleId, getMeasurements, timeoutMs = 15000) {
  if (!record?.id || String(record.id).startsWith('placeholder-')) return measurementsFromRecord(record);
  if (record.measurementsLoaded === true && record.measurementsComplete !== false) {
    return measurementsFromRecord(record);
  }
  let timer;
  try {
    const rows = await Promise.race([
      Promise.resolve().then(() => getMeasurements(cycleId, record.id, { requireComplete: true })),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('La carga ha tardado demasiado.')), timeoutMs);
      }),
    ]);
    return measurementsFromRecord(record, rows);
  } finally {
    clearTimeout(timer);
  }
}
