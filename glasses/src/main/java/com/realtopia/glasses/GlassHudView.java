package com.realtopia.glasses;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.os.SystemClock;
import android.view.View;

/** Single-wavelength HUD: every illuminated pixel uses the Rokid green emitter hue. */
final class GlassHudView extends View {
    enum Mode { READY, CAPTURING, SENDING, PERSON, RECORDING, SCENE_RECORDING, ERROR }
    private static final int R=76, G=255, B=151, GREEN=Color.rgb(R,G,B);
    private final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);
    private Mode mode=Mode.READY;
    private String detail="相机预热中", personName="", personTitle="", personQuest="", personSpeech="";
    private int personBond;
    private final PersonChoiceState personChoices=new PersonChoiceState();
    private static final long PERSON_TIMEOUT_MS=45_000;
    private long modeStarted=SystemClock.elapsedRealtime();
    private boolean perception;
    private Runnable visualChangeListener;

    GlassHudView(Context context){super(context);paint.setTypeface(android.graphics.Typeface.create("sans",android.graphics.Typeface.NORMAL));setBackgroundColor(Color.BLACK);}
    void setOnVisualChangeListener(Runnable listener){visualChangeListener=listener;notifyVisualChanged();}
    private void notifyVisualChanged(){invalidate();if(visualChangeListener!=null)post(visualChangeListener);}
    void setStatus(Mode next,String value){mode=next;detail=value==null?"":value;modeStarted=SystemClock.elapsedRealtime();notifyVisualChanged();}
    void setPerception(boolean value){perception=value;notifyVisualChanged();}
    void showPerson(String personId,String name,String title,int bond,String quest,String speech,String kind,String contextId,String[] choiceIds,String[] choiceLabels){personName=name;personTitle=title;personBond=bond;personQuest=quest;personSpeech=speech;personChoices.reset(personId,kind,contextId,choiceIds,choiceLabels);setStatus(Mode.PERSON,"world_event".equals(kind)?"新的世界事件":"dialogue".equals(kind)?"对话建议已生成":bond<0?"检测到陌生人":"人物已相认");}
    void showPerson(String personId,String name,String title,int bond,String quest,String speech){showPerson(personId,name,title,bond,quest,speech,"person","",null,null);}
    boolean isPersonMode(){return mode==Mode.PERSON;}
    void previousPersonChoice(){if(mode!=Mode.PERSON)return;personChoices.previous();notifyVisualChanged();}
    void nextPersonChoice(){if(mode!=Mode.PERSON)return;personChoices.next();notifyVisualChanged();}
    PersonChoiceState.Selection selectedPersonChoice(){return mode==Mode.PERSON?personChoices.selection():null;}
    void dismissPerson(String contextId){if(mode==Mode.PERSON&&personChoices.hasContext(contextId))setStatus(Mode.READY,"持续感知中");}
    void finishPersonChoice(PersonChoiceState.Selection choice,boolean sent){if(choice==null)return;setStatus(sent?Mode.READY:Mode.ERROR,sent?"已选择 · "+choice.label:"选择已确认 · 等待手机重新连接");}
    String snapshotMode(){return mode.name();}
    String snapshotToken(){return mode.name()+"|"+detail+"|"+perception+"|"+personName+"|"+personChoices.selectedIndex();}
    private static int mono(int alpha){return Color.argb(alpha,R,G,B);}

    @Override protected void onDraw(Canvas c){super.onDraw(c);float w=getWidth(),h=getHeight();paint.setStyle(Paint.Style.FILL);if(mode==Mode.PERSON)drawPerson(c,w,h);else drawFieldHud(c,w,h);postInvalidateDelayed(1000);}
    private void drawFieldHud(Canvas c,float w,float h){
        String heading=mode==Mode.RECORDING?"正在录音":mode==Mode.SCENE_RECORDING?"场景录制":mode==Mode.CAPTURING?"正在拍摄":
                mode==Mode.SENDING?"正在传输":mode==Mode.ERROR?"连接异常":"RealTopia";
        text(c,heading,22,36,15,mono(125),true);
        wrapText(c,detail,22,70,w-44,20,mode==Mode.ERROR?mono(210):GREEN);
        rightText(c,mode==Mode.RECORDING?"再按一次结束手机录音":mode==Mode.SCENE_RECORDING?"实景 + HUD":"按一下开启手机录音",w-22,h-22,14,mono(125));
    }
    private void drawPerson(Canvas c,float w,float h){
        text(c,personName,18,44,30,GREEN,false);
        text(c,personTitle+(personBond==-2?"":personBond<0?" · ？？？":" · "+personBond+"/100"),18,68,14,mono(145),false);
        String line=personSpeech.length()>46?personSpeech.substring(0,46)+"…":personSpeech;
        wrapText(c,"“"+line+"”",18,96,w-36,18,mono(210));
        text(c,"关联任务 · "+personQuest,18,h-20,14,mono(145),false);
        float optionTop=h-96;for(int i=0;i<personChoices.size();i++){float y=optionTop+i*31;rightText(c,(i==personChoices.selectedIndex()?"› ":"  ")+personChoices.labelAt(i),w-22,y,18,i==personChoices.selectedIndex()?GREEN:mono(125));}
        if(SystemClock.elapsedRealtime()-modeStarted>PERSON_TIMEOUT_MS)setStatus(Mode.READY,perception?"持续感知中":"物理按键已就绪");
    }
    private void wrapText(Canvas c,String value,float x,float y,float max,int size,int color){StringBuilder line=new StringBuilder();float cursor=y;for(char ch:value.toCharArray()){paint.setTextSize(size);if(paint.measureText(line.toString()+ch)>max){text(c,line.toString(),x,cursor,size,color,false);line.setLength(0);cursor+=29;}line.append(ch);}text(c,line.toString(),x,cursor,size,color,false);}
    private void rightText(Canvas c,String value,float right,float y,float size,int color){paint.setTextSize(size);paint.setTypeface(android.graphics.Typeface.create("sans",android.graphics.Typeface.NORMAL));text(c,value,right-paint.measureText(value),y,size,color,false);}
    private void text(Canvas c,String value,float x,float y,float size,int color,boolean monoFont){paint.setColor(color);paint.setTextSize(size);paint.setTypeface(android.graphics.Typeface.create(monoFont?"monospace":"sans",monoFont?android.graphics.Typeface.BOLD:android.graphics.Typeface.NORMAL));c.drawText(value,x,y,paint);}
}
