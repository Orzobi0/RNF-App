import { format, parseISO, startOfDay } from "date-fns";
import { Capacitor } from "@capacitor/core";

const toCelsius = (temp) => {
  if (!temp) return null;
  const unit = temp.unit;
  const value = Number(temp.value);
  if (!Number.isFinite(value)) return null;
  if (unit === "fahrenheit") return (value - 32) / 1.8;
  return value; // celsius
};

export async function ensureHealthConnectPermissions() {
  const { HealthConnect } = await import("capacitor-health-connect");
  const neededRead = ["BasalBodyTemperature"];

  // 1) Disponibilidad (el plugin puede devolver string u objeto)
  const availabilityResp = await HealthConnect.checkAvailability();
  const availability =
    typeof availabilityResp === "string"
      ? availabilityResp
      : availabilityResp?.availability ?? availabilityResp?.value ?? availabilityResp?.status;

  if (availability !== "Available") {
    throw new Error(`HEALTH_CONNECT_${availability || "Unknown"}`);
  }

  // Helper: detectar permisos concedidos aunque el formato cambie
  const hasAllRead = (permResp) => {
    const r = permResp?.read;

    // Caso A: array de booleanos
    if (Array.isArray(r) && r.every((x) => typeof x === "boolean")) {
      return r.every(Boolean);
    }

    // Caso B: array de strings (tipos concedidos)
    if (Array.isArray(r) && r.every((x) => typeof x === "string")) {
      return neededRead.every((t) => r.includes(t));
    }

    // Caso C: objeto { BasalBodyTemperature: true } o { BasalBodyTemperature: { granted: true } }
    if (r && typeof r === "object") {
      return neededRead.every((t) => {
        const v = r[t];
        if (typeof v === "boolean") return v;
        if (v && typeof v === "object") return Boolean(v.granted ?? v.allowed ?? v.value ?? v.status);
        return false;
      });
    }

    return false;
  };

  // 2) Check
  const perm = await HealthConnect.checkHealthPermissions({ read: neededRead, write: [] });
  if (hasAllRead(perm)) return true;

  // 3) Request (esto debería abrir la pantalla de permisos de Health Connect)
  await HealthConnect.requestHealthPermissions({ read: neededRead, write: [] });

  // 4) Re-check
  const permAfter = await HealthConnect.checkHealthPermissions({ read: neededRead, write: [] });
  return hasAllRead(permAfter);
}


export async function readBbtFromHealthConnect({ startDate }) {
  if (!Capacitor.isNativePlatform()) {
    throw new Error("HEALTH_CONNECT_ONLY_IN_APP");
  }

  const { HealthConnect } = await import("capacitor-health-connect");

  const availabilityResp = await HealthConnect.checkAvailability();

  // El plugin puede devolver string o un objeto
  const availability =
    typeof availabilityResp === "string"
      ? availabilityResp
      : availabilityResp?.availability ?? availabilityResp?.value ?? availabilityResp?.status;

  if (availability !== "Available") {
    throw new Error(`HEALTH_CONNECT_${availability || "Unknown"}`);
  }


 const hasPermissions = await ensureHealthConnectPermissions();
  if (!hasPermissions) {
    throw new Error("HEALTH_CONNECT_PERMISSION_DENIED");
  }

  const parsedStart = parseISO(startDate);
  if (!startDate || Number.isNaN(parsedStart?.getTime?.())) {
    throw new Error("HEALTH_CONNECT_INVALID_START_DATE");
  }
  const start = startOfDay(parsedStart);
  const end = new Date();

  const resp = await HealthConnect.readRecords({
    type: "BasalBodyTemperature",
    timeRangeFilter: { type: "between", startTime: start, endTime: end },
    ascendingOrder: true,
    pageSize: 500,
  });

  const records = resp?.records || [];

  // Normalizamos a lo que espera la callable
  return records
    .map((r) => {
      const c = toCelsius(r.temperature);
      if (c == null) return null;

      const time = new Date(r.time);
      return {
        externalId: r?.metadata?.id || null,
        dataOrigin: r?.metadata?.dataOrigin || null,

        timestampMs: time.getTime(),
        timestamp: format(time, "yyyy-MM-dd'T'HH:mm:ssXXX"),
        localDate: format(time, "yyyy-MM-dd"),
        time: format(time, "HH:mm"),

        temperatureC: Number(c.toFixed(2)),
      };
    })
    .filter(Boolean);
}
