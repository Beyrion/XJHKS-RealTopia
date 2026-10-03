package com.realtopia.phone.mood

import org.junit.Assert.*
import org.junit.Test

class SensingSegmentQueueTest {
  @Test fun boundsPendingAndDiscardsOldest() {
    val deleted = mutableListOf<Long>()
    val queue = SensingSegmentQueue<Long>(2) { deleted.add(it) }
    queue.offer(1); queue.offer(2); queue.offer(3)
    assertEquals(listOf(1L), deleted); assertEquals(1, queue.dropped)
    assertEquals(2L, queue.take { it }); assertNull(queue.take { it })
    queue.acknowledge(2); assertEquals(3L, queue.take { it })
  }
  @Test fun stopClearsPendingButKeepsFileInFlightUntilAcknowledged() {
    val deleted = mutableListOf<Long>()
    val queue = SensingSegmentQueue<Long>(2) { deleted.add(it) }
    queue.offer(1); queue.offer(2); queue.take { it }; queue.clearPending()
    assertEquals(listOf(2L), deleted); queue.acknowledge(1)
    assertEquals(listOf(2L, 1L), deleted)
  }
  @Test fun microphoneLeaseCannotBeStolenOrReleasedByOtherOwner() {
    val first = Any(); val second = Any()
    assertTrue(MicrophoneLease.acquire(first)); assertFalse(MicrophoneLease.acquire(second))
    MicrophoneLease.release(second); assertFalse(MicrophoneLease.acquire(second))
    MicrophoneLease.release(first); assertTrue(MicrophoneLease.acquire(second)); MicrophoneLease.release(second)
  }
}
