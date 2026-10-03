package com.realtopia.phone.mood

/** One owner across continuous sensing and explicit mood/legacy recordings. */
internal object MicrophoneLease {
  private var owner: Any? = null
  @Synchronized fun acquire(candidate: Any): Boolean {
    if (owner != null && owner !== candidate) return false
    owner = candidate
    return true
  }
  @Synchronized fun release(candidate: Any) {
    if (owner === candidate) owner = null
  }
}
