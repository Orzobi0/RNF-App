package com.fertiliapp.fertiliapp;

import android.app.*;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

/** Keeps the existing owner alive; never scans, connects, or restarts itself. */
public final class FemometerReceptionService extends Service {
    private static final String CHANNEL = "vinca_reception";
    private FemometerGattSession session;
    private final android.content.BroadcastReceiver bluetoothState = new android.content.BroadcastReceiver() {
        @Override public void onReceive(android.content.Context context, Intent intent) {
            int state = intent.getIntExtra(android.bluetooth.BluetoothAdapter.EXTRA_STATE, -1);
            if (state == android.bluetooth.BluetoothAdapter.STATE_OFF || state == android.bluetooth.BluetoothAdapter.STATE_TURNING_OFF)
                session.serviceFailed();
        }
    };
    @Override public void onCreate() {
        super.onCreate();
        session = FemometerGattSession.get(this);
        session.serviceStarted(this);
        // This is a protected system broadcast, never a background scan.
        registerReceiver(bluetoothState, new android.content.IntentFilter(android.bluetooth.BluetoothAdapter.ACTION_STATE_CHANGED));
        NotificationManager manager = getSystemService(NotificationManager.class);
        NotificationChannel channel = new NotificationChannel(CHANNEL, "Recepción Bluetooth", NotificationManager.IMPORTANCE_LOW);
        channel.setSound(null, null); channel.enableVibration(false);
        manager.createNotificationChannel(channel);
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification notification = new Notification.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.stat_sys_data_bluetooth).setContentTitle("FertiliApp")
            .setContentText("Recepción Bluetooth activa").setContentIntent(open)
            .setOngoing(true).setOnlyAlertOnce(true).setCategory(Notification.CATEGORY_SERVICE).build();
        try {
            if (Build.VERSION.SDK_INT >= 29) startForeground(1060, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE);
            else startForeground(1060, notification);
        } catch (RuntimeException failure) { session.serviceFailed(); stopSelf(); }
    }
    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (!session.serviceNeeded()) stopSelf();
        return START_NOT_STICKY;
    }
    @Override public void onDestroy() {
        unregisterReceiver(bluetoothState);
        session.serviceDestroyed(this);
        stopForeground(STOP_FOREGROUND_REMOVE);
        super.onDestroy();
    }
    @Override public IBinder onBind(Intent intent) { return null; }
}
