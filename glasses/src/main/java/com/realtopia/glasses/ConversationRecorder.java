package com.realtopia.glasses;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.os.SystemClock;
import java.io.ByteArrayOutputStream;
import java.util.concurrent.atomic.AtomicBoolean;

/** Records microphone audio as transport-ready 16 kHz mono PCM16. */
final class ConversationRecorder implements AutoCloseable {
    static final int SAMPLE_RATE=16_000;
    interface Callback{void onComplete(Recording recording);void onError(String message);}
    static final class Recording{
        final long startedAtMs,durationMs;final byte[] pcm;
        Recording(long startedAtMs,long durationMs,byte[] pcm){this.startedAtMs=startedAtMs;this.durationMs=durationMs;this.pcm=pcm;}
    }
    private final Context context;
    private final AtomicBoolean active=new AtomicBoolean(false);
    private AudioRecord audioRecord;
    private Thread worker;
    private ByteArrayOutputStream output;
    private long startedAtMs;

    ConversationRecorder(Context context){this.context=context;}
    synchronized boolean isRecording(){return active.get();}
    synchronized void start() throws IllegalStateException{
        if(active.get())return;
        if(context.checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED)throw new IllegalStateException("microphone permission missing");
        int minimum=AudioRecord.getMinBufferSize(SAMPLE_RATE,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT);
        int bufferSize=Math.max(4096,minimum*2);
        AudioRecord next=new AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION,SAMPLE_RATE,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT,bufferSize);
        if(next.getState()!=AudioRecord.STATE_INITIALIZED){next.release();throw new IllegalStateException("microphone initialization failed");}
        output=new ByteArrayOutputStream();audioRecord=next;startedAtMs=SystemClock.elapsedRealtime();active.set(true);
        worker=new Thread(()->recordLoop(next,bufferSize),"realtopia-conversation");worker.start();
    }
    private void recordLoop(AudioRecord source,int bufferSize){
        byte[] buffer=new byte[bufferSize];
        try{source.startRecording();while(active.get()){int read=source.read(buffer,0,buffer.length);if(read>0&&output.size()+read<=RealiaFrame.MAX_AUDIO_BYTES)output.write(buffer,0,read);}}
        catch(RuntimeException ignored){}finally{try{source.stop();}catch(RuntimeException ignored){}source.release();}
    }
    synchronized void stop(Callback callback){
        if(!active.compareAndSet(true,false)){callback.onError("recorder is not active");return;}
        AudioRecord source=audioRecord;Thread running=worker;long began=startedAtMs;
        try{if(source!=null)source.stop();}catch(RuntimeException ignored){}
        new Thread(()->{try{if(running!=null)running.join(1500);byte[] pcm; synchronized(ConversationRecorder.this){pcm=output==null?new byte[0]:output.toByteArray();audioRecord=null;worker=null;output=null;}if(pcm.length==0)callback.onError("recording is empty");else callback.onComplete(new Recording(began,SystemClock.elapsedRealtime()-began,pcm));}catch(InterruptedException error){Thread.currentThread().interrupt();callback.onError("recording finalization interrupted");}},"realtopia-recording-finish").start();
    }
    @Override public synchronized void close(){if(active.getAndSet(false)&&audioRecord!=null){try{audioRecord.stop();}catch(RuntimeException ignored){}}}
}
