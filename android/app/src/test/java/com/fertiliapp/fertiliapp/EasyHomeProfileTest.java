package com.fertiliapp.fertiliapp;
import org.junit.Test;
import static org.junit.Assert.*;

public class EasyHomeProfileTest {
    // Fixtures ported from easyathome-ble 0.2.4 tests/test_parser.py (MIT).
    private byte[] current() { return new byte[] {0,1,0,0,0x44,0x0e,0,0,0x38,0,2,8,14,30,25}; }
    @Test public void decodesDocumentedCurrentAndHistoricalPackets() {
        EasyHomeProfile.Reading live = EasyHomeProfile.decode(current(), true);
        assertEquals(36.52, live.temperature, 0.00001); assertTrue(live.live);
        assertEquals("2026-02-08T14:30:25", live.timestamp);
        byte[] old = {0,17,0,0,0x7e,0x0e,0,0,0x38,0,2,7,22,15,0};
        EasyHomeProfile.Reading history = EasyHomeProfile.decode(old, true);
        assertEquals(37.10, history.temperature, 0.00001); assertFalse(history.live);
        assertEquals("2026-02-07T22:15:00", history.timestamp);
    }
    @Test public void rejectsAmbiguousIdentityUnitAndMalformedPackets() {
        assertTrue(EasyHomeProfile.identifies("EBT-300", null));
        assertFalse(EasyHomeProfile.identifies("Easy@Home", null));
        assertFalse(EasyHomeProfile.identifies("EBT-300", "EBT-089"));
        assertFalse(EasyHomeProfile.identifies("EBT-3000", null));
        assertTrue(EasyHomeProfile.requirements(0x04, 0x10, true));
        assertFalse(EasyHomeProfile.requirements(0x04, 0x20, true));
        reject(current(), false); reject(new byte[14], true); reject(new byte[16], true);
        byte[] invalid = current(); invalid[1] = 2; reject(invalid, true);
        invalid = current(); invalid[10] = 13; reject(invalid, true);
        invalid = current(); invalid[11] = 30; reject(invalid, true);
        assertArrayEquals(new byte[] {90,6,6,1,-1,-1,-1,-1,-6}, EasyHomeProfile.celsiusCommand());
    }
    @Test public void documentedClockAndUnitCommandsAndTemperatureRange() {
        java.util.Calendar local = new java.util.GregorianCalendar(2026, 10, 19, 8, 5, 9);
        assertArrayEquals(new byte[] {90,3,6,56,11,19,8,5,9}, EasyHomeProfile.clockCommand(local));
        assertArrayEquals(new byte[] {90,6,6,2,-1,-1,-1,-1,-6}, EasyHomeProfile.unitCommand(2));
        try { EasyHomeProfile.unitCommand(0); fail("unit"); } catch (IllegalArgumentException expected) { }
        local.set(java.util.Calendar.YEAR, 2226);
        try { EasyHomeProfile.clockCommand(local); fail("year"); } catch (IllegalArgumentException expected) { }
        byte[] value = current(); value[4] = 0; value[5] = 0; reject(value, true);
        value = current(); value[4] = (byte)0x80; value[5] = 0x25; assertEquals(35.56, EasyHomeProfile.decode(value, true).temperature, 0.001); // provisional range inference
        value = current(); value[4] = (byte)0xCC; value[5] = 0x10;
        assertEquals(43.0, EasyHomeProfile.decode(value, true).temperature, 0.001);
    }
    @Test public void infersBothRangesForCurrentAndHistoryWithoutInventingAUnitFlag() {
        int[] values = {3200, 4300, 8960, 10940, 9770};
        double[] normalized = {32, 43, 32, 43, 36.5};
        for (int kind : new int[] {1, 17}) {
            for (int i = 0; i < values.length; i++) {
                byte[] packet = current(); packet[1] = (byte)kind;
                packet[4] = (byte)values[i]; packet[5] = (byte)(values[i] >> 8);
                EasyHomeProfile.Reading reading = EasyHomeProfile.decode(packet, true);
                assertEquals(normalized[i], reading.temperature, 0.00001);
                assertEquals(values[i] / 100.0, reading.original, 0.00001);
                assertEquals(i < 2 ? "celsius" : "fahrenheit", reading.inferredUnit);
                assertEquals(kind == 1, reading.live);
            }
            for (int invalid : new int[] {0, 3199, 4301, 8959, 10941, 65535}) {
                byte[] packet = current(); packet[1] = (byte)kind;
                packet[4] = (byte)invalid; packet[5] = (byte)(invalid >> 8); reject(packet, true);
            }
            for (int field : new int[] {10, 11, 12, 13, 14}) {
                byte[] packet = current(); packet[1] = (byte)kind; packet[field] = (byte)255; reject(packet, true);
            }
        }
    }
    private void reject(byte[] packet, boolean configured) {
        try { EasyHomeProfile.decode(packet, configured); fail("must reject"); }
        catch (IllegalArgumentException expected) { }
    }
}
