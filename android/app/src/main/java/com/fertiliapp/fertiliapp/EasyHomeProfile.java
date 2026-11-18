package com.fertiliapp.fertiliapp;

import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattService;
import java.util.UUID;

/** EBT-300 only. Port of easyathome-ble 0.2.4; see docs/easyathome-protocol.md and license. */
final class EasyHomeProfile {
    static final String MODEL = "EBT-300", PROTOCOL = "easyhome-ebt300";
    static final UUID SERVICE = UUID.fromString("0000ffe0-0000-1000-8000-00805f9b34fb");
    static final UUID WRITE = UUID.fromString("0000ffe1-0000-1000-8000-00805f9b34fb");
    static final UUID NOTIFY = UUID.fromString("0000ffe2-0000-1000-8000-00805f9b34fb");
    static boolean identifies(String name, String model) {
        return model != null ? MODEL.equalsIgnoreCase(model.trim()) : name != null && MODEL.equalsIgnoreCase(name.trim());
    }
    static boolean requirements(int write, int notify, boolean cccd) {
        return (write & (0x04 | 0x08)) != 0 && (notify & 0x10) != 0 && cccd;
    }
    static boolean supports(BluetoothGatt gatt) {
        BluetoothGattService service = gatt.getService(SERVICE);
        BluetoothGattCharacteristic write = service == null ? null : service.getCharacteristic(WRITE);
        BluetoothGattCharacteristic notify = service == null ? null : service.getCharacteristic(NOTIFY);
        return write != null && notify != null && requirements(write.getProperties(), notify.getProperties(),
            notify.getDescriptor(HealthThermometerProfile.CCCD) != null);
    }
    // Source configures Celsius before receiving packets; no unit flag is documented in a packet.
    static byte[] celsiusCommand() { return new byte[] {90, 6, 6, 1, (byte)255, (byte)255, (byte)255, (byte)255, (byte)250}; }
    static final class Reading {
        final double temperature; final String timestamp; final boolean live;
        Reading(double temperature, String timestamp, boolean live) { this.temperature = temperature; this.timestamp = timestamp; this.live = live; }
    }
    static Reading decode(byte[] data, boolean celsiusConfigured) {
        if (!celsiusConfigured || data == null || data.length != 15 || (data[1] != 1 && data[1] != 17))
            throw new IllegalArgumentException("packet");
        int year = 1970 + (data[8] & 255) + ((data[9] & 255) << 8);
        if (year > 2100) throw new IllegalArgumentException("year");
        String timestamp = BleClockCodec.dateTime(year, data[10] & 255, data[11] & 255,
            data[12] & 255, data[13] & 255, data[14] & 255);
        return new Reading(((data[4] & 255) + ((data[5] & 255) << 8)) / 100.0, timestamp, data[1] == 1);
    }
}
