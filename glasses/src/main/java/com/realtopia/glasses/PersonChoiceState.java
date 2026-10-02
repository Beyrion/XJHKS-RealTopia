package com.realtopia.glasses;

/** Pure selection state for the Rokid touch strip driven GalGame choices. */
final class PersonChoiceState {
    private static final String[] DEFAULT_IDS={"greet","catch_up","later"};
    private static final String[] DEFAULT_LABELS={"打个招呼","聊聊近况","稍后再说"};

    static final class Selection {
        final String personId,choiceId,label,kind,contextId;
        final int index;
        Selection(String personId,int index,String choiceId,String label,String kind,String contextId){
            this.personId=personId;this.index=index;this.choiceId=choiceId;this.label=label;this.kind=kind;this.contextId=contextId;
        }
    }

    private String personId="",kind="person",contextId="";
    private String[] ids=DEFAULT_IDS,labels=DEFAULT_LABELS;
    private int selected;

    void reset(String nextPersonId){reset(nextPersonId,"person","",DEFAULT_IDS,DEFAULT_LABELS);}
    void reset(String nextPersonId,String nextKind,String nextContextId,String[] nextIds,String[] nextLabels){
        personId=nextPersonId==null?"":nextPersonId;kind=nextKind==null?"person":nextKind;
        contextId=nextContextId==null?"":nextContextId;
        if(nextIds!=null&&nextLabels!=null&&nextIds.length>=2&&nextIds.length<=3&&nextIds.length==nextLabels.length){ids=nextIds.clone();labels=nextLabels.clone();}
        else{ids=DEFAULT_IDS;labels=DEFAULT_LABELS;}
        selected=0;
    }
    int selectedIndex(){return selected;}
    boolean hasContext(String value){return value!=null&&value.equals(contextId);}
    int size(){return labels.length;}
    String labelAt(int index){return labels[index];}
    String selectedLabel(){return labels[selected];}
    void previous(){selected=(selected+labels.length-1)%labels.length;}
    void next(){selected=(selected+1)%labels.length;}
    Selection selection(){return new Selection(personId,selected,ids[selected],labels[selected],kind,contextId);}
}
