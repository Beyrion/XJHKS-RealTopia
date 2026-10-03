package com.realtopia.phone.mood

import java.util.ArrayDeque

/** Pending audio is bounded; in-flight ASR files survive stop until acknowledged. */
internal class SensingSegmentQueue<T>(private val capacity: Int, private val discard: (T) -> Unit) {
  private val pending = ArrayDeque<T>()
  private val inFlight = mutableMapOf<Long, T>()
  var dropped = 0
    private set
  @Synchronized fun offer(item: T) {
    if (pending.size >= capacity) { discard(pending.removeFirst()); dropped++ }
    pending.addLast(item)
  }
  @Synchronized fun take(id: (T) -> Long): T? {
    if (inFlight.isNotEmpty()) return null
    val item = pending.pollFirst() ?: return null
    inFlight[id(item)] = item
    return item
  }
  @Synchronized fun acknowledge(id: Long) { inFlight.remove(id)?.let(discard) }
  @Synchronized fun clearPending() { while (pending.isNotEmpty()) discard(pending.removeFirst()) }
  @Synchronized fun size(): Int = pending.size
}
