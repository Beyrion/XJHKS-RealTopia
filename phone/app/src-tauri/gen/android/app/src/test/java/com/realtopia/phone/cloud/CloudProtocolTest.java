package com.realtopia.phone.cloud;

import static org.junit.Assert.*;
import org.json.JSONObject;
import org.junit.Test;

public class CloudProtocolTest {
    private static final String DEEPSEEK = "https://api.deepseek.com/anthropic";

    @Test public void detectsOnlyAnthropicEndpoints() {
        assertTrue(CloudProtocol.isAnthropic(DEEPSEEK));
        assertTrue(CloudProtocol.isAnthropic(DEEPSEEK + "/v1/"));
        assertTrue(CloudProtocol.isAnthropic("https://api.anthropic.com"));
        assertFalse(CloudProtocol.isAnthropic("https://api.deepseek.com/v1"));
        assertFalse(CloudProtocol.isAnthropic("https://example.com/anthropic-proxy/v1"));
        assertEquals(DEEPSEEK + "/v1/messages", CloudProtocol.endpoint(DEEPSEEK));
        assertEquals(DEEPSEEK + "/v1/messages", CloudProtocol.endpoint(DEEPSEEK + "/v1/"));
    }

    @Test public void messagesFormatHasRequiredTokenBudgetAndNoOpenAiOnlyFields() throws Exception {
        JSONObject body = CloudProtocol.request(DEEPSEEK, "deepseek-v4-pro", "system", "prompt", true, 3000, true, 0.6);
        assertEquals("deepseek-v4-pro", body.getString("model"));
        assertEquals("system", body.getString("system"));
        assertEquals(3000, body.getInt("max_tokens"));
        assertEquals("disabled", body.getJSONObject("thinking").getString("type"));
        assertEquals(1, body.getJSONArray("messages").length());
        assertEquals("user", body.getJSONArray("messages").getJSONObject(0).getString("role"));
        assertFalse(body.has("response_format"));
        assertFalse(body.has("max_completion_tokens"));
        assertEquals(4096, CloudProtocol.request(DEEPSEEK, "m", "s", "p", false, null, false, null).getInt("max_tokens"));
    }

    @Test public void openAiPathAndQwenFastOptionsRemainCompatible() throws Exception {
        String base = "https://example.com/compatible-mode/v1";
        assertEquals(base + "/chat/completions", CloudProtocol.endpoint(base));
        JSONObject body = CloudProtocol.request(base, "qwen-plus", "s", "p", true, 1024, true, null);
        assertEquals(2, body.getJSONArray("messages").length());
        assertEquals("json_object", body.getJSONObject("response_format").getString("type"));
        assertEquals(1024, body.getInt("max_completion_tokens"));
        assertFalse(body.getBoolean("enable_thinking"));
        assertFalse(body.has("max_tokens"));
        assertFalse(body.has("system"));
    }

    @Test public void extractsTextOnlyAndNeverReturnsThinkingOrToolData() throws Exception {
        JSONObject response = new JSONObject("{\"content\":[{\"type\":\"thinking\",\"thinking\":\"private\"},{\"type\":\"text\",\"text\":\"{\\\"ok\\\":\"},{\"type\":\"tool_use\",\"input\":{}},{\"type\":\"text\",\"text\":\"true}\"}],\"stop_reason\":\"end_turn\"}");
        assertEquals("{\"ok\":true}", CloudProtocol.text(DEEPSEEK, response));
        assertEquals("", CloudProtocol.text(DEEPSEEK, new JSONObject("{\"content\":[]}")));
        assertEquals("ok", CloudProtocol.text("https://example.com/v1", new JSONObject("{\"choices\":[{\"message\":{\"content\":\"ok\"}}]}")));
    }

    @Test public void rejectsTruncatedResponsesAndClampsBudget() throws Exception {
        assertThrows(IllegalStateException.class, () -> CloudProtocol.text(DEEPSEEK, new JSONObject("{\"stop_reason\":\"max_tokens\"}")));
        assertThrows(IllegalStateException.class, () -> CloudProtocol.text("https://example.com/v1", new JSONObject("{\"choices\":[{\"finish_reason\":\"length\"}]}")));
        assertEquals(256, CloudProtocol.request(DEEPSEEK, "m", "s", "p", true, -1, true, null).getInt("max_tokens"));
        assertEquals(16384, CloudProtocol.request(DEEPSEEK, "m", "s", "p", true, 99999, true, null).getInt("max_tokens"));
    }
}
