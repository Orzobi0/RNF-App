const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

// POST https://us-central1-rnf-app.cloudfunctions.net/addTemperature
exports.addTemperature = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).send('Método no permitido');
  }

  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.split('Bearer ')[1] : null;
  if (!idToken) return res.status(401).send('Falta Authorization Bearer');

  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(idToken);
  } catch (err) {
    return res.status(401).send('Token inválido');
  }
  const userId = decoded.uid;

  const {timestamp, temperature} = req.body;
  if (!timestamp || !temperature) {
    return res.status(400).send('Faltan datos');
  }

  // 1) Buscar ciclo activo (basado en createNewCycleEntry)
  const cyclesSnap = await db.collection(`users/${userId}/cycles`).get();
  const entryDate = new Date(timestamp);
const candidate = cyclesSnap.docs
  .filter((d) => {
    const {start_date: startDate, end_date: endDate} = d.data();
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;
    return start && entryDate >= start && (!end || entryDate <= end);
  })
  .sort(
    (a, b) => new Date(b.data().start_date) - new Date(a.data().start_date)
  )[0];

  if (!candidate) {
    return res.status(404).send('No se encontró ciclo activo');
  }

  // 2) Crear entrada
  const entryData = {
    timestamp,
    temperature_raw: temperature,
    temperature_corrected: temperature,
    use_corrected: false,
    temperature_chart: temperature,
    ignored: false
  };
const ref = await db
  .collection(`users/${userId}/cycles/${candidate.id}/entries`)
  .add(entryData);

return res.json({
  entryId: ref.id,
  cycleId: candidate.id,
});
});
