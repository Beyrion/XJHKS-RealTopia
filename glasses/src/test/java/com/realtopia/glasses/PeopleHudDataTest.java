package com.realtopia.glasses;

import org.json.JSONObject;
import org.junit.Test;
import static org.junit.Assert.*;

public class PeopleHudDataTest {
    private String payload(String people){return "{\"schemaVersion\":1,\"peopleInView\":{\"active\":true,\"sessionId\":\"s1\",\"requestId\":1,\"people\":"+people+",\"unmatchedCount\":2}}";}
    @Test public void parsesMultipleIdentitiesIndependentlyOfDialogue(){
        PeopleHudData data=PeopleHudData.fromJson(payload("[{\"id\":\"a\",\"name\":\"老孙\"},{\"id\":\"b\",\"name\":\"小蔡\"}]"));
        assertTrue(data.active);assertEquals(2,data.names.size());assertEquals(2,data.unmatchedCount);
        assertEquals("老孙 · 小蔡 · 2张脸未确认",data.summary());
        assertFalse(DialogueHudData.fromJson(payload("[]")).active);
    }
    @Test public void backgroundIsAttachedToItsOwnProfileAndMissingBackgroundStaysEmpty(){
        PeopleHudData data=PeopleHudData.fromJson(payload("[{\"id\":\"a\",\"name\":\"老孙\",\"background\":\" 同事  ·  研究引擎优化 \"},{\"id\":\"b\",\"name\":\"小蔡\"}]"));
        assertEquals("老孙",data.profiles.get(0).name);
        assertEquals("同事 · 研究引擎优化",data.profiles.get(0).background);
        assertEquals("小蔡",data.profiles.get(1).name);
        assertEquals("",data.profiles.get(1).background);
        assertNotEquals(data.token(),PeopleHudData.fromJson(payload("[{\"id\":\"a\",\"name\":\"老孙\",\"background\":\"新的简介\"},{\"id\":\"b\",\"name\":\"小蔡\"}]")).token());
    }
    @Test public void backgroundIsBoundedAndDuplicateProfilesCannotLeakAcrossPeople(){
        String longStory="🙂".repeat(200);
        PeopleHudData data=PeopleHudData.fromJson(payload("[{\"id\":\"a\",\"name\":\"老孙\",\"background\":\""+longStory+"\"},{\"id\":\"a\",\"name\":\"重复\",\"background\":\"重复简介\"}]"));
        assertEquals(1,data.profiles.size());
        assertEquals(160,data.profiles.get(0).background.codePointCount(0,data.profiles.get(0).background.length()));
        String clean=PeopleHudData.withoutIdentities(payload("[{\"id\":\"a\",\"name\":\"老孙\",\"background\":\"不应持久化的简介\"}]"));
        assertFalse(clean.contains("不应持久化的简介"));
    }
    @Test public void missingInvalidAndInactiveDataClearIdentities(){
        assertFalse(PeopleHudData.fromJson("{}").active);
        assertFalse(PeopleHudData.fromJson("bad").active);
        assertFalse(PeopleHudData.fromJson(payload("[]").replace("\"active\":true","\"active\":false")).active);
        assertFalse(PeopleHudData.fromJson(payload("[]").replace("\"requestId\":1","\"requestId\":0")).active);
        assertFalse(PeopleHudData.fromJson(payload("[]").replace("\"s1\"","\"\"")).active);
    }
    @Test public void deduplicatesAndBoundsNamesAndCounts(){
        PeopleHudData data=PeopleHudData.fromJson(payload("[{\"id\":\"a\",\"name\":\"老孙\"},{\"id\":\"a\",\"name\":\"重复\"},{\"id\":\"b\",\"name\":\"小蔡\"},{\"id\":\"c\",\"name\":\"老陈\"},{\"id\":\"d\",\"name\":\"大翔\"},{\"id\":\"e\",\"name\":\"第五人\"}]"));
        assertEquals(4,data.names.size());assertEquals(1,data.omittedCount);
        assertEquals(0,PeopleHudData.fromJson(payload("[]").replace("\"unmatchedCount\":2","\"unmatchedCount\":-4")).unmatchedCount);
    }
    @Test public void oldFrameExpiresAndDuplicateSyncCannotRenewIt(){
        PeopleHudData a=PeopleHudData.fromJson(payload("[]"));
        assertTrue(a.sameFrame(PeopleHudData.fromJson(payload("[]"))));
        assertFalse(a.sameFrame(PeopleHudData.fromJson(payload("[]").replace("\"requestId\":1","\"requestId\":2"))));
        assertFalse(a.sameFrame(PeopleHudData.fromJson(payload("[]").replace("\"s1\"","\"s2\""))));
        assertTrue(a.fresh(24_999));assertFalse(a.fresh(25_000));assertFalse(a.fresh(-1));
    }
    @Test public void identitiesAreNotPersistedOrReplayed() throws Exception{
        String clean=PeopleHudData.withoutIdentities(payload("[{\"id\":\"a\",\"name\":\"老孙\"}]"));
        assertFalse(PeopleHudData.fromJson(clean).active);
        assertEquals(1,new JSONObject(clean).optInt("schemaVersion"));
        assertEquals("",PeopleHudData.withoutIdentities("bad"));
    }
}
