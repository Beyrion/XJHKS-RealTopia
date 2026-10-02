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
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;

final class PhotoSocketServer implements AutoCloseable {
    static final int PORT = 39831;
    private static final String TAG = "RealiaPhotoSocket";
    private volatile boolean running;
    private ServerSocket server;
    private Socket client;
    private DataOutputStream output;
    private final ArrayDeque<PendingChoice> pendingChoices=new ArrayDeque<>();
    private final ArrayDeque<PendingAudio> pendingAudio=new ArrayDeque<>();
    private int pendingAudioBytes;
    private final AtomicReference<PendingPhoto> latestStream=new AtomicReference<>();
    private final AtomicBoolean streamWriterRunning=new AtomicBoolean(false);
    private final ExecutorService streamIo=Executors.newSingleThreadExecutor(r->{
        Thread thread=new Thread(r,"realia-latest-frame");thread.setDaemon(true);return thread;
    });
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
                accepted.setKeepAlive(true);
                accepted.setSendBufferSize(2 * 1024 * 1024);
                synchronized (this) {
                    closeClient();
                    client = accepted;
                    output = new DataOutputStream(accepted.getOutputStream());
                    flushPendingAudio();
                    flushPendingChoices();
                }
                Log.i(TAG, "CONNECTED peer=" + accepted.getRemoteSocketAddress());
                drainLatestStream();
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

    /**
     * Non-blocking stream delivery with a single latest-frame slot. If the
     * receiver pauses, stale frames are replaced instead of queueing latency or
     * blocking the camera encoder.
     */
    boolean sendStream(long requestId,JSONObject metadata,byte[] jpeg){
        boolean connected;
        synchronized(this){connected=output!=null;}
        PendingPhoto previous=latestStream.getAndSet(new PendingPhoto(requestId,metadata,jpeg));
        if(previous!=null)Log.d(TAG,"STREAM_DROP requestId="+previous.requestId+" replacedBy="+requestId);
        drainLatestStream();
        return connected;
    }

    private void drainLatestStream(){
        if(!running||!streamWriterRunning.compareAndSet(false,true))return;
        streamIo.execute(()->{
            try{
                while(running){
                    PendingPhoto frame=latestStream.getAndSet(null);
                    if(frame==null)return;
                    if(!writeStream(frame))return;
                }
            }finally{
                streamWriterRunning.set(false);
                if(running&&latestStream.get()!=null)drainLatestStream();
            }
        });
    }

    private synchronized boolean writeStream(PendingPhoto frame){
        if(output==null)return false;
        long started=SystemClock.elapsedRealtime();
        try{
            RealiaFrame.write(output,frame.requestId,frame.metadata,frame.jpeg);
            Log.i(TAG,"STREAM_SENT requestId="+frame.requestId+" bytes="+frame.jpeg.length+
                    " socketWriteMs="+(SystemClock.elapsedRealtime()-started));
            return true;
        }catch(IOException error){
            Log.e(TAG,"stream send failed",error);closeClient();return false;
        }
    }

    synchronized boolean sendAudio(long recordingId,JSONObject metadata,byte[] pcm){
        PendingAudio audio=new PendingAudio(recordingId,metadata,pcm);
        if(output==null){enqueueAudio(audio);return true;}
        long started=SystemClock.elapsedRealtime();
        try{RealiaFrame.writeAudio(output,recordingId,metadata,pcm);Log.i(TAG,"AUDIO_SENT recordingId="+recordingId+" bytes="+pcm.length+" socketWriteMs="+(SystemClock.elapsedRealtime()-started));return true;}
        catch(IOException error){Log.e(TAG,"audio send failed; queued for reconnect",error);enqueueAudio(audio);closeClient();return true;}
    }

    synchronized boolean sendPersonChoice(long eventId,JSONObject metadata){
        PendingChoice choice=new PendingChoice(eventId,metadata);
        enqueueChoice(choice);
        Log.i(TAG,"PERSON_CHOICE_QUEUED eventId="+eventId);
        if(output!=null)choiceIo.execute(this::flushPendingChoices);
        return true;
    }

    private void writeChoice(PendingChoice choice)throws IOException{RealiaFrame.writePersonChoice(output,choice.eventId,choice.metadata);Log.i(TAG,"PERSON_CHOICE_SENT eventId="+choice.eventId);}
    private void writeAudio(PendingAudio audio)throws IOException{long started=SystemClock.elapsedRealtime();RealiaFrame.writeAudio(output,audio.recordingId,audio.metadata,audio.pcm);Log.i(TAG,"AUDIO_SENT recordingId="+audio.recordingId+" bytes="+audio.pcm.length+" socketWriteMs="+(SystemClock.elapsedRealtime()-started)+" queued=true");}
    private void enqueueAudio(PendingAudio audio){while(!pendingAudio.isEmpty()&&pendingAudioBytes+audio.pcm.length>MAX_PENDING_AUDIO_BYTES){PendingAudio dropped=pendingAudio.removeFirst();pendingAudioBytes-=dropped.pcm.length;Log.w(TAG,"AUDIO_QUEUE_DROP recordingId="+dropped.recordingId+" bytes="+dropped.pcm.length);}pendingAudio.addLast(audio);pendingAudioBytes+=audio.pcm.length;Log.i(TAG,"AUDIO_QUEUED recordingId="+audio.recordingId+" bytes="+audio.pcm.length+" pendingBytes="+pendingAudioBytes);}
    private synchronized void flushPendingAudio(){while(output!=null&&!pendingAudio.isEmpty()){PendingAudio audio=pendingAudio.peekFirst();try{writeAudio(audio);pendingAudio.removeFirst();pendingAudioBytes-=audio.pcm.length;}catch(IOException error){Log.e(TAG,"pending audio flush failed",error);closeClient();return;}}}
    private void enqueueChoice(PendingChoice choice){while(pendingChoices.size()>=16)pendingChoices.removeFirst();pendingChoices.addLast(choice);}
    private synchronized void flushPendingChoices(){while(output!=null&&!pendingChoices.isEmpty()){PendingChoice choice=pendingChoices.peekFirst();try{writeChoice(choice);pendingChoices.removeFirst();}catch(IOException error){Log.e(TAG,"pending choice flush failed",error);closeClient();return;}}}
    private static final class PendingAudio{final long recordingId;final JSONObject metadata;final byte[] pcm;PendingAudio(long recordingId,JSONObject metadata,byte[] pcm){this.recordingId=recordingId;this.metadata=metadata;this.pcm=pcm;}}
    private static final class PendingChoice{final long eventId;final JSONObject metadata;PendingChoice(long eventId,JSONObject metadata){this.eventId=eventId;this.metadata=metadata;}}
    private static final class PendingPhoto{final long requestId;final JSONObject metadata;final byte[] jpeg;PendingPhoto(long requestId,JSONObject metadata,byte[] jpeg){this.requestId=requestId;this.metadata=metadata;this.jpeg=jpeg;}}

    // About 32 seconds of 16 kHz mono PCM16. This covers cold P2P setup while
    // keeping reconnect buffering bounded on the glasses.
    private static final int MAX_PENDING_AUDIO_BYTES=1_024_000;

    private synchronized void closeClient() {
        try { if (client != null) client.close(); } catch (IOException ignored) { }
        client = null; output = null;
    }

    @Override public synchronized void close() {
        running = false; closeClient();
        pendingAudio.clear();pendingAudioBytes=0;
        latestStream.set(null);
        choiceIo.shutdownNow();
        streamIo.shutdownNow();
        try { if (server != null) server.close(); } catch (IOException ignored) { }
        server = null;
    }
}
