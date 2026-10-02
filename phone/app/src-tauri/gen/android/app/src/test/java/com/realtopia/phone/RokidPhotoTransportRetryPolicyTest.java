package com.realtopia.phone;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class RokidPhotoTransportRetryPolicyTest {
    @Test
    public void wifiRetryRequiresStartedBluetoothConnectionAndIncompleteSocket() {
        assertTrue(RokidPhotoTransport.shouldRetryWifi(true, true, false));
        assertFalse(RokidPhotoTransport.shouldRetryWifi(true, false, false));
        assertFalse(RokidPhotoTransport.shouldRetryWifi(false, true, false));
        assertFalse(RokidPhotoTransport.shouldRetryWifi(true, true, true));
    }

    @Test
    public void recoveryIntervalsStayBelowTheUserVisibleThreshold() {
        assertEquals(300, RokidPhotoTransport.BLUETOOTH_RETRY_MS);
        assertEquals(400, RokidPhotoTransport.P2P_RETRY_MS);
        assertEquals(250, RokidPhotoTransport.SOCKET_RETRY_MS);
        assertTrue(RokidPhotoTransport.SOCKET_CONNECT_TIMEOUT_MS <= 1_500);
    }
}
