package com.fertiliapp.fertiliapp;

import java.util.Calendar;
import java.util.GregorianCalendar;
import java.util.Locale;
import java.util.TimeZone;

/** Original implementation of Bluetooth Date Time / Current Time wire formats.
 * Values are wall-clock components, not UTC instants. See docs/femometer-clock.md.
 */
public final class BleClockCodec {
    private BleClockCodec() {}

    public static byte[] encodeCurrentTime(Calendar local) {
        int year = local.get(Calendar.YEAR);
        int month = local.get(Calendar.MONTH) + 1;
        int day = local.get(Calendar.DAY_OF_MONTH);
        int hour = local.get(Calendar.HOUR_OF_DAY);
        int minute = local.get(Calendar.MINUTE);
        int second = local.get(Calendar.SECOND);
        wallMillis(year, month, day, hour, minute, second);
        return new byte[] { (byte) year, (byte) (year >>> 8), (byte) month, (byte) day,
            (byte) hour, (byte) minute, (byte) second,
            (byte) ((local.get(Calendar.DAY_OF_WEEK) + 5) % 7 + 1),
            (byte) (local.get(Calendar.MILLISECOND) * 256 / 1000), 1 }; // Explicit manual adjustment.
    }

    public static long wallMillis(int year, int month, int day, int hour, int minute, int second) {
        if (year < 1582 || year > 9999 || month < 1 || month > 12 || day < 1
            || hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59)
            throw new IllegalArgumentException("Invalid BLE date");
        GregorianCalendar calendar = new GregorianCalendar(TimeZone.getTimeZone("UTC"), Locale.ROOT);
        calendar.setGregorianChange(new java.util.Date(Long.MIN_VALUE));
        calendar.setLenient(false);
        calendar.clear();
        calendar.set(year, month - 1, day, hour, minute, second);
        return calendar.getTimeInMillis(); // Validation/comparison only, never a device UTC timestamp.
    }

    public static String dateTime(int year, int month, int day, int hour, int minute, int second) {
        wallMillis(year, month, day, hour, minute, second);
        return String.format(Locale.ROOT, "%04d-%02d-%02dT%02d:%02d:%02d", year, month, day, hour, minute, second);
    }

    public static int[] decodeCurrentTime(byte[] bytes) {
        if (bytes == null || bytes.length != 10) throw new IllegalArgumentException("Invalid Current Time length");
        int[] fields = new int[] { (bytes[0] & 255) | ((bytes[1] & 255) << 8), bytes[2] & 255,
            bytes[3] & 255, bytes[4] & 255, bytes[5] & 255, bytes[6] & 255,
            bytes[7] & 255, bytes[8] & 255, bytes[9] & 255 };
        // Zero year/month/day are standard 'unknown', not a usable date.
        wallMillis(fields[0], fields[1], fields[2], fields[3], fields[4], fields[5]);
        if (fields[6] > 7 || fields[8] > 15) throw new IllegalArgumentException("Invalid Current Time fields");
        return fields;
    }

    public static String localText(int[] f) { return dateTime(f[0], f[1], f[2], f[3], f[4], f[5]); }

    public static boolean matchesPhone(int[] fields, Calendar phone, String writtenZone, int writtenOffset) {
        if (!phone.getTimeZone().getID().equals(writtenZone)
            || phone.getTimeZone().getOffset(phone.getTimeInMillis()) != writtenOffset) return false;
        int[] expected = decodeCurrentTime(encodeCurrentTime(phone));
        long actual = wallMillis(fields[0], fields[1], fields[2], fields[3], fields[4], fields[5]);
        long target = wallMillis(expected[0], expected[1], expected[2], expected[3], expected[4], expected[5]);
        return Math.abs(actual - target) <= 5000L;
    }
}
