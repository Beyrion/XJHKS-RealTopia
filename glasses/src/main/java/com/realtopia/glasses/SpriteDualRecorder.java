package com.realtopia.glasses;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.RemoteException;
import android.os.SystemClock;
import android.util.Log;
import com.rokid.os.sprite.record.service.IRecorderService;
import com.rokid.os.sprite.record.service.IRecordingCallback;
import java.io.File;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/** Consumer Sprite firmware fallback: records synchronized camera and HUD tracks for host compositing. */
final class SpriteDualRecorder implements AutoCloseable {
    private static final String TAG="RealiaRecording";
    private static final ComponentName COMPONENT=new ComponentName("com.rokid.os.sprite.record","com.rokid.os.sprite.record.service.RecordingService");
    private static final int CAMERA=1,SCREEN=2,BOTH=CAMERA|SCREEN;

    interface Listener {
        void onReady();
        void onStarted(String cameraPath,String screenPath);
        void onStopped(String cameraPath,String screenPath,boolean success);
        void onUnavailable(String message);
    }

    private final Context context;
    private final Listener listener;
    private final Handler main=new Handler(Looper.getMainLooper());
    private IRecorderService service;
    private boolean binding,bound,recording,closed,cameraStarted,screenStarted,cameraDone,screenDone,cameraSuccess,screenSuccess;
    private String cameraPath="",screenPath="";

    SpriteDualRecorder(Context context,Listener listener){this.context=context.getApplicationContext();this.listener=listener;}
    boolean isReady(){return bound&&service!=null;}
    boolean isRecording(){return recording;}

    void prepare(){
        if(closed||bound||binding)return;
        binding=true;
        Intent intent=new Intent("com.rokid.os.sprite.record.action.RECORDING_SERVICE").setComponent(COMPONENT);
        try{
            boolean accepted=context.bindService(intent,connection,Context.BIND_AUTO_CREATE);
            Log.i(TAG,"SPRITE_BIND_REQUEST accepted="+accepted+" component="+COMPONENT.flattenToShortString());
            if(!accepted){binding=false;listener.onUnavailable("Rokid Sprite recording service is unavailable");}
        }catch(RuntimeException error){binding=false;listener.onUnavailable("Rokid Sprite recording bind failed: "+error.getMessage());}
    }

    boolean start(int durationMs){
        if(closed||recording||!isReady())return false;
        String stamp=new SimpleDateFormat("yyyyMMdd-HHmmss",Locale.US).format(new Date());
        File output=new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MOVIES),"RealTopia");
        cameraPath=new File(output,stamp+"-camera.mp4").getAbsolutePath();
        screenPath=new File(output,stamp+"-hud.mp4").getAbsolutePath();
        cameraStarted=false;screenStarted=false;cameraDone=false;screenDone=false;cameraSuccess=false;screenSuccess=false;
        Bundle config=new Bundle();
        config.putInt("type",BOTH);config.putInt("width",1280);config.putInt("height",720);
        config.putInt("screenWidth",480);config.putInt("screenHeight",640);
        config.putInt("durationMs",Math.min(180_000,Math.max(5_000,durationMs)));config.putInt("fps",30);
        config.putString("outputPath",cameraPath);config.putString("screenOutputPath",screenPath);
        try{
            recording=service.startRecording(config,callback);
            Log.i(TAG,"SPRITE_RECORD_REQUEST accepted="+recording+" camera="+cameraPath+" screen="+screenPath+" durationMs="+durationMs);
            if(!recording)listener.onUnavailable("Rokid Sprite recorder rejected the request");
            return recording;
        }catch(RemoteException|RuntimeException error){recording=false;listener.onUnavailable("Rokid Sprite recording start failed: "+error.getMessage());return false;}
    }

    void stop(){
        if(!recording||service==null)return;
        try{service.stopRecording(BOTH);}catch(RemoteException|RuntimeException error){recording=false;listener.onUnavailable("Rokid Sprite recording stop failed: "+error.getMessage());}
    }

    private void reportStarted(){if(cameraStarted&&screenStarted){Log.i(TAG,"SPRITE_RECORD_STARTED camera="+cameraPath+" screen="+screenPath);listener.onStarted(cameraPath,screenPath);}}
    private void reportCompleted(){
        if(!cameraDone||!screenDone)return;
        recording=false;boolean success=cameraSuccess&&screenSuccess;
        Log.i(TAG,"SPRITE_RECORD_FILES camera="+cameraPath+" screen="+screenPath+" success="+success);
        listener.onStopped(cameraPath,screenPath,success);
    }

    private final IRecordingCallback callback=new IRecordingCallback.Stub(){
        @Override public void onStarted(int type,String path){long at=SystemClock.elapsedRealtime();main.post(()->{Log.i(TAG,"SPRITE_TRACK_STARTED type="+type+" elapsedRealtimeMs="+at+" path="+path);if((type&CAMERA)!=0){cameraStarted=true;if(path!=null&&!path.isEmpty())cameraPath=path;}if((type&SCREEN)!=0){screenStarted=true;if(path!=null&&!path.isEmpty())screenPath=path;}reportStarted();});}
        @Override public void onCompleted(int type,String path,boolean success,String message){main.post(()->{if((type&CAMERA)!=0){cameraDone=true;cameraSuccess=success;if(path!=null&&!path.isEmpty())cameraPath=path;}if((type&SCREEN)!=0){screenDone=true;screenSuccess=success;if(path!=null&&!path.isEmpty())screenPath=path;}Log.i(TAG,"SPRITE_TRACK_FINISHED type="+type+" success="+success+" message="+message+" path="+path);reportCompleted();});}
        @Override public void onError(int type,int code,String message){main.post(()->{Log.e(TAG,"SPRITE_RECORD_ERROR type="+type+" code="+code+" message="+message);listener.onUnavailable("Rokid Sprite recorder error "+code+": "+message);});}
    };

    private final ServiceConnection connection=new ServiceConnection(){
        @Override public void onServiceConnected(ComponentName name,IBinder binder){main.post(()->{binding=false;bound=true;service=IRecorderService.Stub.asInterface(binder);Log.i(TAG,"SPRITE_RECORDER_READY component="+name.flattenToShortString());listener.onReady();});}
        @Override public void onServiceDisconnected(ComponentName name){main.post(()->{bound=false;binding=false;service=null;if(recording)listener.onUnavailable("Rokid Sprite recording service disconnected");recording=false;});}
        @Override public void onBindingDied(ComponentName name){onServiceDisconnected(name);}
        @Override public void onNullBinding(ComponentName name){main.post(()->{bound=false;binding=false;service=null;listener.onUnavailable("Rokid Sprite recording service returned a null binder");});}
    };

    @Override public void close(){
        closed=true;if(recording)stop();
        if(bound||binding){try{context.unbindService(connection);}catch(IllegalArgumentException ignored){}}
        service=null;bound=false;binding=false;
    }
}
