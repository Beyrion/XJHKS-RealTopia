package com.realtopia.phone;

import org.junit.Test;
import static org.junit.Assert.*;

public class CxrDiscoveryPolicyTest {
    @Test public void acceptsExactAddressWithoutName() {
        assertTrue(CxrDiscoveryPolicy.matches("AA:BB", null, "aa:bb", null));
    }
    @Test public void acceptsFreshBleAddressOnlyWithExactPairedName() {
        assertTrue(CxrDiscoveryPolicy.matches("AA:BB", "Glasses_2804", "CC:DD", "Glasses_2804"));
        assertFalse(CxrDiscoveryPolicy.matches("AA:BB", "Glasses_2804", "CC:DD", "Glasses_9999"));
        assertFalse(CxrDiscoveryPolicy.matches("AA:BB", "Glasses_2804", "CC:DD", "Rokid"));
    }
    @Test public void missingNamesCannotSelectUnrelatedDevice() {
        assertFalse(CxrDiscoveryPolicy.matches("AA:BB", null, "CC:DD", null));
        assertFalse(CxrDiscoveryPolicy.matches("AA:BB", "", "CC:DD", ""));
        assertFalse(CxrDiscoveryPolicy.matches("AA:BB", " ", "CC:DD", " "));
    }
    @Test public void oldTimeoutCannotCancelNewAttemptOrClosedTransport() {
        assertTrue(CxrDiscoveryPolicy.current(true, 3, 3));
        assertFalse(CxrDiscoveryPolicy.current(true, 2, 3));
        assertFalse(CxrDiscoveryPolicy.current(false, 3, 3));
    }
    @Test public void gattIsNotRepeatedlyCancelledAtSocketTimeout() {
        assertTrue(CxrDiscoveryPolicy.GATT_TIMEOUT_MS > 30_000);
        assertTrue(CxrDiscoveryPolicy.GATT_TIMEOUT_MS > CxrDiscoveryPolicy.SOCKET_TIMEOUT_MS);
    }
}
