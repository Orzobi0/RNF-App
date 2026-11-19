package com.fertiliapp.fertiliapp;

import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCharacteristic;
import android.os.Build;
import android.os.Handler;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;

/** One documented write at a time, sharing the transport owner's exclusion gate. */
final class EasyHomeOperation {
    private final Handler handler;
    private PluginCall call;
    private BluetoothGatt gatt, uncertain;
    private Runnable timeout;
    private String operation, deviceKey;
    EasyHomeOperation(Handler handler) { this.handler = handler; }
    synchronized boolean busy() { return call != null; }
    synchronized boolean uncertain(BluetoothGatt candidate) { return candidate != null && candidate == uncertain; }
    synchronized void start(BluetoothGatt connection, PluginCall pending, byte[] command, String type, String key) {
        gatt = connection; call = pending; operation = type; deviceKey = key;
        timeout = () -> finish(false, "EASYHOME_RECONNECT_REQUIRED");
        handler.postDelayed(timeout, 8000);
        try {
            BluetoothGattCharacteristic target = gatt.getService(EasyHomeProfile.SERVICE).getCharacteristic(EasyHomeProfile.WRITE);
            int mode = (target.getProperties() & BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE) != 0
                ? BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE : BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT;
            boolean accepted;
            if (Build.VERSION.SDK_INT >= 33) accepted = gatt.writeCharacteristic(target, command, mode) == 0;
            else { target.setWriteType(mode); target.setValue(command); accepted = gatt.writeCharacteristic(target); }
            if (!accepted) finish(false, "EASYHOME_WRITE_FAILED");
        } catch (Exception error) { finish(false, "EASYHOME_WRITE_FAILED"); }
    }
    synchronized void onWrite(BluetoothGatt connection, int status) { if (call != null && gatt == connection) finish(status == BluetoothGatt.GATT_SUCCESS, "EASYHOME_WRITE_FAILED"); }
    private synchronized void finish(boolean success, String code) {
        if (call == null) return;
        PluginCall pending = call; call = null; handler.removeCallbacks(timeout);
        if (!success) { uncertain = gatt; pending.reject("No se pudo confirmar el ajuste. Deten y reconecta antes de reintentar.", code); }
        else {
            JSObject result = new JSObject(); result.put("writeAccepted", true); result.put("verified", false);
            result.put("operation", operation); result.put("deviceKey", deviceKey); result.put("checkedAt", System.currentTimeMillis());
            pending.resolve(result);
        }
        gatt = null;
    }
    synchronized void cancel() { if (call != null) finish(false, "EASYHOME_CANCELLED"); uncertain = null; }
}
