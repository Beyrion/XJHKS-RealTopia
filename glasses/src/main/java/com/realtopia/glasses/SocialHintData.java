package com.realtopia.glasses;

import org.json.JSONObject;

/** Transient read-only memory hint, deliberately outside PersonChoiceState. */
final class SocialHintData {
    final boolean active;
    final String sessionId,name,reminder,advice;
    final long requestId;
    private SocialHintData(boolean active,String session,long request,String name,String reminder,String advice){
        this.active=active;sessionId=session;requestId=request;this.name=name;this.reminder=reminder;this.advice=advice;
    }
    static SocialHintData empty(){return new SocialHintData(false,"",0,"","","");}
    static SocialHintData fromJson(String raw){
        try{
            JSONObject root=new JSONObject(raw),value=root.optJSONObject("socialHint");
            if(root.optInt("schemaVersion")!=1||value==null||!value.optBoolean("active"))return empty();
            String session=clean(value.optString("sessionId"),128),name=clean(value.optString("name"),24);
            String reminder=clean(value.optString("reminder"),100),advice=clean(value.optString("advice"),100);
            long request=value.optLong("requestId");
            if(session.isEmpty()||request<=0||name.isEmpty()||reminder.isEmpty()||value.optJSONArray("usedMemoryIds")==null||value.optJSONArray("usedMemoryIds").length()==0)return empty();
            return new SocialHintData(true,session,request,name,reminder,advice);
        }catch(Exception ignored){return empty();}
    }
    boolean matches(PeopleHudData people){return active&&people.active&&requestId==people.requestId&&sessionId.equals(people.sessionId)&&people.names.contains(name);}
    private static String clean(String raw,int max){
        String value=raw.replaceAll("\\s+"," ").trim();
        return value.codePointCount(0,value.length())<=max?value:value.substring(0,value.offsetByCodePoints(0,max));
    }
    String token(){return active+"|"+sessionId+"|"+requestId+"|"+name+"|"+reminder+"|"+advice;}
}
