package expo.modules.callringer

import android.content.Intent
import android.os.Build
import android.provider.Settings
import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class CallRingerModule : Module() {
  private val context get() = requireNotNull(appContext.reactContext)

  override fun definition() = ModuleDefinition {
    Name("CallRinger")

    Events("onIncomingCall")

    OnCreate {
      CallAlerts.onIncomingCall = { sendEvent("onIncomingCall", emptyMap<String, Any>()) }
    }

    OnDestroy {
      CallAlerts.onIncomingCall = null
    }

    // 앱이 기기 알림으로 전화를 울릴 때(서버 푸시가 없는 기기 일정 등).
    Function("showIncomingCall") { title: String, body: String ->
      CallAlerts.showIncoming(context, title, body)
    }

    Function("stopRinging") {
      CallAlerts.stopRinging(context)
    }

    Function("isRinging") {
      CallAlerts.isRinging(context)
    }

    Function("clearMissedCalls") {
      CallAlerts.clearMissed(context)
    }

    Function("dismissReminder") {
      CallAlerts.cancel(context, CallAlerts.REMINDER_ID)
    }

    Function("canUseFullScreen") {
      CallAlerts.canUseFullScreen(context)
    }

    // 안드로이드 14 이상에서 전체 화면 알림이 꺼져 있을 때 설정 화면을 연다.
    Function("openFullScreenSettings") {
      val intent = if (Build.VERSION.SDK_INT >= 34) {
        Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:${context.packageName}"))
      } else {
        Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
      }
      context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    // 통화가 끝나면 잠금 화면 위 표시를 끈다(전화로 열린 동안만 켠다).
    Function("setShowOverLockScreen") { show: Boolean ->
      appContext.currentActivity?.let { activity -> activity.runOnUiThread { LockScreen.apply(activity, show) } }
    }
  }
}
