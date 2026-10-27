package expo.modules.callringer

import com.google.firebase.messaging.RemoteMessage
import expo.modules.notifications.service.ExpoFirebaseMessagingService

// 서버가 보낸 전화·사전 알림(data 메시지)은 직접 띄우고, 나머지(선생님 메시지 등)는 expo-notifications에 넘긴다.
class CallMessagingService : ExpoFirebaseMessagingService() {
  override fun onMessageReceived(remoteMessage: RemoteMessage) {
    val data = remoteMessage.data
    if (data["kind"] == "call-review" && remoteMessage.notification == null) {
      val title = data["title"] ?: "베플리 선생님 전화가 왔어요"
      val body = data["message"] ?: ""
      when (data["type"]) {
        "call" -> return CallAlerts.showIncoming(applicationContext, title, body)
        "reminder" -> return CallAlerts.showReminder(applicationContext, title, body)
      }
    }
    super.onMessageReceived(remoteMessage)
  }
}
