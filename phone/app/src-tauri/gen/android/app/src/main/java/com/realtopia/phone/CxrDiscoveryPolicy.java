package com.realtopia.phone;

/** Pure rules: a paired Classic address is not necessarily the current BLE address. */
final class CxrDiscoveryPolicy {
    static final long SDP_TIMEOUT_MS = 4_000;
    static final long SCAN_TIMEOUT_MS = 15_000;
    static final long GATT_TIMEOUT_MS = 35_000;
    static final long SOCKET_TIMEOUT_MS = 12_000;

    static boolean matches(String targetAddress, String targetName,
                           String advertisedAddress, String advertisedName) {
        if (targetAddress != null && advertisedAddress != null
                && targetAddress.equalsIgnoreCase(advertisedAddress)) return true;
        // No generic "Rokid"/"Glasses" or first-device fallback: only this paired name.
        return targetName != null && !targetName.trim().isEmpty()
                && targetName.equals(advertisedName);
    }

    static boolean current(boolean started, long expected, long actual) {
        return started && expected == actual;
    }
}
