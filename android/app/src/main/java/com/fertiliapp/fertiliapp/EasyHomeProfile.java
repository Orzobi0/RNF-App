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
    static byte[] celsiusCommand() { return unitCommand(1); }
    static byte[] unitCommand(int unit) {
        if (unit != 1 && unit != 2) throw new IllegalArgumentException("unit");
        return new byte[] {90, 6, 6, (byte)unit, (byte)255, (byte)255, (byte)255, (byte)255, (byte)250};
    }
    static byte[] clockCommand(java.util.Calendar local) {
        int year = local.get(java.util.Calendar.YEAR);
        if (year < 1970 || year > 2225 || local.get(java.util.Calendar.ERA) != java.util.GregorianCalendar.AD) throw new IllegalArgumentException("year");
        int month = local.get(java.util.Calendar.MONTH) + 1, day = local.get(java.util.Calendar.DAY_OF_MONTH);
        int hour = local.get(java.util.Calendar.HOUR_OF_DAY), minute = local.get(java.util.Calendar.MINUTE), second = local.get(java.util.Calendar.SECOND);
        BleClockCodec.dateTime(year, month, day, hour, minute, second);
        return new byte[] {90, 3, 6, (byte)(year - 1970), (byte)month, (byte)day, (byte)hour, (byte)minute, (byte)second};
    }
    static final class Reading {
        final double temperature, original; final String timestamp, inferredUnit; final boolean live;
        Reading(double temperature, double original, String inferredUnit, String timestamp, boolean live) {
            this.temperature = temperature; this.original = original; this.inferredUnit = inferredUnit; this.timestamp = timestamp; this.live = live;
        }
    }
    static Reading decode(byte[] data, boolean celsiusConfigured) {
        if (!celsiusConfigured || data == null || data.length != 15 || (data[1] != 1 && data[1] != 17))
            throw new IllegalArgumentException("packet");
        int year = 1970 + (data[8] & 255) + ((data[9] & 255) << 8);
        if (year > 2100) throw new IllegalArgumentException("year");
        String timestamp = BleClockCodec.dateTime(year, data[10] & 255, data[11] & 255,
            data[12] & 255, data[13] & 255, data[14] & 255);
        double temperature = ((data[4] & 255) + ((data[5] & 255) << 8)) / 100.0;
        // Manufacturer EBT-300 manual: 89.6–109.4 F (32–43 C).
        double original = temperature;
        String inferredUnit;
        // Provisional range inference, NOT a transmitted unit flag or hardware verification.
        if (temperature >= 32 && temperature <= 43) inferredUnit = "celsius";
        else if (temperature >= 89.6 && temperature <= 109.4) {
            inferredUnit = "fahrenheit";
            temperature = Math.round((temperature - 32) * 5 / 9 * 100) / 100.0;
        } else throw new IllegalArgumentException("range");
        return new Reading(temperature, original, inferredUnit, timestamp, data[1] == 1);
    }
}
