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
    private void reject(byte[] packet, boolean configured) {
        try { EasyHomeProfile.decode(packet, configured); fail("must reject"); }
        catch (IllegalArgumentException expected) { }
    }
}
