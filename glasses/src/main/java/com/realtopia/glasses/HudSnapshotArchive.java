package com.realtopia.glasses;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.os.Environment;
import android.os.SystemClock;
import android.util.Log;
import android.view.View;
import org.json.JSONException;
import org.json.JSONObject;
import java.io.BufferedWriter;
import java.io.File;
import java.io.FileOutputStream;
import java.io.FileWriter;
import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

/** Debug fallback that archives every distinct HUD visual state as a PNG plus a JSONL timeline. */
final class HudSnapshotArchive implements AutoCloseable {
    private static final String TAG="RealiaRecording";
    private final File directory,timeline;
    private final long startedAtMs=SystemClock.elapsedRealtime();
    private final AtomicInteger sequence=new AtomicInteger();
    private final ExecutorService writer=Executors.newSingleThreadExecutor();
    private String previousToken="";
    private boolean closed;

    HudSnapshotArchive(Context context){
        File root=context.getExternalFilesDir(Environment.DIRECTORY_PICTURES);
        if(root==null)root=new File(context.getFilesDir(),"pictures");
        String stamp=new SimpleDateFormat("yyyyMMdd-HHmmss",Locale.US).format(new Date());
        directory=new File(root,"hud-timeline/"+stamp+"-"+startedAtMs);
        timeline=new File(directory,"timeline.jsonl");
        if(!directory.mkdirs()&&!directory.isDirectory())Log.e(TAG,"HUD_ARCHIVE_CREATE_FAILED path="+directory);
        Log.i(TAG,"HUD_ARCHIVE_READY path="+directory.getAbsolutePath());
    }

    String directory(){return directory.getAbsolutePath();}

    void capture(GlassHudView view){
        if(closed)return;
        if(view.getWidth()<=0||view.getHeight()<=0){view.postDelayed(()->capture(view),100);return;}
        String token=view.snapshotToken();if(token.equals(previousToken))return;previousToken=token;
        int index=sequence.incrementAndGet();long elapsed=SystemClock.elapsedRealtime()-startedAtMs;
        Bitmap bitmap=Bitmap.createBitmap(view.getWidth(),view.getHeight(),Bitmap.Config.ARGB_8888);
        view.draw(new Canvas(bitmap));
        String filename=String.format(Locale.US,"%04d-%06d-%s.png",index,elapsed,view.snapshotMode().toLowerCase(Locale.US));
        File output=new File(directory,filename);
        writer.execute(()->write(bitmap,output,index,elapsed,token));
    }

    private void write(Bitmap bitmap,File output,int index,long elapsed,String token){
        try(FileOutputStream stream=new FileOutputStream(output)){
            if(!bitmap.compress(Bitmap.CompressFormat.PNG,100,stream))throw new IOException("PNG encoder returned false");
            JSONObject row=new JSONObject().put("index",index).put("elapsedMs",elapsed).put("file",output.getName()).put("state",token);
            try(BufferedWriter log=new BufferedWriter(new FileWriter(timeline,true))){log.write(row.toString());log.newLine();}
            Log.i(TAG,"HUD_SNAPSHOT index="+index+" elapsedMs="+elapsed+" path="+output.getAbsolutePath());
        }catch(IOException|JSONException error){Log.e(TAG,"HUD_SNAPSHOT_ERROR path="+output,error);}
        finally{bitmap.recycle();}
    }

    @Override public void close(){closed=true;writer.shutdown();Log.i(TAG,"HUD_ARCHIVE_FINISHED path="+directory.getAbsolutePath()+" count="+sequence.get());}
}
