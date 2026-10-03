package com.realtopia.phone;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.wifi.WpsInfo;
import android.net.wifi.p2p.WifiP2pConfig;
import android.net.wifi.p2p.WifiP2pDevice;
import android.net.wifi.p2p.WifiP2pManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

/** Owns its callbacks instead of using the SDK's unsafe, process-wide peer slot. */
final class WifiDirectLink implements AutoCloseable {
    interface Listener { void onReady(String address); void onFailure(String message); }
    private static final String TAG="RealiaWifiDirect";
    private final Context context;
    private final Listener listener;
    private final Handler main=new Handler(Looper.getMainLooper());
    private WifiP2pManager manager;
    private WifiP2pManager.Channel channel;
    private String peerAddress;
    private boolean running,registered,connecting,connected;
    private final BroadcastReceiver receiver=new BroadcastReceiver(){
        @Override public void onReceive(Context ignored,Intent intent){
            if(!running)return;
            String action=intent.getAction();
            if(WifiP2pManager.WIFI_P2P_PEERS_CHANGED_ACTION.equals(action))requestPeers();
            else if(WifiP2pManager.WIFI_P2P_CONNECTION_CHANGED_ACTION.equals(action))requestConnection();
            else if(WifiP2pManager.WIFI_P2P_STATE_CHANGED_ACTION.equals(action)
                    &&intent.getIntExtra(WifiP2pManager.EXTRA_WIFI_STATE,-1)==WifiP2pManager.WIFI_P2P_STATE_DISABLED)
                fail("Wi-Fi Direct is disabled");
        }
    };
    WifiDirectLink(Context context,Listener listener){this.context=context;this.listener=listener;}

    static boolean matchesPeer(String expected,String actual){
        return expected!=null&&expected.matches("(?i)[0-9a-f]{2}(:[0-9a-f]{2}){5}")
                &&!"00:00:00:00:00:00".equals(expected)&&expected.equalsIgnoreCase(actual);
    }

    void start(String address){
        main.post(()->{
            if(running)return;
            if(!matchesPeer(address,address)){listener.onFailure("Invalid P2P peer address");return;}
            running=true;peerAddress=address;
            try{
                manager=context.getSystemService(WifiP2pManager.class);
                if(manager==null){fail("Wi-Fi Direct unavailable");return;}
                channel=manager.initialize(context,Looper.getMainLooper(),()->fail("P2P channel lost"));
                if(channel==null){fail("P2P channel unavailable");return;}
                IntentFilter filter=new IntentFilter();
                filter.addAction(WifiP2pManager.WIFI_P2P_PEERS_CHANGED_ACTION);
                filter.addAction(WifiP2pManager.WIFI_P2P_CONNECTION_CHANGED_ACTION);
                filter.addAction(WifiP2pManager.WIFI_P2P_STATE_CHANGED_ACTION);
                if(Build.VERSION.SDK_INT>=33)context.registerReceiver(receiver,filter,Context.RECEIVER_EXPORTED);
                else context.registerReceiver(receiver,filter);
                registered=true;
                main.postDelayed(()->{if(running&&!connected)fail("P2P negotiation timed out (30s)");},30_000);
                manager.requestGroupInfo(channel,group->{
                    if(!running)return;
                    if(group!=null){
                        if(group.getOwner()!=null&&matchesPeer(peerAddress,group.getOwner().deviceAddress))requestConnection();
                        else fail("Another Wi-Fi Direct group is active; not replacing it");
                    }else discover();
                });
            }catch(RuntimeException error){fail("P2P initialization failed: "+error.getClass().getSimpleName());}
        });
    }
    private void discover(){
        if(!running||connecting||connected)return;
        manager.discoverPeers(channel,new WifiP2pManager.ActionListener(){
            public void onSuccess(){if(running)requestPeers();}
            public void onFailure(int reason){if(running)Log.w(TAG,"DISCOVERY_RETRY reason="+reason);}
        });
        main.postDelayed(this::discover,2_000);
    }
    private void requestPeers(){
        if(!running||connecting||connected)return;
        manager.requestPeers(channel,peers->{
            if(!running||connecting||connected||peers==null)return;
            WifiP2pDevice target=null;
            for(WifiP2pDevice device:peers.getDeviceList())
                if(device!=null&&matchesPeer(peerAddress,device.deviceAddress)){target=device;break;}
            if(target==null)return; // An empty/changed peer list is normal, not a crash.
            WifiP2pConfig config=new WifiP2pConfig();
            config.deviceAddress=target.deviceAddress;
            config.wps.setup=WpsInfo.PBC;
            // Prefer the glasses as GO so their server has the reported owner IP.
            config.groupOwnerIntent=0;
            connecting=true;
            Log.i(TAG,"P2P_CONNECT peerMatched=true");
            manager.connect(channel,config,new WifiP2pManager.ActionListener(){
                public void onSuccess(){if(running){Log.i(TAG,"P2P_CONNECT accepted");pollConnection();}}
                public void onFailure(int reason){if(running)fail("P2P connect failed: "+reason);}
            });
        });
    }
    private void pollConnection(){
        if(!running||connected)return;
        requestConnection();main.postDelayed(this::pollConnection,500);
    }
    private void requestConnection(){
        if(!running)return;
        manager.requestConnectionInfo(channel,info->{
            if(!running||info==null)return;
            if(!info.groupFormed){if(connected)fail("P2P group disconnected");return;}
            if(info.isGroupOwner){fail("Phone became P2P owner; retrying with glasses as owner");return;}
            if(info.groupOwnerAddress==null||connected)return;
            manager.requestGroupInfo(channel,group->{
                if(!running||connected||group==null||group.getOwner()==null)return;
                if(!matchesPeer(peerAddress,group.getOwner().deviceAddress)){fail("P2P group does not match selected glasses");return;}
                connected=true;connecting=false;main.removeCallbacksAndMessages(null);
                Log.i(TAG,"P2P_READY role=client peerMatched=true");
                listener.onReady(info.groupOwnerAddress.getHostAddress());
            });
        });
    }
    private void fail(String message){
        if(!running)return;
        closeNow();listener.onFailure(message);
    }
    private void closeNow(){
        running=false;main.removeCallbacksAndMessages(null);
        if(registered){context.unregisterReceiver(receiver);registered=false;}
        if(channel!=null){
            try{
                if(connecting)manager.cancelConnect(channel,null);
                manager.stopPeerDiscovery(channel,null);
                channel.close();
            }catch(RuntimeException ignored){}
            channel=null;
        }
        connecting=false;connected=false;
    }
    @Override public void close(){main.post(this::closeNow);}
}
