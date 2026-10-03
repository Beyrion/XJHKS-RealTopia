package com.realtopia.glasses;

import org.junit.Test;
import static org.junit.Assert.*;

public class SocialHintDataTest {
    private static final String ROOT="{\"schemaVersion\":1,\"socialHint\":{\"active\":true,\"sessionId\":\"s\",\"requestId\":7,\"name\":\"小蔡\",\"reminder\":\"上次没看懂结算\",\"advice\":\"确认这次是否更清楚\",\"usedMemoryIds\":[\"m\"]},\"peopleInView\":{\"active\":true,\"sessionId\":\"s\",\"requestId\":7,\"people\":[{\"id\":\"c\",\"name\":\"小蔡\"}]}}";
    @Test public void readOnlyMemoryNeedsMatchingFreshFrame(){
        SocialHintData hint=SocialHintData.fromJson(ROOT);
        assertTrue(hint.active);assertTrue(hint.matches(PeopleHudData.fromJson(ROOT)));
        assertFalse(hint.matches(PeopleHudData.fromJson(ROOT.replace("\"requestId\":7","\"requestId\":8"))));
    }
    @Test public void noEvidenceNoHint(){assertFalse(SocialHintData.fromJson(ROOT.replace("[\"m\"]","[]")).active);}
    @Test public void notPersisted(){assertFalse(PeopleHudData.withoutIdentities(ROOT).contains("socialHint"));}
    @Test public void malformedAndInactiveClear(){assertFalse(SocialHintData.fromJson("bad").active);assertFalse(SocialHintData.fromJson(ROOT.replace("\"active\":true","\"active\":false")).active);}
}
