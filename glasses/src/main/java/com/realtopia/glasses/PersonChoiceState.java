package com.realtopia.glasses;

/** Pure selection state for the Rokid touch strip driven GalGame choices. */
final class PersonChoiceState {
    static final String[] IDS={"greet","catch_up","later"};
    static final String[] LABELS={"打个招呼","聊聊近况","稍后再说"};

    static final class Selection {
        final String personId,choiceId,label;
        final int index;
        Selection(String personId,int index,String choiceId,String label){
            this.personId=personId;this.index=index;this.choiceId=choiceId;this.label=label;
        }
    }

    private String personId="";
    private int selected;

    void reset(String nextPersonId){personId=nextPersonId==null?"":nextPersonId;selected=0;}
    int selectedIndex(){return selected;}
    String selectedLabel(){return LABELS[selected];}
    void previous(){selected=(selected+LABELS.length-1)%LABELS.length;}
    void next(){selected=(selected+1)%LABELS.length;}
    Selection selection(){return new Selection(personId,selected,IDS[selected],LABELS[selected]);}
}
