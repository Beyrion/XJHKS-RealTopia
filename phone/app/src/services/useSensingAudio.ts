import { useEffect, useRef, useState, type RefObject } from "react";
import type { Recording, SensingAudioState } from "../models";
import { nativeService } from "./native";

const idle: SensingAudioState = {
  active: false,
  session_id: 0,
  queued_segments: 0,
  completed_segments: 0,
  dropped_segments: 0,
  last_error: null,
};
let lastSpeakerTurnId = 0;
const speakerTurnId = () =>
  (lastSpeakerTurnId = Math.max(
    2_000_000_000_000_000 + Date.now() * 1000,
    lastSpeakerTurnId + 1,
  ));

/** Keeps acquisition independent from serialized ASR/LLM processing. */
export function useSensingAudio(
  enabled: boolean,
  asrReady: boolean,
  process: (recording: Recording) => Promise<void>,
  activeSession: RefObject<number | null>,
  visionModelId: string | null = null,
  includeSpeakers = false,
  lifecycle?: {
    requested: boolean;
    onStart: (sessionId: number) => void;
    shouldFinalize: (sessionId: number) => boolean;
    onEnd: (sessionId: number) => Promise<void>;
  },
) {
  const [state, setState] = useState(idle);
  const [processing, setProcessing] = useState(false);
  const processRef = useRef(process);
  processRef.current = process;
  const readyRef = useRef(asrReady);
  readyRef.current = asrReady;
  const processingRef = useRef(false);
  const [preparation, setPreparation] =
    useState<SensingAudioState["model_preparation"]>();
  const optionsRef = useRef({ asrReady, visionModelId, includeSpeakers });
  optionsRef.current = { asrReady, visionModelId, includeSpeakers };
  const preparedOptionsRef = useRef("");
  const lifecycleRef = useRef(lifecycle);
  lifecycleRef.current = lifecycle;
  const settlingRef = useRef<Promise<void>>(Promise.resolve());
  const lastStartedRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setState(idle);
      return;
    }
    const sessionId = Date.now();
    const previousSettling = settlingRef.current;
    activeSession.current = sessionId;
    lastStartedRef.current = sessionId;
    lifecycleRef.current?.onStart(sessionId);
    let disposed = false;
    let failed = false;
    let timer: number | undefined;
    let job: Promise<void> = Promise.resolve();
    let polling: Promise<void> = Promise.resolve();
    let finalize = false;
    const processSegment = async (recording: Recording) => {
      processingRef.current = true;
      setProcessing(true);
      try {
        if (!includeSpeakers) return await processRef.current(recording);
        const result = await nativeService.diarizeAudioPath(
          recording.path,
          recording.sample_rate,
          recording.channels,
          sessionId,
        );
        if ((disposed && !finalize) || result.session_id !== sessionId) return;
        for (const turn of result.turns) {
          if (disposed && !finalize) break;
          const id = speakerTurnId();
          await processRef.current({
            ...recording,
            recording_id: id,
            conversation_id: id,
            path: turn.path,
            bytes: turn.bytes,
            duration_ms: turn.duration_ms,
            speaker: {
              id: turn.speaker_id,
              decision: turn.decision,
              similarity: turn.similarity,
              startMs: turn.start_ms,
              endMs: turn.end_ms,
              latencyMs: result.latency_ms,
              sourceRecordingId: recording.recording_id,
            },
          });
        }
      } catch (error) {
        setState((current) => ({ ...current, last_error: String(error) }));
      } finally {
        if (includeSpeakers)
          await nativeService.releaseSpeakerTurns().catch(() => undefined);
        await nativeService
          .acknowledgeSensingAudio(recording.recording_id)
          .catch(() => undefined);
        processingRef.current = false;
        setProcessing(false);
      }
    };
    const tick = async () => {
      if (disposed || failed) return;
      try {
        let snapshot = await nativeService.sensingAudioState(
          !processingRef.current && readyRef.current,
        );
        if (disposed) {
          if (
            snapshot.recording &&
            finalize &&
            snapshot.recording.sensing_session_id === sessionId
          )
            job = processSegment(snapshot.recording);
          else if (snapshot.recording)
            await nativeService.acknowledgeSensingAudio(
              snapshot.recording.recording_id,
            );
          return;
        }
        if (snapshot.active && snapshot.session_id !== sessionId) {
          await nativeService.stopSensingAudio(snapshot.session_id);
          snapshot = { ...snapshot, active: false };
        }
        if (!snapshot.active)
          snapshot = await nativeService.startSensingAudio(sessionId);
        if (disposed) {
          await nativeService.stopSensingAudio(sessionId, finalize);
          return;
        }
        setState(snapshot);
        const recording = snapshot.recording;
        if (recording && recording.sensing_session_id === sessionId) {
          job = processSegment(recording);
        } else if (recording)
          await nativeService.acknowledgeSensingAudio(recording.recording_id);
      } catch (error) {
        if (!disposed) {
          const message =
            error instanceof Error ? error.message : String(error);
          setState((current) => ({
            ...current,
            active: false,
            last_error: message,
          }));
          // Denial must not re-open permission dialogs on every polling tick.
          failed = !/正在停止|正被其他|已有感知/.test(message);
        }
      } finally {
        if (!disposed && !failed)
          timer = window.setTimeout(() => {
            polling = tick();
          }, 500);
      }
    };
    const options = optionsRef.current;
    preparedOptionsRef.current = JSON.stringify(options);
    setPreparation({ loading: true, models: [], elapsed_ms: 0 });
    void settlingRef.current
      .then(() =>
        disposed
          ? null
          : nativeService.prepareSensingModels(
              options.asrReady,
              options.visionModelId,
              options.includeSpeakers,
            ),
      )
      .then((result) => {
        if (!result || disposed) return;
        if (
          includeSpeakers &&
          !result.models.some((m) => m.model_id.startsWith("CAM++") && m.loaded)
        )
          throw new Error("说话人模型未就绪，未启动语音采集");
        if (!disposed) setPreparation({ ...result, loading: false });
      })
      .catch((error: unknown) => {
        if (includeSpeakers) {
          failed = true;
          setState({ ...idle, last_error: String(error) });
        }
        if (!disposed)
          setPreparation({
            loading: false,
            models: [],
            elapsed_ms: 0,
            last_error: String(error),
          });
      })
      .finally(() => {
        if (!disposed && !failed) polling = tick();
      });
    return () => {
      disposed = true;
      finalize = lifecycleRef.current?.shouldFinalize(sessionId) === true;
      if (activeSession.current === sessionId) activeSession.current = null;
      window.clearTimeout(timer);
      setPreparation((current) =>
        current ? { ...current, loading: false } : current,
      );
      const stopped = nativeService.stopSensingAudio(sessionId, finalize);
      const finish = lifecycleRef.current?.onEnd;
      settlingRef.current = (async () => {
        try {
          await stopped;
          await previousSettling;
          await polling;
          await job;
          if (finalize) {
            // Native stop resolves only after its spoken tail has been queued.
            for (;;) {
              const snapshot = await nativeService.sensingAudioState(true);
              if (snapshot.session_id !== sessionId || !snapshot.recording)
                break;
              await processSegment(snapshot.recording);
            }
          }
        } catch (error) {
          setState((current) => ({
            ...current,
            last_error: `收尾转写失败：${String(error)}`,
          }));
        } finally {
          await nativeService
            .stopSensingAudio(sessionId)
            .catch(() => undefined);
          if (includeSpeakers)
            await nativeService.resetSpeakerSession().catch(() => undefined);
        }
      })();
      // New capture waits for audio cleanup, not the cloud summary request.
      void settlingRef.current.then(() =>
        finalize && finish ? finish(sessionId) : undefined,
      );
    };
  }, [enabled, activeSession, includeSpeakers]);
  useEffect(() => {
    // Explicit OFF while already disconnected still summarizes the prior run.
    // Also safe for normal OFF: the ledger's finish is exactly-once.
    const id = lastStartedRef.current;
    if (
      enabled ||
      lifecycle?.requested !== false ||
      id == null ||
      !lifecycleRef.current?.shouldFinalize(id)
    )
      return;
    void settlingRef.current.then(() => lifecycleRef.current?.onEnd(id));
  }, [enabled, lifecycle?.requested]);
  // A newly downloaded/enabled model is prepared without restarting acquisition.
  useEffect(() => {
    if (!enabled || !state.active) return;
    const options = { asrReady, visionModelId, includeSpeakers };
    const key = JSON.stringify(options);
    if (preparedOptionsRef.current === key) return;
    preparedOptionsRef.current = key;
    let disposed = false;
    setPreparation((current) => ({
      models: current?.models ?? [],
      elapsed_ms: 0,
      loading: true,
    }));
    void nativeService
      .prepareSensingModels(asrReady, visionModelId, includeSpeakers)
      .then((result) => {
        if (!disposed) setPreparation({ ...result, loading: false });
      })
      .catch((error: unknown) => {
        if (!disposed)
          setPreparation({
            models: [],
            elapsed_ms: 0,
            loading: false,
            last_error: String(error),
          });
      });
    return () => {
      disposed = true;
    };
  }, [enabled, state.active, asrReady, visionModelId, includeSpeakers]);
  return { ...state, processing, model_preparation: preparation };
}
