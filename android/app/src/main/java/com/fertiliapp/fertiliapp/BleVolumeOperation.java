package com.fertiliapp.fertiliapp;

import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCharacteristic;
import android.os.Build;
import android.os.Handler;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import java.util.function.BiConsumer;
import java.util.function.Consumer;
import java.util.function.IntPredicate;

/** Only the two Vinca 2 volume writes. GATT acceptance is not physical verification. */
final class BleVolumeOperation {
    private final BiConsumer<Runnable, Long> schedule;
    private final Consumer<Runnable> unschedule;
    private BiConsumer<String, String> pending;
    private Object transport;
    private Object uncertainTransport;
    private Object expected;
    private IntPredicate write;
    private String level;
    private boolean confirming;
    private Runnable timeout;

    BleVolumeOperation(Handler handler) {
        this((task, delay) -> handler.postDelayed(task, delay), handler::removeCallbacks);
    }
    // Same narrow test seam as the device-info operation; no other BLE operations use it.
    BleVolumeOperation(BiConsumer<Runnable, Long> schedule, Consumer<Runnable> unschedule) {
        this.schedule = schedule;
        this.unschedule = unschedule;
    }

    static int command(String level) {
        if ("low".equals(level)) return 0x09;
        if ("medium".equals(level)) return 0x14;
        if ("high".equals(level)) return 0x16;
        return -1;
    }
    static boolean supportsResponse(int properties) {
        return (properties & BluetoothGattCharacteristic.PROPERTY_WRITE) != 0;
    }
    synchronized boolean busy() { return pending != null; }
    synchronized boolean uncertain(Object gatt) { return gatt != null && gatt == uncertainTransport; }

    synchronized void start(BluetoothGatt gatt, PluginCall call, String requested) {
        BluetoothGattCharacteristic target = Vinca2Profile.volume(gatt);
        start(gatt, target, target == null ? 0 : target.getProperties(), requested, value -> {
            byte[] payload = new byte[] {(byte) value};
            if (Build.VERSION.SDK_INT >= 33) {
                return gatt.writeCharacteristic(target, payload, BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT) == BluetoothGatt.GATT_SUCCESS;
            }
            target.setWriteType(BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT);
            if (!target.setValue(payload)) return false;
            return gatt.writeCharacteristic(target);
        }, (acceptedLevel, code) -> {
            if (code != null) {
                call.reject("No se pudo completar el ajuste de volumen.", code);
            } else {
                JSObject result = new JSObject();
                result.put("level", acceptedLevel);
                result.put("outcome", "accepted");
                result.put("commandsAccepted", true);
                result.put("verified", false);
                call.resolve(result);
            }
        });
    }

    synchronized void start(Object connection, Object target, int properties, String requested,
            IntPredicate writer, BiConsumer<String, String> completion) {
        int value = command(requested);
        if (value < 0) { completion.accept(null, "VOLUME_INVALID_LEVEL"); return; }
        if (busy()) { completion.accept(null, "VOLUME_BUSY"); return; }
        if (connection == null) { completion.accept(null, "VOLUME_NOT_CONNECTED"); return; }
        if (uncertain(connection)) { completion.accept(null, "VOLUME_RECONNECT_REQUIRED"); return; }
        if (target == null || !supportsResponse(properties)) { completion.accept(null, "VOLUME_UNSUPPORTED"); return; }
        transport = connection;
        expected = target;
        level = requested;
        write = writer;
        pending = completion;
        confirming = false;
        timeout = () -> {
            synchronized (BleVolumeOperation.this) {
                if (pending == completion) fail("VOLUME_TIMEOUT");
            }
        };
        schedule.accept(timeout, 8000L); // Total for both writes, below the 20s JS bridge limit.
        send(value);
    }

    private void send(int value) {
        try {
            if (!write.test(value)) fail(confirming ? "VOLUME_CONFIRM_WRITE_FAILED" : "VOLUME_FIRST_WRITE_FAILED");
        } catch (Exception error) {
            fail(confirming ? "VOLUME_CONFIRM_WRITE_FAILED" : "VOLUME_FIRST_WRITE_FAILED");
        }
    }

    synchronized void onWrite(Object gatt, Object characteristic, int status) {
        if (pending == null || transport != gatt || expected != characteristic) return;
        if (status != BluetoothGatt.GATT_SUCCESS) {
            fail(confirming ? "VOLUME_CONFIRM_WRITE_FAILED" : "VOLUME_FIRST_WRITE_FAILED");
            return;
        }
        if (!confirming) {
            confirming = true;
            send(0xFD); // Separate write, only after the first callback succeeded.
            return;
        }
        BiConsumer<String, String> completion = pending;
        String acceptedLevel = level;
        clear();
        completion.accept(acceptedLevel, null);
    }

    private void fail(String code) {
        if (pending == null) return;
        // Partial command sequences and unanswered writes must never be retried on this GATT.
        uncertainTransport = transport;
        BiConsumer<String, String> completion = pending;
        clear();
        completion.accept(null, code);
    }
    synchronized void cancel() { fail("VOLUME_CANCELLED"); }
    private void clear() {
        if (timeout != null) unschedule.accept(timeout);
        timeout = null;
        pending = null;
        transport = null;
        expected = null;
        write = null;
        level = null;
    }
}
