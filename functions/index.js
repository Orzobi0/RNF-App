const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");

admin.initializeApp();
const db = admin.firestore();

const sanitizeDocId = (s) =>
  String(s)
    .trim()
    // Firestore doc ids: evitamos chars problemáticos
    .replace(/[\/\?#\[\]]/g, "_")
    .slice(0, 900);

const normalizeCelsius = (v) => {
  if (v == null) return null;
  let num = typeof v === "number" ? v : Number(String(v).replace(",", ".").trim());
  if (Number.isNaN(num)) return null;

  // Si llega Fahrenheit por error
  if (num > 80 && num < 120) num = (num - 32) / 1.8;

  // Rango razonable BBT
  if (num < 30 || num > 45) return null;

  return Number(num.toFixed(2));
};

// Callable para Health Connect
exports.syncBasalBodyTemperature = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError("unauthenticated", "Debes estar autenticada.");
  }

  const uid = context.auth.uid;
  const cycleId = typeof data?.cycleId === "string" ? data.cycleId.trim() : "";
  const items = Array.isArray(data?.items) ? data.items : [];

  if (!cycleId) {
    throw new functions.https.HttpsError("invalid-argument", "cycleId es obligatorio.");
  }
  if (items.length > 500) {
    throw new functions.https.HttpsError("invalid-argument", "Máximo 500 mediciones por sincronización.");
  }

  // Verificar ciclo actual (end_date == null)
  const cycleRef = db.doc(`users/${uid}/cycles/${cycleId}`);
  const cycleSnap = await cycleRef.get();
  if (!cycleSnap.exists) {
    throw new functions.https.HttpsError("not-found", "Ciclo no encontrado.");
  }

  const cycle = cycleSnap.data() || {};
  const endDate = cycle.end_date;
  const isCurrent = endDate === null || endDate === undefined || endDate === "";
  if (!isCurrent) {
    throw new functions.https.HttpsError("failed-precondition", "Solo se permite sincronizar el ciclo actual.");
  }

  const startDate = typeof cycle.start_date === "string" ? cycle.start_date : null;

  // Agrupar por día (1 entry por día)
  const byDate = new Map(); // localDate -> array items
  const rejectedItems = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i] || {};

    const timestampMs = typeof it.timestampMs === "number" ? it.timestampMs : null;
    const temperatureC = normalizeCelsius(it.temperatureC);
    const localDate = typeof it.localDate === "string" ? it.localDate.trim() : "";
    const externalIdRaw = typeof it.externalId === "string" ? it.externalId.trim() : "";
    const timeLocal = typeof it.time === "string" ? it.time.trim() : null; // "HH:mm" (mejor desde el móvil)
    const dataOrigin = typeof it.dataOrigin === "string" ? it.dataOrigin : null;

    if (!timestampMs || temperatureC == null || !localDate) {
      rejectedItems.push({ index: i, error: "INVALID_ITEM" });
      continue;
    }

    // Filtrar fuera del ciclo actual (por fecha local)
    if (startDate && localDate < startDate) {
      rejectedItems.push({ index: i, error: "OUTSIDE_CURRENT_CYCLE" });
      continue;
    }

    const arr = byDate.get(localDate) || [];
    arr.push({
      index: i,
      timestampMs,
      timestamp: typeof it.timestamp === "string" && it.timestamp ? it.timestamp : new Date(timestampMs).toISOString(),
      temperatureC,
      localDate,
      externalIdRaw,
      timeLocal,
      dataOrigin,
    });
    byDate.set(localDate, arr);
  }

  let createdDays = 0;
  let createdMeasurements = 0;
  let skippedMeasurements = 0;

  const results = [];

  // Para determinismo: ordena mediciones por hora dentro del día
  const sortByTs = (a, b) => a.timestampMs - b.timestampMs;

  for (const [localDate, dayItems] of byDate.entries()) {
    dayItems.sort(sortByTs);

    const entryId = localDate; // "YYYY-MM-DD" -> docId estable (1 entry por día)
    const entryRef = db.doc(`users/${uid}/cycles/${cycleId}/entries/${entryId}`);

    const entrySnap = await entryRef.get();
    const entryExists = entrySnap.exists;

    // Si no existe el entry del día, lo creamos con resumen basado en la 1ª medición
    if (!entryExists) {
      const first = dayItems[0];
      const entryData = {
        timestamp: first.timestamp,   // ISO con offset si lo mandas desde el móvil
        iso_date: localDate,          // coherente con tu código (iso_date)
        temperature_raw: first.temperatureC,
        temperature_corrected: first.temperatureC,
        temperature_chart: first.temperatureC,
        use_corrected: false,
        ignored: false,
        source: "health_connect",
        created_at: FieldValue.serverTimestamp(),
      };

      await entryRef.create(entryData);
      createdDays++;
    }

    // Crear mediciones en subcolección measurements (idempotente por externalId/timestamp)
    for (let j = 0; j < dayItems.length; j++) {
      const m = dayItems[j];
      const externalId = m.externalIdRaw || `hc_${m.timestampMs}`;
      const measurementId = sanitizeDocId(`hc_${externalId}`);

      const mRef = entryRef.collection("measurements").doc(measurementId);
      const mData = {
        temperature: m.temperatureC,
        temperature_corrected: null,
        use_corrected: false,
        selected: !entryExists && j === 0, // solo si el entry era nuevo, marcamos una por defecto
        time: m.timeLocal || null,         // importante: viene del móvil
        timestamp: m.timestamp,
        timestamp_ms: m.timestampMs,
        source: "health_connect",
        health_connect: {
          externalId: m.externalIdRaw || null,
          dataOrigin: m.dataOrigin || null,
        },
        created_at: FieldValue.serverTimestamp(),
      };

      try {
        await mRef.create(mData);
        createdMeasurements++;
        results.push({ index: m.index, ok: true, status: "MEASUREMENT_CREATED", day: localDate, measurementId });
      } catch (err) {
        const msg = String(err?.message || "");
        const code = err?.code;
        if (code === 6 || msg.includes("ALREADY_EXISTS")) {
          skippedMeasurements++;
          results.push({ index: m.index, ok: true, status: "MEASUREMENT_EXISTS", day: localDate, measurementId });
          continue;
        }
        console.error("MEASUREMENT_WRITE_FAILED", err);
        results.push({ index: m.index, ok: false, error: "MEASUREMENT_WRITE_FAILED", day: localDate });
      }
    }
  }

  await cycleRef.set(
    { last_health_connect_sync: FieldValue.serverTimestamp() },
    { merge: true }
  );

  return {
    ok: true,
    cycleId,
    createdDays,
    createdMeasurements,
    skippedMeasurements,
    rejected: rejectedItems.length,
    rejectedItems,
    results,
  };
});


exports.addTemperature = functions.https.onRequest(async (req, res) => {
  try {
    if (req.method !== "POST") {
      return res.status(405).send("Método no permitido");
    }

    // --- Auth ---
    const authHeader = req.headers.authorization || req.headers.Authorization || "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return res.status(401).send("Falta Authorization Bearer");

    let decoded;
    try {
      decoded = await admin.auth().verifyIdToken(idToken);
    } catch {
      return res.status(401).send("Token inválido");
    }
    const userId = decoded.uid;

    // --- Body: aceptar objeto o array ---
    const rawBody = req.body;
    if (rawBody == null || rawBody === "") {
      return res.status(400).json({ error: "EMPTY_BODY" });
    }
    const items = Array.isArray(rawBody) ? rawBody : [rawBody];

    const toDateAny = (v) => {
      if (!v) return null;
      if (typeof v.toDate === "function") return v.toDate(); // Firestore Timestamp
      if (typeof v === "number") return new Date(v);
      if (typeof v === "string") return new Date(v);
      return null;
    };

    const parseTimestamp = (ts) => {
      if (typeof ts === "number") {
        const d = new Date(ts);
        if (Number.isNaN(d.getTime())) return { err: "INVALID_TIMESTAMP" };
        return { date: d, iso: d.toISOString() };
      }
      if (typeof ts === "string") {
        // quitar saltos/espacios y si viniera "uno\notro", nos quedamos con el primero
        const first = ts.trim().split(/\s+/)[0];
        const d = new Date(first);
        if (Number.isNaN(d.getTime())) return { err: "INVALID_TIMESTAMP" };
        return { date: d, iso: d.toISOString() };
      }
      return { err: "INVALID_TIMESTAMP" };
    };

    const normalizeTemperature = (t) => {
      if (t == null) return null;
      let s = typeof t === "number" ? String(t) : String(t);
      s = s.replace(",", ".").trim();
      if (!s) return null;
      let num = Number(s);
      if (Number.isNaN(num)) return null;

      // Casos típicos:
      if (num >= 3500 && num <= 4000) num = num / 100;        // 3669 -> 36.69
      if (num > 80 && num < 120) num = (num - 32) / 1.8;      // °F -> °C

      // Rango razonable BBT
      if (num < 30 || num > 45) return null;

      return Number(num.toFixed(2));
    };

    const findCycle = async (uid, when) => {
      // Pocos docs por usuario: snapshot y filtrado en memoria
      const snap = await db.collection(`users/${uid}/cycles`).get();
      let candidate = null;
      const whenMs = when.getTime();
      for (const d of snap.docs) {
        const data = d.data();
        const start = toDateAny(data.start_date);
        const end = data.end_date ? toDateAny(data.end_date) : null;
        if (!start) continue;
        const inside =
          whenMs >= start.getTime() && (!end || whenMs <= end.getTime());
        if (inside) {
          if (
            !candidate ||
            toDateAny(candidate.data().start_date).getTime() < start.getTime()
          ) {
            candidate = d;
          }
        }
      }
      return candidate;
    };

    const results = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i] || {};
      if (it.timestamp == null || it.temperature == null) {
        results.push({ index: i, ok: false, error: "MISSING_FIELDS" });
        continue;
      }

      const ts = parseTimestamp(it.timestamp);
      if (ts.err) {
        results.push({ index: i, ok: false, error: "INVALID_TIMESTAMP", value: it.timestamp });
        continue;
      }

      const temp = normalizeTemperature(it.temperature);
      if (temp == null) {
        results.push({ index: i, ok: false, error: "INVALID_TEMPERATURE", value: it.temperature });
        continue;
      }

      const cycle = await findCycle(userId, ts.date);
      if (!cycle) {
        results.push({ index: i, ok: false, error: "NO_ACTIVE_CYCLE", timestamp: ts.iso });
        continue;
      }

      // Idempotencia: usa el ISO como id de doc (sin ':')
      const entryId = ts.iso.replace(/:/g, "-");
      const entryData = {
        timestamp: ts.iso,
        temperature_raw: temp,
        temperature_corrected: temp,
        temperature_chart: temp,
        use_corrected: false,
        ignored: false,
        // opcional: origen
        source: "shortcut/fermometer",
      };

      await db
        .collection(`users/${userId}/cycles/${cycle.id}/entries`)
        .doc(entryId)
        .set(entryData, { merge: true });

      results.push({ index: i, ok: true, cycleId: cycle.id, entryId });
    }

    // Respuesta: objeto si recibimos 1, array si recibimos N
    if (!Array.isArray(rawBody)) {
      const only = results[0];
      if (!only.ok) {
        const map = {
          MISSING_FIELDS: 400,
          INVALID_TIMESTAMP: 400,
          INVALID_TEMPERATURE: 422,
          NO_ACTIVE_CYCLE: 404,
        };
        return res.status(map[only.error] || 400).json(only);
      }
      return res.json(only);
    }
    return res.json({ ok: true, count: results.length, results });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "INTERNAL" });
  }
});
exports.exchangeCustomToken = functions.https.onRequest(async (req, res) => {
  try {
    if (req.method !== "POST") return res.status(405).send("Método no permitido");

    const authHeader = req.headers.authorization || req.headers.Authorization || "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return res.status(401).send("Falta Authorization Bearer");

    const decoded = await admin.auth().verifyIdToken(idToken);
    const customToken = await admin.auth().createCustomToken(decoded.uid);

    return res.json({ customToken });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "INTERNAL" });
  }
});

