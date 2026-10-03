package com.realtopia.glasses;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ApplicationInfo;
import android.os.Bundle;
import android.os.SystemClock;
import android.util.Log;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.WindowManager;
import org.json.JSONException;
import org.json.JSONObject;

public final class MainActivity extends Activity implements RealiaApplication.RuntimeListener {
    private static final int PERMISSION_REQUEST=41;
    private WarmCamera camera;
    private ActiveCaptureLoop activeCapture;
    private volatile long captureGeneration;
    private PhotoSocketServer photoServer;
    private RealiaApplication runtime;
    private GlassHudView hud;
    private Boolean pendingSensingEnabled;
    private int sensingControlGeneration;
    private boolean perceptionEnabled;
    private int captureWidth=4032;
    private int captureQuality=90;
    private boolean destroyed;
    private float choiceTouchX,choiceTouchY;
    private boolean choiceTouchStarted;
    private long lastChoiceConfirmationMs=-1000;
    private final ChoiceNavigationFilter choiceNavigation=new ChoiceNavigationFilter();

    @Override protected void onCreate(Bundle state){
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        hud=new GlassHudView(this);setContentView(hud);
        runtime=(RealiaApplication)getApplication();
        photoServer=runtime.photoServer();
        startForegroundService(new Intent(this,GlassLinkService.class));
        camera=new WarmCamera(this);
        activeCapture=new ActiveCaptureLoop(new ActiveCaptureLoop.Scheduler(){
            public void postDelayed(Runnable task,long delay){hud.postDelayed(task,delay);}
            public void remove(Runnable task){hud.removeCallbacks(task);}
        },new ActiveCaptureLoop.Target(){
            public boolean isReady(){return !destroyed&&photoServer.isConnected()
                    &&checkSelfPermission(Manifest.permission.CAMERA)==PackageManager.PERMISSION_GRANTED;}
            public void capture(Runnable finished){MainActivity.this.capture(runtime.nextRequestId(),captureWidth,captureQuality,false,true,finished);}
        });
        runtime.attach(this);
        if(checkSelfPermission(Manifest.permission.CAMERA)==PackageManager.PERMISSION_GRANTED)prepareCamera();
        else requestPermissions(new String[]{Manifest.permission.CAMERA,Manifest.permission.BLUETOOTH_CONNECT},PERMISSION_REQUEST);
    }
    private boolean isDebuggable(){return (getApplicationInfo().flags&ApplicationInfo.FLAG_DEBUGGABLE)!=0;}
    private void prepareCamera(){hud.setStatus(GlassHudView.Mode.READY,"按一下开启感知 · 拍照与语音同步");}

    @Override public void onCapture(long requestId,int width,int quality,boolean forceCold){capture(requestId,width,quality,forceCold);}
    private void capture(long requestId,int width,int quality,boolean forceCold){
        capture(requestId,width,quality,forceCold,false,()->{});
    }
    private void capture(long requestId,int width,int quality,boolean forceCold,boolean automatic,Runnable finished){
        final long generation=captureGeneration;
        Log.i("RealiaE2E","CAPTURE_REQUEST requestId="+requestId+" automatic="+automatic+" requestedElapsedMs="+SystemClock.elapsedRealtime());
        runOnUiThread(()->{if(!hud.isPersonMode())hud.setStatus(GlassHudView.Mode.CAPTURING,(forceCold?"冷启动":"热拍摄")+" · request #"+requestId);});
        camera.capture(requestId,width,quality,forceCold,new WarmCamera.Callback(){
            @Override public void onPhoto(WarmCamera.Photo photo){
                try{
                    if(destroyed||(automatic&&generation!=captureGeneration))return;
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
                            .put("stream",false).put("automatic",automatic).put("intervalMs",automatic?ActiveCaptureLoop.INTERVAL_MS:0).put("bytes",photo.jpeg.length);
                    boolean sent=photoServer.send(photo.requestId,metadata,photo.jpeg);
                    long localE2e=SystemClock.elapsedRealtime()-photo.requestedAtMs;
                    Log.i("RealiaE2E","CAPTURE_RESULT requestId="+photo.requestId+" automatic="+automatic+" cold="+photo.cold+" localE2eMs="+localE2e+" transport="+(sent?"wifi_direct_tcp":"not_connected"));
                    runOnUiThread(()->{if(!hud.isPersonMode())hud.setStatus(sent?GlassHudView.Mode.SENDING:GlassHudView.Mode.READY,"#"+photo.requestId+" · "+photo.jpeg.length+" bytes · "+localE2e+" ms");});
                }catch(JSONException e){onError(photo.requestId,e.getMessage());}finally{finished.run();}
            }
            @Override public void onError(long id,String message){finished.run();if(!automatic||generation==captureGeneration)MainActivity.this.onError(id,message);}
        });
    }
    @Override public void onPerception(boolean enabled,int framesPerSecond,int width,int quality){setPerception(enabled,framesPerSecond,width,quality);}
    private void setPerception(boolean enabled,int framesPerSecond,int width,int quality){
        runOnUiThread(()->{
            boolean changed=perceptionEnabled!=enabled;
            if(changed)captureGeneration++;
            perceptionEnabled=enabled;captureWidth=width;captureQuality=quality;
            hud.setPerception(enabled);
            if(changed&&!enabled)runtime.clearPerson(null);
            if(!hud.isPersonMode())hud.setStatus(GlassHudView.Mode.READY,enabled?"主动感知 · 每10秒拍照 + 手机语音":"感知已关闭 · 按一下开启");
            camera.stopStream();
            activeCapture.setEnabled(enabled);
            // The first tick is immediate. Open with the requested parameters.
            // Preparing a default 4032px camera here and reconfiguring it just
            // before takePicture stalls this device's legacy HAL.
            if(changed&&!enabled)camera.suspend(()->{});
            Log.i("RealiaE2E","ACTIVE_CAPTURE enabled="+enabled+" intervalMs="+ActiveCaptureLoop.INTERVAL_MS+" changed="+changed+" elapsedMs="+SystemClock.elapsedRealtime());
        });
    }
    private void sendStreamFrame(WarmCamera.StreamFrame frame){
        long requestId=runtime.nextRequestId();
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
    @Override public void onPerson(String personId,String name,String title,int affinity,String quest,String story,String kind,String contextId,String[] choiceIds,String[] choiceLabels){showPerson(personId,name,title,affinity,quest,story,kind,contextId,choiceIds,choiceLabels);}
    @Override public void onHudSnapshot(String action,String configJson){runOnUiThread(()->{
        if("sync".equals(action)){
            DialogueHudData captions=DialogueHudData.fromJson(configJson);hud.setDialogueData(captions);
            PeopleHudData visualPeople=PeopleHudData.fromJson(configJson);hud.setPeopleData(visualPeople);
            SocialHintData hint=SocialHintData.fromJson(configJson);hud.setSocialHint(hint);
            TaskSummaryData summary=TaskSummaryData.fromJson(configJson);hud.setTaskSummary(summary);
            Log.i("RealiaTaskSummary","HUD_SYNC active="+summary.active+" session="+summary.sessionId+" phase="+summary.phase+" tasks="+summary.taskCount+" pending="+summary.pendingCount);
            Log.i("RealiaSocialHint","HUD_SYNC active="+hint.active+" request="+hint.requestId+" memoryOnly=true");
            Log.i("RealiaPeople","HUD_SYNC active="+visualPeople.active+" request="+visualPeople.requestId
                    +" known="+visualPeople.names.size()+" unmatched="+visualPeople.unmatchedCount);
            Log.i("RealiaDialogue","HUD_SYNC active="+captions.active+" session="+captions.sessionId+
                    " left="+captions.left.lines.size()+" right="+captions.right.lines.size());
        }
        hud.setHudSnapshot(HudSnapshotData.fromJson(configJson));
    });}
    private void showPerson(String personId,String name,String title,int affinity,String quest,String story,String kind,String contextId,String[] choiceIds,String[] choiceLabels){
        if("dismiss".equals(kind)){runtime.clearPerson(contextId);runOnUiThread(()->hud.dismissPerson(contextId,story));return;}
        Log.i("RealiaPerson","SHOW personId="+personId+" affinity="+affinity+" quest="+quest);
        runOnUiThread(()->hud.showPerson(personId,name,title,affinity,quest,story,kind,contextId,choiceIds,choiceLabels));
    }
    private void confirmPersonChoice(){
        PersonChoiceState.Selection choice=hud.selectedPersonChoice();if(choice==null)return;
        long now=SystemClock.elapsedRealtime();if(now-lastChoiceConfirmationMs<400)return;
        lastChoiceConfirmationMs=now;
        long eventId=runtime.nextRequestId();boolean accepted=false;
        try{JSONObject metadata=new JSONObject().put("eventId",eventId).put("personId",choice.personId)
                .put("choiceIndex",choice.index).put("choiceId",choice.choiceId).put("label",choice.label)
                .put("kind",choice.kind).put("contextId",choice.contextId)
                .put("selectedAtElapsedMs",SystemClock.elapsedRealtime()).put("input","rokid_touchpad");
            accepted=photoServer.sendPersonChoice(eventId,metadata);
            Log.i("RealiaPerson","CHOICE eventId="+eventId+" personId="+choice.personId+" choiceId="+choice.choiceId+" accepted="+accepted);
        }catch(JSONException error){Log.e("RealiaPerson","choice metadata failed",error);}
        hud.finishPersonChoice(choice,accepted);
        runtime.clearPerson(choice.contextId);
    }
    private static boolean isPrimaryKey(int keyCode){return keyCode==KeyEvent.KEYCODE_DPAD_CENTER||keyCode==KeyEvent.KEYCODE_CAMERA||keyCode==KeyEvent.KEYCODE_HEADSETHOOK||keyCode==KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE||keyCode==KeyEvent.KEYCODE_ENTER;}
    private static boolean isChoiceDirectionKey(int keyCode){return keyCode==KeyEvent.KEYCODE_DPAD_LEFT||keyCode==KeyEvent.KEYCODE_DPAD_RIGHT||keyCode==KeyEvent.KEYCODE_DPAD_UP||keyCode==KeyEvent.KEYCODE_DPAD_DOWN;}
    private void onError(long requestId,String message){Log.e("RealiaE2E","CAPTURE_ERROR requestId="+requestId+" message="+message);runOnUiThread(()->{if(!hud.isPersonMode())hud.setStatus(GlassHudView.Mode.ERROR,message);});}
    private void toggleSensing(){
        boolean enabled=!(pendingSensingEnabled!=null?pendingSensingEnabled:perceptionEnabled);
        pendingSensingEnabled=enabled;
        int generation=++sensingControlGeneration;
        setPerception(enabled,2,captureWidth,captureQuality);
        sendSensingControl(enabled,runtime.nextRequestId(),generation);
    }
    private void sendSensingControl(boolean enabled,long eventId,int generation){
        if(destroyed||generation!=sensingControlGeneration)return;
        try{
            JSONObject metadata=new JSONObject().put("eventId",eventId)
                    .put("personId","__sensing__").put("choiceIndex",enabled?0:1)
                    .put("choiceId",enabled?"sensing_start":"sensing_stop")
                    .put("label",enabled?"开始感知":"关闭感知")
                    .put("kind","sensing_control").put("contextId",Long.toString(eventId))
                    .put("selectedAtElapsedMs",SystemClock.elapsedRealtime()).put("input","rokid_button");
            boolean sent=photoServer.sendPersonChoice(eventId,metadata);
            Log.i("RealiaAudio","SENSING_CONTROL enabled="+enabled+" sent="+sent);
            if(sent)pendingSensingEnabled=null;
            else{
                hud.setStatus(GlassHudView.Mode.READY,"感知设置等待手机连接 · "+(enabled?"开启":"关闭"));
                hud.postDelayed(()->sendSensingControl(enabled,eventId,generation),500);
            }
        }catch(JSONException error){onError(eventId,error.getMessage());}
    }
    @Override public boolean dispatchTouchEvent(MotionEvent event){
        if(hud.isPersonMode()){
            if(event.getActionMasked()==MotionEvent.ACTION_DOWN){choiceTouchX=event.getX();choiceTouchY=event.getY();choiceTouchStarted=true;}
            else if(event.getActionMasked()==MotionEvent.ACTION_UP&&choiceTouchStarted){
                choiceTouchStarted=false;
                float dx=event.getX()-choiceTouchX,dy=event.getY()-choiceTouchY;
                ChoiceInput.Action action=ChoiceInput.touchAction(dx,dy);
                if(action==ChoiceInput.Action.CONFIRM)confirmPersonChoice();
                else navigateChoice(action,"touch",false);
            }else if(event.getActionMasked()==MotionEvent.ACTION_CANCEL||event.getActionMasked()==MotionEvent.ACTION_POINTER_DOWN)choiceTouchStarted=false;
            return true;
        }
        choiceTouchStarted=false;
        return super.dispatchTouchEvent(event);
    }
    private void navigateChoice(ChoiceInput.Action action,String source,boolean repeated){
        if(action!=ChoiceInput.Action.NEXT&&action!=ChoiceInput.Action.PREVIOUS)return;
        boolean accepted=choiceNavigation.accept(SystemClock.elapsedRealtime(),repeated);
        Log.i("RealiaPerson","NAVIGATION action="+action+" source="+source+" accepted="+accepted);
        if(!accepted)return;
        if(action==ChoiceInput.Action.NEXT)hud.nextPersonChoice();else hud.previousPersonChoice();
    }
    @Override public boolean onKeyDown(int keyCode,KeyEvent event){
        if(isDebuggable())Log.i("RealiaPerson","INPUT_RAW key="+keyCode+" name="+KeyEvent.keyCodeToString(keyCode));
        keyCode=ChoiceInput.normalize(keyCode,KeyEvent.keyCodeToString(keyCode));
        if(ChoiceInput.resolve(keyCode,hud.isPersonMode())!=ChoiceInput.Action.NONE)return true;
        return super.onKeyDown(event.getKeyCode(),event);
    }
    @Override public boolean onKeyUp(int keyCode,KeyEvent event){
        keyCode=ChoiceInput.normalize(keyCode,KeyEvent.keyCodeToString(keyCode));
        if(ChoiceInput.suppressRepeatedTap(keyCode,SystemClock.elapsedRealtime()-lastChoiceConfirmationMs))return true;
        ChoiceInput.Action action=ChoiceInput.resolve(keyCode,hud.isPersonMode());
        if(action!=ChoiceInput.Action.NONE)Log.i("RealiaPerson","INPUT key="+event.getKeyCode()+" action="+action);
        if(event.isCanceled()&&action!=ChoiceInput.Action.NONE)return true;
        switch(action){
            case CONFIRM:confirmPersonChoice();return true;
            case PREVIOUS:case NEXT:navigateChoice(action,"key-"+keyCode,event.getRepeatCount()>0);return true;
            case TOGGLE_SENSING:toggleSensing();return true;
            default:break;
        }
        return super.onKeyUp(event.getKeyCode(),event);
    }
    @Override public void onRequestPermissionsResult(int code,String[] permissions,int[] grants){super.onRequestPermissionsResult(code,permissions,grants);if(code==PERMISSION_REQUEST&&checkSelfPermission(Manifest.permission.CAMERA)==PackageManager.PERMISSION_GRANTED)prepareCamera();else onError(0,"camera permission denied");}
    @Override protected void onDestroy(){destroyed=true;captureGeneration++;if(activeCapture!=null)activeCapture.close();if(runtime!=null)runtime.detach(this);if(camera!=null)camera.close();super.onDestroy();}
}
