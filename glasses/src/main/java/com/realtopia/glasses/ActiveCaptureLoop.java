package com.realtopia.glasses;

/** Immediate first shot, then fixed cadence without overlap or catch-up bursts. */
final class ActiveCaptureLoop implements AutoCloseable {
    static final long INTERVAL_MS = 10_000;
    static final long FIRST_SHOT_RETRY_MS = 250;
    interface Scheduler {
        void postDelayed(Runnable task, long delayMs);
        void remove(Runnable task);
    }
    interface Target {
        boolean isReady();
        void capture(Runnable finished);
    }
    private final Scheduler scheduler;
    private final Target target;
    private final Runnable tick = this::tick;
    private boolean enabled, busy, firstShotPending;
    private long generation;

    ActiveCaptureLoop(Scheduler scheduler, Target target) {
        this.scheduler = scheduler;
        this.target = target;
    }
    synchronized void setEnabled(boolean next) {
        if (enabled == next) return; // Parameter changes must not reset cadence.
        enabled = next;
        generation++;
        busy = false;
        firstShotPending = next;
        scheduler.remove(tick);
        if (enabled) scheduler.postDelayed(tick, 0);
    }
    private synchronized void tick() {
        if (!enabled) return;
        if (!target.isReady()) {
            // If Wi-Fi Direct/permission is still becoming ready, take the
            // first photo as soon as it is usable rather than waiting 10s.
            scheduler.postDelayed(tick, firstShotPending ? FIRST_SHOT_RETRY_MS : INTERVAL_MS);
            return;
        }
        scheduler.postDelayed(tick, INTERVAL_MS);
        if (busy) return;
        firstShotPending = false;
        busy = true;
        long current = generation;
        try {
            target.capture(() -> finish(current));
        } catch (RuntimeException error) {
            finish(current);
            throw error;
        }
    }
    private synchronized void finish(long current) {
        if (current == generation) busy = false;
    }
    @Override public void close() { setEnabled(false); }
}
