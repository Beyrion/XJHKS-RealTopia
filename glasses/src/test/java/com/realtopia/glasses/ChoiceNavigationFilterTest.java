package com.realtopia.glasses;

import org.junit.Test;
import static org.junit.Assert.*;

public class ChoiceNavigationFilterTest {
    @Test public void rightDownAndTouchAliasesAreOneSwipe(){
        ChoiceNavigationFilter filter=new ChoiceNavigationFilter();
        assertTrue(filter.accept(1000,false));
        assertFalse(filter.accept(1030,false));
        assertFalse(filter.accept(1080,false));
        assertTrue(filter.accept(1580,false));
    }
    @Test public void longBurstNeverRetriggersUntilAQuietGap(){
        ChoiceNavigationFilter filter=new ChoiceNavigationFilter();
        assertTrue(filter.accept(1000,false));
        for(long at=1020;at<=4000;at+=20)assertFalse(filter.accept(at,false));
        assertFalse(filter.accept(4499,false));
        assertTrue(filter.accept(4999,false));
    }
    @Test public void heldKeyRepeatCannotNavigate(){
        ChoiceNavigationFilter filter=new ChoiceNavigationFilter();
        assertFalse(filter.accept(1000,true));
        assertFalse(filter.accept(1050,false));
        assertTrue(filter.accept(1550,false));
    }
    @Test public void pairedFirmwareKeysChangeSelectionOnceInBothDirections(){
        ChoiceNavigationFilter filter=new ChoiceNavigationFilter();
        PersonChoiceState state=new PersonChoiceState();
        state.reset("__task__","task_offer","paired-keys",new String[]{"accept","reject"},new String[]{"接受任务","拒绝任务"});
        for(int i=0;i<2;i++)if(filter.accept(1000+i*30,false))state.next();
        assertEquals(1,state.selectedIndex());
        for(int i=0;i<2;i++)if(filter.accept(2000+i*30,false))state.previous();
        assertEquals(0,state.selectedIndex());
    }
}
