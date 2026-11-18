package com.fertiliapp.fertiliapp;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/** Ephemeral evidence, never supplied by the frontend or persisted as measurements. */
final class ThermometerVerification<T> {
    private String user, address, session;
    private final Map<String, T> readings = new LinkedHashMap<>();
    synchronized String begin(String user, String address) {
        clear(); this.user = user; this.address = address;
        return session = UUID.randomUUID().toString();
    }
    synchronized String add(T reading) {
        if (session == null) return null;
        if (readings.size() >= 50) readings.remove(readings.keySet().iterator().next());
        String id = UUID.randomUUID().toString(); readings.put(id, reading); return id;
    }
    synchronized T confirmed(String user, String address, String session, String reading, boolean basal) {
        if (!basal || this.session == null || !this.session.equals(session)
                || !this.user.equals(user) || !this.address.equals(address) || !readings.containsKey(reading))
            throw new IllegalStateException("VERIFICATION_INVALID");
        return readings.get(reading);
    }
    synchronized String session() { return session; }
    synchronized long count(java.util.function.Predicate<T> predicate) { return readings.values().stream().filter(predicate).count(); }
    synchronized void clear() { user = address = session = null; readings.clear(); }
}
