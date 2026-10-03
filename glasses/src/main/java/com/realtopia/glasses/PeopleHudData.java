package com.realtopia.glasses;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

/** Independent, transient visual identities. Never binds a voice to a face. */
final class PeopleHudData {
    static final long MAX_AGE_MS=25_000;
    static final class Profile {
        final String name,background;
        Profile(String name,String background){this.name=name;this.background=background;}
        @Override public String toString(){return name+"|"+background;}
    }
    final boolean active;
    final String sessionId;
    final long requestId;
    final List<String> names;
    final List<Profile> profiles;
    final int unmatchedCount,omittedCount;
    private PeopleHudData(boolean active,String sessionId,long requestId,List<Profile> profiles,int unmatched,int omitted){
        this.active=active;this.sessionId=sessionId;this.requestId=requestId;
        this.profiles=Collections.unmodifiableList(profiles);
        List<String> names=new ArrayList<>();for(Profile profile:profiles)names.add(profile.name);
        this.names=Collections.unmodifiableList(names);this.unmatchedCount=unmatched;this.omittedCount=omitted;
    }
    static PeopleHudData empty(){return new PeopleHudData(false,"",0,new ArrayList<>(),0,0);}
    static String withoutIdentities(String raw){
        try{JSONObject value=new JSONObject(raw);value.remove("peopleInView");value.remove("socialHint");value.remove("taskSummary");return value.toString();}
        catch(Exception ignored){return "";}
    }
    static PeopleHudData fromJson(String raw){
        try{
            JSONObject root=new JSONObject(raw);
            if(root.optInt("schemaVersion",0)!=1)return empty();
            JSONObject value=root.optJSONObject("peopleInView");
            if(value==null||!value.optBoolean("active",false))return empty();
            String session=clean(value.optString("sessionId",""),128);
            long request=value.optLong("requestId",0);
            if(session.isEmpty()||request<=0)return empty();
            List<Profile> profiles=new ArrayList<>();HashSet<String> ids=new HashSet<>();
            JSONArray array=value.optJSONArray("people");
            if(array!=null)for(int i=0;i<Math.min(array.length(),64);i++){
                JSONObject person=array.optJSONObject(i);if(person==null)continue;
                String id=clean(person.optString("id",""),128),name=clean(person.optString("name",""),24);
                if(!id.isEmpty()&&!name.isEmpty()&&ids.add(id))profiles.add(new Profile(name,clean(person.optString("background",""),160)));
            }
            int omitted=count(value.optInt("omittedCount",0))+Math.max(0,profiles.size()-4);
            return new PeopleHudData(true,session,request,new ArrayList<>(profiles.subList(0,Math.min(4,profiles.size()))),
                    count(value.optInt("unmatchedCount",0)),count(omitted));
        }catch(Exception ignored){return empty();}
    }
    private static int count(int value){return Math.max(0,Math.min(99,value));}
    private static String clean(String value,int max){
        String text=value==null?"":value.replaceAll("\\s+"," ").trim();
        return text.codePointCount(0,text.length())<=max?text:text.substring(0,text.offsetByCodePoints(0,max));
    }
    boolean fresh(long age){return active&&age>=0&&age<MAX_AGE_MS;}
    boolean sameFrame(PeopleHudData other){return other!=null&&active&&other.active
            &&requestId==other.requestId&&sessionId.equals(other.sessionId);}
    String summary(){
        String text=String.join(" · ",names);
        if(omittedCount>0)text+=(text.isEmpty()?"":" · ")+"另"+omittedCount+"人";
        if(unmatchedCount>0)text+=(text.isEmpty()?"":" · ")+unmatchedCount+"张脸未确认";
        return text;
    }
    String token(){return active+"|"+sessionId+"|"+requestId+"|"+profiles+"|"+unmatchedCount+"|"+omittedCount;}
}
