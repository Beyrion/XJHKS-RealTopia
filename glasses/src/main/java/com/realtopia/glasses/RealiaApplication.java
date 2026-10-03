package com.realtopia.glasses;

import android.app.Application;
import android.content.SharedPreferences;
import android.os.SystemClock;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Process-scoped glasses runtime. Transport and CXR subscriptions outlive the
 * HUD Activity, while camera commands are replayed to the current Activity.
 */
public final class RealiaApplication extends Application {
    interface RuntimeListener {
        void onCapture(long requestId,int width,int jpegQuality,boolean forceCold);
        void onPerception(boolean enabled,int framesPerSecond,int width,int jpegQuality);
        void onPerson(String personId,String name,String title,int affinity,String quest,String story,
                      String kind,String contextId,String[] choiceIds,String[] choiceLabels);
        void onHudSnapshot(String action,String configJson);
    }

    private static final long PERSON_REPLAY_WINDOW_MS=45_000;
    private final Object lock=new Object();
    private final AtomicLong requestIds=new AtomicLong(10_000);
    private PhotoSocketServer photoServer;
    private RokidCommandBridge commandBridge;
    private RuntimeListener listener;
    private PendingCapture pendingCapture;
    private PersonState personState;
    private String pendingHudSnapshotAction;
    private String hudSnapshotConfigJson="";
    private boolean perceptionEnabled;
    private int perceptionFramesPerSecond=2,perceptionWidth=1280,perceptionQuality=75;

    @Override public void onCreate(){
        super.onCreate();
        SharedPreferences settings=getSharedPreferences("realtopia-runtime",MODE_PRIVATE);
        // A process restart must never silently resume automatic photography.
        perceptionEnabled=false;
        perceptionFramesPerSecond=settings.getInt("perceptionFps",2);
        perceptionWidth=settings.getInt("perceptionWidth",1280);
        perceptionQuality=settings.getInt("perceptionQuality",75);
        hudSnapshotConfigJson=PeopleHudData.withoutIdentities(settings.getString("hudSnapshotHudConfig",""));
        photoServer=new PhotoSocketServer();photoServer.start();
        commandBridge=new RokidCommandBridge(this::captureCommand,this::perceptionCommand,this::personCommand,this::hudSnapshotCommand,this::pauseActiveCapture);
        commandBridge.start();
    }

    PhotoSocketServer photoServer(){return photoServer;}
    long nextRequestId(){return requestIds.incrementAndGet();}

    void attach(RuntimeListener next){
        PendingCapture capture;
        PersonState person;
        boolean enabled;int fps,width,quality;String hudSnapshotAction,hudSnapshotConfig;
        synchronized(lock){
            listener=next;capture=pendingCapture;pendingCapture=null;
            person=personState;
            enabled=perceptionEnabled;fps=perceptionFramesPerSecond;
            width=perceptionWidth;quality=perceptionQuality;
            hudSnapshotAction=pendingHudSnapshotAction;pendingHudSnapshotAction=null;
            hudSnapshotConfig=hudSnapshotConfigJson;
        }
        next.onPerception(enabled,fps,width,quality);
        if(capture!=null)next.onCapture(capture.requestId,capture.width,capture.quality,capture.cold);
        if(person!=null&&SystemClock.elapsedRealtime()-person.receivedAtMs<=PERSON_REPLAY_WINDOW_MS)
            person.deliver(next);
        // Visual identities require a fresh phone result after Activity recreation.
        if(hudSnapshotAction!=null)next.onHudSnapshot(hudSnapshotAction,PeopleHudData.withoutIdentities(hudSnapshotConfig));
        else if(!hudSnapshotConfig.isEmpty())next.onHudSnapshot("sync",PeopleHudData.withoutIdentities(hudSnapshotConfig));
    }

    void detach(RuntimeListener value){synchronized(lock){if(listener==value)listener=null;}}

    void clearPerson(String contextId){synchronized(lock){
        if(personState!=null&&(contextId==null||contextId.equals(personState.contextId)))personState=null;
    }}

    private void captureCommand(long id,int width,int quality,boolean cold){
        RuntimeListener target;
        synchronized(lock){target=listener;if(target==null)pendingCapture=new PendingCapture(id,width,quality,cold);}
        if(target!=null)target.onCapture(id,width,quality,cold);
    }

    private void perceptionCommand(boolean enabled,int fps,int width,int quality){
        RuntimeListener target;
        synchronized(lock){
            perceptionEnabled=enabled;perceptionFramesPerSecond=fps;
            perceptionWidth=width;perceptionQuality=quality;target=listener;
        }
        getSharedPreferences("realtopia-runtime",MODE_PRIVATE).edit()
                .putInt("perceptionFps",fps)
                .putInt("perceptionWidth",width).putInt("perceptionQuality",quality).apply();
        if(target!=null)target.onPerception(enabled,fps,width,quality);
    }

    private void pauseActiveCapture(){
        synchronized(lock){perceptionCommand(false,perceptionFramesPerSecond,perceptionWidth,perceptionQuality);}
    }

    private void personCommand(String id,String name,String title,int affinity,String quest,String story,
                               String kind,String contextId,String[] choiceIds,String[] choiceLabels){
        RuntimeListener target;PersonState state=new PersonState(id,name,title,affinity,quest,story,
                kind,contextId,choiceIds,choiceLabels,SystemClock.elapsedRealtime());
        synchronized(lock){personState=state;target=listener;}
        if(target!=null)state.deliver(target);
    }

    private void hudSnapshotCommand(String action,String configJson){
        RuntimeListener target;
        String nextConfig=configJson==null?"":configJson;
        synchronized(lock){
            if(!nextConfig.isEmpty())hudSnapshotConfigJson=nextConfig;
            target=listener;if(target==null)pendingHudSnapshotAction=action;
        }
        if(!nextConfig.isEmpty())getSharedPreferences("realtopia-runtime",MODE_PRIVATE).edit()
                .putString("hudSnapshotHudConfig",PeopleHudData.withoutIdentities(nextConfig)).apply();
        if(target!=null)target.onHudSnapshot(action,hudSnapshotConfigJson);
    }

    private static final class PendingCapture{
        final long requestId;final int width,quality;final boolean cold;
        PendingCapture(long requestId,int width,int quality,boolean cold){this.requestId=requestId;this.width=width;this.quality=quality;this.cold=cold;}
    }
    private static final class PersonState{
        final String id,name,title,quest,story,kind,contextId;final int affinity;final String[] ids,labels;final long receivedAtMs;
        PersonState(String id,String name,String title,int affinity,String quest,String story,String kind,String contextId,String[] ids,String[] labels,long receivedAtMs){
            this.id=id;this.name=name;this.title=title;this.affinity=affinity;this.quest=quest;this.story=story;
            this.kind=kind;this.contextId=contextId;this.ids=ids==null?null:ids.clone();this.labels=labels==null?null:labels.clone();this.receivedAtMs=receivedAtMs;
        }
        void deliver(RuntimeListener target){target.onPerson(id,name,title,affinity,quest,story,kind,contextId,ids,labels);}
    }
}
