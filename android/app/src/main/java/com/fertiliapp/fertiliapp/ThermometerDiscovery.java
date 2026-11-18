package com.fertiliapp.fertiliapp;

import java.util.Locale;

/** Discovery evidence is not permission to use a protocol. No addresses cross this boundary. */
final class ThermometerDiscovery {
    static String preliminaryModel(String name) {
        return Vinca2Profile.identifies(name, null) ? Vinca2Profile.MODEL
            : EasyHomeProfile.identifies(name, null) ? EasyHomeProfile.MODEL : null;
    }

    static boolean candidate(String name, boolean healthService, boolean vincaSignature, boolean expanded) {
        String text = name == null ? "" : name.toLowerCase(Locale.ROOT);
        return expanded || healthService || vincaSignature || text.equals("ebt-300") || text.contains("bm-vinca2")
            || text.contains("thermometer") || text.contains("termometro")
            || text.contains("femometer") || text.contains("easy@home") || text.contains("easyathome");
    }

    static String classification(boolean supported, String model, String manufacturer, boolean standard) {
        if (supported) return "compatible";
        // DIS values identify a model, but do not validate its protocol or basal use.
        if (model != null && !model.trim().isEmpty() && manufacturer != null && !manufacturer.trim().isEmpty()) return "recognized_unsupported";
        return standard ? "possible_standard" : "unknown";
    }
}
