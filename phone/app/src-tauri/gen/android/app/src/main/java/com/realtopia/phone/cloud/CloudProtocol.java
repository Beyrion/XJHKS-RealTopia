package com.realtopia.phone.cloud;

import java.net.URI;
import org.json.JSONArray;
import org.json.JSONObject;

/** Pure protocol adapter. No credentials, network or Android state. */
public final class CloudProtocol {
    private CloudProtocol() {}

    public static boolean isAnthropic(String baseUrl) {
        URI uri = URI.create(baseUrl);
        String path = uri.getPath().replaceAll("/+$", "");
        return "api.anthropic.com".equalsIgnoreCase(uri.getHost())
                || path.endsWith("/anthropic") || path.endsWith("/anthropic/v1");
    }

    public static String endpoint(String baseUrl) {
        String base = baseUrl.replaceAll("/+$", "");
        if (!isAnthropic(base)) return base + "/chat/completions";
        return base + (URI.create(base).getPath().endsWith("/v1") ? "/messages" : "/v1/messages");
    }

    public static JSONObject request(String baseUrl, String model, String system,
            String prompt, boolean json, Integer maxTokens, boolean fast, Double temperature) throws org.json.JSONException {
        boolean anthropic = isAnthropic(baseUrl);
        JSONObject body = new JSONObject().put("model", model)
                .put("temperature", Math.max(0.0, Math.min(1.5, temperature == null ? 0.2 : temperature)));
        JSONArray messages = new JSONArray();
        if (anthropic) {
            body.put("system", system);
            body.put("max_tokens", clampTokens(maxTokens == null ? 4096 : maxTokens));
        } else {
            messages.put(new JSONObject().put("role", "system").put("content", system));
            if (json) body.put("response_format", new JSONObject().put("type", "json_object"));
            if (maxTokens != null) body.put("max_completion_tokens", clampTokens(maxTokens));
        }
        messages.put(new JSONObject().put("role", "user").put("content", prompt));
        body.put("messages", messages);
        if (fast) {
            if (anthropic || model.toLowerCase(java.util.Locale.ROOT).startsWith("deepseek")) {
                body.put("thinking", new JSONObject().put("type", "disabled"));
            } else if (model.toLowerCase(java.util.Locale.ROOT).contains("qwen3.8")) {
                body.put("reasoning_effort", "low");
            } else {
                body.put("enable_thinking", false);
            }
        }
        return body;
    }

    public static String text(String baseUrl, JSONObject response) {
        if (isAnthropic(baseUrl)) {
            if ("max_tokens".equals(response.optString("stop_reason"))) {
                throw new IllegalStateException("模型输出达到长度上限，请重试");
            }
            StringBuilder text = new StringBuilder();
            JSONArray blocks = response.optJSONArray("content");
            if (blocks != null) for (int i = 0; i < blocks.length(); i++) {
                JSONObject block = blocks.optJSONObject(i);
                if (block != null && "text".equals(block.optString("type"))) {
                    text.append(block.optString("text", ""));
                }
            }
            return text.toString().trim();
        }
        JSONArray choices = response.optJSONArray("choices");
        JSONObject choice = choices == null ? null : choices.optJSONObject(0);
        if (choice != null && "length".equals(choice.optString("finish_reason"))) {
            throw new IllegalStateException("模型输出达到长度上限，请重试");
        }
        JSONObject message = choice == null ? null : choice.optJSONObject("message");
        return message == null ? "" : message.optString("content", "").trim();
    }

    private static int clampTokens(int tokens) { return Math.max(256, Math.min(16_384, tokens)); }
}
