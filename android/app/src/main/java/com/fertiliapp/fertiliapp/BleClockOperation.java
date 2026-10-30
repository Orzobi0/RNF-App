package com.fertiliapp.fertiliapp;

import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCharacteristic;
import android.os.Build;
import android.os.Handler;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import java.util.Calendar;
import java.util.GregorianCalendar;
import java.util.Locale;
import java.util.TimeZone;

/** A single optional CTS transaction on the existing GATT. Never closes the temperature transport. */
final class BleClockOperation {
    private final Handler handler;
    private PluginCall pending;
    private BluetoothGatt transport;
    private BluetoothGatt uncertainTransport;
    private BluetoothGattCharacteristic characteristic;
    private Runnable timeout;
    private boolean writing;
    private boolean accepted;
    private boolean syncing;
    private String phoneZone;
    private int phoneOffset;
    private String requestedLocal;

    BleClockOperation(Handler handler) { this.handler = handler; }

    synchronized void start(BluetoothGatt gatt, PluginCall call, boolean sync) {
        if (pending != null) { call.reject("Ya hay una operacion de reloj.", "CLOCK_BUSY"); return; }
        if (gatt == null) { call.reject("Inicia la escucha antes de consultar el reloj.", "CLOCK_NOT_CONNECTED"); return; }
        if (gatt == uncertainTransport) {
            call.reject("La operacion anterior no respondio. Deten y vuelve a conectar antes de usar el reloj.", "CLOCK_RECONNECT_REQUIRED"); return;
        }
        BluetoothGattCharacteristic target = Vinca2Profile.clock(gatt);
        int required = sync ? BluetoothGattCharacteristic.PROPERTY_WRITE : BluetoothGattCharacteristic.PROPERTY_READ;
        if (target == null || (target.getProperties() & required) == 0) {
            call.reject("El dispositivo no anuncia esta operacion de reloj.", "CLOCK_UNSUPPORTED"); return;
        }
        pending = call;
        transport = gatt;
        characteristic = target;
        syncing = sync;
        writing = sync;
        accepted = false;
        Calendar now = phoneNow();
        phoneZone = now.getTimeZone().getID();
        phoneOffset = now.getTimeZone().getOffset(now.getTimeInMillis());
        timeout = () -> {
            synchronized (BleClockOperation.this) {
                if (pending != call) return;
                uncertainTransport = gatt; // A late callback must not complete a later request.
                fail("CLOCK_TIMEOUT", "El reloj no respondio; la escucha sigue activa. El resultado del ajuste puede ser desconocido.");
            }
        };
        handler.postDelayed(timeout, 8000L);
        try {
            if (!sync) { read(); return; }
            byte[] payload = BleClockCodec.encodeCurrentTime(now);
            requestedLocal = BleClockCodec.localText(BleClockCodec.decodeCurrentTime(payload));
            boolean started;
            if (Build.VERSION.SDK_INT >= 33) {
                started = gatt.writeCharacteristic(target, payload, BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT) == BluetoothGatt.GATT_SUCCESS;
            } else {
                target.setWriteType(BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT);
                target.setValue(payload);
                started = gatt.writeCharacteristic(target);
            }
            if (!started) fail("CLOCK_WRITE_FAILED", "No se pudo iniciar el ajuste del reloj.");
        } catch (Exception error) {
            fail("CLOCK_OPERATION_FAILED", "No se pudo realizar la operacion de reloj.");
        }
    }

    private void read() {
        writing = false;
        try {
            if (!transport.readCharacteristic(characteristic)) fail("CLOCK_READ_FAILED", "No se pudo leer el reloj.");
        } catch (Exception error) { fail("CLOCK_READ_FAILED", "No se pudo leer el reloj."); }
    }

    synchronized void onWrite(BluetoothGatt gatt, int status) {
        if (pending == null || transport != gatt || !writing) return;
        if (status != BluetoothGatt.GATT_SUCCESS) {
            fail("CLOCK_WRITE_FAILED", "El dispositivo rechazo el ajuste o ignoro campos de fecha/hora."); return;
        }
        accepted = true;
        if ((characteristic.getProperties() & BluetoothGattCharacteristic.PROPERTY_READ) != 0) read();
        else complete(null);
    }

    synchronized void onRead(BluetoothGatt gatt, byte[] value, int status) {
        if (pending == null || transport != gatt || writing) return;
        if (status != BluetoothGatt.GATT_SUCCESS) { fail("CLOCK_READ_FAILED", "No se pudo verificar el reloj mediante lectura."); return; }
        try { complete(BleClockCodec.decodeCurrentTime(value)); }
        catch (IllegalArgumentException error) { fail("CLOCK_INVALID_DATE", "El reloj contiene una fecha desconocida o invalida."); }
    }

    private void complete(int[] fields) {
        JSObject result = new JSObject();
        result.put("writeAccepted", accepted);
        result.put("verified", syncing && fields != null && BleClockCodec.matchesPhone(fields, phoneNow(), phoneZone, phoneOffset));
        result.put("deviceLocalTime", fields == null ? null : BleClockCodec.localText(fields));
        result.put("requestedLocalTime", syncing ? requestedLocal : null);
        result.put("phoneTimeZone", phoneZone);
        result.put("phoneUtcOffsetMinutes", phoneOffset / 60000);
        result.put("deviceTimeZone", "unknown");
        PluginCall call = pending;
        clear();
        call.resolve(result);
    }

    private void fail(String code, String message) {
        if (pending == null) return;
        PluginCall call = pending;
        JSObject detail = new JSObject();
        detail.put("writeAccepted", accepted);
        clear();
        call.reject(message, code, detail);
    }

    synchronized void cancel() { fail("CONNECTION_CANCELLED", "Operacion de reloj cancelada; un ajuste ya enviado no se puede deshacer."); }

    private void clear() {
        if (timeout != null) handler.removeCallbacks(timeout);
        timeout = null;
        pending = null;
        transport = null;
        characteristic = null;
    }

    private Calendar phoneNow() { return new GregorianCalendar(TimeZone.getDefault(), Locale.ROOT); }
}
