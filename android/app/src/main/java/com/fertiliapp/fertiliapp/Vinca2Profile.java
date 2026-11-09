package com.fertiliapp.fertiliapp;

import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattService;
import com.getcapacitor.JSObject;
import java.util.UUID;

/** Only model facts/capabilities; connection ownership stays in FemometerBle. */
final class Vinca2Profile {
    static final UUID CONFIGURATION_SERVICE = UUID.fromString("0f0e0d0c-0b0a-0908-0706-050403020100");
    static final UUID CONFIGURATION = UUID.fromString("2f2e2d2c-2b2a-2928-2726-252423222120");
    static final UUID INDICATION = UUID.fromString("3f3e3d3c-3b3a-3938-3736-353433323130");
    static final UUID CURRENT_TIME_SERVICE = UUID.fromString("00001805-0000-1000-8000-00805f9b34fb");
    static final UUID CURRENT_TIME = UUID.fromString("00002a2b-0000-1000-8000-00805f9b34fb");

    static BluetoothGattCharacteristic clock(BluetoothGatt gatt) {
        BluetoothGattService service = gatt == null ? null : gatt.getService(CURRENT_TIME_SERVICE);
        return service == null ? null : service.getCharacteristic(CURRENT_TIME);
    }

    // Whitelist only; deliberately excludes serial number and other identifiers.
    static BluetoothGattCharacteristic deviceInfo(BluetoothGatt gatt, int index) {
        String[] ids = { "2a19", "2a24", "2a29", "2a26", "2a28" };
        UUID serviceId = UUID.fromString("0000" + (index == 0 ? "180f" : "180a") + "-0000-1000-8000-00805f9b34fb");
        BluetoothGattService service = gatt.getService(serviceId);
        return service == null ? null : service.getCharacteristic(UUID.fromString("0000" + ids[index] + "-0000-1000-8000-00805f9b34fb"));
    }

    static BluetoothGattCharacteristic volume(BluetoothGatt gatt) {
        BluetoothGattService service = gatt == null ? null : gatt.getService(CONFIGURATION_SERVICE);
        // Fail closed for devices without the Vinca-specific channel.
        if (service == null || service.getCharacteristic(INDICATION) == null) return null;
        return service.getCharacteristic(CONFIGURATION);
    }

    static BluetoothGattCharacteristic measurementMode(BluetoothGatt gatt) {
        return volume(gatt); // Same Vinca configuration characteristic and compatibility guard.
    }

    static JSObject capabilities(BluetoothGatt gatt) {
        BluetoothGattCharacteristic clock = clock(gatt);
        int properties = clock == null ? 0 : clock.getProperties();
        JSObject result = new JSObject();
        result.put("model", "BM-Vinca2");
        BluetoothGattCharacteristic volume = volume(gatt);
        result.put("volumeWrite", volume != null && BleVolumeOperation.supportsResponse(volume.getProperties()));
        result.put("clockProtocol", clock == null ? "unavailable" : "bluetooth-current-time");
        result.put("clockRead", (properties & BluetoothGattCharacteristic.PROPERTY_READ) != 0);
        result.put("clockSync", (properties & BluetoothGattCharacteristic.PROPERTY_WRITE) != 0);
        result.put("historyReceive", true); // Buffered indications observed on this model.
        result.put("historyRequest", false); // No explicit history command implemented.
        result.put("modeConfiguration", volume != null && BleMeasurementModeOperation.supportsResponse(volume.getProperties()));
        return result;
    }
}
