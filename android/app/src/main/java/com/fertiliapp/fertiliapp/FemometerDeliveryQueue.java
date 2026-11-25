package com.fertiliapp.fertiliapp;

import android.content.Context;
import android.util.AtomicFile;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

/** Private delivery spool, excluded from backup. No raw packets, addresses or Firebase. */
final class FemometerDeliveryQueue {
    private final AtomicFile file;
    FemometerDeliveryQueue(Context context) {
        file = new AtomicFile(new File(context.getNoBackupFilesDir(), "vinca-deliveries.json"));
    }
    private JSONArray read() throws Exception {
        try { return new JSONArray(new String(file.readFully(), StandardCharsets.UTF_8)); }
        catch (java.io.FileNotFoundException absent) { return new JSONArray(); }
    }
    private void write(JSONArray rows) throws Exception {
        FileOutputStream stream = null;
        try {
            stream = file.startWrite();
            stream.write(rows.toString().getBytes(StandardCharsets.UTF_8));
            stream.getFD().sync();
            file.finishWrite(stream);
            stream = null;
            if (!rows.toString().equals(new String(file.readFully(), StandardCharsets.UTF_8)))
                throw new java.io.IOException("QUEUE_WRITE_UNCONFIRMED");
        } catch (Exception error) { if (stream != null) file.failWrite(stream); throw error; }
    }
    synchronized void append(String user, JSObject event) throws Exception {
        if (user == null || event.optString("deviceKey").isEmpty()) throw new IllegalStateException();
        JSONArray rows = read();
        // Never evict unacknowledged readings. Stop reception visibly on capacity failure.
        if (rows.length() >= 256) throw new IllegalStateException("QUEUE_FULL");
        JSONObject reading = new JSONObject();
        for (String key : new String[] { "temperatureC", "temperatureOriginal", "temperatureUnit",
                "deviceTimestamp", "deviceTimestampReliability", "deviceTimeZone", "receivedAt",
                "measurementType", "measurementTypeCode", "flags", "transport", "deviceKey",
                "deviceModel", "deviceProtocol", "receptionValidated", "experimental" }) {
            if (event.has(key)) reading.put(key, event.get(key));
        }
        String id = UUID.randomUUID().toString();
        reading.put("nativeDeliveryId", id);
        rows.put(new JSONObject().put("userId", user).put("reading", reading));
        write(rows); // Only publish the delivery ID after the durable write.
        event.put("nativeDeliveryId", id);
        event.put("nativeUserId", user);
    }
    synchronized JSArray pending(String user) throws Exception {
        JSONArray rows = read(); JSArray result = new JSArray();
        for (int i = 0; i < rows.length(); i++) {
            JSONObject row = rows.getJSONObject(i);
            if (user.equals(row.getString("userId"))) {
                JSONObject reading = row.getJSONObject("reading");
                reading.put("nativeUserId", user); result.put(reading);
            }
        }
        return result;
    }
    synchronized void acknowledge(String user, String deviceKey, String id) throws Exception {
        if (id == null || deviceKey == null) throw new IllegalArgumentException();
        JSONArray rows = read(), next = new JSONArray();
        for (int i = 0; i < rows.length(); i++) {
            JSONObject row = rows.getJSONObject(i), reading = row.getJSONObject("reading");
            if (!(user.equals(row.getString("userId")) && deviceKey.equals(reading.getString("deviceKey"))
                    && id.equals(reading.getString("nativeDeliveryId")))) next.put(row);
        }
        write(next);
    }
}
