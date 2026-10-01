package com.realtopia.glasses;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.graphics.ImageFormat;
import android.graphics.SurfaceTexture;
import android.hardware.Camera;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.SystemClock;
import android.util.Log;
import java.io.IOException;
import java.util.Comparator;
import java.util.List;

/** Rokid legacy HAL still capture with a warmed, reusable preview session. */
@SuppressWarnings("deprecation")
final class WarmCamera implements AutoCloseable {
    private static final String TAG = "RealiaCamera";
    private static final long COLD_WARMUP_MS = 1_200;
    private static final long HOT_WARMUP_MS = 250;
    private static final long CAPTURE_TIMEOUT_MS = 3_000;

    interface Callback {
        void onPhoto(Photo photo);
        void onError(long requestId, String message);
    }
    static final class Photo {
        final long requestId, requestedAtMs, cameraOpenedAtMs, previewReadyAtMs,
                captureStartedAtMs, jpegReadyAtMs;
        final int width, height, rotationDegrees;
        final boolean cold;
        final byte[] jpeg;
        Photo(long requestId, long requestedAtMs, long cameraOpenedAtMs,
              long previewReadyAtMs, long captureStartedAtMs, long jpegReadyAtMs,
              int width, int height,
              int rotationDegrees, boolean cold, byte[] jpeg) {
            this.requestId=requestId; this.requestedAtMs=requestedAtMs;
            this.cameraOpenedAtMs=cameraOpenedAtMs; this.previewReadyAtMs=previewReadyAtMs;
            this.captureStartedAtMs=captureStartedAtMs;
            this.jpegReadyAtMs=jpegReadyAtMs; this.width=width; this.height=height;
            this.rotationDegrees=rotationDegrees; this.cold=cold; this.jpeg=jpeg;
        }
    }

    private final Context context;
    private final HandlerThread thread = new HandlerThread("realia-camera");
    private final Handler handler;
    private Camera camera;
    private SurfaceTexture previewTexture;
    private long cameraOpenedAtMs, previewReadyAtMs, generation;
    private long activeRequestId = -1;
    private int pictureWidth=4032, pictureHeight=3024, rotationDegrees;
    private boolean opening, captureInFlight, closed;

    WarmCamera(Context context) { this.context=context; thread.start(); handler=new Handler(thread.getLooper()); }
    void prepare() { handler.post(() -> ensureCamera(null)); }
    void capture(long requestId, int requestedWidth, int jpegQuality, boolean forceCold, Callback callback) {
        final long requestedAt = SystemClock.elapsedRealtime();
        handler.post(() -> {
            if (closed) { callback.onError(requestId,"camera closed"); return; }
            if (captureInFlight) { callback.onError(requestId,"capture busy"); return; }
            if (forceCold && camera != null) releaseCamera();
            captureInFlight=true;
            activeRequestId=requestId;
            Pending pending=new Pending(requestId,requestedAt,Math.max(1280,Math.min(4032,requestedWidth)),Math.max(50,Math.min(100,jpegQuality)),callback,camera==null);
            // ensureCamera schedules the first capture after opening. Scheduling
            // again here races two takePicture calls on Rokid's legacy HAL.
            if (camera == null) ensureCamera(pending);
            else scheduleCapture(pending);
        });
    }

    private void ensureCamera(Pending pending) {
        if (camera!=null || opening || closed) return;
        if (context.checkSelfPermission(Manifest.permission.CAMERA)!=PackageManager.PERMISSION_GRANTED) {
            fail(pending,"camera permission missing"); return;
        }
        opening=true; cameraOpenedAtMs=SystemClock.elapsedRealtime();
        try {
            Camera.CameraInfo info=new Camera.CameraInfo(); Camera.getCameraInfo(0,info); rotationDegrees=info.orientation;
            Camera opened=Camera.open(0); camera=opened;
            Camera.Parameters p=opened.getParameters();
            Camera.Size picture=choosePicture(p.getSupportedPictureSizes(),pending==null?4032:pending.width);
            pictureWidth=picture.width; pictureHeight=picture.height; p.setPictureSize(picture.width,picture.height);
            p.setPictureFormat(ImageFormat.JPEG); p.setJpegQuality(pending==null?90:pending.quality);
            if(p.getSupportedJpegThumbnailSizes()!=null)p.setJpegThumbnailSize(0,0);
            Camera.Size preview=choosePreview(p.getSupportedPreviewSizes(),1280); p.setPreviewSize(preview.width,preview.height);
            setIfSupported(p,p.getSupportedWhiteBalance(),Camera.Parameters.WHITE_BALANCE_AUTO,0);
            setIfSupported(p,p.getSupportedAntibanding(),Camera.Parameters.ANTIBANDING_AUTO,1);
            List<String> focus=p.getSupportedFocusModes();
            if(focus!=null&&focus.contains(Camera.Parameters.FOCUS_MODE_CONTINUOUS_PICTURE))p.setFocusMode(Camera.Parameters.FOCUS_MODE_CONTINUOUS_PICTURE);
            if(p.getMinExposureCompensation()<=0&&p.getMaxExposureCompensation()>=0)p.setExposureCompensation(0);
            opened.setParameters(p); previewTexture=new SurfaceTexture(10); previewTexture.setDefaultBufferSize(preview.width,preview.height);
            opened.setPreviewTexture(previewTexture); opened.startPreview(); previewReadyAtMs=SystemClock.elapsedRealtime(); opening=false;
            Log.i(TAG,"PREVIEW_READY openMs="+(previewReadyAtMs-cameraOpenedAtMs)+" picture="+pictureWidth+"x"+pictureHeight);
            if(pending!=null)scheduleCapture(pending);
        } catch(RuntimeException|IOException e) { opening=false; releaseCamera(); fail(pending,"camera open failed: "+e.getMessage()); }
    }

    private void setIfSupported(Camera.Parameters p,List<String> supported,String value,int kind){if(supported!=null&&supported.contains(value)){if(kind==0)p.setWhiteBalance(value);else p.setAntibanding(value);}}
    private void scheduleCapture(Pending pending) {
        if (!captureInFlight || closed) return;
        if (camera==null) { if(!opening)ensureCamera(pending); handler.postDelayed(()->scheduleCapture(pending),30); return; }
        long warmup=(pending.cold?COLD_WARMUP_MS:HOT_WARMUP_MS)-(SystemClock.elapsedRealtime()-previewReadyAtMs);
        if(warmup>0){handler.postDelayed(()->scheduleCapture(pending),warmup);return;}
        takePicture(pending);
    }

    private void takePicture(Pending pending) {
        Camera active=camera; long currentGeneration=generation;
        long previewForCapture=previewReadyAtMs, started=SystemClock.elapsedRealtime();
        try {
            active.takePicture(null,null,(jpeg,source)->handler.post(()->{
                if(closed||currentGeneration!=generation||!captureInFlight
                        || activeRequestId!=pending.id)return;
                if(jpeg==null||jpeg.length==0){fail(pending,"empty JPEG");return;}
                try{source.startPreview();previewReadyAtMs=SystemClock.elapsedRealtime()-COLD_WARMUP_MS+HOT_WARMUP_MS;}catch(RuntimeException e){releaseCamera();}
                long ready=SystemClock.elapsedRealtime();captureInFlight=false;activeRequestId=-1;
                Log.i(TAG,"JPEG_READY requestId="+pending.id+" cold="+pending.cold+" captureMs="+(ready-started)+" bytes="+jpeg.length);
                pending.callback.onPhoto(new Photo(pending.id,pending.requestedAt,
                        cameraOpenedAtMs,previewForCapture,started,ready,pictureWidth,
                        pictureHeight,rotationDegrees,pending.cold,jpeg));
            }));
            handler.postDelayed(()->{if(captureInFlight&&generation==currentGeneration
                    &&activeRequestId==pending.id)fail(pending,"capture timeout");},CAPTURE_TIMEOUT_MS);
        } catch(RuntimeException e){fail(pending,"capture failed: "+e.getMessage());}
    }

    private void fail(Pending pending,String message){captureInFlight=false;activeRequestId=-1;if(pending!=null)pending.callback.onError(pending.id,message);Log.e(TAG,message);}
    private static Camera.Size choosePicture(List<Camera.Size> sizes,int requested){return sizes.stream().filter(s->s.width<=requested).max(Comparator.comparingInt(s->s.width*s.height)).orElseGet(()->sizes.get(0));}
    private static Camera.Size choosePreview(List<Camera.Size> sizes,int requested){return sizes.stream().min(Comparator.comparingInt(s->Math.abs(s.width-requested))).orElseGet(()->sizes.get(0));}
    private void releaseCamera(){generation++;if(camera!=null){try{camera.stopPreview();}catch(RuntimeException ignored){}camera.release();camera=null;}if(previewTexture!=null){previewTexture.release();previewTexture=null;}}
    @Override public void close(){handler.post(()->{closed=true;captureInFlight=false;activeRequestId=-1;releaseCamera();thread.quitSafely();});}
    private static final class Pending{final long id,requestedAt;final int width,quality;final Callback callback;final boolean cold;Pending(long id,long requestedAt,int width,int quality,Callback callback,boolean cold){this.id=id;this.requestedAt=requestedAt;this.width=width;this.quality=quality;this.callback=callback;this.cold=cold;}}
}
