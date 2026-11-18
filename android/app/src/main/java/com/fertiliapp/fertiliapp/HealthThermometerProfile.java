package com.fertiliapp.fertiliapp;

import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothGattCharacteristic;
import java.util.UUID;

/** Experimental final measurements only; no clock, interval or manufacturer writes. */
final class HealthThermometerProfile {
    static final UUID SERVICE = UUID.fromString("00001809-0000-1000-8000-00805f9b34fb");
    static final UUID MEASUREMENT = UUID.fromString("00002a1c-0000-1000-8000-00805f9b34fb");
    static final UUID CCCD = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");
    static boolean supports(BluetoothGatt gatt) {
        BluetoothGattService service = gatt.getService(SERVICE);
        BluetoothGattCharacteristic value = service == null ? null : service.getCharacteristic(MEASUREMENT);
        return requirements(value != null, value == null ? 0 : value.getProperties(), value != null && value.getDescriptor(CCCD) != null);
    }
    static boolean requirements(boolean measurement, int properties, boolean cccd) {
        return measurement && (properties & 0x20) != 0 && cccd;
    }
}
