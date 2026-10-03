package com.realtopia.phone;

import java.util.UUID;

/** Select an unambiguous CXR service, excluding standard and known MFi services. */
final class CxrSocketDiscovery {
    // These are the MFIConnectionHelper/MFISocketService endpoints in CXRService,
    // not the device-specific Android CXR socket UUID returned by live SDP.
    private static final UUID MFI_CLIENT=UUID.fromString("00000000-deca-fade-deca-deafdecacafe");
    private static final UUID MFI_SERVER=UUID.fromString("00000000-deca-fade-deca-deafdecacaff");

    static UUID select(UUID[] services) {
        UUID candidate=null;
        if(services==null)return null;
        for(UUID uuid:services){
            if(uuid==null||uuid.toString().endsWith("-0000-1000-8000-00805f9b34fb")
                    ||MFI_CLIENT.equals(uuid)||MFI_SERVER.equals(uuid))continue;
            if(candidate!=null&&!candidate.equals(uuid))return null;
            candidate=uuid;
        }
        return candidate;
    }
}
