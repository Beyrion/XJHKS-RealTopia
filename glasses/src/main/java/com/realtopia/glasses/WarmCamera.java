package com.realtopia.glasses;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.graphics.ImageFormat;
import android.graphics.Rect;
import android.graphics.SurfaceTexture;
import android.graphics.YuvImage;
import android.hardware.Camera;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.SystemClock;
import android.util.Log;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

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
    interface StreamCallback {
        void onFrame(StreamFrame frame);
        void onError(String message);
    }
    static final class StreamFrame {
        final long capturedAtMs, jpegReadyAtMs;
        final int width, height, rotationDegrees, framesPerSecond;
        final byte[] jpeg;
        StreamFrame(long capturedAtMs,long jpegReadyAtMs,int width,int height,
                    int rotationDegrees,int framesPerSecond,byte[] jpeg) {
            this.capturedAtMs=capturedAtMs;this.jpegReadyAtMs=jpegReadyAtMs;
            this.width=width;this.height=height;this.rotationDegrees=rotationDegrees;
            this.framesPerSecond=framesPerSecond;this.jpeg=jpeg;
        }
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
    private final ExecutorService streamEncoder=Executors.newSingleThreadExecutor();
    private final AtomicBoolean streamEncoding=new AtomicBoolean(false);
    private Camera camera;
    private SurfaceTexture previewTexture;
    private long cameraOpenedAtMs, previewReadyAtMs, generation;
    private long activeRequestId = -1;
    private int pictureWidth=4032, pictureHeight=3024, previewWidth=1280,
            previewHeight=720, previewFormat=ImageFormat.NV21, rotationDegrees;
    private boolean opening, captureInFlight, closed;
    private boolean streamEnabled;
    private int streamFramesPerSecond=2, streamJpegQuality=75;
    private long nextStreamFrameAtMs;
    private StreamCallback streamCallback;

    WarmCamera(Context context) { this.context=context; thread.start(); handler=new Handler(thread.getLooper()); }
    void prepare() { handler.post(() -> ensureCamera(null)); }
    void startStream(int framesPerSecond,int jpegQuality,StreamCallback callback) {
        handler.post(()->{
            if(closed){callback.onError("camera closed");return;}
            streamFramesPerSecond=Math.max(2,Math.min(5,framesPerSecond));
            streamJpegQuality=Math.max(50,Math.min(85,jpegQuality));
            streamCallback=callback;streamEnabled=true;nextStreamFrameAtMs=0;
            if(camera==null)ensureCamera(null);else configureStreamCallback();
            Log.i(TAG,"STREAM_START fps="+streamFramesPerSecond+" quality="+streamJpegQuality);
        });
    }
    void stopStream(){handler.post(()->{
        streamEnabled=false;streamCallback=null;nextStreamFrameAtMs=0;
        if(camera!=null)camera.setPreviewCallbackWithBuffer(null);
        Log.i(TAG,"STREAM_STOP");
    });}
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
            Camera.Size preview=choosePreview(p.getSupportedPreviewSizes(),1280);
            previewWidth=preview.width;previewHeight=preview.height;p.setPreviewSize(preview.width,preview.height);
            if(p.getSupportedPreviewFormats()!=null&&p.getSupportedPreviewFormats().contains(ImageFormat.NV21))p.setPreviewFormat(ImageFormat.NV21);
            previewFormat=p.getPreviewFormat();
            setIfSupported(p,p.getSupportedWhiteBalance(),Camera.Parameters.WHITE_BALANCE_AUTO,0);
            setIfSupported(p,p.getSupportedAntibanding(),Camera.Parameters.ANTIBANDING_AUTO,1);
            List<String> focus=p.getSupportedFocusModes();
            if(focus!=null&&focus.contains(Camera.Parameters.FOCUS_MODE_CONTINUOUS_PICTURE))p.setFocusMode(Camera.Parameters.FOCUS_MODE_CONTINUOUS_PICTURE);
            if(p.getMinExposureCompensation()<=0&&p.getMaxExposureCompensation()>=0)p.setExposureCompensation(0);
            opened.setParameters(p); previewTexture=new SurfaceTexture(10); previewTexture.setDefaultBufferSize(preview.width,preview.height);
            opened.setPreviewTexture(previewTexture); opened.startPreview(); previewReadyAtMs=SystemClock.elapsedRealtime(); opening=false;
            Log.i(TAG,"PREVIEW_READY openMs="+(previewReadyAtMs-cameraOpenedAtMs)+" picture="+pictureWidth+"x"+pictureHeight);
            if(streamEnabled)configureStreamCallback();
            if(pending!=null)scheduleCapture(pending);
        } catch(RuntimeException|IOException e) { opening=false; releaseCamera(); fail(pending,"camera open failed: "+e.getMessage()); }
    }

    private void setIfSupported(Camera.Parameters p,List<String> supported,String value,int kind){if(supported!=null&&supported.contains(value)){if(kind==0)p.setWhiteBalance(value);else p.setAntibanding(value);}}
    private void configureStreamCallback(){
        Camera active=camera;if(active==null||!streamEnabled)return;
        final long currentGeneration=generation;
        active.setPreviewCallbackWithBuffer((data,source)->{
            if(data==null||closed||!streamEnabled||currentGeneration!=generation){returnBuffer(source,data);return;}
            long now=SystemClock.elapsedRealtime();
            if(now<nextStreamFrameAtMs||!streamEncoding.compareAndSet(false,true)){returnBuffer(source,data);return;}
            int fps=streamFramesPerSecond,quality=streamJpegQuality,width=previewWidth,height=previewHeight,format=previewFormat,rotation=rotationDegrees;
            long intervalMs=Math.max(1,1_000/fps);
            if(nextStreamFrameAtMs<=0||now-nextStreamFrameAtMs>intervalMs)nextStreamFrameAtMs=now+intervalMs;
            else nextStreamFrameAtMs+=intervalMs;
            streamEncoder.execute(()->encodeStreamFrame(source,data,currentGeneration,now,width,height,format,rotation,fps,quality));
        });
        int bits=ImageFormat.getBitsPerPixel(previewFormat);
        if(bits<=0)bits=12;
        int bufferSize=Math.max(1,previewWidth*previewHeight*bits/8);
        for(int index=0;index<3;index++)active.addCallbackBuffer(new byte[bufferSize]);
    }
    private void encodeStreamFrame(Camera source,byte[] data,long currentGeneration,long capturedAt,
                                   int width,int height,int format,int rotation,int fps,int quality){
        try{
            ByteArrayOutputStream output=new ByteArrayOutputStream(Math.max(64*1024,width*height/4));
            boolean compressed=new YuvImage(data,format,width,height,null)
                    .compressToJpeg(new Rect(0,0,width,height),quality,output);
            if(!compressed)throw new IOException("preview JPEG compression failed");
            byte[] jpeg=output.toByteArray();long ready=SystemClock.elapsedRealtime();
            StreamCallback callback=streamCallback;
            if(callback!=null&&streamEnabled&&currentGeneration==generation){
                callback.onFrame(new StreamFrame(capturedAt,ready,width,height,rotation,fps,jpeg));
                Log.i(TAG,"STREAM_FRAME fps="+fps+" encodeMs="+(ready-capturedAt)+" bytes="+jpeg.length);
            }
        }catch(RuntimeException|IOException error){
            StreamCallback callback=streamCallback;if(callback!=null)callback.onError("stream encode failed: "+error.getMessage());
        }finally{
            handler.post(()->{returnBuffer(source,data);streamEncoding.set(false);});
        }
    }
    private void returnBuffer(Camera source,byte[] data){
        if(data==null||source==null||closed||source!=camera)return;
        try{source.addCallbackBuffer(data);}catch(RuntimeException ignored){}
    }
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
                try{source.startPreview();previewReadyAtMs=SystemClock.elapsedRealtime()-COLD_WARMUP_MS+HOT_WARMUP_MS;if(streamEnabled)configureStreamCallback();}catch(RuntimeException e){releaseCamera();}
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
    private void releaseCamera(){generation++;streamEncoding.set(false);if(camera!=null){camera.setPreviewCallbackWithBuffer(null);try{camera.stopPreview();}catch(RuntimeException ignored){}camera.release();camera=null;}if(previewTexture!=null){previewTexture.release();previewTexture=null;}}
    @Override public void close(){handler.post(()->{closed=true;streamEnabled=false;streamCallback=null;captureInFlight=false;activeRequestId=-1;releaseCamera();streamEncoder.shutdownNow();thread.quitSafely();});}
    private static final class Pending{final long id,requestedAt;final int width,quality;final Callback callback;final boolean cold;Pending(long id,long requestedAt,int width,int quality,Callback callback,boolean cold){this.id=id;this.requestedAt=requestedAt;this.width=width;this.quality=quality;this.callback=callback;this.cold=cold;}}
}
