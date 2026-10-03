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
    private static final float DESIGN_W=480f,DESIGN_H=640f;
    private static final int R=76, G=255, B=151, GREEN=Color.rgb(R,G,B);
    private final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);
    private Mode mode=Mode.READY;
    private String detail="相机预热中", personName="", personTitle="", personQuest="", personSpeech="";
    private int personBond;
    private final PersonChoiceState personChoices=new PersonChoiceState();
    private static final long PERSON_TIMEOUT_MS=45_000;
    private long modeStarted=SystemClock.elapsedRealtime();
    private String choiceFeedback="";
    private long choiceFeedbackAt;
    private boolean choiceSubmitted;
    private boolean perception;
    private DialogueHudData dialogue=DialogueHudData.empty();
    private PeopleHudData peopleInView=PeopleHudData.empty();
    private SocialHintData socialHint=SocialHintData.empty();
    private TaskSummaryData taskSummary=TaskSummaryData.empty();
    private long peopleReceivedAt;
    private Runnable visualChangeListener;
    private HudSnapshotData hudSnapshot=HudSnapshotData.empty();

    GlassHudView(Context context){super(context);paint.setTypeface(android.graphics.Typeface.create("sans",android.graphics.Typeface.NORMAL));setBackgroundColor(Color.BLACK);}
    void setOnVisualChangeListener(Runnable listener){visualChangeListener=listener;notifyVisualChanged();}
    private void notifyVisualChanged(){invalidate();if(visualChangeListener!=null)post(visualChangeListener);}
    void setStatus(Mode next,String value){mode=next;detail=value==null?"":value;modeStarted=SystemClock.elapsedRealtime();notifyVisualChanged();}
    void setPerception(boolean value){perception=value;if(value)taskSummary=TaskSummaryData.empty();if(!value){dialogue=DialogueHudData.empty();peopleInView=PeopleHudData.empty();socialHint=SocialHintData.empty();if(mode==Mode.PERSON&&!personChoices.isTaskOffer())setStatus(Mode.READY,"主动感知已关闭");}notifyVisualChanged();}
    void setTaskSummary(TaskSummaryData value){taskSummary=value==null?TaskSummaryData.empty():value;notifyVisualChanged();}
    void setSocialHint(SocialHintData value){socialHint=value==null?SocialHintData.empty():value;notifyVisualChanged();}
    private boolean hasSocialHint(){return hasPeople()&&socialHint.matches(peopleInView);}
    void setDialogueData(DialogueHudData value){dialogue=value==null?DialogueHudData.empty():value;notifyVisualChanged();}
    void setPeopleData(PeopleHudData value){
        PeopleHudData next=value==null?PeopleHudData.empty():value;
        // Repeated caption/task syncs must not keep an old photo alive forever.
        if(!next.sameFrame(peopleInView))peopleReceivedAt=SystemClock.elapsedRealtime();
        peopleInView=next;notifyVisualChanged();
    }
    private boolean hasPeople(){return peopleInView.fresh(SystemClock.elapsedRealtime()-peopleReceivedAt)
            &&!peopleInView.summary().isEmpty();}
    void setHudSnapshot(HudSnapshotData value){hudSnapshot=value==null?HudSnapshotData.empty():value;notifyVisualChanged();}
    void showPerson(String personId,String name,String title,int bond,String quest,String speech,String kind,String contextId,String[] choiceIds,String[] choiceLabels){if("dialogue".equals(kind)||"person".equals(kind))return;if(mode==Mode.PERSON&&personChoices.isTaskOffer()&&!"task_offer".equals(kind))return;if(personChoices.hasContext(contextId)&&choiceSubmitted)return;if(personChoices.isFrozen(contextId)&&mode==Mode.PERSON)return;personName=name;personTitle=title;personBond=bond;personQuest=quest;personSpeech=speech;choiceFeedback="";choiceSubmitted=false;personChoices.reset(personId,kind,contextId,choiceIds,choiceLabels);setStatus(Mode.PERSON,"task_offer".equals(kind)?"新任务等待确认":"新的世界事件");}
    void showPerson(String personId,String name,String title,int bond,String quest,String speech){showPerson(personId,name,title,bond,quest,speech,"person","",null,null);}
    boolean isPersonMode(){return mode==Mode.PERSON;}
    void previousPersonChoice(){if(mode!=Mode.PERSON)return;personChoices.previous();notifyVisualChanged();}
    void nextPersonChoice(){if(mode!=Mode.PERSON)return;personChoices.next();notifyVisualChanged();}
    PersonChoiceState.Selection selectedPersonChoice(){return mode==Mode.PERSON?personChoices.selection():null;}
    void dismissPerson(String contextId){if(mode==Mode.PERSON&&personChoices.hasContext(contextId))setStatus(Mode.READY,perception?"主动感知 · 拍照与语音":"主动感知已关闭");}
    void dismissPerson(String contextId,String feedback){
        if(!personChoices.hasContext(contextId))return;
        dismissPerson(contextId);
        if(feedback!=null&&!feedback.isEmpty()){
            choiceFeedback=feedback;choiceFeedbackAt=SystemClock.elapsedRealtime();
            detail=feedback;notifyVisualChanged();
        }
    }
    void finishPersonChoice(PersonChoiceState.Selection choice,boolean sent){if(choice==null)return;choiceSubmitted=sent&&personChoices.isTaskOffer();choiceFeedback=sent?"已发送「"+choice.label+"」· 等待手机确认":"未能发送 · 请检查连接";choiceFeedbackAt=SystemClock.elapsedRealtime();setStatus(sent?Mode.READY:Mode.ERROR,choiceFeedback);}
    String snapshotMode(){return mode.name();}
    String snapshotToken(){return mode.name()+"|"+detail+"|"+perception+"|"+personName+"|"+personQuest+"|"+personSpeech+"|"+personChoices.selectedIndex()+"|"+hudSnapshot.tasks.size()+"|"+hudSnapshot.vitality+"|"+hudSnapshot.focusedTaskTitle()+"|"+dialogue.token()+"|"+peopleInView.token()+"|"+hasPeople()+"|"+socialHint.token()+"|"+hasSocialHint()+"|"+taskSummary.token();}
    private static int mono(int alpha){return Color.argb(alpha,R,G,B);}

    @Override protected void onDraw(Canvas c){
        super.onDraw(c);paint.setStyle(Paint.Style.FILL);
        float w=getWidth(),h=getHeight();
        if(mode==Mode.PERSON)drawPerson(c,w,h);
        else if(!perception&&taskSummary.showPanel()&&!(choiceSubmitted&&"ready".equals(taskSummary.phase)))drawTaskSummary(c,w,h);
        else if(dialogue.active)drawDialogueHud(c,w,h);
        else drawFieldHud(c,w,h);
        postInvalidateDelayed(1000);
    }

    /** Live layout: tasks NW, people NE, vitals SE. */
    private void drawLiveChrome(Canvas c,float w,float h){
        text(c,"当前任务",18,28,13,mono(150),true);
        float width=Math.min(220,w*0.48f),y=52;
        if(hudSnapshot.tasks.isEmpty())text(c,"○ 等待接取任务",18,y,12,mono(100),false);
        for(int i=0;i<Math.min(3,hudSnapshot.tasks.size());i++){
            HudSnapshotData.Task task=hudSnapshot.tasks.get(i);
            int color=task.focused?GREEN:mono(task.done()?100:145);
            text(c,task.done()?"✓":task.focused?"◇":"○",18,y,13,color,true);
            y=wrapLimited(c,task.title,40,y,width-22,13,color,1,18);
            if(!task.steps.isEmpty()){y+=17;text(c,"└ "+ellipsize(task.steps.get(0),width-28,10),40,y,10,mono(100),false);}
            y+=25;
        }
        if(hasPeople())drawPeopleProfiles(c,w);
        rightText(c,"心情 · "+hudSnapshot.moodLabel+" · "+hudSnapshot.moodWeather,w-18,h-72,13,GREEN);
        text(c,"生命力",w-191,h-43,11,mono(125),false);
        float barLeft=w-83,barRight=w-18,barTop=h-54;
        rightText(c,hudSnapshot.vitality+" / "+hudSnapshot.vitalityMaximum,barLeft-8,h-43,12,GREEN);
        paint.setStyle(Paint.Style.STROKE);paint.setStrokeWidth(1);paint.setColor(mono(95));c.drawRect(barLeft,barTop,barRight,barTop+12,paint);
        paint.setStyle(Paint.Style.FILL);paint.setColor(GREEN);
        float ratio=Math.max(0f,Math.min(1f,hudSnapshot.vitality/(float)hudSnapshot.vitalityMaximum));
        c.drawRect(barLeft+2,barTop+2,barLeft+2+(barRight-barLeft-4)*ratio,barTop+10,paint);
        text(c,perception?"感知中 · 按一下关闭":"感知已关闭",18,h-22,12,mono(120),false);
    }

    private void drawDialogueHud(Canvas c,float w,float h){
        if(mode==Mode.PERSON&&!personChoices.isTaskOffer()&&SystemClock.elapsedRealtime()-modeStarted>PERSON_TIMEOUT_MS)
            setStatus(Mode.READY,perception?"主动感知 · 拍照与语音":"物理按键已就绪");
        drawLiveChrome(c,w,h);
        float columnsTop=310,bottom=h-105;
        paint.setStyle(Paint.Style.STROKE);paint.setColor(mono(65));paint.setStrokeWidth(1);
        c.drawLine(w/2,columnsTop,w/2,bottom,paint);paint.setStyle(Paint.Style.FILL);
        drawDialogueColumn(c,dialogue.left,18,w/2-14,bottom,columnsTop);
        drawDialogueColumn(c,dialogue.right,w/2+14,w-18,bottom,columnsTop);
    }
    /** Only fresh recognized profiles belong here; never a fallback task body. */
    private void drawPeopleProfiles(Canvas c,float w){
        float left=w-194,right=w-18,width=right-left,y=58;
        rightText(c,"人物档案",right,28,12,mono(150));
        int count=peopleInView.profiles.size(),lines=count<=1?4:count==2?2:1;
        for(PeopleHudData.Profile profile:peopleInView.profiles){
            text(c,ellipsize(profile.name,width,count==1?22:18),left,y,count==1?22:18,GREEN,false);
            if(!profile.background.isEmpty()){
                y=wrapLimited(c,profile.background,left,y+22,width,12,mono(155),lines,18)+25;
            }else y+=32;
        }
        if(count==0){wrapLimited(c,peopleInView.summary(),left,y,width,15,mono(150),2,20);y+=50;}
        String footer="视野人物 · 非讲话者";
        if(peopleInView.omittedCount>0)footer+=" · 另"+peopleInView.omittedCount+"人";
        if(count>0&&peopleInView.unmatchedCount>0)footer+=" · "+peopleInView.unmatchedCount+"张脸未确认";
        float bottom=Math.max(156,y+2);
        text(c,ellipsize(footer,width,10),left,bottom,10,mono(105),false);
        paint.setStyle(Paint.Style.STROKE);paint.setStrokeWidth(1);paint.setColor(mono(95));
        c.drawLine(left-12,18,left-12,bottom+12,paint);c.drawLine(left-12,18,left+15,18,paint);
        paint.setStyle(Paint.Style.FILL);
        if(hasSocialHint()){
            float top=bottom+24;
            text(c,ellipsize("社交提示 · "+socialHint.name,width,12),left,top,12,GREEN,true);
            // Bound all profile/hint text above the dialogue's 310px start.
            if(top+62<=292){
                wrapLimited(c,socialHint.reminder,left,top+19,width,12,mono(155),1,18);
                wrapLimited(c,socialHint.advice,left,top+42,width,13,mono(220),Math.min(2,(int)((292-top-42)/18)+1),18);
            }else if(top+20<=292)wrapLimited(c,socialHint.advice,left,top+20,width,13,mono(220),1,18);
        }
    }
    private void drawDialogueColumn(Canvas c,DialogueHudData.Column column,float left,float right,float bottom,float top){
        float y=top+20;
        if(column.lines.isEmpty())return;
        if(column.lines.size()>1){
            y=wrapLimited(c,column.lines.get(0),left,y,right-left,13,mono(105),1,18)+23;
        }
        int count=Math.max(1,(int)((bottom-y)/27)+1);
        wrapLimited(c,column.lines.get(column.lines.size()-1),left,y,right-left,18,mono(225),count,27);
    }
    private float wrapLimited(Canvas c,String value,float x,float y,float width,int size,int color,int maxLines,float lineHeight){
        java.util.List<String> lines=new java.util.ArrayList<>();StringBuilder row=new StringBuilder();
        paint.setTextSize(size);paint.setTypeface(android.graphics.Typeface.create("sans",android.graphics.Typeface.NORMAL));
        for(int point:value.codePoints().toArray()){
            String ch=new String(Character.toChars(point));
            if(row.length()>0&&paint.measureText(row.toString()+ch)>width){lines.add(row.toString());row.setLength(0);}
            row.append(ch);
        }
        if(row.length()>0)lines.add(row.toString());
        int count=Math.min(maxLines,lines.size());
        for(int i=0;i<count;i++){
            String line=lines.get(i);
            if(i==count-1&&lines.size()>count)line=ellipsize(line+"…",width,size);
            text(c,line,x,y+i*lineHeight,size,color,false);
        }
        return y+Math.max(0,count-1)*lineHeight;
    }
    private void drawFieldHud(Canvas c,float w,float h){
        drawLiveChrome(c,w,h);
        String heading=mode==Mode.RECORDING?"正在录音":mode==Mode.SCENE_RECORDING?"场景录制":mode==Mode.CAPTURING?"正在拍摄":
                mode==Mode.SENDING?"正在传输":mode==Mode.ERROR?"连接异常":"RealTopia";
        centeredText(c,mode==Mode.READY?(perception?"主动感知中":"按一下开启感知"):heading,w/2,350,19,mono(150),false);
        if(mode==Mode.ERROR)wrapLimited(c,detail,30,385,w-60,14,mono(210),3,22);
        else if(!choiceFeedback.isEmpty()&&SystemClock.elapsedRealtime()-choiceFeedbackAt<6_000)
            wrapLimited(c,choiceFeedback,30,385,w-60,14,GREEN,2,22);
        else centeredText(c,perception?"人物与对话将在识别后更新":mode==Mode.READY?"开启后拍照与语音同步":"照片通过 Wi-Fi Direct 传输",w/2,382,13,mono(100),false);
    }
    private void drawPerson(Canvas c,float w,float h){
        if(personChoices.isTaskOffer()||"dialogue".equals(personChoices.selection().kind)){
            drawLiveChrome(c,w,h);
            drawChoiceCard(c,w,h,110);
            if(!personChoices.isTaskOffer()&&SystemClock.elapsedRealtime()-modeStarted>PERSON_TIMEOUT_MS)setStatus(Mode.READY,"提示已过期 · 等待下一句");
            return;
        }
        text(c,personName,18,44,30,GREEN,false);
        text(c,personTitle+(personBond==-2?"":personBond<0?" · ？？？":" · "+personBond+"/100"),18,68,14,mono(145),false);
        String line=personSpeech.length()>46?personSpeech.substring(0,46)+"…":personSpeech;
        wrapText(c,"“"+line+"”",18,96,w-36,18,mono(210));
        text(c,ellipsize("关联任务 · "+personQuest,w-36,14),18,h-55,14,mono(145),false);
        text(c,"滑动切换 · 轻触确认 · 按钮关闭感知",18,h-20,13,mono(125),false);
        float optionTop=h-157;for(int i=0;i<personChoices.size();i++){float y=optionTop+i*31;rightText(c,(i==personChoices.selectedIndex()?"› ":"  ")+ellipsize(personChoices.labelAt(i),w-44,18),w-22,y,18,i==personChoices.selectedIndex()?GREEN:mono(125));}
        if(SystemClock.elapsedRealtime()-modeStarted>PERSON_TIMEOUT_MS)setStatus(Mode.READY,perception?"主动感知 · 拍照与语音":"物理按键已就绪");
    }
    private void drawChoiceCard(Canvas c,float w,float h,float top){
        if(personChoices.isTaskOffer()){drawTaskOffer(c,w,h,310);return;}
        paint.setColor(mono(75));paint.setStrokeWidth(1);c.drawLine(18,top-16,w-18,top-16,paint);
        boolean task=personChoices.isTaskOffer();
        text(c,task?"发现新任务 · 等待你确认":"可参考回复 · "+personName,18,top,16,GREEN,true);
        if(task){
            wrapLimited(c,personQuest,18,top+28,w-36,18,mono(225),2,24);
            text(c,ellipsize(personSpeech,w-36,14),18,top+79,14,mono(145),false);
        }else wrapLimited(c,personSpeech,18,top+27,w-36,15,mono(165),2,22);
        for(int i=0;i<personChoices.size();i++){
            text(c,(i==personChoices.selectedIndex()?"› ":"  ")+ellipsize(personChoices.labelAt(i),w-56,18),18,top+106+i*29,18,i==personChoices.selectedIndex()?GREEN:mono(115),false);
        }
        text(c,"滑动切换 · 镜腿轻触确认",18,h-50,13,mono(135),false);
    }
    /** Same green diamond, thin outline and centered notice across the live HUD. */
    private void drawTaskOffer(Canvas c,float w,float h,float top){
        float left=30,right=w-30,bottom=top+150;
        paint.setStyle(Paint.Style.FILL);paint.setColor(mono(24));c.drawRect(left,top,right,bottom,paint);
        paint.setStyle(Paint.Style.STROKE);paint.setStrokeWidth(1.5f);paint.setColor(mono(205));c.drawRect(left,top,right,bottom,paint);
        paint.setStyle(Paint.Style.FILL);
        centeredText(c,"新任务 · "+ellipsize(personName,220,12),w/2,top+27,12,mono(155),true);
        wrapLimited(c,personQuest,left+18,top+57,right-left-36,20,GREEN,2,24);
        wrapLimited(c,personSpeech,left+18,top+106,right-left-36,13,mono(165),2,18);
        paint.setColor(mono(135));c.drawRect(w/2-82,bottom-13,w/2+82,bottom-12,paint);
        for(int i=0;i<personChoices.size();i++){
            boolean selected=i==personChoices.selectedIndex();
            float optionLeft=w-210,y=bottom+18+i*43;
            paint.setStyle(Paint.Style.FILL);paint.setColor(mono(selected?48:18));c.drawRect(optionLeft,y,right,y+34,paint);
            paint.setStyle(Paint.Style.STROKE);paint.setStrokeWidth(selected?2f:1f);paint.setColor(mono(selected?235:90));c.drawRect(optionLeft,y,right,y+34,paint);
            paint.setStyle(Paint.Style.FILL);
            text(c,selected?"◆":"◇",optionLeft+11,y+24,13,selected?GREEN:mono(105),true);
            text(c,ellipsize(personChoices.labelAt(i),right-optionLeft-44,16),optionLeft+33,y+24,16,selected?GREEN:mono(130),false);
        }
        text(c,"滑动切换 · 轻触确认",left,bottom+40,12,mono(135),false);
    }
    private void drawTaskSummary(Canvas c,float w,float h){
        drawLiveChrome(c,w,h);
        float top=315,left=30,right=w-30,bottom=top+146;
        paint.setStyle(Paint.Style.FILL);paint.setColor(mono(24));c.drawRect(left,top,right,bottom,paint);
        paint.setStyle(Paint.Style.STROKE);paint.setStrokeWidth(1.5f);paint.setColor(mono(205));c.drawRect(left,top,right,bottom,paint);
        paint.setStyle(Paint.Style.FILL);
        centeredText(c,"◇ 感知结束 · 任务总结",w/2,top+27,13,mono(155),true);
        centeredText(c,taskSummary.heading(),w/2,top+65,21,GREEN,false);
        wrapLimited(c,taskSummary.detail(),left+18,top+99,right-left-36,14,mono(175),2,20);
    }
    private void wrapText(Canvas c,String value,float x,float y,float max,int size,int color){StringBuilder line=new StringBuilder();float cursor=y;for(char ch:value.toCharArray()){paint.setTextSize(size);if(paint.measureText(line.toString()+ch)>max){text(c,line.toString(),x,cursor,size,color,false);line.setLength(0);cursor+=29;}line.append(ch);}text(c,line.toString(),x,cursor,size,color,false);}
    private void rightText(Canvas c,String value,float right,float y,float size,int color){paint.setTextSize(size);paint.setTypeface(android.graphics.Typeface.create("sans",android.graphics.Typeface.NORMAL));text(c,value,right-paint.measureText(value),y,size,color,false);}
    private void centeredText(Canvas c,String value,float center,float y,float size,int color,boolean monoFont){paint.setTextSize(size);paint.setTypeface(android.graphics.Typeface.create(monoFont?"monospace":"sans",monoFont?android.graphics.Typeface.BOLD:android.graphics.Typeface.NORMAL));text(c,value,center-paint.measureText(value)/2,y,size,color,monoFont);}
    private String ellipsize(String value,float maximum,float size){paint.setTextSize(size);paint.setTypeface(android.graphics.Typeface.create("sans",android.graphics.Typeface.NORMAL));if(paint.measureText(value)<=maximum)return value;String suffix="…";int end=value.length();while(end>0&&paint.measureText(value.substring(0,end)+suffix)>maximum)end--;return value.substring(0,end)+suffix;}
    private void text(Canvas c,String value,float x,float y,float size,int color,boolean monoFont){paint.setColor(color);paint.setTextSize(size);paint.setTypeface(android.graphics.Typeface.create(monoFont?"monospace":"sans",monoFont?android.graphics.Typeface.BOLD:android.graphics.Typeface.NORMAL));c.drawText(value,x,y,paint);}
    private void strikeText(Canvas c,String value,float x,float y,float size,int color){text(c,value,x,y,size,color,false);paint.setColor(color);paint.setStrokeWidth(1.5f);c.drawLine(x,y-size*0.42f,x+paint.measureText(value),y-size*0.42f,paint);}
    private static float clamp(float value){return Math.max(0f,Math.min(1f,value));}
    private static String loadingDots(float age){int count=1+(int)(Math.max(0,age)/350)%3;return count==1?".":count==2?"..":"...";}
}
