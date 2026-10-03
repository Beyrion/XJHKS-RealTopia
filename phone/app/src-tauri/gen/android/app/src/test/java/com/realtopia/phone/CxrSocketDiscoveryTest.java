package com.realtopia.phone;

import java.util.UUID;
import org.junit.Test;
import static org.junit.Assert.*;

public class CxrSocketDiscoveryTest {
    private final UUID standard=UUID.fromString("00001101-0000-1000-8000-00805f9b34fb");
    private final UUID current=UUID.fromString("0371fff8-88c5-49f0-b69e-7c5e7dd11c29");
    @Test public void selectsLiveVendorServiceNotStandardSpp(){assertEquals(current,CxrSocketDiscovery.select(new UUID[]{standard,current}));}
    @Test public void rejectsMissingOrAmbiguousService(){
        assertNull(CxrSocketDiscovery.select(null));
        assertNull(CxrSocketDiscovery.select(new UUID[]{standard}));
        assertNull(CxrSocketDiscovery.select(new UUID[]{current,UUID.fromString("8f599222-e9dd-450c-8844-d09d0b2cccef")}));
    }
    @Test public void toleratesNullAndDuplicateRecords(){assertEquals(current,CxrSocketDiscovery.select(new UUID[]{null,current,current}));}
    @Test public void selectsCxrFromActualGlassesSdpIncludingMfiServer(){
        UUID[] services={
            UUID.fromString("00000000-deca-fade-deca-deafdecacaff"),
            UUID.fromString("00001105-0000-1000-8000-00805f9b34fb"),
            UUID.fromString("0000110b-0000-1000-8000-00805f9b34fb"),
            UUID.fromString("0000110e-0000-1000-8000-00805f9b34fb"),
            UUID.fromString("00001115-0000-1000-8000-00805f9b34fb"),
            UUID.fromString("00001116-0000-1000-8000-00805f9b34fb"),
            UUID.fromString("0000111e-0000-1000-8000-00805f9b34fb"),
            current
        };
        assertEquals(current,CxrSocketDiscovery.select(services));
    }
    @Test public void neverUsesMfiAsCxrFallback(){
        UUID client=UUID.fromString("00000000-deca-fade-deca-deafdecacafe");
        UUID server=UUID.fromString("00000000-deca-fade-deca-deafdecacaff");
        assertNull(CxrSocketDiscovery.select(new UUID[]{standard,client,server}));
        assertEquals(current,CxrSocketDiscovery.select(new UUID[]{client,current,server}));
    }
    @Test public void mfiExclusionDoesNotHideOtherVendorAmbiguity(){
        assertNull(CxrSocketDiscovery.select(new UUID[]{
            UUID.fromString("00000000-deca-fade-deca-deafdecacaff"),
            current,UUID.fromString("8f599222-e9dd-450c-8844-d09d0b2cccef")
        }));
    }
}
