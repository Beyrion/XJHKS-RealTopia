package com.realtopia.phone

import android.app.Activity
import android.bluetooth.BluetoothManager
import android.content.Intent
import android.os.SystemClock
import android.provider.Settings
import android.util.Log
import androidx.appcompat.app.AppCompatActivity
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File
import java.util.ArrayDeque
import java.util.concurrent.ConcurrentHashMap
import org.json.JSONArray
import org.json.JSONObject

@InvokeArg
class StartTransportArgs {
  lateinit var glassAddress: String
}

@InvokeArg
class PairTransportArgs {
  lateinit var glassAddress: String
}

@InvokeArg
class HudSnapshotArgs { var configJson: String = "" }

@InvokeArg
class CaptureTransportArgs {
  var requestId: Long = 0
  var mode: String = "hot"
  var width: Int = 4032
  var quality: Int = 90
}

@InvokeArg
class PerceptionArgs {
  var enabled: Boolean = false
  var framesPerSecond: Int = 2
  var width: Int = 1280
  var quality: Int = 75
}

@InvokeArg
class RecoverTransportArgs {
  var requestId: Long = 0
  var reason: String = "capture timeout"
}

@InvokeArg
class ShowPersonArgs {
  lateinit var personId: String
  lateinit var name: String
  lateinit var title: String
  var affinity: Int = 0
  lateinit var quest: String
  lateinit var story: String
  var choicesJson: String = ""
}

@TauriPlugin
class RealiaTransportPlugin(private val activity: Activity) : Plugin(activity),
  RokidPhotoTransport.Listener {
  private val lock = Any()
  private val requestedAt = ConcurrentHashMap<Long, Long>()
  private var transport: RokidPhotoTransport? = null
  private var currentGlassAddress = ""
  private var phase = "idle"
  private var transportName = "not connected"
  private var detail = ""
  private var lastError: String? = null
  private var completedCaptures = 0
  private var lastCapture: JSObject? = null
  private var lastRecording: JSObject? = null
  private val pendingRecordings = ArrayDeque<JSObject>()
  private var lastPersonChoice: JSObject? = null
  private var samples = JSONArray()
  private val streamFiles = ArrayDeque<File>()
  private var desiredPerceptionEnabled = false
  private var desiredPerceptionFramesPerSecond = 2
  private var desiredPerceptionWidth = 1280
  private var desiredPerceptionQuality = 75
  @Command
  fun paired(invoke: Invoke) {
    try {
      val manager = activity.getSystemService(BluetoothManager::class.java)
      val devices = JSONArray()
      manager?.adapter?.bondedDevices?.sortedBy { it.name ?: it.address }?.forEach { device ->
        devices.put(JSONObject()
          .put("name", device.name ?: "Rokid Glass")
          .put("address", device.address))
      }
      invoke.resolve(JSObject().apply { put("devices", devices) })
    } catch (error: SecurityException) {
      invoke.reject("需要附近设备权限后才能选择眼镜")
    }
  }

  @Command
  fun pair(invoke: Invoke) {
    try {
      val args = invoke.parseArgs(PairTransportArgs::class.java)
      val adapter = activity.getSystemService(BluetoothManager::class.java)?.adapter
        ?: return invoke.reject("蓝牙不可用")
      val device = adapter.getRemoteDevice(args.glassAddress)
      if (device.bondState == android.bluetooth.BluetoothDevice.BOND_BONDED) {
        invoke.resolve()
        return
      }
      if (device.createBond()) {
        invoke.resolve()
      } else {
        invoke.reject("系统未接受眼镜配对请求")
      }
    } catch (error: IllegalArgumentException) {
      invoke.reject("眼镜蓝牙地址无效")
    } catch (error: SecurityException) {
      invoke.reject("需要附近设备权限后才能配对眼镜")
    }
  }

  @Command
  fun openBluetoothSettings(invoke: Invoke) {
    activity.startActivity(Intent(Settings.ACTION_BLUETOOTH_SETTINGS))
    invoke.resolve()
  }

  @Command
  fun start(invoke: Invoke) {
    val args = invoke.parseArgs(StartTransportArgs::class.java)
    synchronized(lock) {
      val existing = transport
      if (existing != null && currentGlassAddress.equals(args.glassAddress, ignoreCase = true)) {
        // Re-entering the same glasses session is a transport recovery, not a
        // new task. Preserve captures, recordings, choices and pending work.
        existing.ensureConnected()
        phase = if (existing.isReady) "ready" else "p2p_negotiating"
        transportName = if (existing.isReady) "Wi-Fi Direct / TCP" else "CXR Bluetooth"
        detail = if (existing.isReady) "photo socket connected" else "transport still connecting"
      } else {
        existing?.close()
        requestedAt.clear()
        completedCaptures = 0
        lastCapture = null
        lastRecording = null
        pendingRecordings.clear()
        lastPersonChoice = null
        samples = JSONArray()
        synchronized(streamFiles) {
          while (streamFiles.isNotEmpty()) streamFiles.removeFirst().delete()
        }
        lastError = null
        currentGlassAddress = args.glassAddress
        phase = "bt_connecting"
        transportName = "CXR Bluetooth"
        detail = "starting transport"
        transport = RokidPhotoTransport(activity, this).also {
          val debugUuid = if (BuildConfig.DEBUG) activity.intent?.getStringExtra("cxrSocketUuid") else null
          if (debugUuid != null) it.startWithEndpoint(args.glassAddress, debugUuid)
          else it.start(args.glassAddress)
        }
      }
    }
    invoke.resolve(snapshot())
  }

  @Command
  fun syncHud(invoke: Invoke) {
    val args = invoke.parseArgs(HudSnapshotArgs::class.java)
    if (args.configJson.length > 16_384) return invoke.reject("HUD snapshot is too large")
    val accepted = synchronized(lock) { transport }?.syncHud(args.configJson) == true
    invoke.resolve(JSObject().apply { put("accepted", accepted) })
  }

  @Command
  fun capture(invoke: Invoke) {
    val args = invoke.parseArgs(CaptureTransportArgs::class.java)
    val active = synchronized(lock) { transport }
    val sentAt = SystemClock.elapsedRealtime()
    val accepted = active?.requestCapture(
      args.requestId, args.width.coerceIn(1280, 4032),
      args.quality.coerceIn(50, 100), args.mode == "cold"
    ) == true
    if (accepted) {
      requestedAt[args.requestId] = sentAt
      synchronized(lock) {
        phase = "capturing"
        detail = "request #${args.requestId} ${args.mode}"
      }
    }
    val response = JSObject()
    response.put("accepted", accepted)
    response.put("state", snapshot())
    if (accepted) invoke.resolve(response) else invoke.reject("transport is not ready")
  }

  @Command
  fun perception(invoke: Invoke) {
    val args = invoke.parseArgs(PerceptionArgs::class.java)
    val framesPerSecond = args.framesPerSecond.coerceIn(2, 5)
    val width = args.width.coerceIn(1280, 4032)
    val quality = args.quality.coerceIn(50, 100)
    val active = synchronized(lock) {
      transport?.also {
        desiredPerceptionEnabled = args.enabled
        desiredPerceptionFramesPerSecond = framesPerSecond
        desiredPerceptionWidth = width
        desiredPerceptionQuality = quality
      }
    }
    val accepted = active?.setPerception(args.enabled, framesPerSecond, width, quality) == true
    if (!accepted) active?.ensureConnected()
    if (accepted) {
      synchronized(lock) { detail = if (args.enabled) "active capture enabled: 10s interval" else "active capture paused" }
      invoke.resolve(JSObject().apply { put("accepted", true) })
    } else if (active != null) {
      synchronized(lock) {
        detail = if (args.enabled) "active capture queued for reconnect" else "active capture pause queued for reconnect"
      }
      // The desired setting is durable and onPhase("ready") reapplies it. A
      // transient link loss must not make the UI revert the user's toggle.
      invoke.resolve(JSObject().apply { put("accepted", true); put("queued", true) })
    } else invoke.reject("transport has not started")
  }

  @Command
  fun recover(invoke: Invoke) {
    val args = invoke.parseArgs(RecoverTransportArgs::class.java)
    val active = synchronized(lock) {
      requestedAt.remove(args.requestId)
      val current = transport
      if (phase == "capturing") {
        phase = if (current?.isReady == true) "ready" else "p2p_negotiating"
        transportName = if (current?.isReady == true) "Wi-Fi Direct / TCP" else "automatic recovery"
        detail = "capture #${args.requestId} released · ${args.reason}"
      }
      current
    }
    active?.ensureConnected()
    invoke.resolve(snapshot())
  }

  @Command
  fun showPerson(invoke: Invoke) {
    val args = invoke.parseArgs(ShowPersonArgs::class.java)
    val accepted = synchronized(lock) { transport }?.showPerson(
      args.personId, args.name, args.title, args.affinity.coerceIn(-2, 100), args.quest, args.story,
      args.choicesJson,
    ) == true
    if (accepted) invoke.resolve(JSObject().apply { put("accepted", true) })
    else invoke.reject("Bluetooth transport is not ready")
  }

  @Command
  fun state(invoke: Invoke) {
    synchronized(lock) { transport }?.ensureConnected()
    invoke.resolve(snapshot())
  }

  @Command
  fun takeRecording(invoke: Invoke) {
    val recording = synchronized(lock) {
      if (pendingRecordings.isEmpty()) null else pendingRecordings.removeFirst()
    }
    invoke.resolve(JSObject().apply { put("recording", recording ?: JSONObject.NULL) })
  }

  @Command
  fun close(invoke: Invoke) {
    synchronized(lock) {
      transport?.close()
      transport = null
      currentGlassAddress = ""
      phase = "idle"
      transportName = "not connected"
      detail = ""
    }
    invoke.resolve(snapshot())
  }

  override fun onPhase(nextPhase: String, nextTransport: String, nextDetail: String?) {
    var activeToResume: RokidPhotoTransport? = null
    var resumeEnabled = false
    var resumeFramesPerSecond = 2
    var resumeWidth = 1280
    var resumeQuality = 75
    synchronized(lock) {
      phase = nextPhase
      transportName = nextTransport
      detail = nextDetail ?: ""
      if (nextPhase != "error") lastError = null
      if (nextPhase == "ready") {
        activeToResume = transport
        resumeEnabled = desiredPerceptionEnabled
        resumeFramesPerSecond = desiredPerceptionFramesPerSecond
        resumeWidth = desiredPerceptionWidth
        resumeQuality = desiredPerceptionQuality
      }
    }
    Log.i("RealiaTransportPlugin", "STATE phase=$nextPhase transport=$nextTransport detail=$nextDetail")
    if (activeToResume != null) {
      val accepted = activeToResume?.setPerception(
        resumeEnabled, resumeFramesPerSecond, resumeWidth, resumeQuality,
      )
      Log.i("RealiaTransportPlugin", "PERCEPTION_RESUME accepted=$accepted")
    }
  }

  override fun onPhoto(frame: RealiaFrameReader.Frame) {
    val finishedAt = SystemClock.elapsedRealtime()
    val startedAt = requestedAt.remove(frame.requestId())
    val metadata = frame.metadata()
    val stream = metadata.optBoolean("stream", false)
    val automatic = metadata.optBoolean("automatic", false)
    val outputDir = File(activity.getExternalFilesDir(null), "captures").apply { mkdirs() }
    val output = File(outputDir, if (stream) "realia-stream-${frame.requestId()}.jpg" else "realia-${frame.requestId()}.jpg")
    try {
      output.writeBytes(frame.jpeg())
      if (stream || automatic) synchronized(streamFiles) {
        streamFiles.addLast(output)
        while (streamFiles.size > MAX_STREAM_FILES) streamFiles.removeFirst().delete()
      }
      val sample = JSObject()
      sample.put("request_id", frame.requestId())
      sample.put("mode", if (automatic) "interval" else if (stream) "stream" else if (metadata.optBoolean("cold")) "cold" else "hot")
      sample.put("stream", stream)
      sample.put("bytes", frame.jpeg().size)
      sample.put("width", metadata.optInt("width"))
      sample.put("height", metadata.optInt("height"))
      sample.put("rotation_degrees", metadata.optInt("rotationDegrees"))
      sample.put("camera_open_ms", metadata.optLong("cameraOpenMs", -1))
      sample.put("warmup_ms", metadata.optLong("warmupMs", -1))
      sample.put("capture_ms", metadata.optLong("captureMs", -1))
      sample.put("transfer_ms", frame.readFinishedAtMs() - frame.readStartedAtMs())
      sample.put("e2e_ms", if (startedAt == null) -1 else finishedAt - startedAt)
      sample.put("path", output.absolutePath)
      synchronized(lock) {
        completedCaptures += 1
        phase = "ready"
        transportName = "Wi-Fi Direct / TCP"
        detail = "received #${frame.requestId()} · ${frame.jpeg().size} bytes"
        lastCapture = sample
        samples.put(sample)
        while (samples.length() > MAX_REPORT_SAMPLES) samples.remove(0)
        lastError = null
      }
      if (!stream || completedCaptures % STREAM_REPORT_INTERVAL == 0) writeReports()
      Log.i("RealiaE2E", "RECEIVED requestId=${frame.requestId()} e2eMs=${sample.optLong("e2e_ms")}" +
        " transferMs=${sample.optLong("transfer_ms")} bytes=${frame.jpeg().size} path=${output.absolutePath}")
    } catch (error: Exception) {
      onError("capture persistence failed: ${error.message}")
    }
  }

  override fun onAudio(frame: RealiaFrameReader.Frame) {
    val metadata=frame.metadata()
    val outputDir=File(activity.getExternalFilesDir(null),"recordings").apply{mkdirs()}
    val output=File(outputDir,"realtopia-${frame.requestId()}.pcm")
    try{
      output.writeBytes(frame.jpeg())
      val item=JSObject().apply{
        put("recording_id",frame.requestId());put("bytes",frame.jpeg().size)
        put("sample_rate",metadata.optInt("sampleRate",16000));put("channels",metadata.optInt("channels",1))
        put("encoding",metadata.optString("encoding","pcm_s16le"));put("duration_ms",metadata.optLong("durationMs",0))
        put("transfer_ms",frame.readFinishedAtMs()-frame.readStartedAtMs());put("path",output.absolutePath)
        put("partial",metadata.optBoolean("partial",false));put("conversation_id",metadata.optLong("conversationId",frame.requestId()))
        put("sequence",metadata.optInt("sequence",0))
        put("chunk",metadata.optBoolean("chunk",false));put("final_chunk",metadata.optBoolean("finalChunk",false))
      }
      synchronized(lock){
        lastRecording=item
        pendingRecordings.addLast(item)
        if(pendingRecordings.size>MAX_PENDING_RECORDINGS){
          val dropped=pendingRecordings.removeFirst()
          Log.w("RealiaAudio","QUEUE_OVERFLOW dropped recordingId=${dropped.optLong("recording_id")}")
        }
        detail="received recording #${frame.requestId()} · ${frame.jpeg().size} bytes"
        lastError=null
      }
      Log.i("RealiaAudio","RECEIVED recordingId=${frame.requestId()} durationMs=${item.optLong("duration_ms")} bytes=${frame.jpeg().size} path=${output.absolutePath}")
    }catch(error:Exception){onError("recording persistence failed: ${error.message}")}
  }

  override fun onPersonChoice(frame: RealiaFrameReader.Frame) {
    val metadata = frame.metadata()
    val personId = metadata.optString("personId").trim()
    val choiceId = metadata.optString("choiceId").trim()
    val label = metadata.optString("label").trim()
    val choiceIndex = metadata.optInt("choiceIndex", -1)
    val kind = metadata.optString("kind", "person").trim()
    val contextId = metadata.optString("contextId", "").trim()
    if (personId.isEmpty() || personId.length > 128 ||
      !choiceId.matches(Regex("[a-zA-Z0-9_-]{1,64}")) ||
      choiceIndex !in 0..2 || label.isEmpty() || label.length > 32) {
      onError("invalid person choice event #${frame.requestId()}")
      return
    }
    val item = JSObject().apply {
      put("event_id", frame.requestId())
      put("person_id", personId)
      put("choice_index", choiceIndex)
      put("choice_id", choiceId)
      put("label", label)
      put("kind", kind)
      put("context_id", contextId)
      put("input", metadata.optString("input", "rokid_touchpad"))
      put("selected_at_elapsed_ms", metadata.optLong("selectedAtElapsedMs", -1))
      put("received_at_ms", System.currentTimeMillis())
    }
    synchronized(lock) {
      lastPersonChoice = item
      detail = "person choice · $personId / $choiceId"
      lastError = null
    }
    Log.i("RealiaPerson", "CHOICE_RECEIVED eventId=${frame.requestId()} personId=$personId choiceId=$choiceId")
  }

  override fun onError(message: String) {
    synchronized(lock) {
      phase = "error"
      lastError = message
      detail = message
    }
    Log.e("RealiaTransportPlugin", message)
  }

  private fun snapshot(): JSObject = synchronized(lock) {
    JSObject().also {
      it.put("phase", phase)
      it.put("transport", transportName)
      it.put("detail", detail)
      it.put("completed_captures", completedCaptures)
      it.put("last_error", lastError)
      it.put("last_capture", lastCapture)
      // Audio is delivered through takeRecording(), so a burst cannot be
      // collapsed into the latest item by session-state polling.
      it.put("last_recording",JSONObject.NULL)
      it.put("last_person_choice",lastPersonChoice)
    }
  }

  private fun writeReports() {
    val reportDir = File(activity.getExternalFilesDir(null), "reports").apply { mkdirs() }
    val copy = synchronized(lock) { JSONArray(samples.toString()) }
    val json = JSONObject()
      .put("protocol", "REA/1")
      .put("transport", "Wi-Fi Direct / TCP")
      .put("sample_count", copy.length())
      .put("samples", copy)
    File(reportDir, "latest-e2e.json").writeText(json.toString(2))
    val hot = mutableListOf<Long>()
    val markdown = StringBuilder("# RealTopia E2E benchmark\n\n")
      .append("| request | mode | camera open | warmup | capture | transfer | E2E | bytes |\n")
      .append("| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |\n")
    for (index in 0 until copy.length()) {
      val item = copy.getJSONObject(index)
      if (item.optString("mode") == "hot") hot.add(item.optLong("e2e_ms"))
      markdown.append("| ${item.optLong("request_id")} | ${item.optString("mode")} | ")
        .append("${item.optLong("camera_open_ms")} | ${item.optLong("warmup_ms")} | ")
        .append("${item.optLong("capture_ms")} | ${item.optLong("transfer_ms")} | ")
        .append("${item.optLong("e2e_ms")} | ${item.optLong("bytes")} |\n")
    }
    if (hot.isNotEmpty()) {
      hot.sort()
      fun percentile(p: Double): Long = hot[((hot.size - 1) * p).toInt()]
      markdown.append("\nHot E2E: min=${hot.first()} ms, p50=${percentile(0.50)} ms, ")
        .append("p95=${percentile(0.95)} ms, max=${hot.last()} ms.\n")
    }
    File(reportDir, "latest-e2e.md").writeText(markdown.toString())
  }

  override fun onDestroy(activity: AppCompatActivity) {
    synchronized(lock) {
      transport?.close()
      transport = null
    }
  }

  private companion object {
    const val MAX_STREAM_FILES = 24
    const val MAX_PENDING_RECORDINGS = 64
    const val MAX_REPORT_SAMPLES = 200
    const val STREAM_REPORT_INTERVAL = 10
  }
}
