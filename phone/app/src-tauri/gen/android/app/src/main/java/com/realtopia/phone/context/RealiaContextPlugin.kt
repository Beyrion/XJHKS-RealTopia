package com.realtopia.phone.context

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import android.location.LocationManager
import android.provider.CalendarContract
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import app.tauri.annotation.Command
import app.tauri.annotation.Permission
import app.tauri.annotation.PermissionCallback
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import org.json.JSONArray
import org.json.JSONObject

/** Optional real-world context used only to ground local world-event proposals. */
@TauriPlugin(
  permissions = [
    Permission(strings = [Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION], alias = "location"),
    Permission(strings = [Manifest.permission.READ_CALENDAR], alias = "calendar"),
  ],
)
class RealiaContextPlugin(private val activity: Activity) : Plugin(activity) {
  private val worker: ExecutorService = Executors.newSingleThreadExecutor { task ->
    Thread(task, "realtopia-context")
  }

  @Command
  fun snapshot(invoke: Invoke) {
    if (!hasPermissions()) {
      requestPermissionForAliases(arrayOf(LOCATION_ALIAS, CALENDAR_ALIAS), invoke, "permissionResult")
      return
    }
    resolveSnapshotAsync(invoke)
  }

  @PermissionCallback
  fun permissionResult(invoke: Invoke) = resolveSnapshotAsync(invoke)

  private fun hasPermissions() =
    ContextCompat.checkSelfPermission(activity, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED &&
      ContextCompat.checkSelfPermission(activity, Manifest.permission.READ_CALENDAR) == PackageManager.PERMISSION_GRANTED

  private fun resolveSnapshotAsync(invoke: Invoke) {
    worker.execute { resolveSnapshot(invoke) }
  }

  private fun resolveSnapshot(invoke: Invoke) {
    val now = System.currentTimeMillis()
    val location = JSObject()
    try {
      if (ContextCompat.checkSelfPermission(activity, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
        val manager = activity.getSystemService(LocationManager::class.java)
        val best = manager?.getProviders(true)?.mapNotNull { provider ->
          runCatching { manager.getLastKnownLocation(provider) }.getOrNull()
        }?.maxByOrNull { it.time }
        if (best != null) {
          location.put("available", true)
          location.put("latitude", best.latitude)
          location.put("longitude", best.longitude)
          location.put("accuracy_m", best.accuracy.toDouble())
          location.put("observed_at_ms", best.time)
        }
      }
    } catch (_: SecurityException) { }
    if (!location.has("available")) location.put("available", false)

    val calendar = JSONArray()
    try {
      if (ContextCompat.checkSelfPermission(activity, Manifest.permission.READ_CALENDAR) == PackageManager.PERMISSION_GRANTED) {
        val projection = arrayOf(
          CalendarContract.Instances.EVENT_ID,
          CalendarContract.Instances.TITLE,
          CalendarContract.Instances.BEGIN,
          CalendarContract.Instances.END,
          CalendarContract.Instances.EVENT_LOCATION,
        )
        val uri = CalendarContract.Instances.CONTENT_URI.buildUpon()
        android.content.ContentUris.appendId(uri, now - 60 * 60_000L)
        android.content.ContentUris.appendId(uri, now + 24 * 60 * 60_000L)
        activity.contentResolver.query(uri.build(), projection, null, null, CalendarContract.Instances.BEGIN + " ASC")?.use { cursor ->
          while (cursor.moveToNext() && calendar.length() < 8) {
            calendar.put(JSONObject()
              .put("id", cursor.getLong(0).toString())
              .put("title", cursor.getString(1) ?: "未命名日程")
              .put("start_ms", cursor.getLong(2))
              .put("end_ms", cursor.getLong(3))
              .put("location", cursor.getString(4) ?: ""))
          }
        }
      }
    } catch (_: SecurityException) { }
    invoke.resolve(JSObject().apply {
      put("captured_at_ms", now)
      put("location", location)
      put("calendar", calendar)
    })
  }

  override fun onDestroy(activity: AppCompatActivity) {
    worker.shutdownNow()
  }

  companion object {
    private const val LOCATION_ALIAS = "location"
    private const val CALENDAR_ALIAS = "calendar"
  }
}
