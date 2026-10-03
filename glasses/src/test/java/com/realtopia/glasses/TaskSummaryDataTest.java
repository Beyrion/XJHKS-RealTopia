package com.realtopia.glasses;

import org.junit.Test;
import static org.junit.Assert.*;

public class TaskSummaryDataTest {
    private static String root(String phase,int tasks,int pending){return "{\"schemaVersion\":1,\"taskSummary\":{\"active\":true,\"sessionId\":123,\"phase\":\""+phase+"\",\"utteranceCount\":3,\"taskCount\":"+tasks+",\"pendingCount\":"+pending+"}}";}
    @Test public void offStagesAreVisible(){
        assertTrue(TaskSummaryData.fromJson(root("draining",0,0)).heading().contains("整理"));
        assertTrue(TaskSummaryData.fromJson(root("analyzing",0,0)).heading().contains("生成"));
        assertTrue(TaskSummaryData.fromJson(root("empty",0,0)).detail().contains("未生成任务"));
        assertTrue(TaskSummaryData.fromJson(root("error",0,0)).heading().contains("失败"));
    }
    @Test public void readyAndDecidedHaveDifferentStatus(){
        assertEquals("生成 2 个新任务",TaskSummaryData.fromJson(root("ready",2,2)).heading());
        assertTrue(TaskSummaryData.fromJson(root("ready",2,2)).detail().contains("接受或拒绝"));
        assertTrue(TaskSummaryData.fromJson(root("ready",2,0)).detail().contains("已完成选择"));
        assertTrue(TaskSummaryData.fromJson(root("ready",2,1)).showPanel());
        assertFalse(TaskSummaryData.fromJson(root("ready",2,0)).showPanel());
        assertTrue(TaskSummaryData.fromJson(root("analyzing",0,0)).showPanel());
        assertFalse(TaskSummaryData.empty().showPanel());
    }
    @Test public void invalidOrClearedPayloadCannotStick(){
        assertFalse(TaskSummaryData.fromJson("bad").active);
        assertFalse(TaskSummaryData.fromJson(root("unknown",0,0)).active);
        assertFalse(TaskSummaryData.fromJson(root("ready",2,2).replace("\"active\":true","\"active\":false")).active);
        assertFalse(TaskSummaryData.fromJson(root("ready",2,2).replace("\"schemaVersion\":1","\"schemaVersion\":2")).active);
        assertEquals(0,TaskSummaryData.fromJson(root("ready",-5,-9)).taskCount);
    }
    @Test public void transientStateIsNotRestoredFromDisk(){
        assertFalse(PeopleHudData.withoutIdentities(root("analyzing",0,0)).contains("taskSummary"));
    }
}
