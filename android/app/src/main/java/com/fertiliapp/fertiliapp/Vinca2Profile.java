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

    static final String MODEL = "BM-Vinca2";
    static final String PROTOCOL = "vinca2";
    private static final UUID HEALTH = UUID.fromString("00001809-0000-1000-8000-00805f9b34fb");
    private static final UUID MEASUREMENT = UUID.fromString("00002a1c-0000-1000-8000-00805f9b34fb");
    private static final UUID INTERVAL = UUID.fromString("00002a21-0000-1000-8000-00805f9b34fb");
    private static final UUID CCCD = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");

    static boolean identifies(String advertisedName, String reportedModel) {
        // A conflicting DIS model wins over an advertised name; shared vendor UUIDs
        // must not silently turn another model into a Vinca 2.
        if (reportedModel != null) return MODEL.equalsIgnoreCase(reportedModel.trim());
        return advertisedName != null && advertisedName.toLowerCase(java.util.Locale.ROOT)
            .matches(".*(?:^|[^a-z0-9])bm-vinca2(?:$|[^a-z0-9]).*");
    }

    // Identity AND the proprietary fingerprint are required by the connection owner.
    // The standard Health Thermometer service alone never identifies this protocol.
    static boolean matches(BluetoothGatt gatt) {
        BluetoothGattService service = gatt == null ? null : gatt.getService(CONFIGURATION_SERVICE);
        return service != null && service.getCharacteristic(CONFIGURATION) != null
            && service.getCharacteristic(INDICATION) != null;
    }

    static boolean supports(BluetoothGatt gatt) {
        if (!matches(gatt)) return false;
        BluetoothGattService health = gatt.getService(HEALTH);
        BluetoothGattCharacteristic measurement = health == null ? null : health.getCharacteristic(MEASUREMENT);
        BluetoothGattCharacteristic interval = health == null ? null : health.getCharacteristic(INTERVAL);
        BluetoothGattCharacteristic indication = gatt.getService(CONFIGURATION_SERVICE).getCharacteristic(INDICATION);
        return supportsFacts(true, measurement == null ? 0 : measurement.getProperties(),
            measurement != null && measurement.getDescriptor(CCCD) != null,
            indication.getProperties(), indication.getDescriptor(CCCD) != null,
            interval == null ? 0 : interval.getProperties());
    }

    static boolean supportsFacts(boolean fingerprint, int measurementProperties, boolean measurementCccd,
            int indicationProperties, boolean indicationCccd, int intervalProperties) {
        return fingerprint && (measurementProperties & BluetoothGattCharacteristic.PROPERTY_INDICATE) != 0
            && measurementCccd && indicationCccd
            && (indicationProperties & BluetoothGattCharacteristic.PROPERTY_INDICATE) != 0
            && (intervalProperties & BluetoothGattCharacteristic.PROPERTY_WRITE) != 0;
    }

    static BluetoothGattCharacteristic clock(BluetoothGatt gatt) {
        BluetoothGattService service = gatt == null ? null : gatt.getService(CURRENT_TIME_SERVICE);
        return service == null ? null : service.getCharacteristic(CURRENT_TIME);
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
        if (!supports(gatt)) return result;
        result.put("model", MODEL);
        result.put("protocol", PROTOCOL);
        result.put("compatibility", "compatible");
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
