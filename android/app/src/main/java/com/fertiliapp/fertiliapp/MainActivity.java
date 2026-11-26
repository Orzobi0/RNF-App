package com.fertiliapp.fertiliapp;

import android.content.res.Configuration;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.Window;
import android.webkit.JavascriptInterface;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String DEFAULT_STATUS_BAR_COLOR = "#FFF7F9";
    private String statusBarColor = DEFAULT_STATUS_BAR_COLOR;
    private static final String FEMOMETER_BLE_TAG = "FemometerBle";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        Log.d(FEMOMETER_BLE_TAG, "Registering FemometerBle Capacitor plugin");
        registerPlugin(FemometerBle.class);
        super.onCreate(savedInstanceState);

        setStatusBar(DEFAULT_STATUS_BAR_COLOR);

        if (getBridge() != null && getBridge().getWebView() != null) {
            // Same visual scale in Staging and production; do not inherit Android fontScale.
            getBridge().getWebView().getSettings().setTextZoom(100);
            getBridge().getWebView().addJavascriptInterface(
                new StatusBarBridge(),
                "FertiliAppStatusBar"
            );
        }
    }

    @Override public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        setStatusBar(statusBarColor);
    }

    @Override public void onResume() {
        super.onResume();
        setStatusBar(statusBarColor);
    }

    @Override public void onStart() {
        super.onStart();
        FemometerGattSession.get(this).activityVisible(true);
    }

    @Override public void onStop() {
        FemometerGattSession.get(this).activityVisible(false);
        super.onStop();
    }

    private void setStatusBar(String color) {
        runOnUiThread(() -> {
            try {
                Window window = getWindow();
                int background = Color.parseColor(color);
                statusBarColor = color;
                // SystemBars alone owns icon contrast and insets. This paints the
                // native gutter on WebView < 140 and the legacy opaque status bar.
                window.getDecorView().setBackgroundColor(background);
                if (Build.VERSION.SDK_INT < 35) window.setStatusBarColor(background);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    window.setStatusBarContrastEnforced(false);
                }

            } catch (IllegalArgumentException ignored) {
                // Ignore invalid colors sent from the WebView.
            }
        });
    }

    private class StatusBarBridge {
        @JavascriptInterface
        public void setColor(String color) {
            setStatusBar(color);
        }
    }
}
