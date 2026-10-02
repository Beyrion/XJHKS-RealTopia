package com.realtopia.glasses;

import android.content.Context;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.os.RemoteException;
import android.util.Log;
import com.rokid.security.glass3.open.sdk.GlassSdk;
import com.rokid.security.glass3.open.sdk.client.IServiceConnectionCallback;
import com.rokid.security.glass3.sdk.base.data.media.RecordConfig;
import com.rokid.security.system.server.IClientCallback;
import com.rokid.security.system.server.media.IMediaServer;
import com.rokid.security.system.server.media.callback.VideoCallback;
import java.io.File;

/** Records the first-person camera with the visible glasses screen composited by Rokid AR Mix. */
final class ArSceneRecorder implements AutoCloseable {
    private static final String TAG="RealiaRecording";
    private static final String CLIENT_ID="RealTopia";
    private static final int WIDTH=1280,HEIGHT=720,FPS=20,SEGMENT_MINUTES=1;

    interface Listener {
        void onSdkReady();
        void onStarted(String outputDirectory);
        void onFile(String path,boolean last);
        void onStopped();
        void onUnavailable(String message);
    }

    private final Context context;
    private final Listener listener;
    private final Handler main=new Handler(Looper.getMainLooper());
    private boolean binding,ready,recording,stopReported,closed;
    private long generation;
    private String outputDirectory="";

    ArSceneRecorder(Context context,Listener listener){this.context=context.getApplicationContext();this.listener=listener;}

    boolean isReady(){return ready&&GlassSdk.isReady()&&GlassSdk.getGlassMediaService()!=null;}
    boolean isRecording(){return recording;}

    void prepare(){
        main.post(()->{
            if(closed||ready||binding)return;
            if(GlassSdk.isReady()&&GlassSdk.getGlassMediaService()!=null){markReady();return;}
            binding=true;long attempt=++generation;
            try{
                GlassSdk.bindSecurityService(context,new IServiceConnectionCallback(){
                    @Override public void onServiceConnected(){main.post(()->{if(closed)return;try{GlassSdk.registerClient(CLIENT_ID,clientCallback);}catch(RuntimeException error){binding=false;unavailable("Rokid client registration failed: "+error.getMessage());}});}
                    @Override public void onServiceDisconnected(){main.post(()->{ready=false;binding=false;if(recording)fail("Rokid media service disconnected");});}
                    @Override public void onBindingDied(){main.post(()->{ready=false;binding=false;if(recording)fail("Rokid media service binding died");});}
                });
                main.postDelayed(()->{if(!closed&&attempt==generation&&!ready&&binding){binding=false;unavailable("Rokid media service bind timeout; Glass3 enterprise OTA 1.11.e003 or newer is required");}},8_000);
            }catch(RuntimeException error){binding=false;unavailable("Rokid media service bind failed: "+error.getMessage());}
        });
    }

    boolean start(int durationMs,boolean enableAudio){
        if(closed||recording||!isReady())return false;
        IMediaServer media=GlassSdk.getGlassMediaService();if(media==null)return false;
        File pictures=Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES);
        outputDirectory=new File(pictures,"RealTopia/video").getAbsolutePath();
        RecordConfig config=new RecordConfig(outputDirectory,SEGMENT_MINUTES,enableAudio,WIDTH,HEIGHT,FPS,true);
        stopReported=false;
        try{
            media.startRecord(videoCallback,config);
            recording=true;long attempt=++generation;
            Log.i(TAG,"AR_RECORD_REQUEST directory="+outputDirectory+" durationMs="+durationMs+" audio="+enableAudio+" size="+WIDTH+"x"+HEIGHT+" fps="+FPS);
            if(durationMs>0)main.postDelayed(()->{if(recording&&attempt==generation)stop();},durationMs);
            return true;
        }catch(RemoteException|RuntimeException error){fail("AR mixed recording start failed: "+error.getMessage());return false;}
    }

    void stop(){
        if(!recording)return;
        IMediaServer media=GlassSdk.getGlassMediaService();
        try{if(media!=null)media.stopRecord();else fail("Rokid media service disappeared while stopping");}
        catch(RemoteException|RuntimeException error){fail("AR mixed recording stop failed: "+error.getMessage());}
    }

    private void markReady(){ready=true;binding=false;Log.i(TAG,"AR_SDK_READY");listener.onSdkReady();}
    private void unavailable(String message){Log.w(TAG,"AR_UNAVAILABLE message="+message);listener.onUnavailable(message);}
    private void fail(String message){recording=false;++generation;Log.e(TAG,"AR_RECORD_ERROR message="+message);listener.onUnavailable(message);reportStopped();}
    private void reportStopped(){if(stopReported)return;stopReported=true;listener.onStopped();}

    private final IClientCallback clientCallback=new IClientCallback.Stub(){
        @Override public void onReady(){main.post(()->{if(closed)return;if(GlassSdk.getGlassMediaService()==null){binding=false;unavailable("Rokid media service is unavailable after client registration");}else markReady();});}
    };

    private final VideoCallback videoCallback=new VideoCallback.Stub(){
        @Override public void onStart(){main.post(()->{if(closed)return;recording=true;Log.i(TAG,"AR_RECORD_STARTED directory="+outputDirectory);listener.onStarted(outputDirectory);});}
        @Override public void onError(){main.post(()->fail("Rokid recorder returned an unspecified error"));}
        @Override public void onFinish(){main.post(()->{recording=false;++generation;Log.i(TAG,"AR_RECORD_FINISHED");reportStopped();});}
        @Override public void onNewFile(long startTime,long endTime,String path,boolean isLast){main.post(()->{Log.i(TAG,"AR_RECORD_FILE path="+path+" startMs="+startTime+" endMs="+endTime+" isLast="+isLast);listener.onFile(path,isLast);});}
        @Override public void onErrorWithDetail(int code,String message){main.post(()->fail("Rokid recorder error "+code+": "+message));}
    };

    @Override public void close(){
        closed=true;++generation;
        if(recording)stop();
        ready=false;binding=false;
        try{GlassSdk.release();}catch(RuntimeException error){Log.w(TAG,"GlassSdk release failed",error);}
    }
}
