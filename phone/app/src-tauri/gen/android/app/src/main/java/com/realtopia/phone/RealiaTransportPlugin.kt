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
import java.util.concurrent.ConcurrentHashMap
import org.json.JSONArray
import org.json.JSONObject

@InvokeArg
class StartTransportArgs {
  lateinit var glassAddress: String
}

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
  var intervalSeconds: Int = 15
  var width: Int = 4032
  var quality: Int = 90
}

@InvokeArg
class ShowPersonArgs {
  lateinit var personId: String
  lateinit var name: String
  lateinit var title: String
  var affinity: Int = 0
  lateinit var quest: String
  lateinit var story: String
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
  private var samples = JSONArray()

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
  fun openBluetoothSettings(invoke: Invoke) {
    activity.startActivity(Intent(Settings.ACTION_BLUETOOTH_SETTINGS))
    invoke.resolve()
  }

  @Command
  fun start(invoke: Invoke) {
    val args = invoke.parseArgs(StartTransportArgs::class.java)
    synchronized(lock) {
      requestedAt.clear()
      completedCaptures = 0
      lastCapture = null
      lastRecording = null
      samples = JSONArray()
      lastError = null
      val existing = transport
      if (existing != null && currentGlassAddress.equals(args.glassAddress, ignoreCase = true)) {
        phase = if (existing.isReady) "ready" else "p2p_negotiating"
        transportName = if (existing.isReady) "Wi-Fi Direct / TCP" else "CXR Bluetooth"
        detail = if (existing.isReady) "photo socket connected" else "transport still connecting"
      } else {
        existing?.close()
        currentGlassAddress = args.glassAddress
        phase = "bt_connecting"
        transportName = "CXR Bluetooth"
        detail = "starting transport"
        transport = RokidPhotoTransport(activity, this).also { it.start(args.glassAddress) }
      }
    }
    invoke.resolve(snapshot())
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
    val accepted = synchronized(lock) { transport }?.setPerception(
      args.enabled, args.intervalSeconds.coerceIn(5, 300),
      args.width.coerceIn(1280, 4032), args.quality.coerceIn(50, 100)
    ) == true
    if (accepted) {
      synchronized(lock) { detail = if (args.enabled) "continuous perception enabled" else "continuous perception paused" }
      invoke.resolve(JSObject().apply { put("accepted", true) })
    } else invoke.reject("transport is not ready")
  }

  @Command
  fun showPerson(invoke: Invoke) {
    val args = invoke.parseArgs(ShowPersonArgs::class.java)
    val accepted = synchronized(lock) { transport }?.showPerson(
      args.personId, args.name, args.title, args.affinity.coerceIn(0, 100), args.quest, args.story
    ) == true
    if (accepted) invoke.resolve(JSObject().apply { put("accepted", true) })
    else invoke.reject("Bluetooth transport is not ready")
  }

  @Command
  fun state(invoke: Invoke) = invoke.resolve(snapshot())

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
    synchronized(lock) {
      phase = nextPhase
      transportName = nextTransport
      detail = nextDetail ?: ""
      if (nextPhase != "error") lastError = null
    }
    Log.i("RealiaTransportPlugin", "STATE phase=$nextPhase transport=$nextTransport detail=$nextDetail")
  }

  override fun onPhoto(frame: RealiaFrameReader.Frame) {
    val finishedAt = SystemClock.elapsedRealtime()
    val startedAt = requestedAt.remove(frame.requestId())
    val metadata = frame.metadata()
    val outputDir = File(activity.getExternalFilesDir(null), "captures").apply { mkdirs() }
    val output = File(outputDir, "realia-${frame.requestId()}.jpg")
    try {
      output.writeBytes(frame.jpeg())
      val sample = JSObject()
      sample.put("request_id", frame.requestId())
      sample.put("mode", if (metadata.optBoolean("cold")) "cold" else "hot")
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
        lastError = null
      }
      writeReports()
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
      }
      synchronized(lock){lastRecording=item;detail="received recording #${frame.requestId()} · ${frame.jpeg().size} bytes";lastError=null}
      Log.i("RealiaAudio","RECEIVED recordingId=${frame.requestId()} durationMs=${item.optLong("duration_ms")} bytes=${frame.jpeg().size} path=${output.absolutePath}")
    }catch(error:Exception){onError("recording persistence failed: ${error.message}")}
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
      it.put("last_recording",lastRecording)
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
}
