package com.realtopia.glasses;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

/** Dynamic HUD state supplied by the phone's persisted Quest store. */
final class HudSnapshotData {

    static final class Task {
        final String id,group,title,status;
        final int progress;
        final boolean focused;
        final List<String> steps;

        Task(String id,String group,String title,String status,int progress,boolean focused,List<String> steps){
            this.id=id;this.group=group;this.title=title;this.status=status;
            this.progress=progress;this.focused=focused;this.steps=Collections.unmodifiableList(steps);
        }
        boolean done(){return "done".equals(status)||"completed".equals(status);}
        boolean tracked(){return !"inbox".equals(status);}
    }

    final List<Task> tasks;
    final String moodLabel,moodWeather;
    final int vitality,vitalityMaximum;

    private HudSnapshotData(List<Task> tasks,String moodLabel,String moodWeather,int vitality,int vitalityMaximum){
        this.tasks=Collections.unmodifiableList(tasks);this.moodLabel=moodLabel;this.moodWeather=moodWeather;
        this.vitality=vitality;this.vitalityMaximum=vitalityMaximum;
    }

    static HudSnapshotData empty(){return new HudSnapshotData(new ArrayList<>(),"--","--",0,100);}

    static HudSnapshotData fromJson(String raw){
        if(raw==null||raw.trim().isEmpty())return empty();
        try{
            JSONObject root=new JSONObject(raw);
            if(root.optInt("schemaVersion",0)!=1)return empty();
            List<Task> tasks=new ArrayList<>();
            JSONArray taskValues=root.optJSONArray("tasks");
            if(taskValues!=null)for(int index=0;index<taskValues.length()&&tasks.size()<4;index++){
                JSONObject value=taskValues.optJSONObject(index);if(value==null)continue;
                String id=clean(value.optString("id",""),96);
                String title=clean(value.optString("title",""),80);
                if(id.isEmpty()||title.isEmpty())continue;
                List<String> steps=new ArrayList<>();JSONArray stepValues=value.optJSONArray("steps");
                if(stepValues!=null)for(int step=0;step<stepValues.length()&&steps.size()<12;step++){
                    String label=clean(stepValues.optString(step,""),80);if(!label.isEmpty())steps.add(label);
                }
                tasks.add(new Task(id,clean(value.optString("group","任务"),24),title,
                        clean(value.optString("status","active"),16),clamp(value.optInt("progress",0),0,100),
                        value.optBoolean("focused",false),steps));
            }
            JSONObject mood=root.optJSONObject("mood");
            JSONObject vitality=root.optJSONObject("vitality");
            return new HudSnapshotData(tasks,
                    clean(mood==null?"--":mood.optString("label","--"),24),
                    clean(mood==null?"--":mood.optString("weather","--"),24),
                    clamp(vitality==null?0:vitality.optInt("value",0),0,999),
                    clamp(vitality==null?100:vitality.optInt("maximum",100),1,999));
        }catch(Exception ignored){return empty();}
    }

    String focusedTaskTitle(){
        for(Task task:tasks)if(task.focused)return task.title;
        return tasks.isEmpty()?"":tasks.get(0).title;
    }

    HudSnapshotData upsertFocusedTask(Task value){
        if(value==null)return this;
        List<Task> next=new ArrayList<>();
        next.add(new Task(value.id,value.group,value.title,value.status,value.progress,true,value.steps));
        for(Task task:tasks){
            if(value.id.equals(task.id)||next.size()>=4)continue;
            next.add(new Task(task.id,task.group,task.title,task.status,task.progress,false,task.steps));
        }
        return new HudSnapshotData(next,moodLabel,moodWeather,vitality,vitalityMaximum);
    }

    HudSnapshotData completeTask(String taskId){
        if(taskId==null||taskId.isEmpty())return this;
        List<Task> next=new ArrayList<>();
        for(Task task:tasks){
            boolean matched=taskId.equals(task.id);
            next.add(new Task(task.id,task.group,task.title,matched?"done":task.status,
                    matched?100:task.progress,task.focused,task.steps));
        }
        return new HudSnapshotData(next,moodLabel,moodWeather,vitality,vitalityMaximum);
    }

    private static String clean(String value,int maximum){
        if(value==null)return "";String next=value.trim();return next.length()<=maximum?next:next.substring(0,maximum);
    }
    private static int clamp(int value,int minimum,int maximum){return Math.max(minimum,Math.min(maximum,value));}
}
