package com.realtopia.glasses;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Bundle;
import android.os.SystemClock;
import android.util.Log;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.LinearLayout;
import android.widget.TextView;
import org.json.JSONException;
import org.json.JSONObject;
import java.util.concurrent.atomic.AtomicLong;

public final class MainActivity extends Activity {
    private static final int PERMISSION_REQUEST=41;
    private WarmCamera camera;
    private PhotoSocketServer photoServer;
    private RokidCommandBridge commandBridge;
    private GlassHudView hud;
    private final AtomicLong localRequestId=new AtomicLong(10_000);
    private boolean recording;
    private boolean personChoiceConfirmed;
    private ConversationRecorder conversationRecorder;
    private boolean perceptionEnabled;
    private int perceptionFramesPerSecond=2;
    private int captureWidth=4032;
    private int captureQuality=90;

    @Override protected void onCreate(Bundle state){
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        buildUi();
        photoServer=new PhotoSocketServer();photoServer.start();
        camera=new WarmCamera(this);
        conversationRecorder=new ConversationRecorder(this);
        commandBridge=new RokidCommandBridge(this::capture,this::setPerception,this::showPerson);commandBridge.start();
        String mock=getIntent().getStringExtra("mock");
        if("person".equals(mock))hud.postDelayed(()->hud.showPerson("林澄","植物研究员 / 老朋友",86,"让阳台重新生长","周末要不要一起去花市看看？我发现了一家很小的香草摊。"),1_500);
        else if("stranger".equals(mock))hud.postDelayed(()->hud.showPerson("陌生人","？？？",-1,"？？？","？？？"),1_500);
        if(checkSelfPermission(Manifest.permission.CAMERA)==PackageManager.PERMISSION_GRANTED){prepareCamera();}
        else requestPermissions(new String[]{Manifest.permission.CAMERA,Manifest.permission.RECORD_AUDIO,Manifest.permission.BLUETOOTH_CONNECT},PERMISSION_REQUEST);
    }

    private void buildUi(){
        hud=new GlassHudView(this);hud.setStatus(GlassHudView.Mode.READY,"相机预热中");setContentView(hud);
    }
    private TextView text(String value,int sp,int color){TextView view=new TextView(this);view.setText(value);view.setTextSize(sp);view.setTextColor(color);return view;}
    private void prepareCamera(){hud.setStatus(GlassHudView.Mode.READY,"相机预热中");camera.prepare();hud.postDelayed(()->hud.setStatus(GlassHudView.Mode.READY,"物理按键已就绪 · Photo socket :39831"),1_300);}

    private void capture(long requestId,int width,int quality,boolean forceCold){
        runOnUiThread(()->hud.setStatus(GlassHudView.Mode.CAPTURING,(forceCold?"冷启动":"热拍摄")+" · request #"+requestId));
        camera.capture(requestId,width,quality,forceCold,new WarmCamera.Callback(){
            @Override public void onPhoto(WarmCamera.Photo photo){
                try{
                    JSONObject metadata=new JSONObject()
                            .put("requestId",photo.requestId).put("captureRequestedElapsedMs",photo.requestedAtMs)
                            .put("cameraStartedElapsedMs",photo.cameraOpenedAtMs).put("previewReadyElapsedMs",photo.previewReadyAtMs)
                            .put("captureStartedElapsedMs",photo.captureStartedAtMs).put("jpegReadyElapsedMs",photo.jpegReadyAtMs)
                            .put("cameraOpenMs",photo.cold?photo.previewReadyAtMs-photo.cameraOpenedAtMs:0)
                            .put("warmupMs",photo.cold?photo.captureStartedAtMs-photo.previewReadyAtMs:
                                    photo.captureStartedAtMs-photo.requestedAtMs)
                            .put("captureMs",photo.jpegReadyAtMs-photo.captureStartedAtMs)
                            .put("width",photo.width).put("height",photo.height)
                            .put("rotationDegrees",photo.rotationDegrees).put("cold",photo.cold)
                            .put("stream",false).put("bytes",photo.jpeg.length);
                    boolean sent=photoServer.send(photo.requestId,metadata,photo.jpeg);
                    long localE2e=SystemClock.elapsedRealtime()-photo.requestedAtMs;
                    Log.i("RealiaE2E","CAPTURE_RESULT requestId="+photo.requestId+" cold="+photo.cold+" localE2eMs="+localE2e+" transport="+(sent?"wifi_direct_tcp":"not_connected"));
                    runOnUiThread(()->hud.setStatus(sent?GlassHudView.Mode.SENDING:GlassHudView.Mode.READY,"#"+photo.requestId+" · "+photo.jpeg.length+" bytes · "+localE2e+" ms"));
                }catch(JSONException e){onError(photo.requestId,e.getMessage());}
            }
            @Override public void onError(long id,String message){MainActivity.this.onError(id,message);}
        });
    }
    private void setPerception(boolean enabled,int framesPerSecond,int width,int quality){
        runOnUiThread(()->{
            perceptionEnabled=enabled;perceptionFramesPerSecond=framesPerSecond;captureWidth=width;captureQuality=quality;
            hud.setPerception(enabled);hud.setStatus(GlassHudView.Mode.READY,enabled?"持续感知中 · "+framesPerSecond+" FPS · 1280 预览 / Q"+Math.min(85,quality):"持续感知已关闭 · 物理按键仍可拍摄");
            if(enabled)camera.startStream(framesPerSecond,quality,new WarmCamera.StreamCallback(){
                @Override public void onFrame(WarmCamera.StreamFrame frame){sendStreamFrame(frame);}
                @Override public void onError(String message){MainActivity.this.onError(0,message);}
            });else camera.stopStream();
        });
    }
    private void sendStreamFrame(WarmCamera.StreamFrame frame){
        long requestId=localRequestId.incrementAndGet();
        try{
            JSONObject metadata=new JSONObject()
                    .put("requestId",requestId).put("captureRequestedElapsedMs",frame.capturedAtMs)
                    .put("cameraStartedElapsedMs",frame.capturedAtMs).put("previewReadyElapsedMs",frame.capturedAtMs)
                    .put("captureStartedElapsedMs",frame.capturedAtMs).put("jpegReadyElapsedMs",frame.jpegReadyAtMs)
                    .put("cameraOpenMs",0).put("warmupMs",0).put("captureMs",frame.jpegReadyAtMs-frame.capturedAtMs)
                    .put("width",frame.width).put("height",frame.height).put("rotationDegrees",frame.rotationDegrees)
                    .put("cold",false).put("stream",true).put("framesPerSecond",frame.framesPerSecond).put("bytes",frame.jpeg.length);
            boolean sent=photoServer.send(requestId,metadata,frame.jpeg);
            Log.i("RealiaE2E","STREAM_RESULT requestId="+requestId+" fps="+frame.framesPerSecond+
                    " encodeMs="+(frame.jpegReadyAtMs-frame.capturedAtMs)+" bytes="+frame.jpeg.length+
                    " transport="+(sent?"wifi_direct_tcp":"not_connected"));
        }catch(JSONException error){onError(requestId,error.getMessage());}
    }
    private void showPerson(String personId,String name,String title,int affinity,String quest,String story){
        Log.i("RealiaPerson","SHOW personId="+personId+" affinity="+affinity+" quest="+quest);
        runOnUiThread(()->hud.showPerson(name,title,affinity,quest,story));
    }
    private void onError(long requestId,String message){Log.e("RealiaE2E","CAPTURE_ERROR requestId="+requestId+" message="+message);runOnUiThread(()->hud.setStatus(GlassHudView.Mode.ERROR,message));}
    @Override public boolean onKeyDown(int keyCode,KeyEvent event){
        if(keyCode==KeyEvent.KEYCODE_CAMERA||keyCode==KeyEvent.KEYCODE_HEADSETHOOK||keyCode==KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE||keyCode==KeyEvent.KEYCODE_ENTER){
            if(hud.isPersonMode()){if(event.getRepeatCount()==1){personChoiceConfirmed=true;hud.confirmPersonChoice();}else if(event.getRepeatCount()==0)event.startTracking();return true;}
            if(event.getRepeatCount()==1){try{conversationRecorder.start();recording=true;hud.setStatus(GlassHudView.Mode.RECORDING,"正在记录对话 · 16 kHz PCM");}catch(IllegalStateException error){onError(0,error.getMessage());}return true;}
            if(event.getRepeatCount()==0){event.startTracking();return true;}
            return true;
        }return super.onKeyDown(keyCode,event);
    }
    @Override public boolean onKeyUp(int keyCode,KeyEvent event){
        if(keyCode==KeyEvent.KEYCODE_CAMERA||keyCode==KeyEvent.KEYCODE_HEADSETHOOK||keyCode==KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE||keyCode==KeyEvent.KEYCODE_ENTER){
            if(hud.isPersonMode()){if(personChoiceConfirmed)personChoiceConfirmed=false;else hud.nextPersonChoice();return true;}
            if(recording){recording=false;hud.setStatus(GlassHudView.Mode.SENDING,"正在整理录音并发送至手机");conversationRecorder.stop(new ConversationRecorder.Callback(){
                @Override public void onComplete(ConversationRecorder.Recording value){sendRecording(value);}
                @Override public void onError(String message){runOnUiThread(()->hud.setStatus(GlassHudView.Mode.READY,"录音过短或无有效音频，请重新长按"));}
            });}
            else capture(localRequestId.incrementAndGet(),captureWidth,captureQuality,false);return true;
        }return super.onKeyUp(keyCode,event);
    }
    private void sendRecording(ConversationRecorder.Recording value){
        long recordingId=localRequestId.incrementAndGet();
        try{JSONObject metadata=new JSONObject().put("recordingId",recordingId).put("sampleRate",ConversationRecorder.SAMPLE_RATE).put("channels",1).put("encoding","pcm_s16le").put("startedElapsedMs",value.startedAtMs).put("durationMs",value.durationMs).put("bytes",value.pcm.length);boolean sent=photoServer.sendAudio(recordingId,metadata,value.pcm);runOnUiThread(()->hud.setStatus(sent?GlassHudView.Mode.SENDING:GlassHudView.Mode.ERROR,sent?"录音已发送 · 等待手机转写与任务关联":"手机数据通道未连接"));}
        catch(JSONException error){onError(recordingId,error.getMessage());}
    }
    @Override public void onRequestPermissionsResult(int code,String[] permissions,int[] grants){super.onRequestPermissionsResult(code,permissions,grants);if(code==PERMISSION_REQUEST&&checkSelfPermission(Manifest.permission.CAMERA)==PackageManager.PERMISSION_GRANTED)prepareCamera();else onError(0,"camera permission denied");}
    @Override protected void onDestroy(){if(conversationRecorder!=null)conversationRecorder.close();if(camera!=null)camera.close();if(photoServer!=null)photoServer.close();super.onDestroy();}
}
