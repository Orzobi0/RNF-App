package com.fertiliapp.fertiliapp;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.locks.ReentrantLock;

/** Session memory only. BLE callbacks never wait for an exporter/UI lock. */
final class Vinca2Capture {
    static final int MAX_EVENTS = 1000, MAX_BYTES = 128, MAX_DETAIL = 1024;
    interface Clock { long wall(); long monotonic(); }
    static final class Event {
        final int order, connection;
        final long receivedAt, elapsedMs;
        final String channel, direction, status, hex;
        final int originalBytes;
        volatile String decoded;
        Event(int order, int connection, long wall, long elapsed, String channel, String direction, String status, byte[] bytes) {
            this.order = order; this.connection = connection; receivedAt = wall; elapsedMs = elapsed;
            this.channel = channel; this.direction = direction; this.status = status;
            originalBytes = bytes == null ? 0 : bytes.length;
            StringBuilder out = new StringBuilder();
            for (int i = 0; i < Math.min(originalBytes, MAX_BYTES); i++) {
                if (i > 0) out.append(' ');
                int b = bytes[i] & 255;
                out.append("0123456789ABCDEF".charAt(b >>> 4)).append("0123456789ABCDEF".charAt(b & 15));
            }
            hex = out.toString();
        }
    }
    static final class Snapshot {
        final boolean active, truncated, prepared, observeClock;
        final List<Event> events;
        Snapshot(boolean active, boolean truncated, boolean prepared, boolean observeClock, List<Event> events) {
            this.active = active; this.truncated = truncated; this.prepared = prepared; this.observeClock = observeClock; this.events = events;
        }
    }
    private final Clock clock;
    private final ReentrantLock lock = new ReentrantLock();
    private final List<Event> events = new ArrayList<>();
    private volatile boolean active, truncated, prepared, observeClock;
    private int connection;
    private long started;
    Vinca2Capture(Clock clock) { this.clock = clock; }
    static boolean allowed(String packageName, boolean stagingFrontend, boolean validated, String model) {
        return "com.fertiliapp.fertiliapp.staging".equals(packageName) && stagingFrontend
            && validated && "BM-Vinca2".equals(model);
    }
    void start() {
        lock.lock();
        try { events.clear(); truncated = false; started = clock.monotonic(); connection = 0; prepared = false; observeClock = false; active = true; }
        finally { lock.unlock(); }
        record("capture", "control", "started", null);
    }
    void prepare(boolean observe) {
        start();
        prepared = true;
        observeClock = observe;
        record("capture", "control", observe ? "prepared;clock_read_only" : "prepared", null);
    }
    boolean observingClock() { return active && observeClock; }
    // Called by connection ownership before connectGatt; never resets existing evidence.
    void connectionStarted() {
        lock.lock();
        try { if (active) { connection++; prepared = false; } }
        finally { lock.unlock(); }
    }
    void clear() {
        lock.lock();
        try { active = false; events.clear(); truncated = false; prepared = false; observeClock = false; connection = 0; }
        finally { lock.unlock(); }
    }
    Event record(String channel, String direction, String status, byte[] bytes) {
        if (!active) return null;
        if (!lock.tryLock()) { truncated = true; return null; }
        try {
            if (!active) return null;
            if (events.size() >= MAX_EVENTS) { truncated = true; return null; }
            Event event = new Event(events.size() + 1, connection, clock.wall(), Math.max(0, clock.monotonic() - started), channel, direction, status, bytes);
            if (event.originalBytes > MAX_BYTES) truncated = true;
            events.add(event);
            return event;
        } finally { lock.unlock(); }
    }
    void decoded(Event event, String detail) {
        if (event == null || detail == null) return;
        if (detail.length() > MAX_DETAIL) truncated = true;
        event.decoded = detail.substring(0, Math.min(detail.length(), MAX_DETAIL));
    }
    Snapshot snapshot() {
        lock.lock();
        try { return new Snapshot(active, truncated, prepared, observeClock, new ArrayList<>(events)); }
        finally { lock.unlock(); }
    }
}
