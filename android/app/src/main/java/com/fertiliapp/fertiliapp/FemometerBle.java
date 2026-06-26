package com.fertiliapp.fertiliapp;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanResult;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

@CapacitorPlugin(
    name = "FemometerBle",
    permissions = {
        @Permission(alias = "bluetoothScan", strings = { Manifest.permission.BLUETOOTH_SCAN }),
        @Permission(alias = "bluetoothConnect", strings = { Manifest.permission.BLUETOOTH_CONNECT }),
        @Permission(alias = "location", strings = { Manifest.permission.ACCESS_FINE_LOCATION })
    }
)
public class FemometerBle extends Plugin {
    private static final String TAG = "FemometerBle";
    private static final String BLUETOOTH_SCAN_ALIAS = "bluetoothScan";
    private static final String BLUETOOTH_CONNECT_ALIAS = "bluetoothConnect";
    private static final String LOCATION_ALIAS = "location";
    private static final long SCAN_TIMEOUT_MS = 8000L;
    private static final long CONNECT_TIMEOUT_MS = 15000L;
    private static final long DISCOVER_TIMEOUT_MS = 10000L;
    private static final String DEVICE_NAME_FRAGMENT = "bm-vinca2";
    private static final UUID HEALTH_THERMOMETER_UUID = UUID.fromString("00001809-0000-1000-8000-00805f9b34fb");
    private static final UUID TEMPERATURE_MEASUREMENT_UUID = UUID.fromString("00002a1c-0000-1000-8000-00805f9b34fb");

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final Map<String, ScannedDevice> devicesById = new LinkedHashMap<>();
    private final Map<String, String> idsByAddress = new LinkedHashMap<>();

    private PluginCall scanCall;
    private ScanCallback scanCallback;
    private BluetoothGatt activeGatt;
    private PluginCall connectCall;
    private Runnable connectTimeoutRunnable;

    @PluginMethod
    public void requestBluetoothPermissions(PluginCall call) {
        Log.d(TAG, "requestBluetoothPermissions called");
        logPermissionStates("before request");

        String unavailableCode = getUnavailableCode();
        if (unavailableCode != null) {
            Log.d(TAG, "Permission request blocked: " + unavailableCode);
            rejectWithCode(call, unavailableCode);
            return;
        }

        String[] aliases = getRequiredPermissionAliases();
        if (aliases.length == 0 || hasRequiredRuntimePermissions()) {
            Log.d(TAG, "Permissions already granted");
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
            return;
        }

        requestPermissionForAliases(aliases, call, "bluetoothPermissionsCallback");
    }

    @PermissionCallback
    private void bluetoothPermissionsCallback(PluginCall call) {
        boolean granted = hasRequiredRuntimePermissions();
        Log.d(TAG, "Permission callback result: granted=" + granted);
        logPermissionStates("after callback");

        JSObject result = new JSObject();
        result.put("granted", granted);
        result.put("androidVersion", Build.VERSION.SDK_INT);
        result.put("permissionStates", buildPermissionStatesObject());

        if (granted) {
            call.resolve(result);
        } else {
            call.reject("Permisos Bluetooth denegados.", "PERMISSION_NOT_GRANTED", result);
        }
    }

    @PluginMethod
    public void scan(PluginCall call) {
        Log.d(TAG, "scan called");
        String blockedCode = getBlockedOperationCode();
        if (blockedCode != null) {
            Log.d(TAG, "Scan blocked: " + blockedCode);
            rejectWithCode(call, blockedCode);
            return;
        }
        if (scanCall != null) {
            Log.d(TAG, "Scan blocked: SCAN_IN_PROGRESS");
            call.reject("Ya hay una busqueda BLE en curso.", "SCAN_IN_PROGRESS");
            return;
        }

        BluetoothLeScanner scanner = getScanner();
        if (scanner == null) {
            Log.d(TAG, "Scan blocked: SCANNER_UNAVAILABLE");
            call.reject("No se pudo iniciar el escaneo BLE.", "SCANNER_UNAVAILABLE");
            return;
        }

        devicesById.clear();
        idsByAddress.clear();
        scanCall = call;
        scanCallback = new ScanCallback() {
            @Override
            public void onScanResult(int callbackType, ScanResult result) {
                handleScanResult(result);
            }

            @Override
            public void onBatchScanResults(List<ScanResult> results) {
                if (results == null) return;
                for (ScanResult result : results) {
                    handleScanResult(result);
                }
            }

            @Override
            public void onScanFailed(int errorCode) {
                Log.e(TAG, "BLE scan failed with errorCode=" + errorCode);
                PluginCall pending = scanCall;
                stopScanInternal();
                if (pending != null) {
                    pending.reject("Fallo la busqueda BLE.", "SCAN_FAILED");
                }
            }
        };

        try {
            scanner.startScan(scanCallback);
            Log.d(TAG, "BLE scan started");
        } catch (SecurityException error) {
            Log.e(TAG, "SecurityException starting BLE scan", error);
            stopScanInternal();
            call.reject("Faltan permisos Bluetooth para buscar dispositivos.", "PERMISSION_NOT_GRANTED");
            return;
        } catch (IllegalStateException error) {
            Log.e(TAG, "IllegalStateException starting BLE scan", error);
            stopScanInternal();
            call.reject("Bluetooth no esta disponible para buscar dispositivos.", "BLUETOOTH_UNAVAILABLE");
            return;
        } catch (Exception error) {
            Log.e(TAG, "Unexpected exception starting BLE scan", error);
            stopScanInternal();
            call.reject("No se pudo iniciar la busqueda BLE.", "SCAN_FAILED");
            return;
        }

        mainHandler.postDelayed(() -> {
            PluginCall pending = scanCall;
            stopScanInternal();
            if (pending != null) {
                Log.d(TAG, "BLE scan finished: femometerDevices=" + devicesById.size());
                JSObject result = new JSObject();
                result.put("devices", buildScannedDevicesArray());
                pending.resolve(result);
            }
        }, SCAN_TIMEOUT_MS);
    }

    @PluginMethod
    public void connectAndInspect(PluginCall call) {
        String deviceId = call.getString("deviceId");
        if (deviceId == null || deviceId.trim().isEmpty()) {
            call.reject("Falta el identificador interno del dispositivo.", "DEVICE_ID_REQUIRED");
            return;
        }

        String blockedCode = getBlockedOperationCode();
        if (blockedCode != null) {
            rejectWithCode(call, blockedCode);
            return;
        }

        ScannedDevice scannedDevice = devicesById.get(deviceId);
        if (scannedDevice == null) {
            call.reject("El dispositivo seleccionado ya no esta disponible. Vuelve a buscarlo.", "DEVICE_NOT_FOUND");
            return;
        }

        if (connectCall != null) {
            call.reject("Ya hay una conexion BLE en curso.", "CONNECTION_IN_PROGRESS");
            return;
        }

        closeActiveGatt();
        connectCall = call;

        BluetoothGattCallback callback = new BluetoothGattCallback() {
            @Override
            public void onConnectionStateChange(BluetoothGatt gatt, int status, int newState) {
                if (status != BluetoothGatt.GATT_SUCCESS) {
                    rejectConnectCall("No se pudo conectar con el termometro.", "CONNECTION_FAILED");
                    return;
                }

                if (newState == BluetoothProfile.STATE_CONNECTED) {
                    scheduleConnectTimeout(DISCOVER_TIMEOUT_MS, "SERVICE_DISCOVERY_TIMEOUT", "La deteccion de servicios BLE ha tardado demasiado.");
                    try {
                        if (!gatt.discoverServices()) {
                            rejectConnectCall("No se pudo iniciar la deteccion de servicios BLE.", "SERVICE_DISCOVERY_FAILED");
                        }
                    } catch (SecurityException error) {
                        Log.e(TAG, "SecurityException discovering BLE services", error);
                        rejectConnectCall("Faltan permisos Bluetooth para detectar servicios.", "PERMISSION_NOT_GRANTED");
                    } catch (Exception error) {
                        Log.e(TAG, "Unexpected exception discovering BLE services", error);
                        rejectConnectCall("No se pudo iniciar la deteccion de servicios BLE.", "SERVICE_DISCOVERY_FAILED");
                    }
                    return;
                }

                if (newState == BluetoothProfile.STATE_DISCONNECTED && connectCall != null) {
                    rejectConnectCall("El termometro se desconecto antes de terminar la comprobacion.", "DEVICE_DISCONNECTED");
                }
            }

            @Override
            public void onServicesDiscovered(BluetoothGatt gatt, int status) {
                if (status != BluetoothGatt.GATT_SUCCESS) {
                    rejectConnectCall("No se pudieron detectar los servicios BLE.", "SERVICE_DISCOVERY_FAILED");
                    return;
                }

                PluginCall pending = connectCall;
                JSObject result = buildInspectionResult(gatt);
                clearConnectState();
                activeGatt = null;
                closeGatt(gatt);
                if (pending != null) {
                    pending.resolve(result);
                }
            }
        };

        scheduleConnectTimeout(CONNECT_TIMEOUT_MS, "CONNECTION_TIMEOUT", "La conexion BLE ha tardado demasiado.");
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                activeGatt = scannedDevice.device.connectGatt(getContext(), false, callback, BluetoothDevice.TRANSPORT_LE);
            } else {
                activeGatt = scannedDevice.device.connectGatt(getContext(), false, callback);
            }
        } catch (SecurityException error) {
            Log.e(TAG, "SecurityException connecting BLE device", error);
            rejectConnectCall("Faltan permisos Bluetooth para conectar.", "PERMISSION_NOT_GRANTED");
        } catch (Exception error) {
            Log.e(TAG, "Unexpected exception connecting BLE device", error);
            rejectConnectCall("No se pudo abrir la conexion BLE.", "CONNECTION_FAILED");
        }

        if (activeGatt == null && connectCall != null) {
            rejectConnectCall("No se pudo abrir la conexion BLE.", "CONNECTION_FAILED");
        }
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        stopScanInternal();
        rejectPendingConnect("Conexion cancelada.", "CONNECTION_CANCELLED");
        closeActiveGatt();
        call.resolve();
    }

    @Override
    protected void handleOnStop() {
        stopScanInternal();
        rejectPendingConnect("Conexion cancelada al cerrar la app.", "CONNECTION_CANCELLED");
        closeActiveGatt();
    }

    @Override
    protected void handleOnDestroy() {
        stopScanInternal();
        rejectPendingConnect("Conexion cancelada al cerrar la app.", "CONNECTION_CANCELLED");
        closeActiveGatt();
    }

    private void handleScanResult(ScanResult result) {
        if (result == null || result.getDevice() == null) return;

        String advertisedName = null;
        if (result.getScanRecord() != null) {
            advertisedName = result.getScanRecord().getDeviceName();
        }
        if (advertisedName == null) {
            try {
                advertisedName = result.getDevice().getName();
            } catch (SecurityException error) {
                Log.e(TAG, "SecurityException reading advertised device name", error);
                return;
            } catch (Exception error) {
                Log.e(TAG, "Unexpected exception reading advertised device name", error);
                return;
            }
        }
        if (advertisedName == null || !advertisedName.toLowerCase(Locale.ROOT).contains(DEVICE_NAME_FRAGMENT)) {
            return;
        }

        String address;
        try {
            address = result.getDevice().getAddress();
        } catch (SecurityException error) {
            Log.e(TAG, "SecurityException reading internal BLE address", error);
            return;
        } catch (Exception error) {
            Log.e(TAG, "Unexpected exception reading internal BLE address", error);
            return;
        }

        String id = idsByAddress.get(address);
        if (id == null) {
            id = UUID.randomUUID().toString();
            idsByAddress.put(address, id);
        }
        devicesById.put(id, new ScannedDevice(result.getDevice(), advertisedName, result.getRssi()));
    }

    private JSArray buildScannedDevicesArray() {
        JSArray devices = new JSArray();
        for (Map.Entry<String, ScannedDevice> entry : devicesById.entrySet()) {
            JSObject device = new JSObject();
            device.put("id", entry.getKey());
            device.put("name", entry.getValue().name);
            device.put("rssi", entry.getValue().rssi);
            devices.put(device);
        }
        return devices;
    }

    private JSObject buildInspectionResult(BluetoothGatt gatt) {
        boolean healthThermometerFound = false;
        boolean temperatureMeasurementFound = false;
        JSArray services = new JSArray();

        for (BluetoothGattService service : gatt.getServices()) {
            UUID serviceUuid = service.getUuid();
            if (HEALTH_THERMOMETER_UUID.equals(serviceUuid)) {
                healthThermometerFound = true;
            }

            JSObject serviceJson = new JSObject();
            serviceJson.put("uuid", serviceUuid.toString());
            JSArray characteristics = new JSArray();

            for (BluetoothGattCharacteristic characteristic : service.getCharacteristics()) {
                UUID characteristicUuid = characteristic.getUuid();
                if (TEMPERATURE_MEASUREMENT_UUID.equals(characteristicUuid)) {
                    temperatureMeasurementFound = true;
                }

                JSObject characteristicJson = new JSObject();
                characteristicJson.put("uuid", characteristicUuid.toString());
                characteristicJson.put("properties", buildPropertiesArray(characteristic.getProperties()));
                characteristics.put(characteristicJson);
            }

            serviceJson.put("characteristics", characteristics);
            services.put(serviceJson);
        }

        JSObject result = new JSObject();
        result.put("healthThermometerFound", healthThermometerFound);
        result.put("temperatureMeasurementFound", temperatureMeasurementFound);
        result.put("services", services);
        return result;
    }

    private JSArray buildPropertiesArray(int properties) {
        JSArray propertyNames = new JSArray();
        if ((properties & BluetoothGattCharacteristic.PROPERTY_READ) != 0) {
            propertyNames.put("read");
        }
        if ((properties & BluetoothGattCharacteristic.PROPERTY_WRITE) != 0) {
            propertyNames.put("write");
        }
        if ((properties & BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE) != 0) {
            propertyNames.put("writeWithoutResponse");
        }
        if ((properties & BluetoothGattCharacteristic.PROPERTY_NOTIFY) != 0) {
            propertyNames.put("notify");
        }
        if ((properties & BluetoothGattCharacteristic.PROPERTY_INDICATE) != 0) {
            propertyNames.put("indicate");
        }
        return propertyNames;
    }

    private BluetoothAdapter getBluetoothAdapter() {
        BluetoothManager bluetoothManager = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        return bluetoothManager != null ? bluetoothManager.getAdapter() : null;
    }

    private BluetoothLeScanner getScanner() {
        BluetoothAdapter adapter = getBluetoothAdapter();
        return adapter != null ? adapter.getBluetoothLeScanner() : null;
    }

    private String getUnavailableCode() {
        if (!getContext().getPackageManager().hasSystemFeature(PackageManager.FEATURE_BLUETOOTH_LE)) {
            return "BLE_NOT_SUPPORTED";
        }
        BluetoothAdapter adapter = getBluetoothAdapter();
        if (adapter == null) {
            return "BLUETOOTH_UNAVAILABLE";
        }
        return null;
    }

    private String getBlockedOperationCode() {
        String unavailableCode = getUnavailableCode();
        if (unavailableCode != null) return unavailableCode;
        if (!hasRequiredRuntimePermissions()) {
            return "PERMISSION_NOT_GRANTED";
        }
        BluetoothAdapter adapter = getBluetoothAdapter();
        if (adapter == null || !adapter.isEnabled()) {
            return "BLUETOOTH_DISABLED";
        }
        return null;
    }

    private String[] getRequiredPermissionAliases() {
        List<String> aliases = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            aliases.add(BLUETOOTH_SCAN_ALIAS);
            aliases.add(BLUETOOTH_CONNECT_ALIAS);
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            aliases.add(LOCATION_ALIAS);
        }
        return aliases.toArray(new String[0]);
    }

    private boolean hasRequiredRuntimePermissions() {
        for (String alias : getRequiredPermissionAliases()) {
            if (getPermissionState(alias) != PermissionState.GRANTED) {
                return false;
            }
        }
        return true;
    }

    private JSObject buildPermissionStatesObject() {
        JSObject states = new JSObject();
        states.put(BLUETOOTH_SCAN_ALIAS, String.valueOf(getPermissionState(BLUETOOTH_SCAN_ALIAS)));
        states.put(BLUETOOTH_CONNECT_ALIAS, String.valueOf(getPermissionState(BLUETOOTH_CONNECT_ALIAS)));
        states.put(LOCATION_ALIAS, String.valueOf(getPermissionState(LOCATION_ALIAS)));
        return states;
    }

    private void logPermissionStates(String stage) {
        Log.d(
            TAG,
            "Permission states " + stage +
                ": android=" + Build.VERSION.SDK_INT +
                ", scan=" + getPermissionState(BLUETOOTH_SCAN_ALIAS) +
                ", connect=" + getPermissionState(BLUETOOTH_CONNECT_ALIAS) +
                ", location=" + getPermissionState(LOCATION_ALIAS)
        );
    }

    private void scheduleConnectTimeout(long timeoutMs, String code, String message) {
        if (connectTimeoutRunnable != null) {
            mainHandler.removeCallbacks(connectTimeoutRunnable);
        }
        connectTimeoutRunnable = () -> rejectConnectCall(message, code);
        mainHandler.postDelayed(connectTimeoutRunnable, timeoutMs);
    }

    private void rejectConnectCall(String message, String code) {
        PluginCall pending = connectCall;
        clearConnectState();
        closeActiveGatt();
        if (pending != null) {
            pending.reject(message, code);
        }
    }

    private void rejectPendingConnect(String message, String code) {
        PluginCall pending = connectCall;
        clearConnectState();
        if (pending != null) {
            pending.reject(message, code);
        }
    }

    private void clearConnectState() {
        if (connectTimeoutRunnable != null) {
            mainHandler.removeCallbacks(connectTimeoutRunnable);
            connectTimeoutRunnable = null;
        }
        connectCall = null;
    }

    private void stopScanInternal() {
        if (scanCallback != null) {
            try {
                BluetoothLeScanner scanner = getScanner();
                if (scanner != null) {
                    scanner.stopScan(scanCallback);
                }
            } catch (SecurityException error) {
                Log.e(TAG, "SecurityException stopping BLE scan", error);
                // Best effort cleanup only.
            } catch (IllegalStateException error) {
                Log.e(TAG, "IllegalStateException stopping BLE scan", error);
                // Best effort cleanup only.
            } catch (Exception error) {
                Log.e(TAG, "Unexpected exception stopping BLE scan", error);
                // Best effort cleanup only.
            }
        }
        scanCallback = null;
        scanCall = null;
    }

    private void closeActiveGatt() {
        BluetoothGatt gatt = activeGatt;
        activeGatt = null;
        closeGatt(gatt);
    }

    private void closeGatt(BluetoothGatt gatt) {
        if (gatt == null) return;
        try {
            gatt.disconnect();
        } catch (SecurityException error) {
            Log.e(TAG, "SecurityException disconnecting BLE GATT", error);
            // Best effort cleanup only.
        } catch (Exception error) {
            Log.e(TAG, "Unexpected exception disconnecting BLE GATT", error);
            // Best effort cleanup only.
        }
        try {
            gatt.close();
        } catch (SecurityException error) {
            Log.e(TAG, "SecurityException closing BLE GATT", error);
            // Best effort cleanup only.
        } catch (Exception error) {
            Log.e(TAG, "Unexpected exception closing BLE GATT", error);
            // Best effort cleanup only.
        }
    }

    private void rejectWithCode(PluginCall call, String code) {
        switch (code) {
            case "BLE_NOT_SUPPORTED":
                call.reject("Este dispositivo no tiene soporte BLE.", code);
                break;
            case "BLUETOOTH_DISABLED":
                call.reject("Bluetooth esta apagado.", code);
                break;
            case "PERMISSION_NOT_GRANTED":
                call.reject("Faltan permisos Bluetooth.", code);
                break;
            case "BLUETOOTH_UNAVAILABLE":
            default:
                call.reject("Bluetooth no esta disponible.", code);
                break;
        }
    }

    private static class ScannedDevice {
        final BluetoothDevice device;
        final String name;
        final int rssi;

        ScannedDevice(BluetoothDevice device, String name, int rssi) {
            this.device = device;
            this.name = name;
            this.rssi = rssi;
        }
    }
}
