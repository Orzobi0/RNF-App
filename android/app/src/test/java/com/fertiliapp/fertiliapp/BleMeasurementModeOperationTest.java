package com.fertiliapp.fertiliapp;

import org.junit.Test;
import static org.junit.Assert.*;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

public class BleMeasurementModeOperationTest {
    private static final class Reply {
        String level;
        String error;
        int calls;
        void accept(String value, String code) { level = value; error = code; calls++; }
    }
    private static final class Fixture {
        Object connection = new Object();
        final Object target = new Object();
        final List<Integer> writes = new ArrayList<>();
        Runnable deadline;
        long budget;
        int rejectWrite;
        boolean throwOnWrite;
        final BleMeasurementModeOperation operation = new BleMeasurementModeOperation((task, delay) -> {
            deadline = task; budget = delay;
        }, task -> { if (deadline == task) deadline = null; });
        Reply start(String level) { return start(level, target, 0x08); }
        Reply start(String level, Object characteristic, int properties) {
            Reply reply = new Reply();
            operation.start(connection, characteristic, properties, level, value -> {
                writes.add(value);
                if (throwOnWrite) throw new IllegalStateException("transport error");
                return writes.size() != rejectWrite;
            }, reply::accept);
            return reply;
        }
        void callback(int status) { operation.onWrite(connection, target, status); }
    }

    @Test public void exactCommandsAreSeparateAndResolveOnlyAfterBothCallbacks() {
        String[] levels = {"quick", "normal", "precise"};
        int[] commands = {0x1A, 0x1C, 0x1D};
        for (int i = 0; i < levels.length; i++) {
            Fixture f = new Fixture(); Reply reply = f.start(levels[i]);
            assertEquals(commands[i], BleMeasurementModeOperation.command(levels[i]));
            assertEquals(Arrays.asList(commands[i]), f.writes); assertEquals(0, reply.calls);
            assertEquals(8000L, f.budget);
            f.operation.onWrite(new Object(), f.target, 0);
            f.operation.onWrite(f.connection, new Object(), 0);
            assertEquals(Arrays.asList(commands[i]), f.writes);
            f.callback(0); assertEquals(Arrays.asList(commands[i], 0x1E), f.writes); assertEquals(0, reply.calls);
            f.callback(0); assertEquals(1, reply.calls); assertEquals(levels[i], reply.level); assertNull(reply.error);
            assertFalse(f.operation.busy()); assertNull(f.deadline);
            f.callback(0); assertEquals(1, reply.calls);
        }
    }

    @Test public void rejectsUnknownLevelsAndMissingResponseSupportWithoutAnyWrite() {
        for (String level : new String[] {null, "", "Quick", "low", "medium", "high", "mute", "0x1A", " quick "}) {
            Fixture f = new Fixture(); assertEquals("MEASUREMENT_MODE_INVALID_LEVEL", f.start(level).error);
            assertTrue(f.writes.isEmpty()); assertNull(f.deadline);
        }
        for (int properties : new int[] {0, 0x04, 0x02, 0x40}) {
            Fixture f = new Fixture(); assertEquals("MEASUREMENT_MODE_UNSUPPORTED", f.start("quick", f.target, properties).error);
            assertTrue(f.writes.isEmpty()); assertFalse(f.operation.uncertain(f.connection));
        }
        Fixture f = new Fixture(); assertEquals("MEASUREMENT_MODE_UNSUPPORTED", f.start("quick", null, 0x08).error);
        assertTrue(f.writes.isEmpty());
        f.connection = null; assertEquals("MEASUREMENT_MODE_NOT_CONNECTED", f.start("quick").error);
        assertTrue(BleMeasurementModeOperation.supportsResponse(0x08 | 0x04));
    }

    @Test public void firstWriteFailureNeverSendsConfirmationAndSecondFailureNeverSucceeds() {
        Fixture first = new Fixture(); Reply failed = first.start("quick"); first.callback(133);
        assertEquals("MEASUREMENT_MODE_FIRST_WRITE_FAILED", failed.error); assertNull(failed.level);
        first.callback(0); assertEquals(Arrays.asList(0x1A), first.writes);
        assertEquals("MEASUREMENT_MODE_RECONNECT_REQUIRED", first.start("precise").error);
        Fixture second = new Fixture(); Reply partial = second.start("normal"); second.callback(0); second.callback(133);
        assertEquals("MEASUREMENT_MODE_CONFIRM_WRITE_FAILED", partial.error); assertNull(partial.level);
        assertEquals(Arrays.asList(0x1C, 0x1E), second.writes);
        for (int rejected : new int[] {1, 2}) {
            Fixture f = new Fixture(); f.rejectWrite = rejected; Reply reply = f.start("precise");
            if (rejected == 2) f.callback(0);
            assertEquals(rejected == 1 ? "MEASUREMENT_MODE_FIRST_WRITE_FAILED" : "MEASUREMENT_MODE_CONFIRM_WRITE_FAILED", reply.error);
            assertEquals(rejected, f.writes.size());
        }
        Fixture thrown = new Fixture(); thrown.throwOnWrite = true;
        assertEquals("MEASUREMENT_MODE_FIRST_WRITE_FAILED", thrown.start("quick").error);
        assertEquals(Arrays.asList(0x1A), thrown.writes);
        Fixture thrownConfirmation = new Fixture(); Reply reply = thrownConfirmation.start("precise");
        thrownConfirmation.throwOnWrite = true; thrownConfirmation.callback(0);
        assertEquals("MEASUREMENT_MODE_CONFIRM_WRITE_FAILED", reply.error); assertNull(reply.level);
    }

    @Test public void duplicateTimeoutCancellationAndLateCallbacksCannotReuseUncertainConnection() {
        for (boolean confirmationPending : new boolean[] {false, true}) {
            for (boolean cancel : new boolean[] {false, true}) {
                Fixture f = new Fixture(); Reply first = f.start("quick");
                assertEquals("MEASUREMENT_MODE_BUSY", f.start("precise").error);
                if (confirmationPending) f.callback(0);
                Runnable lateTimeout = f.deadline; Object oldConnection = f.connection;
                if (cancel) f.operation.cancel(); else lateTimeout.run();
                assertEquals(cancel ? "MEASUREMENT_MODE_CANCELLED" : "MEASUREMENT_MODE_TIMEOUT", first.error); assertNull(first.level);
                f.callback(0); lateTimeout.run(); assertEquals(1, first.calls);
                assertEquals(confirmationPending ? 2 : 1, f.writes.size());
                assertEquals("MEASUREMENT_MODE_RECONNECT_REQUIRED", f.start("precise").error);
                f.connection = new Object(); Reply next = f.start("normal");
                f.operation.onWrite(oldConnection, f.target, 0); lateTimeout.run();
                assertEquals(0, next.calls); assertTrue(f.operation.busy());
                f.callback(0); f.callback(0); assertEquals("normal", next.level); assertNull(next.error);
            }
        }
    }

    @Test public void oldDeadlineCannotCancelANewTransactionAfterSuccess() {
        Fixture f = new Fixture(); Reply first = f.start("quick"); Runnable old = f.deadline;
        f.callback(0); f.callback(0); assertEquals("quick", first.level);
        Reply next = f.start("precise"); old.run(); assertEquals(0, next.calls);
        f.callback(0); f.callback(0); assertEquals("precise", next.level);
    }
}
