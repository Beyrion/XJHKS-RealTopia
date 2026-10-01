package com.realtopia.glasses;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.os.SystemClock;
import android.view.View;

/** Single-wavelength HUD: every illuminated pixel uses the Rokid green emitter hue. */
final class GlassHudView extends View {
    enum Mode { READY, CAPTURING, SENDING, PERSON, RECORDING, ERROR }
    private static final int R=76, G=255, B=151, GREEN=Color.rgb(R,G,B);
    private final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);
    private Mode mode=Mode.READY;
    private String detail="相机预热中", personName="", personSpeech="";
    private int personChoice;
    private String personResponse="";
    private static final String[] PERSON_CHOICES={"打个招呼","聊聊近况","稍后再说"};
    private long modeStarted=SystemClock.elapsedRealtime();
    private boolean perception;

    GlassHudView(Context context){super(context);paint.setTypeface(android.graphics.Typeface.create("sans",android.graphics.Typeface.NORMAL));setBackgroundColor(Color.BLACK);}
    void setStatus(Mode next,String value){mode=next;detail=value==null?"":value;modeStarted=SystemClock.elapsedRealtime();invalidate();}
    void setPerception(boolean value){perception=value;invalidate();}
    void showPerson(String name,String title,int bond,String quest,String speech){personName=name;personSpeech=speech;personChoice=0;personResponse="";setStatus(Mode.PERSON,"人物已相认");}
    boolean isPersonMode(){return mode==Mode.PERSON;}
    void nextPersonChoice(){if(mode!=Mode.PERSON)return;personChoice=(personChoice+1)%PERSON_CHOICES.length;personResponse="";invalidate();}
    void confirmPersonChoice(){if(mode!=Mode.PERSON)return;personResponse="已选择 · "+PERSON_CHOICES[personChoice];invalidate();}
    private static int mono(int alpha){return Color.argb(alpha,R,G,B);}

    @Override protected void onDraw(Canvas c){super.onDraw(c);float w=getWidth(),h=getHeight();paint.setStyle(Paint.Style.FILL);if(mode==Mode.PERSON)drawPerson(c,w,h);else drawFieldHud(c,w,h);postInvalidateDelayed(1000);}
    private void drawFieldHud(Canvas c,float w,float h){
        text(c,"最近任务",22,36,15,mono(125),true);
        text(c,"把书还给周野",22,68,21,GREEN,false);
        text(c,"18:30 · 青苔书店",22,96,15,mono(120),false);
    }
    private void drawPerson(Canvas c,float w,float h){
        text(c,personName,18,44,30,GREEN,false);
        String line=personSpeech.length()>46?personSpeech.substring(0,46)+"…":personSpeech;
        wrapText(c,"“"+line+"”",18,91,w-36,20,mono(210));
        float optionTop=h-96;for(int i=0;i<PERSON_CHOICES.length;i++){float y=optionTop+i*31;rightText(c,(i==personChoice?"› ":"  ")+PERSON_CHOICES[i],w-22,y,18,i==personChoice?GREEN:mono(125));}
        if(!personResponse.isEmpty())rightText(c,personResponse,w-22,optionTop-32,14,mono(150));
        if(SystemClock.elapsedRealtime()-modeStarted>30_000)setStatus(Mode.READY,perception?"持续感知中":"物理按键已就绪");
    }
    private void wrapText(Canvas c,String value,float x,float y,float max,int size,int color){StringBuilder line=new StringBuilder();float cursor=y;for(char ch:value.toCharArray()){paint.setTextSize(size);if(paint.measureText(line.toString()+ch)>max){text(c,line.toString(),x,cursor,size,color,false);line.setLength(0);cursor+=29;}line.append(ch);}text(c,line.toString(),x,cursor,size,color,false);}
    private void rightText(Canvas c,String value,float right,float y,float size,int color){paint.setTextSize(size);paint.setTypeface(android.graphics.Typeface.create("sans",android.graphics.Typeface.NORMAL));text(c,value,right-paint.measureText(value),y,size,color,false);}
    private void text(Canvas c,String value,float x,float y,float size,int color,boolean monoFont){paint.setColor(color);paint.setTextSize(size);paint.setTypeface(android.graphics.Typeface.create(monoFont?"monospace":"sans",monoFont?android.graphics.Typeface.BOLD:android.graphics.Typeface.NORMAL));c.drawText(value,x,y,paint);}
}
