package com.realtopia.glasses;

/** Kept Android-independent so the physical button/touch-strip distinction is tested. */
final class ChoiceInput {
    static final int DOUBLE_TAP=-20;
    enum Action { NONE, TOGGLE_SENSING, PREVIOUS, NEXT, CONFIRM }
    static Action touchAction(float dx,float dy){
        float distance=Math.max(Math.abs(dx),Math.abs(dy));
        if(distance<16)return Action.CONFIRM;
        // Small accidental movement is neither a swipe nor a tap.
        if(distance<48)return Action.NONE;
        return (Math.abs(dx)>Math.abs(dy)?dx:dy)>0?Action.NEXT:Action.PREVIOUS;
    }
    static boolean suppressRepeatedTap(int key,long sinceConfirmation){
        return (key==66||key==23||key==DOUBLE_TAP)&&sinceConfirmation>=0&&sinceConfirmation<400;
    }
    static int normalize(int key,String name){
        // RG firmware uses vendor names in Generic.kl, unlike Enterprise's DPAD.
        if("KEYCODE_SPRITE_SWIPE_FORWARD".equals(name))return 22;
        if("KEYCODE_SPRITE_SWIPE_BACK".equals(name))return 21;
        if("KEYCODE_SPRITE_DOUBLE_TAP".equals(name))return DOUBLE_TAP;
        return key;
    }
    static Action resolve(int key,boolean card) {
        // Rokid documents ENTER as touch-strip tap; CAMERA remains perception-only.
        if(card&&(key==66||key==23||key==DOUBLE_TAP))return Action.CONFIRM;
        if(card&&(key==21||key==19))return Action.PREVIOUS;
        if(card&&(key==22||key==20))return Action.NEXT;
        if(key==27||key==79||key==85||key==66||key==23)return Action.TOGGLE_SENSING;
        return Action.NONE;
    }
}
