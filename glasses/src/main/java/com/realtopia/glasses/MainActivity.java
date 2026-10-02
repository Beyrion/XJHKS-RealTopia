package com.realtopia.glasses;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.os.SystemClock;
import android.util.Log;
import android.view.KeyEvent;
import android.view.WindowManager;
import org.json.JSONException;
import org.json.JSONObject;
import java.io.File;
import java.util.concurrent.atomic.AtomicLong;

public final class MainActivity extends Activity {
    private static final int PERMISSION_REQUEST=41;
    private WarmCamera camera;
    private ArSceneRecorder sceneRecorder;
    private SpriteDualRecorder spriteRecorder;
    private HudSnapshotArchive hudArchive;
    private PhotoSocketServer photoServer;
    private RokidCommandBridge commandBridge;
    private GlassHudView hud;
    private final AtomicLong localRequestId=new AtomicLong(10_000);
    private boolean recording;
    private ConversationRecorder conversationRecorder;
    private boolean perceptionEnabled;
    private int perceptionFramesPerSecond=2;
    private int captureWidth=4032;
    private int captureQuality=90;
    private boolean arStartPending,arCameraSuspended,arFailed,spriteFallbackPending,demoOverlaySequence,destroyed;
    private int arRecordDurationMs=30_000,demoSequenceGeneration;
    private boolean arRecordAudio;
    private String activeSceneMode="",arLastFile="",arLastScreenFile="";

    @Override protected void onCreate(Bundle state){
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        buildUi();
        configureHudArchive(getIntent());
        photoServer=new PhotoSocketServer();photoServer.start();
        camera=new WarmCamera(this);
        sceneRecorder=new ArSceneRecorder(this,new ArSceneRecorder.Listener(){
            @Override public void onSdkReady(){if(arStartPending)beginArSceneRecording();}
            @Override public void onStarted(String outputDirectory){
                if(destroyed)return;
                hud.setStatus(GlassHudView.Mode.SCENE_RECORDING,"正在录制第一人称实景 + 眼镜界面");
                if(demoOverlaySequence)scheduleDemoOverlaySequence(true);
            }
            @Override public void onFile(String path,boolean last){arLastFile=path==null?"":path;if(last&&!destroyed)hud.setStatus(sceneRecorder.isRecording()?GlassHudView.Mode.SENDING:GlassHudView.Mode.READY,sceneRecorder.isRecording()?"视频封装完成 · 正在等待停止回调":"视频已保存 · "+new File(arLastFile).getName());}
            @Override public void onStopped(){
                if(destroyed||!"ar-mix".equals(activeSceneMode))return;
                activeSceneMode="";arStartPending=false;resumeCameraAfterArRecording();
                if(!arFailed)hud.setStatus(GlassHudView.Mode.READY,arLastFile.isEmpty()?"录制已停止 · 未收到视频文件回调":"视频已保存 · "+new File(arLastFile).getName());
            }
            @Override public void onUnavailable(String message){
                if(destroyed)return;
                Log.w("RealiaRecording","AR_RECORD_FALLBACK reason="+message+" hudArchive="+(hudArchive==null?"disabled":hudArchive.directory()));
                if(arStartPending||arCameraSuspended||"ar-mix".equals(activeSceneMode))trySpriteFallback(message);
            }
        });
        sceneRecorder.prepare();
        spriteRecorder=new SpriteDualRecorder(this,new SpriteDualRecorder.Listener(){
            @Override public void onReady(){if(spriteFallbackPending)beginSpriteSceneRecording();}
            @Override public void onStarted(String cameraPath,String screenPath){
                if(destroyed||!"sprite-dual".equals(activeSceneMode))return;
                arLastFile=cameraPath;arLastScreenFile=screenPath;
                hud.setStatus(GlassHudView.Mode.SCENE_RECORDING,"同步录制第一人称实景 + HUD 双轨");
                if(demoOverlaySequence)scheduleDemoOverlaySequence(true);
            }
            @Override public void onStopped(String cameraPath,String screenPath,boolean success){
                if(destroyed||!"sprite-dual".equals(activeSceneMode))return;
                activeSceneMode="";arLastFile=cameraPath;arLastScreenFile=screenPath;arStartPending=false;
                resumeCameraAfterArRecording();
                if(success)hud.setStatus(GlassHudView.Mode.READY,"双轨录制完成 · 脚本正在合成视频");
                else failSceneRecording("Rokid Sprite 双轨文件保存失败");
            }
            @Override public void onUnavailable(String message){
                if(destroyed)return;
                if(spriteFallbackPending||"sprite-dual".equals(activeSceneMode))failSceneRecording(message);
            }
        });
        spriteRecorder.prepare();
        conversationRecorder=new ConversationRecorder(this);
        commandBridge=new RokidCommandBridge(this::capture,this::setPerception,this::showPerson);commandBridge.start();
        String mock=getIntent().getStringExtra("mock");
        if("person".equals(mock))hud.postDelayed(()->hud.showPerson("lin","林澄","植物研究员 / 老朋友",86,"让阳台重新生长","周末要不要一起去花市看看？我发现了一家很小的香草摊。"),1_500);
        else if("stranger".equals(mock))hud.postDelayed(()->hud.showPerson("__stranger__","陌生人","？？？",-1,"？？？","？？？"),1_500);
        if(checkSelfPermission(Manifest.permission.CAMERA)==PackageManager.PERMISSION_GRANTED){prepareCamera();}
        else requestPermissions(new String[]{Manifest.permission.CAMERA,Manifest.permission.RECORD_AUDIO,Manifest.permission.BLUETOOTH_CONNECT},PERMISSION_REQUEST);
        handleRecordingIntent(getIntent());
    }

    private void buildUi(){
        hud=new GlassHudView(this);hud.setStatus(GlassHudView.Mode.READY,"相机预热中");setContentView(hud);
    }
    private boolean isDebuggable(){return (getApplicationInfo().flags&ApplicationInfo.FLAG_DEBUGGABLE)!=0;}
    private void configureHudArchive(Intent intent){
        if(!isDebuggable()||!intent.getBooleanExtra("archiveHud",false))return;
        hudArchive=new HudSnapshotArchive(this);hud.setOnVisualChangeListener(()->{if(hudArchive!=null)hudArchive.capture(hud);});
    }
    private void handleRecordingIntent(Intent intent){
        if(intent==null||!isDebuggable())return;
        if("stop".equals(intent.getStringExtra("arRecordAction"))){arStartPending=false;if(sceneRecorder!=null)sceneRecorder.stop();if(spriteRecorder!=null)spriteRecorder.stop();return;}
        int requested=intent.getIntExtra("arRecordDurationMs",0);
        if(requested<=0){if(intent.getBooleanExtra("demoOverlaySequence",false))hud.postDelayed(()->scheduleDemoOverlaySequence(false),1_500);return;}
        arRecordDurationMs=Math.min(180_000,Math.max(5_000,requested));
        arRecordAudio=intent.getBooleanExtra("arRecordAudio",false);
        demoOverlaySequence=intent.getBooleanExtra("demoOverlaySequence",false);
        int delay=Math.min(30_000,Math.max(1_500,intent.getIntExtra("arRecordDelayMs",2_500)));
        arStartPending=true;arFailed=false;spriteFallbackPending=false;activeSceneMode="";arLastFile="";arLastScreenFile="";
        hud.setStatus(GlassHudView.Mode.READY,"AR 混合录制待启动 · 相机预热中");
        hud.postDelayed(()->{if(arStartPending)beginArSceneRecording();},delay);
    }
    private void beginArSceneRecording(){
        if(destroyed||!arStartPending||arCameraSuspended)return;
        if(!sceneRecorder.isReady()){hud.setStatus(GlassHudView.Mode.READY,"正在连接 Rokid AR 混合录制服务");sceneRecorder.prepare();return;}
        arCameraSuspended=true;hud.setStatus(GlassHudView.Mode.SCENE_RECORDING,"正在切换到 Rokid AR 混合相机");
        camera.suspend(()->{
            if(destroyed)return;
            if(!arStartPending){resumeCameraAfterArRecording();return;}
            arStartPending=false;activeSceneMode="ar-mix";
            sceneRecorder.start(arRecordDurationMs,arRecordAudio);
        });
    }
    private void trySpriteFallback(String reason){
        if(destroyed)return;
        Log.i("RealiaRecording","SPRITE_FALLBACK_REQUEST reason="+reason);
        activeSceneMode="";arStartPending=true;spriteFallbackPending=true;
        hud.setStatus(GlassHudView.Mode.SCENE_RECORDING,"AR Mix 不可用 · 正在切换同步双轨录制");
        if(spriteRecorder.isReady())beginSpriteSceneRecording();else spriteRecorder.prepare();
    }
    private void beginSpriteSceneRecording(){
        if(destroyed||!spriteFallbackPending)return;
        spriteFallbackPending=false;activeSceneMode="sprite-dual";
        Runnable start=()->{
            if(destroyed)return;
            arStartPending=false;
            if(!spriteRecorder.start(arRecordDurationMs))failSceneRecording("Rokid Sprite 双轨录制启动失败");
        };
        if(arCameraSuspended)start.run();
        else{arCameraSuspended=true;camera.suspend(start);}
    }
    private void failSceneRecording(String message){
        arFailed=true;arStartPending=false;spriteFallbackPending=false;activeSceneMode="";
        Log.e("RealiaRecording","SCENE_RECORDING_UNAVAILABLE message="+message+" hudArchive="+(hudArchive==null?"disabled":hudArchive.directory()));
        resumeCameraAfterArRecording();
        hud.setStatus(GlassHudView.Mode.ERROR,"整段场景录制不可用 · 已保留 HUD 状态截图");
    }
    private void resumeCameraAfterArRecording(){
        if(!arCameraSuspended||destroyed)return;
        arCameraSuspended=false;camera.prepare();
        if(perceptionEnabled)camera.startStream(perceptionFramesPerSecond,captureQuality,new WarmCamera.StreamCallback(){
            @Override public void onFrame(WarmCamera.StreamFrame frame){sendStreamFrame(frame);}
            @Override public void onError(String message){MainActivity.this.onError(0,message);}
        });
    }
    private void scheduleDemoOverlaySequence(boolean requireArRecording){
        int sequence=++demoSequenceGeneration;
        postDemoState(sequence,2_000,requireArRecording,()->hud.setStatus(GlassHudView.Mode.CAPTURING,"热拍摄 · 正在识别眼前场景"));
        postDemoState(sequence,4_000,requireArRecording,()->hud.setStatus(GlassHudView.Mode.SENDING,"场景已发送 · 正在生成人物提示"));
        postDemoState(sequence,6_000,requireArRecording,()->hud.showPerson("lin","林澄","植物研究员 / 老朋友",86,"让阳台重新生长","周末要不要一起去花市看看？我发现了一家很小的香草摊。"));
        postDemoState(sequence,8_500,requireArRecording,hud::nextPersonChoice);
        postDemoState(sequence,11_000,requireArRecording,()->hud.setStatus(requireArRecording?GlassHudView.Mode.SCENE_RECORDING:GlassHudView.Mode.READY,requireArRecording?"Overlay 演示完成 · 第一人称录制继续":"Overlay 状态演示完成"));
    }
    private boolean isSceneRecording(){return sceneRecorder.isRecording()||spriteRecorder.isRecording();}
    private void postDemoState(int sequence,long delay,boolean requireArRecording,Runnable action){hud.postDelayed(()->{if(!destroyed&&sequence==demoSequenceGeneration&&(!requireArRecording||isSceneRecording()))action.run();},delay);}
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
            hud.setPerception(enabled);
            if(!hud.isPersonMode())hud.setStatus(GlassHudView.Mode.READY,enabled?"持续感知中 · "+framesPerSecond+" FPS · 1280 预览 / Q"+Math.min(85,quality):"持续感知已关闭 · 物理按键仍可拍摄");
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
            boolean sent=photoServer.sendStream(requestId,metadata,frame.jpeg);
            Log.i("RealiaE2E","STREAM_RESULT requestId="+requestId+" fps="+frame.framesPerSecond+
                    " encodeMs="+(frame.jpegReadyAtMs-frame.capturedAtMs)+" bytes="+frame.jpeg.length+
                    " transport="+(sent?"wifi_direct_tcp":"not_connected"));
        }catch(JSONException error){onError(requestId,error.getMessage());}
    }
    private void showPerson(String personId,String name,String title,int affinity,String quest,String story,String kind,String contextId,String[] choiceIds,String[] choiceLabels){
        if("dismiss".equals(kind)){runOnUiThread(()->hud.dismissPerson(contextId));return;}
        Log.i("RealiaPerson","SHOW personId="+personId+" affinity="+affinity+" quest="+quest);
        runOnUiThread(()->hud.showPerson(personId,name,title,affinity,quest,story,kind,contextId,choiceIds,choiceLabels));
    }
    private void confirmPersonChoice(){
        PersonChoiceState.Selection choice=hud.selectedPersonChoice();if(choice==null)return;
        long eventId=localRequestId.incrementAndGet();boolean accepted=false;
        try{JSONObject metadata=new JSONObject().put("eventId",eventId).put("personId",choice.personId)
                .put("choiceIndex",choice.index).put("choiceId",choice.choiceId).put("label",choice.label)
                .put("kind",choice.kind).put("contextId",choice.contextId)
                .put("selectedAtElapsedMs",SystemClock.elapsedRealtime()).put("input","rokid_touchpad");
            accepted=photoServer.sendPersonChoice(eventId,metadata);
            Log.i("RealiaPerson","CHOICE eventId="+eventId+" personId="+choice.personId+" choiceId="+choice.choiceId+" accepted="+accepted);
        }catch(JSONException error){Log.e("RealiaPerson","choice metadata failed",error);}
        hud.finishPersonChoice(choice,accepted);
    }
    private static boolean isPrimaryKey(int keyCode){return keyCode==KeyEvent.KEYCODE_DPAD_CENTER||keyCode==KeyEvent.KEYCODE_CAMERA||keyCode==KeyEvent.KEYCODE_HEADSETHOOK||keyCode==KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE||keyCode==KeyEvent.KEYCODE_ENTER;}
    private static boolean isChoiceDirectionKey(int keyCode){return keyCode==KeyEvent.KEYCODE_DPAD_LEFT||keyCode==KeyEvent.KEYCODE_DPAD_RIGHT||keyCode==KeyEvent.KEYCODE_DPAD_UP||keyCode==KeyEvent.KEYCODE_DPAD_DOWN;}
    private void onError(long requestId,String message){Log.e("RealiaE2E","CAPTURE_ERROR requestId="+requestId+" message="+message);runOnUiThread(()->hud.setStatus(GlassHudView.Mode.ERROR,message));}
    @Override public boolean onKeyDown(int keyCode,KeyEvent event){
        if(hud.isPersonMode()&&(isPrimaryKey(keyCode)||isChoiceDirectionKey(keyCode)))return true;
        if(isPrimaryKey(keyCode)){
            if(event.getRepeatCount()==1){try{conversationRecorder.start();recording=true;hud.setStatus(GlassHudView.Mode.RECORDING,"正在记录对话 · 16 kHz PCM");}catch(IllegalStateException error){onError(0,error.getMessage());}return true;}
            if(event.getRepeatCount()==0){event.startTracking();return true;}
            return true;
        }return super.onKeyDown(keyCode,event);
    }
    @Override public boolean onKeyUp(int keyCode,KeyEvent event){
        if(hud.isPersonMode()&&isChoiceDirectionKey(keyCode)){if(keyCode==KeyEvent.KEYCODE_DPAD_LEFT||keyCode==KeyEvent.KEYCODE_DPAD_UP)hud.previousPersonChoice();else hud.nextPersonChoice();return true;}
        if(hud.isPersonMode()&&isPrimaryKey(keyCode)){confirmPersonChoice();return true;}
        if(isPrimaryKey(keyCode)){
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
    @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);handleRecordingIntent(intent);}
    @Override public void onRequestPermissionsResult(int code,String[] permissions,int[] grants){super.onRequestPermissionsResult(code,permissions,grants);if(code==PERMISSION_REQUEST&&checkSelfPermission(Manifest.permission.CAMERA)==PackageManager.PERMISSION_GRANTED)prepareCamera();else onError(0,"camera permission denied");}
    @Override protected void onDestroy(){destroyed=true;++demoSequenceGeneration;if(sceneRecorder!=null)sceneRecorder.close();if(spriteRecorder!=null)spriteRecorder.close();if(hudArchive!=null)hudArchive.close();if(conversationRecorder!=null)conversationRecorder.close();if(camera!=null)camera.close();if(photoServer!=null)photoServer.close();super.onDestroy();}
}
