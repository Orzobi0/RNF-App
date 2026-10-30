package com.fertiliapp.fertiliapp;

import org.junit.Test;
import static org.junit.Assert.*;
import java.util.Calendar;
import java.util.GregorianCalendar;
import java.util.Locale;
import java.util.TimeZone;

public class BleClockCodecTest {
    private Calendar at(String zone, long epoch) {
        Calendar calendar = new GregorianCalendar(TimeZone.getTimeZone(zone), Locale.ROOT);
        calendar.setTimeInMillis(epoch);
        return calendar;
    }

    @Test public void encodesStandardLayoutAndLeapDay() {
        Calendar c = at("UTC", BleClockCodec.wallMillis(2024, 2, 29, 23, 59, 58) + 500);
        byte[] value = BleClockCodec.encodeCurrentTime(c);
        assertArrayEquals(new byte[] {(byte) 0xe8, 7, 2, 29, 23, 59, 58, 4, (byte) 128, 1}, value);
        assertEquals("2024-02-29T23:59:58", BleClockCodec.localText(BleClockCodec.decodeCurrentTime(value)));
    }

    @Test public void validatesCalendarAndUnknownDatesWithoutRollover() {
        assertThrows(IllegalArgumentException.class, () -> BleClockCodec.dateTime(2023, 2, 29, 1, 0, 0));
        assertThrows(IllegalArgumentException.class, () -> BleClockCodec.dateTime(2026, 4, 31, 0, 0, 0));
        assertThrows(IllegalArgumentException.class, () -> BleClockCodec.dateTime(0, 0, 0, 0, 0, 0));
        assertThrows(IllegalArgumentException.class, () -> BleClockCodec.dateTime(2026, 1, 1, 24, 0, 0));
        assertThrows(IllegalArgumentException.class, () -> BleClockCodec.dateTime(2026, 1, 1, 0, 60, 0));
        assertThrows(IllegalArgumentException.class, () -> BleClockCodec.dateTime(2026, 1, 1, 0, 0, 60));
        assertThrows(IllegalArgumentException.class, () -> BleClockCodec.dateTime(1581, 1, 1, 0, 0, 0));
        assertThrows(IllegalArgumentException.class, () -> BleClockCodec.dateTime(10000, 1, 1, 0, 0, 0));
        assertEquals("9999-12-31T23:59:59", BleClockCodec.dateTime(9999, 12, 31, 23, 59, 59));
        assertEquals("1582-01-01T00:00:00", BleClockCodec.dateTime(1582, 1, 1, 0, 0, 0));
        assertThrows(IllegalArgumentException.class, () -> BleClockCodec.decodeCurrentTime(new byte[9]));
        assertThrows(IllegalArgumentException.class, () -> BleClockCodec.decodeCurrentTime(new byte[10]));
        byte[] value = BleClockCodec.encodeCurrentTime(at("UTC", 0));
        value[7] = 8;
        assertThrows(IllegalArgumentException.class, () -> BleClockCodec.decodeCurrentTime(value));
    }

    @Test public void usesLocalWallClockIncludingDstAndFractionalOffsets() {
        long epoch = BleClockCodec.wallMillis(2026, 7, 1, 12, 0, 0);
        assertEquals("2026-07-01T14:00:00", BleClockCodec.localText(BleClockCodec.decodeCurrentTime(BleClockCodec.encodeCurrentTime(at("Europe/Madrid", epoch)))));
        assertEquals("2026-07-01T17:45:00", BleClockCodec.localText(BleClockCodec.decodeCurrentTime(BleClockCodec.encodeCurrentTime(at("Asia/Kathmandu", epoch)))));
        assertEquals("2026-07-01T08:00:00", BleClockCodec.localText(BleClockCodec.decodeCurrentTime(BleClockCodec.encodeCurrentTime(at("America/New_York", epoch)))));
        long spring = BleClockCodec.wallMillis(2026, 3, 29, 1, 0, 0);
        assertEquals("2026-03-29T03:00:00", BleClockCodec.localText(BleClockCodec.decodeCurrentTime(BleClockCodec.encodeCurrentTime(at("Europe/Madrid", spring)))));
        // Device components during a DST gap remain components, not silently shifted instants.
        assertEquals("2026-03-29T02:30:00", BleClockCodec.dateTime(2026, 3, 29, 2, 30, 0));
    }

    @Test public void verifiesReadbackButRejectsOldClocksAndZoneChanges() {
        long epoch = BleClockCodec.wallMillis(2026, 10, 30, 12, 0, 0);
        Calendar now = at("Europe/Madrid", epoch);
        int[] fields = BleClockCodec.decodeCurrentTime(BleClockCodec.encodeCurrentTime(now));
        assertTrue(BleClockCodec.matchesPhone(fields, at("Europe/Madrid", epoch + 5000), "Europe/Madrid", 3600000));
        assertFalse(BleClockCodec.matchesPhone(fields, at("Europe/Madrid", epoch + 6000), "Europe/Madrid", 3600000));
        assertFalse(BleClockCodec.matchesPhone(fields, now, "UTC", 3600000));
        assertFalse(BleClockCodec.matchesPhone(fields, now, "Europe/Madrid", 7200000));
        fields[0] = 2020;
        assertFalse(BleClockCodec.matchesPhone(fields, now, "Europe/Madrid", 3600000));
        assertEquals("2020-10-30T13:00:00", BleClockCodec.localText(fields));
    }
}
