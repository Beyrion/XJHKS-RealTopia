package com.realtopia.glasses;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.os.IBinder;

/** Keeps the process-scoped CXR and photo socket runtime alive across HUD recreation. */
public final class GlassLinkService extends Service {
    private static final String CHANNEL="realtopia-link";
    private static final int NOTIFICATION_ID=39831;
    private Notification notification;

    @Override public void onCreate(){
        super.onCreate();
        NotificationManager manager=getSystemService(NotificationManager.class);
        if(manager!=null)manager.createNotificationChannel(new NotificationChannel(
                CHANNEL,"RealTopia 眼镜连接",NotificationManager.IMPORTANCE_LOW));
        notification=new Notification.Builder(this,CHANNEL)
                .setSmallIcon(android.R.drawable.stat_sys_upload)
                .setContentTitle("RealTopia 持续感知")
                .setContentText("眼镜连接与当前任务保持运行")
                .setOngoing(true).setCategory(Notification.CATEGORY_SERVICE).build();
        ensureForeground();
        ((RealiaApplication)getApplication()).photoServer().start();
    }

    private void ensureForeground(){if(notification!=null)startForeground(NOTIFICATION_ID,notification);}

    @Override public int onStartCommand(Intent intent,int flags,int startId){
        ensureForeground();
        ((RealiaApplication)getApplication()).photoServer().start();
        return START_STICKY;
    }
    @Override public IBinder onBind(Intent intent){return null;}
}
