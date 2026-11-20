package com.fertiliapp.fertiliapp;

import org.junit.Test;
import static org.junit.Assert.*;

public class Vinca2CaptureTest {
    private static final String TEMPERATURE = "00002a1c-0000-1000-8000-00805f9b34fb";
    private static final String PROPRIETARY = "3f3e3d3c-3b3a-3938-3736-353433323130";
    private static final String RAW_T = "86 E2 0D 00 FE EA 07 0B 14 0E 3A 1D 06";
    private static final String RAW_P = "00 01 01 00 01 00 00 00 F6 01 00 00 07 00 00 00 00 00 00 00";
    private static byte[] bytes(String hex) {
        String[] parts = hex.split(" "); byte[] result = new byte[parts.length];
        for (int i = 0; i < parts.length; i++) result[i] = (byte) Integer.parseInt(parts[i], 16);
        return result;
    }
    private static final class Clock implements Vinca2Capture.Clock {
        long wall = 1795170000000L, mono = 100;
        public long wall() { return wall; }
        public long monotonic() { return mono; }
    }
    @Test public void nativeGateRequiresExactPackageFrontendAndValidatedModel() {
        assertTrue(Vinca2Capture.allowed("com.fertiliapp.fertiliapp.staging", true, true, "BM-Vinca2"));
        assertFalse(Vinca2Capture.allowed("com.fertiliapp.fertiliapp", true, true, "BM-Vinca2"));
        assertFalse(Vinca2Capture.allowed("com.fertiliapp.fertiliapp.experiment", true, true, "BM-Vinca2"));
        assertFalse(Vinca2Capture.allowed("com.fertiliapp.fertiliapp.staging", false, true, "BM-Vinca2"));
        assertFalse(Vinca2Capture.allowed("com.fertiliapp.fertiliapp.staging", true, false, "BM-Vinca2"));
        assertFalse(Vinca2Capture.allowed("com.fertiliapp.fertiliapp.staging", true, true, "EBT-300"));
    }
    @Test public void manualCapturePreservesBytesOrderAndIndependentClocksAcrossReconnect() {
        Clock clock = new Clock(); Vinca2Capture capture = new Vinca2Capture(clock);
        assertNull(capture.record(TEMPERATURE, "reception", "received", bytes(RAW_T)));
        capture.start();
        clock.mono += 50;
        byte[] packet = bytes(RAW_T);
        Vinca2Capture.Event t = capture.record(TEMPERATURE, "reception", "received", packet);
        assertEquals(35.54, TemperatureMeasurementCodec.ieee11073(packet, 1), .00001);
        capture.decoded(t, "35.54;2026-11-20T14:58:29;mouth");
        packet[0] = 0; // BLE buffers can be reused; capture must own the original bytes.
        clock.wall -= 5000; clock.mono += 10;
        Vinca2Capture.Event p = capture.record(PROPRIETARY, "reception", "received", bytes(RAW_P));
        assertNull(p.decoded); assertEquals(RAW_P, p.hex); assertEquals(RAW_T, t.hex);
        assertEquals(2, t.order); assertEquals(3, p.order);
        assertEquals(50, t.elapsedMs); assertEquals(60, p.elapsedMs); assertTrue(p.receivedAt < t.receivedAt);
        capture.record("connection", "control", "disconnected", null);
        capture.record("connection", "control", "connect_requested", null);
        assertEquals(5, capture.snapshot().events.size());
        assertTrue(capture.snapshot().active);
    }
    @Test public void limitsAndClearEraseSessionWithoutMutatingReceivedPackets() {
        Vinca2Capture capture = new Vinca2Capture(new Clock()); capture.start();
        byte[] large = new byte[500]; large[0] = 42;
        Vinca2Capture.Event event = capture.record(PROPRIETARY, "reception", "received", large);
        assertEquals(128 * 3 - 1, event.hex.length()); assertEquals(500, event.originalBytes);
        assertEquals(42, large[0]); assertTrue(capture.snapshot().truncated);
        capture.decoded(event, new String(new char[2048])); assertEquals(1024, event.decoded.length());
        for (int i = 0; i < 2000; i++) capture.record("connection", "control", "reconnect", null);
        assertEquals(1000, capture.snapshot().events.size());
        capture.clear(); assertFalse(capture.snapshot().active); assertFalse(capture.snapshot().truncated);
        assertTrue(capture.snapshot().events.isEmpty());
        assertNull(capture.record(PROPRIETARY, "reception", "received", bytes(RAW_P)));
        capture.start(); assertEquals(1, capture.snapshot().events.size()); assertFalse(capture.snapshot().truncated);
        assertTrue(new Vinca2Capture(new Clock()).snapshot().events.isEmpty());
    }
}
