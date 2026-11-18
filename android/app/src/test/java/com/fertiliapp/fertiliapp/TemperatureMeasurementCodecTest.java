package com.fertiliapp.fertiliapp;
import org.junit.Test;
import static org.junit.Assert.*;
import java.util.Arrays;

public class TemperatureMeasurementCodecTest {
    private byte[] value(int flags, int mantissa, int exponent) {
        return new byte[] {(byte) flags, (byte) mantissa, (byte) (mantissa >> 8), (byte) (mantissa >> 16), (byte) exponent};
    }
    private void invalid(byte[] value) {
        try { TemperatureMeasurementCodec.validateFinal(value); fail("must reject malformed measurement"); }
        catch (IllegalArgumentException expected) { }
    }
    @Test public void standardReceptionNeedsOnlyFinalIndicationsAndCccd() {
        assertTrue(HealthThermometerProfile.requirements(true, 0x20, true));
        assertFalse(HealthThermometerProfile.requirements(true, 0x10, true));
        assertFalse(HealthThermometerProfile.requirements(false, 0x20, true));
        assertFalse(HealthThermometerProfile.requirements(true, 0x20, false));
        assertNotEquals(HealthThermometerProfile.MEASUREMENT.toString(), "00002a1e-0000-1000-8000-00805f9b34fb");
    }
    @Test public void decodesCelsiusFahrenheitNegativeAndExponent() {
        assertEquals(36.42, TemperatureMeasurementCodec.celsius(value(0, 3642, -2)), 0.00001);
        assertEquals(37, TemperatureMeasurementCodec.celsius(value(1, 986, -1)), 0.00001);
        assertEquals(-12.5, TemperatureMeasurementCodec.celsius(value(0, -125, -1)), 0.00001);
        assertEquals(40, TemperatureMeasurementCodec.celsius(value(0, 4, 1)), 0.00001);
    }
    @Test public void rejectsAllSpecialFloatsReservedFlagsAndBadLengths() {
        for (int mantissa = 0x7ffffe; mantissa <= 0x800002; mantissa++) invalid(value(0, mantissa, 0));
        invalid(null); invalid(new byte[4]); invalid(value(8, 3642, -2)); invalid(value(2, 3642, -2));
        invalid(Arrays.copyOf(value(0, 3642, -2), 6)); invalid(value(4, 3642, -2));
    }
    @Test public void validatesOptionalDateAndTemperatureType() {
        byte[] packet = Arrays.copyOf(value(6, 3642, -2), 13);
        packet[5] = (byte) 2026; packet[6] = (byte) (2026 >> 8); packet[7] = 11; packet[8] = 18;
        packet[9] = 8; packet[10] = 30; packet[11] = 0; packet[12] = 6;
        assertEquals(36.42, TemperatureMeasurementCodec.celsius(packet), 0.00001);
        packet[8] = 31; invalid(packet); packet[8] = 18;
        packet[9] = 24; invalid(packet); packet[9] = 8;
        packet[12] = 10; invalid(packet);
    }
}
