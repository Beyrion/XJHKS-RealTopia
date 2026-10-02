import { useCallback, useState } from "react";
import { moodProfiles } from "../data/appData";
import type { MoodPhase } from "../models";
import { nativeService } from "../services/native";
import { useAppStore } from "../store/AppStore";
import { analyzeMood } from "../utils/moodPlanner";
import { sanitizeText } from "../utils/text";

export function useMoodCheckIn() {
  const { currentMood, updateMood, updateMemories, addLog } = useAppStore();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<MoodPhase>("idle");
  const [error, setError] = useState("");

  const show = useCallback(() => {
    setOpen(true);
    setPhase("idle");
    setError("");
  }, []);

  const start = useCallback(async () => {
    setError("");
    setPhase("listening");
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 250));
      const speech = await nativeService.listenMood();
      const transcript = sanitizeText(speech.transcript).slice(0, 4_000);
      if (!transcript) throw new Error("没有听清，请再说一次");
      setPhase("analyzing");
      const { analysis, model } = await analyzeMood(transcript);
      updateMood({
        ...analysis,
        transcript,
        model: model.model,
        analyzedAt: new Date().toISOString(),
      });
      const profile = moodProfiles[analysis.mood];
      updateMemories((items) => [
        {
          id: `mood-${Date.now()}`,
          time: new Date().toLocaleTimeString("zh-CN", {
            hour: "2-digit",
            minute: "2-digit",
          }),
          title: `心情 · ${profile.label}`,
          meta: `强度 ${analysis.intensity} · ${model.model}`,
          kind: "mood",
          summary: analysis.summary,
          transcript,
          mood: analysis.mood,
          intensity: analysis.intensity,
        },
        ...items,
      ]);
      addLog(
        `心情分析完成 · ${profile.label} ${analysis.intensity} · ${model.latencyMs}ms`,
      );
      setPhase("result");
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      if (message.includes("心情语音已取消")) {
        setPhase("idle");
        return;
      }
      setError(message || "心情分析失败");
      setPhase("error");
    }
  }, [addLog, updateMemories, updateMood]);

  const cancel = useCallback(async () => {
    setPhase("idle");
    await nativeService.cancelMoodListen().catch(() => undefined);
  }, []);

  const finishListening = useCallback(async () => {
    try {
      await nativeService.finishMoodListen();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setPhase("error");
    }
  }, []);

  const close = useCallback(() => {
    if (phase === "listening")
      void nativeService.cancelMoodListen().catch(() => undefined);
    setOpen(false);
    setPhase("idle");
  }, [phase]);

  return {
    currentMood,
    open,
    phase,
    error,
    show,
    start,
    cancel,
    finishListening,
    close,
  };
}
