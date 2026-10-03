package com.realtopia.phone;

import android.content.Context;
import android.content.BroadcastReceiver;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanFilter;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.os.Build;
import android.os.ParcelUuid;
import android.os.Parcelable;
import android.net.ConnectivityManager;
import android.net.LinkProperties;
import android.net.Network;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import com.rokid.cxr.Caps;
import com.rokid.cxr.client.controllers.CxrController;
import com.rokid.cxr.client.utils.ValueUtil;
import java.io.DataInputStream;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.InetAddress;
import java.net.InterfaceAddress;
import java.net.NetworkInterface;
import java.net.Socket;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import org.json.JSONException;
import org.json.JSONObject;

/** CXR-M control plus a socket bound only to Rokid's Wi-Fi Direct network. */
final class RokidPhotoTransport implements CxrController.Callback {
    interface Listener {
        void onPhase(String phase, String transport, String detail);
        void onPhoto(RealiaFrameReader.Frame frame);
        void onAudio(RealiaFrameReader.Frame frame);
        void onPersonChoice(RealiaFrameReader.Frame frame);
        void onError(String message);
    }

    private static final String TAG = "RealiaPhoneTransport";
    private static final String CAPTURE_COMMAND = "Realia_Capture";
    private static final String CONTROL_COMMAND = "Realia_Control";
    private static final String HUD_COMMAND = "Realia_Hud";
    private static final String PERSON_COMMAND = "Realia_Person";
    private static final String CLIENT_INFO = "RealTopia";
    private static final int PHOTO_PORT = 39831;
    static final long BLUETOOTH_RETRY_MS = 300;
    static final long P2P_RETRY_MS = 400;
    static final long SOCKET_RETRY_MS = 250;
    static final int SOCKET_CONNECT_TIMEOUT_MS = 1_200;
    private static final long P2P_REQUEST_WATCHDOG_MS = 4_000;
    private static final String CXR_DISCOVERY_SERVICE = "00009100-0000-1000-8000-00805f9b34fb";
    private final Context context;
    private final SharedPreferences endpoints;
    private final Listener listener;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final AtomicBoolean activatingBluetooth = new AtomicBoolean(false);
    private final AtomicBoolean bluetoothConnectInFlight = new AtomicBoolean(false);
    private final AtomicBoolean connectingSocket = new AtomicBoolean(false);
    private final AtomicBoolean socketRetryScheduled = new AtomicBoolean(false);
    private final AtomicBoolean p2pRequestInFlight = new AtomicBoolean(false);
    private final AtomicBoolean p2pRetryScheduled = new AtomicBoolean(false);
    private final AtomicLong p2pRequestGeneration = new AtomicLong(0);
    private final AtomicBoolean bluetoothRetryScheduled = new AtomicBoolean(false);
    private final CxrController cxr = CxrController.getInstance();
    private volatile WifiDirectLink wifi;
    private volatile Socket socket;
    private volatile boolean started;
    private volatile boolean ready;
    private volatile String p2pAddress = "";
    private volatile String glassAddress = "";
    private volatile String socketUuid = "";
    private volatile String classicAddress = "";
    private BluetoothDevice discoveryDevice;
    private String discoveryName;
    private BluetoothLeScanner bleScanner;
    private ScanCallback bleCallback;
    private final AtomicLong discoveryGeneration = new AtomicLong(0);
    private boolean bleDiscoveryStarted;
    private boolean gattDiscoveryStarted;
    private boolean uuidReceiverRegistered;
    private final BroadcastReceiver uuidReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context ignored, Intent intent) {
            if (!started || !BluetoothDevice.ACTION_UUID.equals(intent.getAction()) || !socketUuid.isBlank()) return;
            BluetoothDevice device=intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
            if(device==null || discoveryDevice==null) return;
            // Android may report the bonded identity instead of the paired
            // random address. Limit fallback to the same bonded named device.
            if(!device.equals(discoveryDevice) && !(device.getBondState()==BluetoothDevice.BOND_BONDED
                    && discoveryDevice.getName()!=null && discoveryDevice.getName().equals(device.getName()))) return;
            Parcelable[] records=intent.getParcelableArrayExtra(BluetoothDevice.EXTRA_UUID);
            java.util.List<java.util.UUID> services=new java.util.ArrayList<>();
            if(records!=null)for(Parcelable record:records)if(record instanceof ParcelUuid)services.add(((ParcelUuid)record).getUuid());
            // Service UUIDs are public discovery metadata; never log SDK account/auth data.
            Log.i(TAG,"BT_SDP services="+services);
            java.util.UUID uuid=CxrSocketDiscovery.select(services.toArray(new java.util.UUID[0]));
            if(uuid!=null){
                Log.i(TAG,"BT_UUID discovered via SDP");
                onConnectionInfo(uuid.toString(),device.getAddress(),null,-1);
            }else{
                Log.i(TAG,"BT_UUID SDP unavailable or ambiguous; scanning current BLE endpoint");
                startBleDiscovery(discoveryGeneration.get());
            }
        }
    };

    static boolean shouldRetryWifi(boolean started, boolean bluetoothConnected, boolean ready) {
        return started && bluetoothConnected && !ready;
    }

    RokidPhotoTransport(Context context, Listener listener) {
        this.context = context.getApplicationContext();
        this.endpoints=this.context.getSharedPreferences("realia-bluetooth-endpoints",Context.MODE_PRIVATE);
        this.listener = listener;
    }

    synchronized void start(String glassAddress) {
        this.glassAddress = glassAddress;
        if (started) {
            ensureConnected();
            return;
        }
        if(socketUuid.isBlank()){
            String cachedUuid=endpoints.getString(endpointKey("uuid"),"");
            String cachedAddress=endpoints.getString(endpointKey("address"),"");
            try{
                if(android.bluetooth.BluetoothAdapter.checkBluetoothAddress(cachedAddress)){
                    socketUuid=java.util.UUID.fromString(cachedUuid).toString();
                    classicAddress=cachedAddress;
                    Log.i(TAG,"BT_ENDPOINT using previously verified device endpoint");
                }
            }catch(IllegalArgumentException ignored){forgetEndpoint();}
        }
        started = true;
        connectBluetooth();
    }

    private String endpointKey(String field){return glassAddress.toUpperCase(java.util.Locale.ROOT)+":"+field;}
    private void forgetEndpoint(){
        endpoints.edit().remove(endpointKey("uuid")).remove(endpointKey("address")).apply();
        socketUuid="";
    }

    /** Debug-only caller supplies a verified live endpoint for device E2E tests. */
    synchronized void startWithEndpoint(String address, String uuid) {
        socketUuid=java.util.UUID.fromString(uuid).toString();
        classicAddress=address;
        start(address);
    }

    /** Idempotent recovery kick. Safe to call from the 100 ms state poll. */
    void ensureConnected() {
        if (!started || isReady()) return;
        main.post(() -> {
            if (!started || isReady()) return;
            if (!cxr.isBluetoothConnected()) scheduleBluetoothRetry(0);
            else if (!p2pAddress.isBlank() && !socketRetryScheduled.get()) connectSocket();
            else if (wifi == null && !p2pRequestInFlight.get()
                    && !p2pRetryScheduled.get()) startP2p();
        });
    }

    private void connectBluetooth() {
        if (!started || glassAddress.isBlank() || cxr.isBluetoothConnected()
                || !bluetoothConnectInFlight.compareAndSet(false, true)) return;
        listener.onPhase("bt_connecting", "CXR Bluetooth", "recovering control link");
        long generation=discoveryGeneration.incrementAndGet();
        bleDiscoveryStarted=false;
        gattDiscoveryStarted=false;
        try {
            cxr.setCallback(this);
            if (socketUuid.isBlank()) {
                BluetoothManager manager=context.getSystemService(BluetoothManager.class);
                if (manager==null || manager.getAdapter()==null) throw new IllegalStateException("Bluetooth unavailable");
                discoveryDevice=manager.getAdapter().getRemoteDevice(glassAddress);
                discoveryName=discoveryDevice.getName();
                if(!uuidReceiverRegistered){
                    IntentFilter filter=new IntentFilter(BluetoothDevice.ACTION_UUID);
                    if(Build.VERSION.SDK_INT>=33)context.registerReceiver(uuidReceiver,filter,Context.RECEIVER_EXPORTED);
                    else context.registerReceiver(uuidReceiver,filter);
                    uuidReceiverRegistered=true;
                }
                // SDP works for bonded glasses even if GATT on their random
                // address stalls. Always request fresh services, not old cache.
                listener.onPhase("bt_connecting", "CXR Bluetooth", "正在查找眼镜服务 UUID");
                if(!discoveryDevice.fetchUuidsWithSdp())startBleDiscovery(generation);
                main.postDelayed(()->{
                    if(isCurrentDiscovery(generation)&&socketUuid.isBlank())startBleDiscovery(generation);
                },CxrDiscoveryPolicy.SDP_TIMEOUT_MS);
            } else {
                stopBleDiscovery();
                cxr.connectBluetooth(context, socketUuid, classicAddress, CLIENT_INFO);
                armBluetoothTimeout(generation,CxrDiscoveryPolicy.SOCKET_TIMEOUT_MS,"CXR socket connection timed out");
            }
            Log.i(TAG, "BT_CONNECT requested address=" + glassAddress);
        } catch (RuntimeException error) {
            bluetoothConnectInFlight.set(false);
            Log.w(TAG, "Bluetooth reconnect request failed", error);
            scheduleBluetoothRetry(BLUETOOTH_RETRY_MS);
        }
    }

    private boolean isCurrentDiscovery(long generation) {
        return CxrDiscoveryPolicy.current(started,generation,discoveryGeneration.get())
                && bluetoothConnectInFlight.get() && !cxr.isBluetoothConnected();
    }

    private void armBluetoothTimeout(long generation,long timeout,String reason) {
        main.postDelayed(()->{
            if(!isCurrentDiscovery(generation))return;
            Log.w(TAG,"BT_DISCOVERY_TIMEOUT "+reason);
            stopBleDiscovery();
            bluetoothConnectInFlight.set(false);
            forgetEndpoint();
            listener.onPhase("bt_connecting","CXR Bluetooth",reason);
            scheduleBluetoothRetry(2_000);
        },timeout);
    }

    private void startBleDiscovery(long generation) {
        if(!isCurrentDiscovery(generation)||!socketUuid.isBlank()||bleDiscoveryStarted)return;
        bleDiscoveryStarted=true;
        try {
            BluetoothManager manager=context.getSystemService(BluetoothManager.class);
            bleScanner=manager.getAdapter().getBluetoothLeScanner();
            if(bleScanner==null)throw new IllegalStateException("BLE scanner unavailable");
            bleCallback=new ScanCallback(){
                @Override public void onScanResult(int callbackType,ScanResult result) {
                    main.post(()->{
                        if(!isCurrentDiscovery(generation)||gattDiscoveryStarted)return;
                        BluetoothDevice device=result.getDevice();
                        String name=result.getScanRecord()==null?null:result.getScanRecord().getDeviceName();
                        try {
                            if(name==null)name=device.getName();
                            if(!CxrDiscoveryPolicy.matches(glassAddress,discoveryName,device.getAddress(),name))return;
                            Log.i(TAG,"BT_BLE matching live endpoint found");
                            startGattDiscovery(generation,device);
                        }catch(SecurityException error){
                            Log.w(TAG,"BT_BLE nearby-device permission unavailable");
                            startGattDiscovery(generation,discoveryDevice);
                        }
                    });
                }
                @Override public void onScanFailed(int errorCode) {
                    main.post(()->{
                        if(!isCurrentDiscovery(generation))return;
                        Log.w(TAG,"BT_BLE scan failed code="+errorCode);
                        startGattDiscovery(generation,discoveryDevice);
                    });
                }
            };
            listener.onPhase("bt_connecting","CXR Bluetooth","正在扫描眼镜 BLE 服务，请保持眼镜处于发现模式");
            bleScanner.startScan(Collections.singletonList(new ScanFilter.Builder()
                    .setServiceUuid(ParcelUuid.fromString(CXR_DISCOVERY_SERVICE)).build()),
                    new ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build(),bleCallback);
            Log.i(TAG,"BT_BLE scan started service="+CXR_DISCOVERY_SERVICE);
            main.postDelayed(()->{
                if(!isCurrentDiscovery(generation)||gattDiscoveryStarted)return;
                Log.w(TAG,"BT_BLE no matching discovery advertisement; trying paired endpoint");
                startGattDiscovery(generation,discoveryDevice);
            },CxrDiscoveryPolicy.SCAN_TIMEOUT_MS);
        }catch(RuntimeException error){
            Log.w(TAG,"BT_BLE scan unavailable",error);
            startGattDiscovery(generation,discoveryDevice);
        }
    }

    private void startGattDiscovery(long generation,BluetoothDevice device) {
        if(!isCurrentDiscovery(generation)||gattDiscoveryStarted||!socketUuid.isBlank())return;
        gattDiscoveryStarted=true;
        stopBleDiscovery();
        listener.onPhase("bt_connecting","CXR Bluetooth","正在读取眼镜 CXR UUID（GATT）");
        try {
            cxr.initBluetooth(context,device);
            armBluetoothTimeout(generation,CxrDiscoveryPolicy.GATT_TIMEOUT_MS,
                    "未取得眼镜 CXR UUID：GATT 服务无响应，请检查眼镜发现模式");
        }catch(RuntimeException error){
            Log.w(TAG,"BT_GATT discovery failed",error);
            bluetoothConnectInFlight.set(false);
            scheduleBluetoothRetry(2_000);
        }
    }

    private synchronized void stopBleDiscovery() {
        BluetoothLeScanner scanner=bleScanner;
        ScanCallback callback=bleCallback;
        bleScanner=null;
        bleCallback=null;
        if(scanner!=null&&callback!=null)try{scanner.stopScan(callback);}
        catch(RuntimeException error){Log.w(TAG,"BT_BLE scan cleanup failed",error);}
    }

    private void scheduleBluetoothRetry(long delayMs) {
        if (!started || cxr.isBluetoothConnected()
                || !bluetoothRetryScheduled.compareAndSet(false, true)) return;
        main.postDelayed(() -> {
            bluetoothRetryScheduled.set(false);
            if (started && !cxr.isBluetoothConnected()) connectBluetooth();
            else ensureConnected();
        }, delayMs);
    }

    boolean isReady() {
        Socket value = socket;
        return ready && value != null && value.isConnected() && !value.isClosed();
    }

    boolean syncHud(String configJson) {
        if (!cxr.isBluetoothConnected()) return false;
        Caps caps=new Caps();caps.write("sync");caps.write(configJson==null?"":configJson);
        ValueUtil.CxrStatus result=cxr.request(2,HUD_COMMAND,caps,null);
        Log.i(TAG,"HUD_SYNC result="+result);
        return result==ValueUtil.CxrStatus.REQUEST_SUCCEED;
    }

    boolean requestCapture(long requestId, int width, int quality, boolean forceCold) {
        if (!isReady() || !cxr.isBluetoothConnected()) return false;
        Caps caps = new Caps();
        caps.writeInt64(requestId);
        caps.writeInt32(width);
        caps.writeInt32(quality);
        caps.writeInt32(forceCold ? 1 : 0);
        ValueUtil.CxrStatus result = cxr.request(4, CAPTURE_COMMAND, caps, null);
        Log.i(TAG, "CAPTURE_REQUEST requestId=" + requestId + " cold=" + forceCold
                + " result=" + result);
        return result == ValueUtil.CxrStatus.REQUEST_SUCCEED;
    }

    boolean setPerception(boolean enabled,int framesPerSecond,int width,int quality) {
        if (!cxr.isBluetoothConnected()) return false;
        Caps caps=new Caps();caps.writeInt32(enabled?1:0);caps.writeInt32(framesPerSecond);caps.writeInt32(width);caps.writeInt32(quality);
        ValueUtil.CxrStatus result=cxr.request(4,CONTROL_COMMAND,caps,null);
        Log.i(TAG,"PERCEPTION enabled="+enabled+" fps="+framesPerSecond+" width="+width+" quality="+quality+" result="+result);
        return result==ValueUtil.CxrStatus.REQUEST_SUCCEED;
    }

    boolean showPerson(String personId,String name,String title,int affinity,String quest,String story,String choicesJson) {
        if (!cxr.isBluetoothConnected()) return false;
        Caps caps=new Caps();caps.write(personId);caps.write(name);caps.write(title);
        caps.writeInt32(affinity);caps.write(quest);caps.write(story);caps.write(choicesJson==null?"":choicesJson);
        ValueUtil.CxrStatus result=cxr.request(7,PERSON_COMMAND,caps,null);
        Log.i(TAG,"PERSON_HUD personId="+personId+" affinity="+affinity+" result="+result);
        return result==ValueUtil.CxrStatus.REQUEST_SUCCEED;
    }

    private void startP2p() {
        if (!started || !cxr.isBluetoothConnected()
                || !p2pRequestInFlight.compareAndSet(false, true)) return;
        listener.onPhase("p2p_negotiating", "CXR Bluetooth", "requesting Wi-Fi Direct");
        Caps caps = new Caps();
        caps.write("Sync_Start");
        caps.write("{\"type\":\"Android\"}");
        long requestGeneration = p2pRequestGeneration.incrementAndGet();
        ValueUtil.CxrStatus result = cxr.request(2, "Med", caps, null);
        Log.i(TAG, "P2P_INIT result=" + result);
        if (result != ValueUtil.CxrStatus.REQUEST_SUCCEED) {
            p2pRequestInFlight.set(false);
            listener.onPhase("p2p_negotiating", "CXR Bluetooth",
                    "P2P request retrying: " + result);
            scheduleP2pRetry();
            return;
        }
        main.postDelayed(() -> {
            if (started && !ready && wifi == null
                    && p2pRequestGeneration.get() == requestGeneration
                    && p2pRequestInFlight.compareAndSet(true, false)) {
                Log.w(TAG, "P2P request watchdog expired");
                scheduleP2pRetry();
            }
        }, P2P_REQUEST_WATCHDOG_MS);
    }

    private void scheduleP2pRetry() {
        if (!shouldRetryWifi(started, cxr.isBluetoothConnected(), ready)
                || !p2pRetryScheduled.compareAndSet(false, true)) return;
        main.postDelayed(() -> {
            p2pRetryScheduled.set(false);
            if (shouldRetryWifi(started, cxr.isBluetoothConnected(), ready)) startP2p();
        }, P2P_RETRY_MS);
    }

    @Override public void onStatusUpdate(ValueUtil.CxrStatus status,
                                          ValueUtil.CxrBluetoothErrorCode error) {
        if(!started)return;
        Log.i(TAG, "BT_STATUS status=" + status + " error=" + error);
        if (status == ValueUtil.CxrStatus.BLUETOOTH_AVAILABLE) {
            discoveryGeneration.incrementAndGet();
            stopBleDiscovery();
            if(!socketUuid.isBlank()&&android.bluetooth.BluetoothAdapter.checkBluetoothAddress(classicAddress))
                endpoints.edit().putString(endpointKey("uuid"),socketUuid)
                        .putString(endpointKey("address"),classicAddress).apply();
            bluetoothConnectInFlight.set(false);
            activatingBluetooth.set(false);
            bluetoothRetryScheduled.set(false);
            startP2p();
        }
        else if (status == ValueUtil.CxrStatus.BLUETOOTH_INACTIVECONNECT
                && activatingBluetooth.compareAndSet(false, true)) {
            bluetoothConnectInFlight.set(false);
            listener.onPhase("bt_connecting", "CXR Bluetooth", "locating RealTopia client");
            cxr.fetchClientList();
            Log.i(TAG, "BT_CLIENT_LIST requested");
        }
        else if (status == ValueUtil.CxrStatus.BLUETOOTH_UNAVAILABLE) {
            discoveryGeneration.incrementAndGet();
            stopBleDiscovery();
            // A normal disconnect does not invalidate a working UUID. A real
            // connection failure clears it and returns to SDP/GATT discovery.
            if(error!=ValueUtil.CxrBluetoothErrorCode.SUCCEED)forgetEndpoint();
            bluetoothConnectInFlight.set(false);
            activatingBluetooth.set(false);
            ready = false;
            p2pRetryScheduled.set(false);
            p2pRequestInFlight.set(false);
            socketRetryScheduled.set(false);
            main.removeCallbacksAndMessages(null);
            try { if (socket != null) socket.close(); } catch (IOException ignored) { }
            socket = null;
            p2pAddress = "";
            WifiDirectLink disconnected = wifi;
            wifi = null;
            if (disconnected != null) {
                try { disconnected.close(); }
                catch (RuntimeException deinitError) {
                    Log.w(TAG, "P2P deinit after Bluetooth disconnect", deinitError);
                }
            }
            listener.onPhase("bt_connecting", "CXR Bluetooth", "Bluetooth unavailable: " + error);
            scheduleBluetoothRetry(BLUETOOTH_RETRY_MS);
        }
    }

    @Override public void onStatusUpdateWithExtra(ValueUtil.CxrStatus status,
                                                   ValueUtil.CxrBluetoothErrorCode error,
                                                   String uuid, String address) {
        if(status==ValueUtil.CxrStatus.BLUETOOTH_AVAILABLE&&uuid!=null
                &&android.bluetooth.BluetoothAdapter.checkBluetoothAddress(address)){
            try{socketUuid=java.util.UUID.fromString(uuid).toString();classicAddress=address;}
            catch(IllegalArgumentException ignored){}
        }
        onStatusUpdate(status, error);
    }

    @Override public void onValueUpdate(String command, Caps caps) {
        if (!"Med".equals(command) || caps == null || caps.size() < 2
                || !"Med_WifiP2PSuc".equals(caps.at(0).getString())) return;
        try {
            JSONObject info = new JSONObject(caps.at(1).getString());
            String address=info.optString("deviceAddress");
            main.post(()->{
                if(!started||wifi!=null)return;
                long generation=p2pRequestGeneration.get();
                WifiDirectLink negotiating=new WifiDirectLink(context,new WifiDirectLink.Listener(){
                    public void onReady(String peer){if(started&&p2pRequestGeneration.get()==generation)onAddress(peer);}
                    public void onFailure(String message){
                        if(!started||p2pRequestGeneration.get()!=generation)return;
                        wifi=null;ready=false;p2pAddress="";p2pRequestInFlight.set(false);
                        try{if(socket!=null)socket.close();}catch(IOException ignored){}
                        socket=null;
                        listener.onPhase("p2p_negotiating","Wi-Fi Direct",message);
                        scheduleP2pRetry();
                    }
                });
                wifi=negotiating;
                negotiating.start(address);
                Log.i(TAG,"P2P_CREDENTIALS received; using Android P2P API");
            });
        } catch (JSONException e) {
            postError("invalid P2P credentials");
        }
    }

    private void onAddress(String address) {
        p2pAddress = address == null ? "" : address;
        p2pRequestInFlight.set(false);
        p2pRetryScheduled.set(false);
        socketRetryScheduled.set(false);
        Log.i(TAG, "P2P_ADDRESS ready=" + !p2pAddress.isBlank());
        connectSocket();
    }

    private void connectSocket() {
        if (!started || !cxr.isBluetoothConnected() || p2pAddress.isBlank()
                || !connectingSocket.compareAndSet(false, true)) return;
        io.execute(() -> {
            Socket connected = null;
            try {
                connected = createP2pSocket();
                connected.setTcpNoDelay(true);
                connected.setKeepAlive(true);
                connected.setReceiveBufferSize(2 * 1024 * 1024);
                connected.connect(new InetSocketAddress(p2pAddress, PHOTO_PORT),
                        SOCKET_CONNECT_TIMEOUT_MS);
                if (!started) { connected.close(); return; }
                socket = connected;
                ready = true;
                socketRetryScheduled.set(false);
                listener.onPhase("ready", "Wi-Fi Direct / TCP", "photo socket connected");
                Log.i(TAG, "SOCKET_READY");
                readLoop(connected);
            } catch (IOException e) {
                try { if (connected != null) connected.close(); } catch (IOException ignored) { }
                ready = false;
                socket = null;
                if (shouldRetryWifi(started, cxr.isBluetoothConnected(), ready)) {
                    Log.e(TAG, "socket connect/read failed", e);
                    listener.onPhase("p2p_negotiating", "Wi-Fi Direct / TCP", e.getMessage());
                    scheduleSocketRetry();
                }
            } finally {
                connectingSocket.set(false);
            }
        });
    }

    private void scheduleSocketRetry() {
        if (!shouldRetryWifi(started, cxr.isBluetoothConnected(), ready)
                || !socketRetryScheduled.compareAndSet(false, true)) return;
        main.postDelayed(() -> {
            socketRetryScheduled.set(false);
            if (shouldRetryWifi(started, cxr.isBluetoothConnected(), ready)) connectSocket();
        }, SOCKET_RETRY_MS);
    }

    private Socket createP2pSocket() throws IOException {
        ConnectivityManager manager = context.getSystemService(ConnectivityManager.class);
        if (manager != null) {
            for (Network network : manager.getAllNetworks()) {
                LinkProperties properties = manager.getLinkProperties(network);
                String name = properties == null ? null : properties.getInterfaceName();
                if (name != null && name.startsWith("p2p")) {
                    Log.i(TAG, "SOCKET_BIND interface=" + name);
                    return network.getSocketFactory().createSocket();
                }
            }
        }
        // Some Android builds do not expose Wi-Fi Direct as a Network. Bind to
        // the actual P2P source address instead of falling back to Wi-Fi/mobile.
        InetAddress peer = InetAddress.getByName(p2pAddress);
        java.util.Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
        if (interfaces != null) for (NetworkInterface iface : Collections.list(interfaces)) {
            if (!iface.isUp() || !iface.getName().startsWith("p2p")) continue;
            for (InterfaceAddress address : iface.getInterfaceAddresses()) {
                if (!sameIpv4Subnet(address.getAddress().getAddress(), peer.getAddress(),
                        address.getNetworkPrefixLength())) continue;
                Socket bound = new Socket();
                try {
                    bound.bind(new InetSocketAddress(address.getAddress(), 0));
                    Log.i(TAG, "SOCKET_BIND interface=" + iface.getName() + " source=p2p");
                    return bound;
                } catch (IOException error) { bound.close(); throw error; }
            }
        }
        throw new IOException("Wi-Fi Direct interface not ready; no alternate photo transport");
    }

    static boolean sameIpv4Subnet(byte[] local, byte[] peer, int prefix) {
        if (local.length != 4 || peer.length != 4 || prefix <= 0 || prefix > 32) return false;
        for (int index = 0; index < 4; index++) {
            int bits = Math.min(8, Math.max(0, prefix - index * 8));
            int mask = (0xff << (8 - bits)) & 0xff;
            if ((local[index] & mask) != (peer[index] & mask)) return false;
        }
        return true;
    }

    private void readLoop(Socket connected) throws IOException {
        DataInputStream input = new DataInputStream(connected.getInputStream());
        while (started && !connected.isClosed()) {
            RealiaFrameReader.Frame frame=RealiaFrameReader.read(input);
            if(frame.isAudio())listener.onAudio(frame);else if(frame.isPersonChoice())listener.onPersonChoice(frame);else listener.onPhoto(frame);
        }
    }

    private void postError(String message) {
        Log.e(TAG, message);
        main.post(() -> listener.onError(message));
    }

    @Override public void onConnectionInfo(String uuid, String address, String account, int type) {
        // Do not log or persist the account returned by the SDK.
        if (!started) return;
        try {
            socketUuid=java.util.UUID.fromString(uuid).toString();
            if (!android.bluetooth.BluetoothAdapter.checkBluetoothAddress(address))
                throw new IllegalArgumentException("Invalid classic Bluetooth address");
            classicAddress=address;
            main.post(() -> {
                if (started && !socketUuid.isBlank()) {
                    stopBleDiscovery();
                    long generation=discoveryGeneration.incrementAndGet();
                    cxr.connectBluetooth(context, socketUuid, classicAddress, CLIENT_INFO);
                    armBluetoothTimeout(generation,CxrDiscoveryPolicy.SOCKET_TIMEOUT_MS,"CXR socket connection timed out");
                }
            });
            Log.i(TAG, "BT_UUID discovered from glasses");
        } catch (RuntimeException error) {
            socketUuid="";
            bluetoothConnectInFlight.set(false);
            scheduleBluetoothRetry(BLUETOOTH_RETRY_MS);
        }
    }
    @Override public void onStartAudioStream(int id, int rate, int channels, String command, Caps caps) { }
    @Override public void onAudioStream(int id, byte[] data, int offset, int length) { }
    @Override public void onAudioStreamFinish(int id) { }
    @Override public void onARTCFrame(byte[] data, long timestamp) { }
    @Override public void onBtClientsInfo(List<ValueUtil.BtClientInfo> clients) {
        ValueUtil.BtClientInfo match = null;
        if (clients != null) {
            for (ValueUtil.BtClientInfo client : clients) {
                Log.i(TAG, "BT_CLIENT customInfo=" + client.customInfo
                        + " status=" + client.bluetoothStatus);
                if (CLIENT_INFO.equals(client.customInfo)
                        && client.bluetoothStatus == ValueUtil.CxrStatus.BLUETOOTH_INACTIVECONNECT) {
                    match = client;
                }
            }
        }
        if (match == null || match.mac == null || match.mac.isBlank()) {
            activatingBluetooth.set(false);
            listener.onPhase("bt_connecting", "CXR Bluetooth",
                    "waiting for RealTopia client");
            scheduleBluetoothRetry(BLUETOOTH_RETRY_MS);
            return;
        }
        listener.onPhase("bt_connecting", "CXR Bluetooth", "activating RealTopia client");
        cxr.activeBluetoothConnect(match.mac);
        Log.i(TAG, "BT_ACTIVE requested");
    }

    synchronized void close() {
        started = false;
        discoveryGeneration.incrementAndGet();
        stopBleDiscovery();
        ready = false;
        activatingBluetooth.set(false);
        bluetoothConnectInFlight.set(false);
        p2pRetryScheduled.set(false);
        bluetoothRetryScheduled.set(false);
        socketRetryScheduled.set(false);
        p2pRequestInFlight.set(false);
        main.removeCallbacksAndMessages(null);
        try { if (socket != null) socket.close(); } catch (IOException ignored) { }
        socket = null;
        if (wifi != null) {
            wifi.close();
            wifi = null;
        }
        if(uuidReceiverRegistered){context.unregisterReceiver(uuidReceiver);uuidReceiverRegistered=false;}
        cxr.deinitBluetooth();
        io.shutdownNow();
    }
}
