package com.fertiliapp.fertiliapp;

import java.util.IdentityHashMap;
import java.util.ArrayList;
import java.util.Map;

/** Retain failed close handles so a failed disconnect cannot permit another GATT or unlink. */
final class BleGattCleanup {
    private final Map<Object, Runnable> pending = new IdentityHashMap<>();
    synchronized boolean close(Object transport, Runnable close) {
        try {
            close.run();
            pending.remove(transport);
            return true;
        } catch (RuntimeException error) {
            pending.put(transport, close);
            return false;
        }
    }
    synchronized void retry() {
        for (Object transport : new ArrayList<>(pending.keySet())) close(transport, pending.get(transport));
    }
    synchronized boolean complete() { return pending.isEmpty(); }
}
