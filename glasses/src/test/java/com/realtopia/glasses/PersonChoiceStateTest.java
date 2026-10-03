package com.realtopia.glasses;

import static org.junit.Assert.assertEquals;
import org.junit.Test;

public class PersonChoiceStateTest {
    @Test public void taskOffersPreserveAcceptRejectContext(){
        PersonChoiceState state=new PersonChoiceState();
        state.reset("小蔡","task_offer","task-offer:session:task:1",
            new String[]{"accept","reject"},new String[]{"接受任务","拒绝任务"});
        assertEquals(true,state.isTaskOffer());
        state.next();
        assertEquals("reject",state.selection().choiceId);
        assertEquals("task-offer:session:task:1",state.selection().contextId);
        state.reset("小蔡","task_offer","task-offer:session:task:1",
            new String[]{"accept","reject"},new String[]{"接受任务","拒绝任务"});
        assertEquals("reject",state.selection().choiceId);
    }
    @Test public void taskOffersStopAtEdgesInsteadOfCyclingBack(){
        PersonChoiceState state=new PersonChoiceState();
        state.reset("__task__","task_offer","offer-1",new String[]{"accept","reject"},new String[]{"接受任务","拒绝任务"});
        state.previous();assertEquals("accept",state.selection().choiceId);
        state.next();state.next();assertEquals("reject",state.selection().choiceId);
        state.previous();state.previous();assertEquals("accept",state.selection().choiceId);
    }
    @Test public void scrollingFreezesSameContextButNewContextCanReset(){
        PersonChoiceState state=new PersonChoiceState();
        state.reset("xiaocai","dialogue","turn-1",new String[]{"a","b"},new String[]{"本地建议一","本地建议二"});
        state.next();
        state.reset("xiaocai","dialogue","turn-1",new String[]{"c","d"},new String[]{"迟到云端一","迟到云端二"});
        assertEquals(1,state.selectedIndex());assertEquals("本地建议二",state.selectedLabel());
        state.reset("laosun","dialogue","turn-2",new String[]{"c","d"},new String[]{"新对话一","新对话二"});
        assertEquals(0,state.selectedIndex());assertEquals("新对话一",state.selectedLabel());
    }
    @Test public void startsAtFirstChoiceAndCarriesPersonIdentity(){
        PersonChoiceState state=new PersonChoiceState();state.reset("老孙");
        PersonChoiceState.Selection selected=state.selection();
        assertEquals(0,selected.index);assertEquals("老孙",selected.personId);
        assertEquals("greet",selected.choiceId);assertEquals("打个招呼",selected.label);
    }

    @Test public void swipesInBothDirectionsAndWraps(){
        PersonChoiceState state=new PersonChoiceState();state.reset("老孙");
        state.previous();assertEquals(2,state.selectedIndex());
        state.next();assertEquals(0,state.selectedIndex());
        state.next();assertEquals(1,state.selectedIndex());
        assertEquals("catch_up",state.selection().choiceId);
    }

    @Test public void acceptsDynamicDialogueAndWorldEventChoices(){
        PersonChoiceState state=new PersonChoiceState();
        state.reset("老孙","dialogue","conversation-42",
                new String[]{"reply_0","reply_1","reply_2"},
                new String[]{"我明白你的意思","后来怎么样了？","我可以帮忙"});
        state.next();
        PersonChoiceState.Selection dialogue=state.selection();
        assertEquals("reply_1",dialogue.choiceId);assertEquals("后来怎么样了？",dialogue.label);
        assertEquals("dialogue",dialogue.kind);assertEquals("conversation-42",dialogue.contextId);

        state.reset("__world_event__","world_event","world-77",
                new String[]{"accept","ignore"},new String[]{"接受事件","暂时忽略"});
        state.previous();
        PersonChoiceState.Selection event=state.selection();
        assertEquals(1,event.index);assertEquals("ignore",event.choiceId);
        assertEquals("world_event",event.kind);assertEquals("world-77",event.contextId);
    }
}
