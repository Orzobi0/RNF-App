package com.fertiliapp.fertiliapp;

import org.junit.Test;
import static org.junit.Assert.*;

public class Vinca2ReceptionTest {
    @Test public void continuousOnlyForValidatedNonExperimentalVinca() {
        assertTrue(Vinca2Reception.continuous(true, false));
        assertFalse(Vinca2Reception.continuous(false, false));
        assertFalse(Vinca2Reception.continuous(false, true));
        assertFalse(Vinca2Reception.continuous(true, true));
    }
    @Test public void latePacketAndExactReplayAreScopedToConnection() {
        Vinca2Reception first = new Vinca2Reception();
        first.connectedAt = 1000;
        first.indicationsReadyAt = 3000;
        byte[] packet = {2, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11};
        // No elapsed-time expiry: packet remains receivable after any measurement duration.
        assertTrue(first.accept(packet, true));
        assertFalse(first.accept(packet.clone(), true));
        packet[11]++; // Same temperature/minute, different original second: keep it.
        assertTrue(first.accept(packet, true));
        assertTrue(first.accept(packet, false));
        assertTrue(first.accept(packet, false));
        Vinca2Reception second = new Vinca2Reception();
        assertNotEquals(first.sessionId, second.sessionId);
        assertTrue(second.accept(packet, true)); // Server/history review still applies after reconnect.
    }
    @Test public void exactReplayMemoryIsBounded() {
        Vinca2Reception reception = new Vinca2Reception();
        for (int i = 0; i < 257; i++) assertTrue(reception.accept(new byte[]{(byte)i, (byte)(i >> 8)}, true));
        assertTrue(reception.accept(new byte[]{0, 0}, true));
    }
}
