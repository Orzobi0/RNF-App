package com.fertiliapp.fertiliapp;

import android.Manifest;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;

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
    private FemometerGattSession session;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final FemometerGattSession.Events events = (name, data) -> notifyListeners(name, data);
    @Override public void load() {
        session = FemometerGattSession.get(getContext());
        main.post(() -> session.attach(events));
    }
    @Override protected void handleOnDestroy() { main.post(() -> session.detach(events)); }
    @PluginMethod
    public void requestBluetoothPermissions(PluginCall call) {
        Log.d(TAG, "requestBluetoothPermissions called");
        session.logPermissionStates("before request");

        String unavailableCode = session.getUnavailableCode();
        if (unavailableCode != null) {
            Log.d(TAG, "Permission request blocked: " + unavailableCode);
            session.rejectWithCode(call, unavailableCode);
            return;
        }

        String[] aliases = session.getRequiredPermissionAliases();
        if (aliases.length == 0 || session.hasRequiredRuntimePermissions()) {
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
        boolean granted = session.hasRequiredRuntimePermissions();
        Log.d(TAG, "Permission callback result: granted=" + granted);
        session.logPermissionStates("after callback");

        JSObject result = new JSObject();
        result.put("granted", granted);
        result.put("androidVersion", Build.VERSION.SDK_INT);
        result.put("permissionStates", session.buildPermissionStatesObject());

        if (granted) {
            call.resolve(result);
        } else {
            call.reject("Permisos Bluetooth denegados.", "PERMISSION_NOT_GRANTED", result);
        }
    }

    @PluginMethod public void bluetoothCapture(PluginCall call) { main.post(() -> session.bluetoothCapture(call)); }
    @PluginMethod public void getRememberedDevice(PluginCall call) { main.post(() -> session.getRememberedDevice(call)); }
    @PluginMethod public void rememberDevice(PluginCall call) { main.post(() -> session.rememberDevice(call)); }
    @PluginMethod public void forgetDevice(PluginCall call) { main.post(() -> session.forgetDevice(call)); }
    @PluginMethod public void confirmStandardTrial(PluginCall call) { main.post(() -> session.confirmStandardTrial(call)); }
    @PluginMethod public void selectRememberedDevice(PluginCall call) { main.post(() -> session.selectRememberedDevice(call)); }
    @PluginMethod public void scan(PluginCall call) { main.post(() -> session.scan(call)); }
    @PluginMethod public void connectAndInspect(PluginCall call) { main.post(() -> session.connectAndInspect(call)); }
    @PluginMethod public void startTemperatureListener(PluginCall call) { main.post(() -> session.startTemperatureListener(call)); }
    @PluginMethod public void startStandardTrial(PluginCall call) { main.post(() -> session.startStandardTrial(call)); }
    @PluginMethod public void readClock(PluginCall call) { main.post(() -> session.readClock(call)); }
    @PluginMethod public void syncClock(PluginCall call) { main.post(() -> session.syncClock(call)); }
    @PluginMethod public void setTemperatureUnit(PluginCall call) { main.post(() -> session.setTemperatureUnit(call)); }
    @PluginMethod public void readDeviceInfo(PluginCall call) { main.post(() -> session.readDeviceInfo(call)); }
    @PluginMethod public void setVolume(PluginCall call) { main.post(() -> session.setVolume(call)); }
    @PluginMethod public void setMeasurementMode(PluginCall call) { main.post(() -> session.setMeasurementMode(call)); }
    @PluginMethod public void stopTemperatureListener(PluginCall call) { main.post(() -> session.stopTemperatureListener(call)); }
    @PluginMethod public void disconnect(PluginCall call) { main.post(() -> session.disconnect(call)); }
    @PluginMethod public void getReceptionState(PluginCall call) { main.post(() -> session.getReceptionState(call)); }
    @PluginMethod public void getPendingTemperatures(PluginCall call) { main.post(() -> session.getPendingTemperatures(call)); }
    @PluginMethod public void acknowledgeTemperature(PluginCall call) { main.post(() -> session.acknowledgeTemperature(call)); }
}
