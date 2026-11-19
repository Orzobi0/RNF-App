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
        value = current(); value[4] = (byte)0x80; value[5] = 0x25; reject(value, true); // 96 F is never guessed
        value = current(); value[4] = (byte)0xCC; value[5] = 0x10;
        assertEquals(43.0, EasyHomeProfile.decode(value, true).temperature, 0.001);
    }
    private void reject(byte[] packet, boolean configured) {
        try { EasyHomeProfile.decode(packet, configured); fail("must reject"); }
        catch (IllegalArgumentException expected) { }
    }
}
