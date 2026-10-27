package expo.modules.callringer

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import expo.modules.core.interfaces.Package
import expo.modules.core.interfaces.ReactActivityLifecycleListener
import java.lang.ref.WeakReference

object LockScreen {
  fun isIncomingCall(intent: Intent?) = intent?.data?.let { it.scheme == "yooncall" && it.host == "incoming-call" } == true

  fun apply(activity: Activity, show: Boolean) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      activity.setShowWhenLocked(show)
      activity.setTurnScreenOn(show)
    } else {
      @Suppress("DEPRECATION")
      val flags = WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
      if (show) activity.window.addFlags(flags) else activity.window.clearFlags(flags)
    }
  }
}

// 전화 알림으로 앱이 열리면 잠금을 풀지 않아도 수신 화면이 보이도록 한다.
class CallRingerPackage : Package {
  override fun createReactActivityLifecycleListeners(activityContext: Context?): List<ReactActivityLifecycleListener> =
    listOf(object : ReactActivityLifecycleListener {
      private var activity: WeakReference<Activity>? = null

      override fun onCreate(activity: Activity, savedInstanceState: Bundle?) {
        this.activity = WeakReference(activity)
        if (LockScreen.isIncomingCall(activity.intent)) LockScreen.apply(activity, true)
      }

      override fun onNewIntent(intent: Intent): Boolean {
        val current = activity?.get()
        if (current != null && LockScreen.isIncomingCall(intent)) LockScreen.apply(current, true)
        return false
      }
    })
}
