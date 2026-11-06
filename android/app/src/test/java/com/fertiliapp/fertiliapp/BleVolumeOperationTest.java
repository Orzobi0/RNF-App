package com.fertiliapp.fertiliapp;

import org.junit.Test;
import static org.junit.Assert.*;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

public class BleVolumeOperationTest {
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
        final BleVolumeOperation operation = new BleVolumeOperation((task, delay) -> {
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
        String[] levels = {"low", "medium", "high"};
        int[] commands = {0x09, 0x14, 0x16};
        for (int i = 0; i < levels.length; i++) {
            Fixture f = new Fixture(); Reply reply = f.start(levels[i]);
            assertEquals(commands[i], BleVolumeOperation.command(levels[i]));
            assertEquals(Arrays.asList(commands[i]), f.writes); assertEquals(0, reply.calls);
            assertEquals(8000L, f.budget);
            f.operation.onWrite(new Object(), f.target, 0);
            f.operation.onWrite(f.connection, new Object(), 0);
            assertEquals(Arrays.asList(commands[i]), f.writes);
            f.callback(0); assertEquals(Arrays.asList(commands[i], 0xFD), f.writes); assertEquals(0, reply.calls);
            f.callback(0); assertEquals(1, reply.calls); assertEquals(levels[i], reply.level); assertNull(reply.error);
            assertFalse(f.operation.busy()); assertNull(f.deadline);
            f.callback(0); assertEquals(1, reply.calls);
        }
    }

    @Test public void rejectsUnknownLevelsAndMissingResponseSupportWithoutAnyWrite() {
        for (String level : new String[] {null, "", "Low", "mute", "0x09", " low "}) {
            Fixture f = new Fixture(); assertEquals("VOLUME_INVALID_LEVEL", f.start(level).error);
            assertTrue(f.writes.isEmpty()); assertNull(f.deadline);
        }
        for (int properties : new int[] {0, 0x04, 0x02, 0x40}) {
            Fixture f = new Fixture(); assertEquals("VOLUME_UNSUPPORTED", f.start("low", f.target, properties).error);
            assertTrue(f.writes.isEmpty()); assertFalse(f.operation.uncertain(f.connection));
        }
        Fixture f = new Fixture(); assertEquals("VOLUME_UNSUPPORTED", f.start("low", null, 0x08).error);
        assertTrue(f.writes.isEmpty());
        f.connection = null; assertEquals("VOLUME_NOT_CONNECTED", f.start("low").error);
        assertTrue(BleVolumeOperation.supportsResponse(0x08 | 0x04));
    }

    @Test public void firstWriteFailureNeverSendsConfirmationAndSecondFailureNeverSucceeds() {
        Fixture first = new Fixture(); Reply failed = first.start("low"); first.callback(133);
        assertEquals("VOLUME_FIRST_WRITE_FAILED", failed.error); assertNull(failed.level);
        first.callback(0); assertEquals(Arrays.asList(0x09), first.writes);
        assertEquals("VOLUME_RECONNECT_REQUIRED", first.start("high").error);
        Fixture second = new Fixture(); Reply partial = second.start("medium"); second.callback(0); second.callback(133);
        assertEquals("VOLUME_CONFIRM_WRITE_FAILED", partial.error); assertNull(partial.level);
        assertEquals(Arrays.asList(0x14, 0xFD), second.writes);
        for (int rejected : new int[] {1, 2}) {
            Fixture f = new Fixture(); f.rejectWrite = rejected; Reply reply = f.start("high");
            if (rejected == 2) f.callback(0);
            assertEquals(rejected == 1 ? "VOLUME_FIRST_WRITE_FAILED" : "VOLUME_CONFIRM_WRITE_FAILED", reply.error);
            assertEquals(rejected, f.writes.size());
        }
        Fixture thrown = new Fixture(); thrown.throwOnWrite = true;
        assertEquals("VOLUME_FIRST_WRITE_FAILED", thrown.start("low").error);
        assertEquals(Arrays.asList(0x09), thrown.writes);
        Fixture thrownConfirmation = new Fixture(); Reply reply = thrownConfirmation.start("high");
        thrownConfirmation.throwOnWrite = true; thrownConfirmation.callback(0);
        assertEquals("VOLUME_CONFIRM_WRITE_FAILED", reply.error); assertNull(reply.level);
    }

    @Test public void duplicateTimeoutCancellationAndLateCallbacksCannotReuseUncertainConnection() {
        for (boolean confirmationPending : new boolean[] {false, true}) {
            for (boolean cancel : new boolean[] {false, true}) {
                Fixture f = new Fixture(); Reply first = f.start("low");
                assertEquals("VOLUME_BUSY", f.start("high").error);
                if (confirmationPending) f.callback(0);
                Runnable lateTimeout = f.deadline; Object oldConnection = f.connection;
                if (cancel) f.operation.cancel(); else lateTimeout.run();
                assertEquals(cancel ? "VOLUME_CANCELLED" : "VOLUME_TIMEOUT", first.error); assertNull(first.level);
                f.callback(0); lateTimeout.run(); assertEquals(1, first.calls);
                assertEquals(confirmationPending ? 2 : 1, f.writes.size());
                assertEquals("VOLUME_RECONNECT_REQUIRED", f.start("high").error);
                f.connection = new Object(); Reply next = f.start("medium");
                f.operation.onWrite(oldConnection, f.target, 0); lateTimeout.run();
                assertEquals(0, next.calls); assertTrue(f.operation.busy());
                f.callback(0); f.callback(0); assertEquals("medium", next.level); assertNull(next.error);
            }
        }
    }

    @Test public void oldDeadlineCannotCancelANewTransactionAfterSuccess() {
        Fixture f = new Fixture(); Reply first = f.start("low"); Runnable old = f.deadline;
        f.callback(0); f.callback(0); assertEquals("low", first.level);
        Reply next = f.start("high"); old.run(); assertEquals(0, next.calls);
        f.callback(0); f.callback(0); assertEquals("high", next.level);
    }
}
