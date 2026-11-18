package com.fertiliapp.fertiliapp;

import org.junit.Test;
import static org.junit.Assert.*;

public class ThermometerDiscoveryTest {
    @Test public void normalDiscoveryIncludesThermometerEvidenceOnly() {
        assertTrue(ThermometerDiscovery.candidate("BM-Vinca2", false, false, false));
        assertTrue(ThermometerDiscovery.candidate("Easy@Home", false, false, false));
        assertTrue(ThermometerDiscovery.candidate(null, true, false, false));
        assertTrue(ThermometerDiscovery.candidate(null, false, true, false));
        assertFalse(ThermometerDiscovery.candidate(null, false, false, false));
        assertFalse(ThermometerDiscovery.candidate("Headphones", false, false, false));
        assertFalse(ThermometerDiscovery.candidate("Watch", false, false, false));
        assertTrue(ThermometerDiscovery.candidate("Headphones", false, false, true));
    }

    @Test public void identityAndTemperatureServiceDoNotProveSupport() {
        assertEquals("unknown", ThermometerDiscovery.classification(false, null, null, false));
        assertEquals("possible_standard", ThermometerDiscovery.classification(false, null, null, true));
        assertEquals("possible_standard", ThermometerDiscovery.classification(false, "BM-Vinca2", null, true));
        assertEquals("recognized_unsupported", ThermometerDiscovery.classification(false, "Other model", "Other brand", true));
        assertEquals("recognized_unsupported", ThermometerDiscovery.classification(false, "BM-Vinca2", "Femometer", false));
        assertEquals("compatible", ThermometerDiscovery.classification(true, "BM-Vinca2", "Femometer", true));
    }

    @Test public void modelIdentityIsIndependentFromSharedVendorServices() {
        assertTrue(Vinca2Profile.identifies("BM-Vinca2", null));
        assertTrue(Vinca2Profile.identifies("BM-Vinca2 123", null));
        assertTrue(Vinca2Profile.identifies(null, "BM-Vinca2"));
        assertFalse(Vinca2Profile.identifies(null, null));
        assertFalse(Vinca2Profile.identifies("Another device", null));
        assertFalse(Vinca2Profile.identifies("BM-Vinca2", "Another model"));
        assertFalse(Vinca2Profile.identifies("BM-Vinca20", null));
    }

    @Test public void vincaRequiresItsFingerprintAndEveryReceptionRequirement() {
        // Bluetooth GATT property bits: indicate=0x20, write with response=0x08.
        assertTrue(Vinca2Profile.supportsFacts(true, 0x20, true, 0x20, true, 0x08));
        assertFalse(Vinca2Profile.supportsFacts(false, 0x20, true, 0x20, true, 0x08));
        assertFalse(Vinca2Profile.supportsFacts(true, 0x10, true, 0x20, true, 0x08));
        assertFalse(Vinca2Profile.supportsFacts(true, 0x20, false, 0x20, true, 0x08));
        assertFalse(Vinca2Profile.supportsFacts(true, 0x20, true, 0x10, true, 0x08));
        assertFalse(Vinca2Profile.supportsFacts(true, 0x20, true, 0x20, false, 0x08));
        assertFalse(Vinca2Profile.supportsFacts(true, 0x20, true, 0x20, true, 0x04));
    }
}
