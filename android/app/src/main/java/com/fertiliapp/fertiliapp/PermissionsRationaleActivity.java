package com.fertiliapp.fertiliapp;

import android.app.Activity;
import android.os.Bundle;

public class PermissionsRationaleActivity extends Activity {
  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    // Por ahora, no bloquees el flujo
    finish();
  }
}