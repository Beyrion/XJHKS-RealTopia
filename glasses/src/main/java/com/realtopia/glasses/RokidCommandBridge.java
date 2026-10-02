package com.realtopia.glasses;

import android.util.Log;
import com.rokid.cxr.CXRServiceBridge;
import org.json.JSONArray;
import org.json.JSONObject;

final class RokidCommandBridge {
    static final String CAPTURE_COMMAND="Realia_Capture";
    static final String CONTROL_COMMAND="Realia_Control";
    static final String PERSON_COMMAND="Realia_Person";
    interface Listener{void onCapture(long requestId,int width,int jpegQuality,boolean forceCold);}
    interface ControlListener{void onPerception(boolean enabled,int framesPerSecond,int width,int jpegQuality);}
    interface PersonListener{void onPerson(String personId,String name,String title,int affinity,String quest,String story,String kind,String contextId,String[] choiceIds,String[] choiceLabels);}
    private final CXRServiceBridge bridge=new CXRServiceBridge();
    private final Listener listener;
    private final ControlListener controlListener;
    private final PersonListener personListener;
    RokidCommandBridge(Listener listener,ControlListener controlListener,PersonListener personListener){this.listener=listener;this.controlListener=controlListener;this.personListener=personListener;}
    void start(){
        bridge.setStatusListener(new CXRServiceBridge.StatusListener(){
            @Override public void onConnected(String name,String address,int type){Log.i("RealiaCxr","CONNECTED name="+name+" type="+type);}
            @Override public void onConnecting(String name,String address,int type){Log.i("RealiaCxr","CONNECTING name="+name);}
            @Override public void onDisconnected(){Log.i("RealiaCxr","DISCONNECTED");}
            @Override public void onARTCStatus(float health,boolean reset){Log.d("RealiaCxr","health="+health);}
            @Override public void onRokidAccountChanged(String account){Log.d("RealiaCxr","account changed");}
        });
        int result=bridge.subscribe(CAPTURE_COMMAND,(command,caps,data)->{
            if(caps==null||caps.size()<3){Log.e("RealiaCxr","invalid capture command");return;}
            long id=caps.at(0).getLong();int width=caps.at(1).getInt();int quality=caps.at(2).getInt();
            boolean cold=caps.size()>3&&caps.at(3).getInt()!=0;
            listener.onCapture(id,width,quality,cold);
        });
        Log.i("RealiaCxr","SUBSCRIBED result="+result+" command="+CAPTURE_COMMAND);
        int controlResult=bridge.subscribe(CONTROL_COMMAND,(command,caps,data)->{
            if(caps==null||caps.size()<2){Log.e("RealiaCxr","invalid control command");return;}
            boolean enabled=caps.at(0).getInt()!=0;
            int framesPerSecond=Math.max(2,Math.min(5,caps.at(1).getInt()));
            int width=caps.size()>2?Math.max(1280,Math.min(4032,caps.at(2).getInt())):4032;
            int quality=caps.size()>3?Math.max(50,Math.min(100,caps.at(3).getInt())):90;
            controlListener.onPerception(enabled,framesPerSecond,width,quality);
        });
        Log.i("RealiaCxr","SUBSCRIBED result="+controlResult+" command="+CONTROL_COMMAND);
        int personResult=bridge.subscribe(PERSON_COMMAND,(command,caps,data)->{
            if(caps==null||caps.size()<6){Log.e("RealiaCxr","invalid person command");return;}
            String kind="person",contextId="";String[] ids=null,labels=null;
            if(caps.size()>6){try{String raw=caps.at(6).getString();if(raw!=null&&!raw.isEmpty()){
                JSONObject config=new JSONObject(raw);kind=config.optString("kind","person");contextId=config.optString("contextId","");
                JSONArray choices=config.optJSONArray("choices");if(choices!=null&&choices.length()>=2&&choices.length()<=3){ids=new String[choices.length()];labels=new String[choices.length()];for(int i=0;i<choices.length();i++){JSONObject choice=choices.getJSONObject(i);ids[i]=choice.getString("id");labels[i]=choice.getString("label");}}
            }}catch(Exception error){Log.e("RealiaCxr","invalid person choice config",error);}}
            personListener.onPerson(caps.at(0).getString(),caps.at(1).getString(),caps.at(2).getString(),
                    caps.at(3).getInt(),caps.at(4).getString(),caps.at(5).getString(),kind,contextId,ids,labels);
        });
        Log.i("RealiaCxr","SUBSCRIBED result="+personResult+" command="+PERSON_COMMAND);
    }
}
