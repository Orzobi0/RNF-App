package com.fertiliapp.fertiliapp;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String DEFAULT_STATUS_BAR_COLOR = "#FFE4E6";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        setStatusBar(DEFAULT_STATUS_BAR_COLOR, true);

        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().addJavascriptInterface(
                new StatusBarBridge(),
                "FertiliAppStatusBar"
            );
        }
    }

    private void setStatusBar(String color, boolean darkIcons) {
        runOnUiThread(() -> {
            try {
                Window window = getWindow();
                window.setStatusBarColor(Color.parseColor(color));
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    window.setStatusBarContrastEnforced(false);
                }

                View decorView = window.getDecorView();
                int flags = decorView.getSystemUiVisibility();
                if (darkIcons) {
                    flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                } else {
                    flags &= ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                }
                decorView.setSystemUiVisibility(flags);
            } catch (IllegalArgumentException ignored) {
                // Ignore invalid colors sent from the WebView.
            }
        });
    }

    private class StatusBarBridge {
        @JavascriptInterface
        public void setColor(String color, boolean darkIcons) {
            setStatusBar(color, darkIcons);
        }
    }
}
