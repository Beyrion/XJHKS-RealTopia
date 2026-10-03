package com.realtopia.glasses;

import static org.junit.Assert.assertEquals;
import org.junit.Test;

public class ChoiceInputTest {
    @Test public void touchJitterIsNotASwipeOrConfirmation(){
        assertEquals(ChoiceInput.Action.CONFIRM,ChoiceInput.touchAction(5,-6));
        assertEquals(ChoiceInput.Action.NONE,ChoiceInput.touchAction(30,-16));
        assertEquals(ChoiceInput.Action.NEXT,ChoiceInput.touchAction(48,0));
        assertEquals(ChoiceInput.Action.PREVIOUS,ChoiceInput.touchAction(0,-60));
    }
    @Test public void doubleTapCannotConfirmThenAccidentallyToggleSensing(){
        assertEquals(true,ChoiceInput.suppressRepeatedTap(66,150));
        assertEquals(false,ChoiceInput.suppressRepeatedTap(66,450));
        assertEquals(false,ChoiceInput.suppressRepeatedTap(27,150));
    }
    @Test public void rgVendorSwipeNamesResolveWithoutHardcodingFirmwareNumbers(){
        assertEquals(ChoiceInput.Action.NEXT,ChoiceInput.resolve(ChoiceInput.normalize(999,"KEYCODE_SPRITE_SWIPE_FORWARD"),true));
        assertEquals(ChoiceInput.Action.PREVIOUS,ChoiceInput.resolve(ChoiceInput.normalize(888,"KEYCODE_SPRITE_SWIPE_BACK"),true));
        assertEquals(ChoiceInput.Action.CONFIRM,ChoiceInput.resolve(ChoiceInput.normalize(777,"KEYCODE_SPRITE_DOUBLE_TAP"),true));
        assertEquals(ChoiceInput.Action.NONE,ChoiceInput.resolve(ChoiceInput.normalize(777,"KEYCODE_SPRITE_DOUBLE_TAP"),false));
    }
    @Test public void physicalCameraButtonAlwaysControlsSensing(){
        assertEquals(ChoiceInput.Action.TOGGLE_SENSING,ChoiceInput.resolve(27,true));
        assertEquals(ChoiceInput.Action.TOGGLE_SENSING,ChoiceInput.resolve(27,false));
    }
    @Test public void touchTapConfirmsOnlyWhenCardVisible(){
        assertEquals(ChoiceInput.Action.CONFIRM,ChoiceInput.resolve(66,true));
        assertEquals(ChoiceInput.Action.CONFIRM,ChoiceInput.resolve(23,true));
        assertEquals(ChoiceInput.Action.TOGGLE_SENSING,ChoiceInput.resolve(66,false));
    }
    @Test public void swipesOnlyNavigateCardsAndDoNotToggleSensing(){
        assertEquals(ChoiceInput.Action.PREVIOUS,ChoiceInput.resolve(21,true));
        assertEquals(ChoiceInput.Action.NEXT,ChoiceInput.resolve(22,true));
        assertEquals(ChoiceInput.Action.NONE,ChoiceInput.resolve(21,false));
        assertEquals(ChoiceInput.Action.NONE,ChoiceInput.resolve(4,true));
    }
}
