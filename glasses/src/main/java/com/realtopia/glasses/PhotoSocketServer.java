package com.realtopia.glasses;

import android.os.SystemClock;
import android.util.Log;
import java.io.DataOutputStream;
import java.io.IOException;
import java.net.ServerSocket;
import java.net.Socket;
import java.util.ArrayDeque;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

final class PhotoSocketServer implements AutoCloseable {
    static final int PORT = 39831;
    private static final String TAG = "RealiaPhotoSocket";
    private volatile boolean running;
    private ServerSocket server;
    private Socket client;
    private DataOutputStream output;
    private final ArrayDeque<PendingChoice> pendingChoices=new ArrayDeque<>();
    private final ExecutorService choiceIo=Executors.newSingleThreadExecutor(r->{
        Thread thread=new Thread(r,"realia-person-choice");thread.setDaemon(true);return thread;
    });

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
                    flushPendingChoices();
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

    synchronized boolean sendPersonChoice(long eventId,JSONObject metadata){
        PendingChoice choice=new PendingChoice(eventId,metadata);
        enqueueChoice(choice);
        Log.i(TAG,"PERSON_CHOICE_QUEUED eventId="+eventId);
        if(output!=null)choiceIo.execute(this::flushPendingChoices);
        return true;
    }

    private void writeChoice(PendingChoice choice)throws IOException{RealiaFrame.writePersonChoice(output,choice.eventId,choice.metadata);Log.i(TAG,"PERSON_CHOICE_SENT eventId="+choice.eventId);}
    private void enqueueChoice(PendingChoice choice){while(pendingChoices.size()>=16)pendingChoices.removeFirst();pendingChoices.addLast(choice);}
    private synchronized void flushPendingChoices(){while(output!=null&&!pendingChoices.isEmpty()){PendingChoice choice=pendingChoices.peekFirst();try{writeChoice(choice);pendingChoices.removeFirst();}catch(IOException error){Log.e(TAG,"pending choice flush failed",error);closeClient();return;}}}
    private static final class PendingChoice{final long eventId;final JSONObject metadata;PendingChoice(long eventId,JSONObject metadata){this.eventId=eventId;this.metadata=metadata;}}

    private synchronized void closeClient() {
        try { if (client != null) client.close(); } catch (IOException ignored) { }
        client = null; output = null;
    }

    @Override public synchronized void close() {
        running = false; closeClient();
        choiceIo.shutdownNow();
        try { if (server != null) server.close(); } catch (IOException ignored) { }
        server = null;
    }
}
