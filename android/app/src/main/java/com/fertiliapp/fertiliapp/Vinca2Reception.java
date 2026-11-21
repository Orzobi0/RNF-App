package com.fertiliapp.fertiliapp;

import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.UUID;

/** Transport evidence only: neither a session nor packet equality identifies a take. */
final class Vinca2Reception {
    final String sessionId = UUID.randomUUID().toString();
    long connectedAt, indicationsReadyAt;
    private final Set<String> packets = new LinkedHashSet<>();

    static boolean continuous(boolean validatedVinca, boolean experimental) {
        return validatedVinca && !experimental;
    }

    boolean accept(byte[] packet, boolean validTimestamp) {
        // Without a full timestamp identical bytes could be distinct legitimate takes.
        if (!validTimestamp) return true;
        String key = Arrays.toString(packet);
        if (!packets.add(key)) return false;
        if (packets.size() > 256) packets.remove(packets.iterator().next());
        return true;
    }
}
