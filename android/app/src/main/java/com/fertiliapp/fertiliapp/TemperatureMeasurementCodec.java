package com.fertiliapp.fertiliapp;

/** Bluetooth SIG HTS 1.0, final Temperature Measurement (not Intermediate Temperature). */
final class TemperatureMeasurementCodec {
    static double ieee11073(byte[] value, int offset) {
        if (value == null || offset < 0 || value.length < offset + 4) throw new IllegalArgumentException("length");
        int raw = (value[offset] & 255) | ((value[offset + 1] & 255) << 8) | ((value[offset + 2] & 255) << 16);
        if (raw >= 0x7ffffe && raw <= 0x800002) throw new IllegalArgumentException("special-float");
        int mantissa = (raw & 0x800000) != 0 ? raw | 0xff000000 : raw;
        double result = mantissa * Math.pow(10, value[offset + 3]);
        if (!Double.isFinite(result)) throw new IllegalArgumentException("non-finite");
        return result;
    }
    static void validateFinal(byte[] value) {
        validateFinal(value, false);
    }
    // Only the authenticated Vinca path may recover a bad Date Time for review.
    static void validateVincaFinal(byte[] value) {
        validateFinal(value, true);
        double original = ieee11073(value, 1);
        double celsius = (value[0] & 1) == 0 ? original : (original - 32.0) * 5.0 / 9.0;
        if (celsius < 32 || celsius > 43) throw new IllegalArgumentException("temperature-range");
    }
    private static void validateFinal(byte[] value, boolean recoverDate) {
        if (value == null || value.length < 5) throw new IllegalArgumentException("length");
        int flags = value[0] & 255;
        if ((flags & (recoverDate ? 0x78 : 0xf8)) != 0) throw new IllegalArgumentException("reserved-flags");
        int length = 5 + ((flags & 2) != 0 ? 7 : 0) + ((flags & 4) != 0 ? 1 : 0);
        if (value.length != length) throw new IllegalArgumentException("length");
        ieee11073(value, 1);
        if (!recoverDate && (flags & 2) != 0) BleClockCodec.dateTime((value[5] & 255) | ((value[6] & 255) << 8),
            value[7] & 255, value[8] & 255, value[9] & 255, value[10] & 255, value[11] & 255);
        if ((flags & 4) != 0) {
            int type = value[length - 1] & 255;
            if (type < 1 || type > 9) throw new IllegalArgumentException("temperature-type");
        }
    }
    static double celsius(byte[] value) {
        validateFinal(value);
        double temperature = ieee11073(value, 1);
        return (value[0] & 1) == 0 ? temperature : (temperature - 32.0) * 5.0 / 9.0;
    }
}
