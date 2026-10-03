package com.realtopia.glasses;

import org.json.JSONObject;

/** Transient OFF-summary status, independent from interactive task cards. */
final class TaskSummaryData {
    final boolean active;
    final long sessionId;
    final String phase;
    final int utteranceCount,taskCount,pendingCount;
    private TaskSummaryData(boolean active,long sessionId,String phase,int utterances,int tasks,int pending){
        this.active=active;this.sessionId=sessionId;this.phase=phase;
        utteranceCount=utterances;taskCount=tasks;pendingCount=pending;
    }
    static TaskSummaryData empty(){return new TaskSummaryData(false,0,"",0,0,0);}
    static TaskSummaryData fromJson(String raw){
        try{
            JSONObject root=new JSONObject(raw),value=root.optJSONObject("taskSummary");
            if(root.optInt("schemaVersion")!=1||value==null||!value.optBoolean("active"))return empty();
            long session=value.optLong("sessionId",-1);
            String phase=value.optString("phase","");
            if(session<0||!("draining".equals(phase)||"analyzing".equals(phase)||"empty".equals(phase)||"ready".equals(phase)||"error".equals(phase)))return empty();
            return new TaskSummaryData(true,session,phase,count(value,"utteranceCount"),count(value,"taskCount"),count(value,"pendingCount"));
        }catch(Exception ignored){return empty();}
    }
    private static int count(JSONObject value,String key){return Math.max(0,Math.min(999,value.optInt(key)));}
    boolean showPanel(){return active&&!("ready".equals(phase)&&pendingCount==0);}
    String heading(){
        switch(phase){
            case "draining":return "正在整理本轮对话";
            case "analyzing":return "正在生成任务";
            case "empty":return "本轮未收到清晰语音";
            case "ready":return "生成 "+taskCount+" 个新任务";
            default:return "任务总结失败";
        }
    }
    String detail(){
        switch(phase){
            case "draining":return "麦克风已关闭 · 等待剩余转写";
            case "analyzing":return "已收到 "+utteranceCount+" 段转写 · 请稍候";
            case "empty":return "未生成任务 · 下次请说一句完整的话";
            case "ready":return pendingCount>0?"等待在眼镜上接受或拒绝":"已完成选择 · 接受的任务已同步到手机";
            default:return "请查看手机调试日志";
        }
    }
    String token(){return active+"|"+sessionId+"|"+phase+"|"+utteranceCount+"|"+taskCount+"|"+pendingCount;}
}
