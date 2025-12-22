const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

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

