package com.realtopia.phone;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.LinkProperties;
import android.net.Network;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import com.rokid.cxr.Caps;
import com.rokid.cxr.client.controllers.CxrController;
import com.rokid.cxr.client.extend.controllers.WifiController;
import com.rokid.cxr.client.utils.ValueUtil;
import java.io.DataInputStream;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import org.json.JSONException;
import org.json.JSONObject;

/** CXR-M control plus a socket bound only to Rokid's Wi-Fi Direct network. */
final class RokidPhotoTransport implements CxrController.Callback, WifiController.Callback {
    interface Listener {
        void onPhase(String phase, String transport, String detail);
        void onPhoto(RealiaFrameReader.Frame frame);
        void onAudio(RealiaFrameReader.Frame frame);
        void onPersonChoice(RealiaFrameReader.Frame frame);
        void onError(String message);
    }

    private static final String TAG = "RealiaPhoneTransport";
    private static final String CXR_SOCKET_UUID = "8f599222-e9dd-450c-8844-d09d0b2cccef";
    private static final String CAPTURE_COMMAND = "Realia_Capture";
    private static final String CONTROL_COMMAND = "Realia_Control";
    private static final String PERSON_COMMAND = "Realia_Person";
    private static final String CLIENT_INFO = "RealTopia";
    private static final int PHOTO_PORT = 39831;
    static final long BLUETOOTH_RETRY_MS = 300;
    static final long P2P_RETRY_MS = 400;
    static final long SOCKET_RETRY_MS = 250;
    static final int SOCKET_CONNECT_TIMEOUT_MS = 900;
    private static final long P2P_REQUEST_WATCHDOG_MS = 4_000;
    // vivo may spend ~5.3 s discovering the peer before it even calls CONNECT;
    // successful groups on this device have taken up to 8.9 s. Twelve seconds
    // avoids cancelling a healthy late negotiation while still bounding stalls.
    private static final long WIFI_NEGOTIATION_WATCHDOG_MS = 12_000;
    private static final long BLUETOOTH_REQUEST_WATCHDOG_MS = 1_500;
    private final Context context;
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
    private volatile WifiController wifi;
    private volatile Socket socket;
    private volatile boolean started;
    private volatile boolean ready;
    private volatile String p2pAddress = "";
    private volatile String glassAddress = "";

    static boolean shouldRetryWifi(boolean started, boolean bluetoothConnected, boolean ready) {
        return started && bluetoothConnected && !ready;
    }

    RokidPhotoTransport(Context context, Listener listener) {
        this.context = context.getApplicationContext();
        this.listener = listener;
    }

    synchronized void start(String glassAddress) {
        this.glassAddress = glassAddress;
        if (started) {
            ensureConnected();
            return;
        }
        started = true;
        connectBluetooth();
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
        try {
            cxr.setCallback(this);
            cxr.connectBluetooth(context, CXR_SOCKET_UUID, glassAddress, CLIENT_INFO);
            Log.i(TAG, "BT_CONNECT requested address=" + glassAddress);
            main.postDelayed(() -> {
                if (started && !cxr.isBluetoothConnected()
                        && bluetoothConnectInFlight.compareAndSet(true, false)) {
                    Log.w(TAG, "Bluetooth request watchdog expired");
                    scheduleBluetoothRetry(BLUETOOTH_RETRY_MS);
                }
            }, BLUETOOTH_REQUEST_WATCHDOG_MS);
        } catch (RuntimeException error) {
            bluetoothConnectInFlight.set(false);
            Log.w(TAG, "Bluetooth reconnect request failed", error);
            scheduleBluetoothRetry(BLUETOOTH_RETRY_MS);
        }
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
        Log.i(TAG, "BT_STATUS status=" + status + " error=" + error);
        if (status == ValueUtil.CxrStatus.BLUETOOTH_AVAILABLE) {
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
            WifiController disconnected = wifi;
            wifi = null;
            if (disconnected != null) {
                try { disconnected.deinit(ValueUtil.CxrWifiErrorCode.SUCCEED); }
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
        onStatusUpdate(status, error);
    }

    @Override public void onValueUpdate(String command, Caps caps) {
        if (!"Med".equals(command) || caps == null || caps.size() < 2
                || !"Med_WifiP2PSuc".equals(caps.at(0).getString())) return;
        try {
            JSONObject info = new JSONObject(caps.at(1).getString());
            WifiController negotiating = WifiController.getInstance();
            wifi = negotiating;
            long requestGeneration = p2pRequestGeneration.get();
            negotiating.init(context, info.optString("deviceName"),
                    info.optString("deviceAddress"), this);
            Log.i(TAG, "P2P_CREDENTIALS received");
            main.postDelayed(() -> {
                if (!started || ready || !p2pAddress.isBlank()
                        || p2pRequestGeneration.get() != requestGeneration
                        || wifi != negotiating) return;
                Log.w(TAG, "Wi-Fi Direct negotiation watchdog expired");
                wifi = null;
                p2pRequestInFlight.set(false);
                try { negotiating.deinit(ValueUtil.CxrWifiErrorCode.SUCCEED); }
                catch (RuntimeException deinitError) {
                    Log.w(TAG, "P2P watchdog deinit failed", deinitError);
                }
                listener.onPhase("p2p_negotiating", "Wi-Fi Direct",
                        "negotiation stalled; retrying");
                scheduleP2pRetry();
            }, WIFI_NEGOTIATION_WATCHDOG_MS);
        } catch (JSONException e) {
            postError("invalid P2P credentials");
        }
    }

    @Override public void onStatusUpdate(ValueUtil.CxrStatus status,
                                          ValueUtil.CxrWifiErrorCode error) {
        Log.i(TAG, "P2P_STATUS status=" + status + " error=" + error);
        if (status == ValueUtil.CxrStatus.WIFI_AVAILABLE) {
            p2pRetryScheduled.set(false);
            p2pRequestInFlight.set(false);
            socketRetryScheduled.set(false);
            connectSocket();
        }
        else if (status == ValueUtil.CxrStatus.WIFI_UNAVAILABLE) {
            ready = false;
            p2pRequestInFlight.set(false);
            listener.onPhase("p2p_negotiating", "Wi-Fi Direct", "Wi-Fi unavailable: " + error);
            // CXR-M 1.0.8 can keep a stale peer callback queued after provision
            // discovery fails and dereference a removed device. Tear the failed
            // controller down before asking CXR for fresh credentials.
            WifiController failed = wifi;
            wifi = null;
            if (failed != null) {
                try { failed.deinit(error); }
                catch (RuntimeException deinitError) {
                    Log.w(TAG, "P2P deinit after failure", deinitError);
                }
            }
            scheduleP2pRetry();
        }
    }

    @Override public void onAddress(String address) {
        p2pAddress = address == null ? "" : address;
        Log.i(TAG, "P2P_ADDRESS ready=" + !p2pAddress.isBlank());
        connectSocket();
    }

    private void connectSocket() {
        if (!started || !cxr.isBluetoothConnected() || p2pAddress.isBlank()
                || !connectingSocket.compareAndSet(false, true)) return;
        io.execute(() -> {
            try {
                Socket connected = createP2pSocket();
                connected.setTcpNoDelay(true);
                connected.setKeepAlive(true);
                connected.setReceiveBufferSize(2 * 1024 * 1024);
                connected.connect(new InetSocketAddress(p2pAddress, PHOTO_PORT),
                        SOCKET_CONNECT_TIMEOUT_MS);
                socket = connected;
                ready = true;
                socketRetryScheduled.set(false);
                listener.onPhase("ready", "Wi-Fi Direct / TCP", "photo socket connected");
                Log.i(TAG, "SOCKET_READY");
                readLoop(connected);
            } catch (IOException e) {
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
        Log.w(TAG, "P2P Network not exposed; using route-selected socket");
        return new Socket();
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

    @Override public void onConnectionInfo(String uuid, String address, String account, int type) { }
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
            wifi.deinit(ValueUtil.CxrWifiErrorCode.SUCCEED);
            wifi = null;
        }
        cxr.deinitBluetooth();
        io.shutdownNow();
    }
}
