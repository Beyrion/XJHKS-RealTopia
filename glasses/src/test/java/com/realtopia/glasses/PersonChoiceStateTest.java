package com.realtopia.glasses;

import static org.junit.Assert.assertEquals;
import org.junit.Test;

public class PersonChoiceStateTest {
    @Test public void startsAtFirstChoiceAndCarriesPersonIdentity(){
        PersonChoiceState state=new PersonChoiceState();state.reset("lin");
        PersonChoiceState.Selection selected=state.selection();
        assertEquals(0,selected.index);assertEquals("lin",selected.personId);
        assertEquals("greet",selected.choiceId);assertEquals("打个招呼",selected.label);
    }

    @Test public void swipesInBothDirectionsAndWraps(){
        PersonChoiceState state=new PersonChoiceState();state.reset("lin");
        state.previous();assertEquals(2,state.selectedIndex());
        state.next();assertEquals(0,state.selectedIndex());
        state.next();assertEquals(1,state.selectedIndex());
        assertEquals("catch_up",state.selection().choiceId);
    }
}
