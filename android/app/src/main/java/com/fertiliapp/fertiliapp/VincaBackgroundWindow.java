package com.fertiliapp.fertiliapp;

/** elapsedRealtime only. Repeated stop events never extend a lease. */
final class VincaBackgroundWindow {
    static final long DURATION_MS = 360_000L;
    private long deadline = -1;
    boolean enter(long now) {
        if (deadline >= 0) return false;
        deadline = now + DURATION_MS;
        return true;
    }
    boolean expired(long now) { return deadline >= 0 && now >= deadline; }
    void cancel() { deadline = -1; }
}
