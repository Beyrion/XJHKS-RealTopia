package com.realtopia.glasses;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

/** Transient captions received over the existing Bluetooth HUD snapshot command. */
final class DialogueHudData {
    static final class Column {
        final String label;
        final List<String> lines;
        Column(String label,List<String> lines){this.label=label;this.lines=Collections.unmodifiableList(lines);}
    }
    final boolean active;
    final long sessionId;
    final Column left,right;
    final String note;
    private DialogueHudData(boolean active,long sessionId,Column left,Column right,String note){
        this.active=active;this.sessionId=sessionId;this.left=left;this.right=right;this.note=note;
    }
    static DialogueHudData empty(){return new DialogueHudData(false,0,column(null),column(null),"");}
    static DialogueHudData fromJson(String raw){
        try{
            JSONObject root=new JSONObject(raw);
            if(root.optInt("schemaVersion",0)!=1)return empty();
            JSONObject value=root.optJSONObject("dialogue");
            if(value==null||!value.optBoolean("active",false))return empty();
            return new DialogueHudData(true,Math.max(0,value.optLong("sessionId",0)),
                    column(value.optJSONObject("left")),column(value.optJSONObject("right")),"");
        }catch(Exception ignored){return empty();}
    }
    private static Column column(JSONObject value){
        List<String> lines=new ArrayList<>();JSONArray array=value==null?null:value.optJSONArray("lines");
        if(array!=null)for(int i=Math.max(0,array.length()-2);i<array.length();i++){
            String text=clean(array.optString(i,""),160);if(!text.isEmpty())lines.add(text);
        }
        // Ignore old phone labels/uncertain-voice notes too: HUD is captions only.
        return new Column("",lines);
    }
    private static String clean(String value,int max){
        String text=value==null?"":value.replaceAll("\\s+"," ").trim();
        return text.length()<=max?text:text.substring(0,max);
    }
    String token(){return active+"|"+sessionId+"|"+left.label+"|"+left.lines+"|"+right.label+"|"+right.lines+"|"+note;}
}
