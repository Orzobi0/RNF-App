package com.fertiliapp.fertiliapp;

import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCharacteristic;
import android.os.Handler;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.function.BiConsumer;
import java.util.function.Consumer;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/** Five optional standard reads on the listening transport; never writes or closes it. */
final class BleDeviceInfoOperation {
    static final String[] FIELDS = { "battery", "model", "manufacturer", "firmware", "software" };
    // Narrow seams let JVM tests drive the real queue and timeout without Android hardware.
    interface Reads {
        Object readableTarget(int field);
        boolean read(Object target);
    }
    private final BiConsumer<Runnable, Long> schedule;
    private final Consumer<Runnable> unschedule;
    private BiConsumer<Map<String, Object>, String> pending;
    private Object transport;
    private Object uncertainTransport;
    private Object expected;
    private Reads reads;
    private Map<String, Object> result;
    private int index;
    private Runnable timeout;

    BleDeviceInfoOperation(Handler handler) {
        this((task, delay) -> handler.postDelayed(task, delay), handler::removeCallbacks);
    }
    BleDeviceInfoOperation(BiConsumer<Runnable, Long> schedule, Consumer<Runnable> unschedule) {
        this.schedule = schedule;
        this.unschedule = unschedule;
    }
    synchronized boolean busy() { return pending != null; }
    synchronized boolean uncertain(Object gatt) { return gatt != null && gatt == uncertainTransport; }

    synchronized void start(BluetoothGatt gatt, PluginCall call) {
        start(gatt, new Reads() {
            public Object readableTarget(int field) {
                BluetoothGattCharacteristic target = Vinca2Profile.deviceInfo(gatt, field);
                return target != null && (target.getProperties() & BluetoothGattCharacteristic.PROPERTY_READ) != 0 ? target : null;
            }
            public boolean read(Object target) { return gatt.readCharacteristic((BluetoothGattCharacteristic) target); }
        }, (values, code) -> {
            if (code != null) {
                call.reject("No se pudo completar la consulta. Deten y reconecta antes de reintentar; la escucha continua.", code);
            } else {
                JSObject data = new JSObject();
                for (String field : FIELDS) data.put(field, values.get(field) == null ? JSONObject.NULL : values.get(field));
                call.resolve(data);
            }
        });
    }

    synchronized void start(Object connection, Reads access, BiConsumer<Map<String, Object>, String> completion) {
        if (busy()) { completion.accept(null, "DEVICE_INFO_BUSY"); return; }
        if (uncertain(connection)) { completion.accept(null, "DEVICE_INFO_RECONNECT_REQUIRED"); return; }
        pending = completion;
        transport = connection;
        reads = access;
        index = 0;
        result = new LinkedHashMap<>();
        for (String field : FIELDS) result.put(field, null);
        timeout = () -> {
            synchronized (BleDeviceInfoOperation.this) {
                if (pending == completion) fail("DEVICE_INFO_TIMEOUT");
            }
        };
        // Total budget, below the JS bridge's 20 seconds, not five per-field timeouts.
        schedule.accept(timeout, 12000L);
        next();
    }

    private void next() {
        try {
            while (index < FIELDS.length) {
                expected = reads.readableTarget(index);
                if (expected == null) {
                    index++;
                    continue;
                }
                if (!reads.read(expected)) fail("DEVICE_INFO_READ_FAILED");
                return; // Only its callback may advance the queue.
            }
            BiConsumer<Map<String, Object>, String> completion = pending;
            Map<String, Object> completed = result;
            clear();
            completion.accept(completed, null);
        } catch (Exception error) { fail("DEVICE_INFO_READ_FAILED"); }
    }

    synchronized void onRead(Object gatt, Object characteristic, byte[] value, int status) {
        if (pending == null || transport != gatt || expected != characteristic) return;
        if (status != BluetoothGatt.GATT_SUCCESS) { fail("DEVICE_INFO_READ_FAILED"); return; }
        Object decoded = index == 0 ? battery(value) : text(value);
        result.put(FIELDS[index], decoded);
        expected = null;
        index++;
        next();
    }

    static Integer battery(byte[] value) {
        if (value == null || value.length != 1) return null;
        int level = value[0] & 0xff;
        return level <= 100 ? level : null;
    }

    static String text(byte[] value) {
        if (value == null || value.length == 0 || value.length > 512) return null;
        try {
            String decoded = StandardCharsets.UTF_8.newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT)
                .decode(ByteBuffer.wrap(value)).toString();
            String clean = decoded.replaceAll("[\\p{Cc}\\p{Cf}\\p{Cs}\\p{Co}\\p{Cn}\\uFFFD]", "").trim();
            if (clean.isEmpty() || clean.codePointCount(0, clean.length()) > 128) return null;
            return clean;
        } catch (CharacterCodingException error) { return null; }
    }

    private void fail(String code) {
        if (pending == null) return;
        // Never reuse an uncertain GATT, even if its callback arrives later.
        uncertainTransport = transport;
        BiConsumer<Map<String, Object>, String> completion = pending;
        clear();
        completion.accept(null, code);
    }

    synchronized void cancel() { fail("CONNECTION_CANCELLED"); }

    private void clear() {
        if (timeout != null) unschedule.accept(timeout);
        timeout = null;
        pending = null;
        transport = null;
        expected = null;
        result = null;
        reads = null;
    }
}
