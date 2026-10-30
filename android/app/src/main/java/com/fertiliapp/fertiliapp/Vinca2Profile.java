package com.fertiliapp.fertiliapp;

import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattService;
import com.getcapacitor.JSObject;
import java.util.UUID;

/** Only model facts/capabilities; connection ownership stays in FemometerBle. */
final class Vinca2Profile {
    static final UUID CONFIGURATION_SERVICE = UUID.fromString("0f0e0d0c-0b0a-0908-0706-050403020100");
    static final UUID INDICATION = UUID.fromString("3f3e3d3c-3b3a-3938-3736-353433323130");
    static final UUID CURRENT_TIME_SERVICE = UUID.fromString("00001805-0000-1000-8000-00805f9b34fb");
    static final UUID CURRENT_TIME = UUID.fromString("00002a2b-0000-1000-8000-00805f9b34fb");

    static BluetoothGattCharacteristic clock(BluetoothGatt gatt) {
        BluetoothGattService service = gatt == null ? null : gatt.getService(CURRENT_TIME_SERVICE);
        return service == null ? null : service.getCharacteristic(CURRENT_TIME);
    }

    static JSObject capabilities(BluetoothGatt gatt) {
        BluetoothGattCharacteristic clock = clock(gatt);
        int properties = clock == null ? 0 : clock.getProperties();
        JSObject result = new JSObject();
        result.put("model", "BM-Vinca2");
        result.put("clockProtocol", clock == null ? "unavailable" : "bluetooth-current-time");
        result.put("clockRead", (properties & BluetoothGattCharacteristic.PROPERTY_READ) != 0);
        result.put("clockSync", (properties & BluetoothGattCharacteristic.PROPERTY_WRITE) != 0);
        result.put("historyReceive", true); // Buffered indications observed on this model.
        result.put("historyRequest", false); // No explicit history command implemented.
        result.put("modeConfiguration", false); // Model supports modes; app does not configure them.
        return result;
    }
}
