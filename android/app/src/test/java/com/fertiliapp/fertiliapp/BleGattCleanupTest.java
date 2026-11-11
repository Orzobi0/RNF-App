package com.fertiliapp.fertiliapp;

import org.junit.Test;
import static org.junit.Assert.*;

public class BleGattCleanupTest {
    @Test public void failedCloseRemainsBlockedUntilAnExplicitSuccessfulRetry() {
        BleGattCleanup cleanup = new BleGattCleanup();
        Object transport = new Object(); boolean[] fails = {true}; int[] calls = {0};
        assertFalse(cleanup.close(transport, () -> { calls[0]++; if (fails[0]) throw new SecurityException(); }));
        assertFalse(cleanup.complete()); cleanup.retry(); assertFalse(cleanup.complete());
        fails[0] = false; cleanup.retry(); assertTrue(cleanup.complete()); assertEquals(3, calls[0]);
        cleanup.retry(); assertEquals(3, calls[0]);
    }
    @Test public void closingAnotherTransportDoesNotHideAFailedHandle() {
        BleGattCleanup cleanup = new BleGattCleanup();
        cleanup.close(new Object(), () -> { throw new IllegalStateException(); });
        assertTrue(cleanup.close(new Object(), () -> {}));
        assertFalse(cleanup.complete());
    }
}
