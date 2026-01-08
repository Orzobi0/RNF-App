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


  // Permisos
  const neededRead = ["BasalBodyTemperature"];

  const perm = await HealthConnect.checkHealthPermissions({ read: neededRead, write: [] });
  const hasAll = perm?.read?.every(Boolean);

  if (!hasAll) {
    await HealthConnect.requestHealthPermissions({ read: neededRead, write: [] });
  }

  const start = startOfDay(parseISO(startDate));
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
