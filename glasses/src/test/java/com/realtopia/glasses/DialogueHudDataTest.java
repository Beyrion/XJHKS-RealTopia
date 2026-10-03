package com.realtopia.glasses;

import org.junit.Test;
import static org.junit.Assert.*;

public class DialogueHudDataTest {
    @Test public void parsesTwoIndependentColumns(){
        DialogueHudData data=DialogueHudData.fromJson("{\"schemaVersion\":1,\"dialogue\":{\"active\":true,\"sessionId\":123,\"left\":{\"label\":\"声音 A\",\"lines\":[\"第一句\",\"继续讲话\"]},\"right\":{\"label\":\"小蔡\",\"lines\":[\"另一方\"]},\"note\":\"声音未确认\"}}");
        assertTrue(data.active);assertEquals(123,data.sessionId);
        assertEquals(2,data.left.lines.size());assertEquals("继续讲话",data.left.lines.get(1));
        assertEquals("",data.left.label);assertEquals("",data.right.label);assertEquals("另一方",data.right.lines.get(0));
        assertEquals("",data.note);
    }
    @Test public void inactiveOrOldPayloadClearsCaptions(){
        assertFalse(DialogueHudData.fromJson("{}").active);
        assertFalse(DialogueHudData.fromJson("bad json").active);
        assertFalse(DialogueHudData.fromJson("{\"schemaVersion\":1,\"dialogue\":{\"active\":false,\"left\":{\"lines\":[\"旧记录\"]}}}").active);
        assertTrue(DialogueHudData.empty().left.lines.isEmpty());
    }
    @Test public void boundsCaptionsAndUsesLatestTwo(){
        DialogueHudData data=DialogueHudData.fromJson("{\"schemaVersion\":1,\"dialogue\":{\"active\":true,\"left\":{\"lines\":[\"旧\",\"第二\",\"第三\"]}}}");
        assertEquals(2,data.left.lines.size());assertEquals("第二",data.left.lines.get(0));
        assertEquals("",data.right.label);
    }
}
