package expo.modules.callringer

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

// 알림 버튼(거절·확인)과 벨 시간 초과를 처리한다.
class CallAlertReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      CallAlerts.ACTION_DECLINE -> CallAlerts.stopRinging(context)
      CallAlerts.ACTION_DISMISS_REMINDER -> CallAlerts.cancel(context, CallAlerts.REMINDER_ID)
      CallAlerts.ACTION_RING_TIMEOUT -> CallAlerts.onRingTimeout(context)
    }
  }
}
