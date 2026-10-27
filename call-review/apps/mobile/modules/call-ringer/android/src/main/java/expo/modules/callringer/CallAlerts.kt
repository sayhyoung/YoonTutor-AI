package expo.modules.callringer

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.SystemClock
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

// 관리 전화 알림(안드로이드). 서버 푸시(data 메시지)나 앱에서 불러 쓴다.
// - 전화: 잠금 화면 위 전체 화면 + 벨소리·진동 반복. 1분 안에 받지 않으면 부재중 알림으로 바뀐다.
// - 사전 알림: 확인을 누를 때까지 남아 있다.
// - 부재중: "베플리 부재중 전화 N통". 앱을 열면 지운다.
object CallAlerts {
  private const val RING_CHANNEL = "call-ring-v1"
  private const val REMINDER_CHANNEL = "call-reminder-v1"
  private const val MISSED_CHANNEL = "call-missed-v1"

  const val INCOMING_ID = 7101
  const val REMINDER_ID = 7102
  const val MISSED_ID = 7103

  const val ACTION_DECLINE = "expo.modules.callringer.DECLINE"
  const val ACTION_DISMISS_REMINDER = "expo.modules.callringer.DISMISS_REMINDER"
  const val ACTION_RING_TIMEOUT = "expo.modules.callringer.RING_TIMEOUT"

  const val RING_TIMEOUT_MS = 60_000L

  private const val PREFS = "call-ringer"
  private const val KEY_RINGING = "ringing"
  private const val KEY_MISSED = "missedCount"

  // 앱이 떠 있으면 수신 화면을 바로 띄우도록 알린다(CallRingerModule이 등록).
  @Volatile var onIncomingCall: (() -> Unit)? = null

  // expo-notifications 플러그인이 넣은 알림 아이콘(흰색 실루엣). 없으면 앱 아이콘.
  private fun smallIcon(context: Context): Int {
    val id = context.resources.getIdentifier("notification_icon", "drawable", context.packageName)
    return if (id != 0) id else context.applicationInfo.icon
  }

  private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  private fun ensureChannels(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java)
    val ring = NotificationChannel(RING_CHANNEL, "관리 전화 수신", NotificationManager.IMPORTANCE_HIGH).apply {
      description = "베플리 선생님 관리 전화가 오면 벨이 울려요."
      setSound(
        RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE),
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build(),
      )
      enableVibration(true)
      vibrationPattern = longArrayOf(0, 1000, 800, 1000, 800)
      lockscreenVisibility = NotificationCompat.VISIBILITY_PUBLIC
    }
    val reminder = NotificationChannel(REMINDER_CHANNEL, "관리 전화 사전 알림", NotificationManager.IMPORTANCE_HIGH).apply {
      description = "관리 전화 몇 분 전에 알려요."
      enableVibration(true)
      lockscreenVisibility = NotificationCompat.VISIBILITY_PUBLIC
    }
    val missed = NotificationChannel(MISSED_CHANNEL, "부재중 관리 전화", NotificationManager.IMPORTANCE_DEFAULT).apply {
      description = "받지 못한 관리 전화를 알려요."
      lockscreenVisibility = NotificationCompat.VISIBILITY_PUBLIC
    }
    manager.createNotificationChannels(listOf(ring, reminder, missed))
  }

  // 앱(MainActivity)을 딥링크로 연다. 앱의 Linking이 주소를 보고 수신 화면·홈을 연다.
  private fun openApp(context: Context, url: String, requestCode: Int): PendingIntent {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
      .setPackage(context.packageName)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    return PendingIntent.getActivity(context, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  private fun broadcast(context: Context, action: String, requestCode: Int): PendingIntent {
    val intent = Intent(context, CallAlertReceiver::class.java).setAction(action)
    return PendingIntent.getBroadcast(context, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  private fun notify(context: Context, id: Int, builder: NotificationCompat.Builder, insistent: Boolean = false) {
    val manager = NotificationManagerCompat.from(context)
    if (!manager.areNotificationsEnabled()) return
    val notification = builder.build()
    if (insistent) notification.flags = notification.flags or android.app.Notification.FLAG_INSISTENT
    try {
      manager.notify(id, notification)
    } catch (_: SecurityException) {
      // 알림 권한이 없으면 아무것도 띄우지 않는다.
    }
  }

  fun showIncoming(context: Context, title: String, body: String) {
    ensureChannels(context)
    cancel(context, REMINDER_ID)
    val builder = NotificationCompat.Builder(context, RING_CHANNEL)
      .setSmallIcon(smallIcon(context))
      .setContentTitle(title)
      .setContentText(body)
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setOngoing(true)
      .setAutoCancel(false)
      .setTimeoutAfter(RING_TIMEOUT_MS)
      .setFullScreenIntent(openApp(context, "yooncall://incoming-call", 1), true)
      .setContentIntent(openApp(context, "yooncall://incoming-call", 2))
      .addAction(0, "거절", broadcast(context, ACTION_DECLINE, 3))
      .addAction(0, "받기", openApp(context, "yooncall://incoming-call?answer=1", 4))
    prefs(context).edit().putBoolean(KEY_RINGING, true).apply()
    notify(context, INCOMING_ID, builder, insistent = true)
    scheduleTimeout(context)
    onIncomingCall?.invoke()
  }

  // 받거나 거절하면 벨을 멈춘다. 이미 멈췄으면 아무 일도 하지 않는다.
  fun stopRinging(context: Context) {
    prefs(context).edit().putBoolean(KEY_RINGING, false).apply()
    cancel(context, INCOMING_ID)
    val alarm = context.getSystemService(AlarmManager::class.java)
    alarm?.cancel(broadcast(context, ACTION_RING_TIMEOUT, 5))
  }

  fun isRinging(context: Context) = prefs(context).getBoolean(KEY_RINGING, false)

  private fun scheduleTimeout(context: Context) {
    val alarm = context.getSystemService(AlarmManager::class.java) ?: return
    val at = SystemClock.elapsedRealtime() + RING_TIMEOUT_MS
    alarm.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, at, broadcast(context, ACTION_RING_TIMEOUT, 5))
  }

  // 1분 동안 받지 않았으면 벨을 멈추고 부재중 알림을 남긴다.
  fun onRingTimeout(context: Context) {
    if (!isRinging(context)) return
    stopRinging(context)
    val count = prefs(context).getInt(KEY_MISSED, 0) + 1
    prefs(context).edit().putInt(KEY_MISSED, count).apply()
    ensureChannels(context)
    val builder = NotificationCompat.Builder(context, MISSED_CHANNEL)
      .setSmallIcon(smallIcon(context))
      .setContentTitle("베플리 부재중 전화 ${count}통")
      .setContentText("선생님과 약속한 관리 전화를 받지 못했어요. 눌러서 지금 전화해요.")
      .setCategory(NotificationCompat.CATEGORY_MISSED_CALL)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setNumber(count)
      .setAutoCancel(true)
      .setContentIntent(openApp(context, "yooncall://home", 6))
    notify(context, MISSED_ID, builder)
  }

  fun clearMissed(context: Context) {
    prefs(context).edit().putInt(KEY_MISSED, 0).apply()
    cancel(context, MISSED_ID)
  }

  fun showReminder(context: Context, title: String, body: String) {
    ensureChannels(context)
    val builder = NotificationCompat.Builder(context, REMINDER_CHANNEL)
      .setSmallIcon(smallIcon(context))
      .setContentTitle(title)
      .setContentText(body)
      .setCategory(NotificationCompat.CATEGORY_REMINDER)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      // 확인을 누르기 전까지 지워지지 않고, 쓰는 중에는 화면 위에 계속 떠 있다(전체 화면 알림 방식).
      .setOngoing(true)
      .setAutoCancel(true)
      .setFullScreenIntent(openApp(context, "yooncall://home?reminder=1", 7), true)
      .setContentIntent(openApp(context, "yooncall://home?reminder=1", 8))
      .addAction(0, "확인했어요", broadcast(context, ACTION_DISMISS_REMINDER, 9))
    notify(context, REMINDER_ID, builder)
  }

  fun cancel(context: Context, id: Int) {
    NotificationManagerCompat.from(context).cancel(id)
  }

  // 안드로이드 14부터는 전체 화면 알림 권한을 사용자가 끌 수 있다. 꺼져 있으면 일반 알림으로만 온다.
  fun canUseFullScreen(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < 34) return true
    return context.getSystemService(NotificationManager::class.java).canUseFullScreenIntent()
  }
}
