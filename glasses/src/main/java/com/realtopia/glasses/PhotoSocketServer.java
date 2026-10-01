package com.realtopia.glasses;

import android.os.SystemClock;
import android.util.Log;
import java.io.DataOutputStream;
import java.io.IOException;
import java.net.ServerSocket;
import java.net.Socket;
import org.json.JSONObject;

final class PhotoSocketServer implements AutoCloseable {
    static final int PORT = 39831;
    private static final String TAG = "RealiaPhotoSocket";
    private volatile boolean running;
    private ServerSocket server;
    private Socket client;
    private DataOutputStream output;

    void start() {
        if (running) return;
        running = true;
        new Thread(this::acceptLoop, "realia-photo-accept").start();
    }

    private void acceptLoop() {
        try (ServerSocket active = new ServerSocket(PORT)) {
            active.setReuseAddress(true);
            synchronized (this) { server = active; }
            Log.i(TAG, "READY port=" + PORT);
            while (running) {
                Socket accepted = active.accept();
                accepted.setTcpNoDelay(true);
                accepted.setSendBufferSize(2 * 1024 * 1024);
                synchronized (this) {
                    closeClient();
                    client = accepted;
                    output = new DataOutputStream(accepted.getOutputStream());
                }
                Log.i(TAG, "CONNECTED peer=" + accepted.getRemoteSocketAddress());
            }
        } catch (IOException e) {
            if (running) Log.e(TAG, "server failed", e);
        }
    }

    synchronized boolean send(long requestId, JSONObject metadata, byte[] jpeg) {
        if (output == null) return false;
        long started = SystemClock.elapsedRealtime();
        try {
            RealiaFrame.write(output, requestId, metadata, jpeg);
            Log.i(TAG, "SENT requestId=" + requestId + " bytes=" + jpeg.length
                    + " socketWriteMs=" + (SystemClock.elapsedRealtime() - started));
            return true;
        } catch (IOException e) {
            Log.e(TAG, "send failed", e);
            closeClient();
            return false;
        }
    }

    synchronized boolean sendAudio(long recordingId,JSONObject metadata,byte[] pcm){
        if(output==null)return false;
        long started=SystemClock.elapsedRealtime();
        try{RealiaFrame.writeAudio(output,recordingId,metadata,pcm);Log.i(TAG,"AUDIO_SENT recordingId="+recordingId+" bytes="+pcm.length+" socketWriteMs="+(SystemClock.elapsedRealtime()-started));return true;}
        catch(IOException error){Log.e(TAG,"audio send failed",error);closeClient();return false;}
    }

    private synchronized void closeClient() {
        try { if (client != null) client.close(); } catch (IOException ignored) { }
        client = null; output = null;
    }

    @Override public synchronized void close() {
        running = false; closeClient();
        try { if (server != null) server.close(); } catch (IOException ignored) { }
        server = null;
    }
}
