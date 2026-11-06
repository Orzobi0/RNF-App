package com.fertiliapp.fertiliapp;

import org.junit.Test;
import static org.junit.Assert.*;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

public class BleDeviceInfoOperationTest {
    @Test public void batteryRequiresExactlyOneUnsignedByteInRange() {
        assertEquals(Integer.valueOf(0), BleDeviceInfoOperation.battery(new byte[] {0}));
        assertEquals(Integer.valueOf(85), BleDeviceInfoOperation.battery(new byte[] {85}));
        assertEquals(Integer.valueOf(100), BleDeviceInfoOperation.battery(new byte[] {100}));
        for (int value : new int[] {101, 127, 128, 255})
            assertNull(BleDeviceInfoOperation.battery(new byte[] {(byte) value}));
        assertNull(BleDeviceInfoOperation.battery(null));
        assertNull(BleDeviceInfoOperation.battery(new byte[0]));
        assertNull(BleDeviceInfoOperation.battery(new byte[] {85, 0}));
    }

    @Test public void stringsDecodeUtf8CleanControlsAndRejectMalformedOrOversizedValues() {
        for (String value : new String[] {"BM-Vinca2", "Fémometer", "FW-1", "SW-2"})
            assertEquals(value, BleDeviceInfoOperation.text(value.getBytes(StandardCharsets.UTF_8)));
        assertEquals("Vinca", BleDeviceInfoOperation.text("  \u0000Vinca\u202e\n ".getBytes(StandardCharsets.UTF_8)));
        assertNull(BleDeviceInfoOperation.text("\uFFFD".getBytes(StandardCharsets.UTF_8)));
        assertNull(BleDeviceInfoOperation.text(null));
        assertNull(BleDeviceInfoOperation.text(new byte[0]));
        assertNull(BleDeviceInfoOperation.text(new byte[] {0, 10, 32}));
        assertNull(BleDeviceInfoOperation.text(new byte[] {(byte) 0xc3, 0x28}));
        assertNull(BleDeviceInfoOperation.text(new byte[] {(byte) 0xc3}));
        assertNull(BleDeviceInfoOperation.text(new byte[513]));
        byte[] longText = new byte[129];
        java.util.Arrays.fill(longText, (byte) 'x');
        assertNull(BleDeviceInfoOperation.text(longText));
        assertEquals(128, BleDeviceInfoOperation.text(java.util.Arrays.copyOf(longText, 128)).length());
    }

    private static final class Reply {
        Map<String, Object> result;
        String error;
        int calls;
        void accept(Map<String, Object> value, String code) { result = value; error = code; calls++; }
    }

    private static final class Fixture implements BleDeviceInfoOperation.Reads {
        final Object connection = new Object();
        final Object[] targets = {new Object(), new Object(), new Object(), new Object(), new Object()};
        final boolean[] available = {true, true, true, true, true};
        final List<Integer> requests = new ArrayList<>();
        Runnable deadline;
        long budget;
        boolean accepted = true;
        boolean throwsOnRead;
        final BleDeviceInfoOperation operation = new BleDeviceInfoOperation((task, delay) -> {
            deadline = task; budget = delay;
        }, task -> { if (deadline == task) deadline = null; });
        public Object readableTarget(int field) { return available[field] ? targets[field] : null; }
        public boolean read(Object target) {
            requests.add(Arrays.asList(targets).indexOf(target));
            if (throwsOnRead) throw new IllegalStateException("transport failed");
            return accepted;
        }
        Reply start() {
            Reply reply = new Reply();
            operation.start(connection, this, reply::accept);
            return reply;
        }
        void respond(int field, byte[] value) { operation.onRead(connection, targets[field], value, 0); }
        void text(int field, String value) { respond(field, value.getBytes(StandardCharsets.UTF_8)); }
    }

    @Test public void readsInOrderOnlyAfterMatchingCallbacksAndKeepsFirmwareSeparate() {
        Fixture f = new Fixture(); Reply reply = f.start();
        assertEquals(Arrays.asList(0), f.requests);
        assertEquals(12000L, f.budget);
        f.operation.onRead(new Object(), f.targets[0], new byte[] {85}, 0);
        f.respond(4, new byte[] {85}); // Unrelated or stale callback cannot advance.
        assertEquals(Arrays.asList(0), f.requests);
        f.respond(0, new byte[] {85}); assertEquals(Arrays.asList(0, 1), f.requests);
        f.respond(0, new byte[] {85}); assertEquals(Arrays.asList(0, 1), f.requests);
        f.text(1, "BM-Vinca2"); assertEquals(Arrays.asList(0, 1, 2), f.requests);
        f.text(2, "Femometer"); assertEquals(Arrays.asList(0, 1, 2, 3), f.requests);
        f.text(3, "FW-1"); assertEquals(Arrays.asList(0, 1, 2, 3, 4), f.requests);
        assertEquals(0, reply.calls);
        f.text(4, "SW-2");
        assertEquals(1, reply.calls); assertNull(reply.error);
        assertEquals(85, reply.result.get("battery")); assertEquals("BM-Vinca2", reply.result.get("model"));
        assertEquals("Femometer", reply.result.get("manufacturer"));
        assertEquals("FW-1", reply.result.get("firmware")); assertEquals("SW-2", reply.result.get("software"));
        assertFalse(f.operation.busy()); assertNull(f.deadline);
    }

    @Test public void missingUnreadableAndMalformedFieldsDoNotDiscardOtherResults() {
        Fixture f = new Fixture(); f.available[0] = false; f.available[3] = false;
        Reply reply = f.start(); assertEquals(Arrays.asList(1), f.requests);
        f.text(1, "Vinca"); f.respond(2, new byte[] {(byte) 0xff}); f.text(4, "SW-only");
        assertEquals(Arrays.asList(1, 2, 4), f.requests);
        assertNull(reply.error); assertNull(reply.result.get("battery")); assertNull(reply.result.get("manufacturer"));
        assertNull(reply.result.get("firmware")); assertEquals("SW-only", reply.result.get("software"));
        Fixture empty = new Fixture(); Arrays.fill(empty.available, false);
        Reply missing = empty.start(); assertEquals(1, missing.calls); assertTrue(empty.requests.isEmpty());
        assertEquals(5, missing.result.size()); assertTrue(missing.result.values().stream().allMatch(value -> value == null));
    }

    @Test public void duplicatesAndTimeoutQuarantineTransportAndIgnoreLateCallbacks() {
        Fixture f = new Fixture(); Reply first = f.start(); Reply duplicate = f.start();
        assertEquals("DEVICE_INFO_BUSY", duplicate.error); assertEquals(0, first.calls);
        Runnable timeout = f.deadline;
        timeout.run();
        assertEquals("DEVICE_INFO_TIMEOUT", first.error); assertNull(first.result);
        f.respond(0, new byte[] {85}); timeout.run();
        assertEquals(1, first.calls); assertEquals(Arrays.asList(0), f.requests);
        assertEquals("DEVICE_INFO_RECONNECT_REQUIRED", f.start().error);
        Object nextConnection = new Object(); Reply next = new Reply();
        f.operation.start(nextConnection, f, next::accept);
        timeout.run(); f.respond(0, new byte[] {85}); // Old connection and old timeout.
        assertEquals(0, next.calls);
        for (int i = 0; i < 5; i++) f.operation.onRead(nextConnection, f.targets[i], new byte[] {65}, 0);
        assertEquals(1, next.calls); assertNull(next.error);
    }

    @Test public void failedTransportStopsQueueAndNeverResolvesPartialData() {
        Fixture f = new Fixture(); Reply reply = f.start();
        f.respond(0, new byte[] {85});
        f.operation.onRead(f.connection, f.targets[1], null, 133);
        assertEquals("DEVICE_INFO_READ_FAILED", reply.error); assertNull(reply.result);
        assertEquals(Arrays.asList(0, 1), f.requests);
        f.text(1, "late"); assertEquals(Arrays.asList(0, 1), f.requests);
        assertEquals("DEVICE_INFO_RECONNECT_REQUIRED", f.start().error);
        for (boolean throwing : new boolean[] {false, true}) {
            Fixture rejected = new Fixture(); rejected.accepted = false; rejected.throwsOnRead = throwing;
            assertEquals("DEVICE_INFO_READ_FAILED", rejected.start().error);
            assertEquals(Arrays.asList(0), rejected.requests);
        }
    }

    @Test public void cancellationIgnoresCallbacksAndStaleTimeoutCannotCancelLaterCompletedQuery() {
        Fixture f = new Fixture(); Reply reply = f.start(); Runnable cancelledTimeout = f.deadline;
        f.operation.cancel(); assertEquals("CONNECTION_CANCELLED", reply.error);
        f.respond(0, new byte[] {85}); cancelledTimeout.run(); assertEquals(1, reply.calls);
        assertEquals(Arrays.asList(0), f.requests);
        Fixture complete = new Fixture(); Reply first = complete.start(); Runnable oldTimeout = complete.deadline;
        for (int i = 0; i < 5; i++) complete.respond(i, new byte[] {65});
        assertEquals(1, first.calls);
        Reply next = complete.start(); oldTimeout.run(); assertEquals(0, next.calls);
        for (int i = 0; i < 5; i++) complete.respond(i, new byte[] {66});
        assertEquals(1, next.calls); assertNull(next.error);
    }
}
