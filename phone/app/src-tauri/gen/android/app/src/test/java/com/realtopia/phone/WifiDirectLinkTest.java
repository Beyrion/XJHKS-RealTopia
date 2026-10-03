package com.realtopia.phone;

import org.junit.Test;
import static org.junit.Assert.*;

public class WifiDirectLinkTest {
    @Test public void matchesOnlySelectedPeerIgnoringCase(){
        assertTrue(WifiDirectLink.matchesPeer("AC:86:D1:56:FC:AF","ac:86:d1:56:fc:af"));
        assertFalse(WifiDirectLink.matchesPeer("AC:86:D1:56:FC:AF","AC:86:D1:56:FC:00"));
    }
    @Test public void missingOrInvalidPeersAreNotMatches(){
        assertFalse(WifiDirectLink.matchesPeer(null,null));
        assertFalse(WifiDirectLink.matchesPeer("AC:86:D1:56:FC:AF",null));
        assertFalse(WifiDirectLink.matchesPeer("",""));
        assertFalse(WifiDirectLink.matchesPeer("00:00:00:00:00:00","00:00:00:00:00:00"));
    }
}
