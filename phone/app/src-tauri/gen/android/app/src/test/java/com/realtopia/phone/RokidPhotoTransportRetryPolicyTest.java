package com.realtopia.phone;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class RokidPhotoTransportRetryPolicyTest {
    @Test public void photoSocketFallbackRequiresActualP2pSubnet() {
        byte[] local={(byte)192,(byte)168,49,2};
        assertTrue(RokidPhotoTransport.sameIpv4Subnet(local,new byte[]{(byte)192,(byte)168,49,1},24));
        assertFalse(RokidPhotoTransport.sameIpv4Subnet(local,new byte[]{(byte)192,(byte)168,1,1},24));
        assertFalse(RokidPhotoTransport.sameIpv4Subnet(local,new byte[]{10,0,0,1},24));
        assertFalse(RokidPhotoTransport.sameIpv4Subnet(local,new byte[]{10,0,0,1},0));
        assertFalse(RokidPhotoTransport.sameIpv4Subnet(local,new byte[16],24));
    }
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
