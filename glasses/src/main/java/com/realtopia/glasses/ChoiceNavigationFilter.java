package com.realtopia.glasses;

/** One gesture can emit RIGHT + DOWN + touch events. Debounce across all sources. */
final class ChoiceNavigationFilter {
    static final long QUIET_GAP_MS=500;
    private long lastEventMs=-QUIET_GAP_MS;

    boolean accept(long nowMs,boolean repeated){
        boolean quiet=nowMs-lastEventMs>=QUIET_GAP_MS;
        // Extend the quiet window on every event, so a long repeat burst still
        // counts as one swipe instead of retriggering every 500 ms.
        lastEventMs=nowMs;
        return !repeated&&quiet;
    }
}
