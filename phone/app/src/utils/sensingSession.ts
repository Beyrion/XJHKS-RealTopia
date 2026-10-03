/** RAM-only transcript ledger. Closing sessions accept their in-flight ASR only. */
export class SensingSessions {
  private runs = new Map<
    number,
    { closing: boolean; finalized: boolean; entries: Map<number, string> }
  >();
  private order: number[] = [];
  start(id: number, previousId?: number | null) {
    if (!this.runs.has(id)) {
      const previous = previousId == null ? null : this.runs.get(previousId);
      // A reconnect is not an OFF/ON action: keep the same logical transcript.
      this.runs.set(
        id,
        previous && !previous.closing && !previous.finalized
          ? previous
          : { closing: false, finalized: false, entries: new Map() },
      );
      this.order.push(id);
      while (this.order.length > 8) this.runs.delete(this.order.shift()!);
    }
  }
  close(id: number | null) {
    const run = id == null ? null : this.runs.get(id);
    if (!run || run.finalized || run.closing) return false;
    run.closing = true;
    return true;
  }
  isClosing(id: number | undefined) {
    const run = id == null ? null : this.runs.get(id);
    return !!run?.closing && !run.finalized;
  }
  append(id: number, recordingId: number, text: string) {
    const run = this.runs.get(id);
    const clean = text.replace(/\s+/g, " ").trim();
    if (!run || run.finalized || !clean) return;
    run.entries.set(recordingId, clean);
  }
  finish(
    id: number,
  ): { transcript: string; truncated: boolean; count: number } | null {
    const run = this.runs.get(id);
    if (!run?.closing || run.finalized) return null;
    run.finalized = true;
    const full = [...run.entries.values()].join("。\n");
    run.entries.clear();
    return {
      transcript: full.slice(-6000),
      truncated: full.length > 6000,
      count: full ? full.split("。\n").length : 0,
    };
  }
}
