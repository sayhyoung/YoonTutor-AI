package expo.modules.callringer

import android.animation.ValueAnimator
import android.app.Activity
import android.app.KeyguardManager
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import androidx.core.view.WindowCompat
import java.lang.ref.WeakReference

// 잠금 화면에서 관리 전화가 오면 전체 화면 알림으로 띄우는 가벼운 수신 화면.
// - 앱 본체(React Native)가 켜지기를 기다리지 않아 벨과 함께 바로 보인다.
// - 잠금 화면 위 표시·화면 켜기를 매니페스트에 선언한다. 앱 화면이 만들어진 뒤에 코드로 켜면
//   삼성 One UI 7(안드로이드 15)에서는 잠금 화면만 가리고 아무것도 그려지지 않았다.
// - 전화받기: 잠금을 풀게 한 뒤 앱의 통화를 연다. 나중에: 벨을 멈춘다.
class IncomingCallActivity : Activity() {
  private var pulse: ValueAnimator? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    // 벨이 이미 멈췄으면(받기·거절·시간 초과) 띄우지 않는다.
    if (!CallAlerts.isRinging(this)) {
      finish()
      return
    }
    showOverLockScreen()
    setContentView(R.layout.call_ringer_incoming)
    WindowCompat.getInsetsController(window, window.decorView).apply {
      isAppearanceLightStatusBars = true
      isAppearanceLightNavigationBars = true
    }
    findViewById<View>(R.id.call_ringer_avatar).clipToOutline = true
    findViewById<View>(R.id.call_ringer_answer).setOnClickListener { answer() }
    findViewById<View>(R.id.call_ringer_later).setOnClickListener { later() }
    startPulse(findViewById(R.id.call_ringer_pulse))
    current = WeakReference(this)
  }

  override fun onResume() {
    super.onResume()
    if (!CallAlerts.isRinging(this)) finish()
  }

  override fun onDestroy() {
    pulse?.cancel()
    pulse = null
    if (current?.get() === this) current = null
    super.onDestroy()
  }

  // 매니페스트 선언(showWhenLocked·turnScreenOn)을 못 읽는 안드로이드 8.0 이하도 같은 동작을 하게 한다.
  private fun showOverLockScreen() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
    }
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
  }

  // 베플리 둘레의 동그라미가 퍼지며 흐려진다(앱 수신 화면의 물결과 같은 느낌).
  private fun startPulse(ring: View) {
    pulse = ValueAnimator.ofFloat(0f, 1f).apply {
      duration = 1600
      repeatCount = ValueAnimator.INFINITE
      addUpdateListener { animator ->
        val progress = animator.animatedValue as Float
        val scale = 0.78f + 0.22f * progress
        ring.scaleX = scale
        ring.scaleY = scale
        ring.alpha = 1f - progress
      }
      start()
    }
  }

  private fun answer() {
    val keyguard = getSystemService(KeyguardManager::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && keyguard?.isKeyguardLocked == true) {
      // 잠금(PIN·패턴·지문)을 풀면 통화를 연다. 취소하면 이 화면에 남고 벨도 계속 울린다.
      keyguard.requestDismissKeyguard(
        this,
        object : KeyguardManager.KeyguardDismissCallback() {
          override fun onDismissSucceeded() = openCall()

          override fun onDismissError() = openCall()
        },
      )
    } else {
      openCall()
    }
  }

  private fun openCall() {
    if (isFinishing) return
    // 벨소리만 멈추고 '울리는 중' 상태는 남긴다. 앱이 받기를 처리하면서 정리하고,
    // 혹시 받기 주소를 놓쳐도 앱 홈이 울리는 중인 전화를 보고 수신 화면을 띄운다.
    CallAlerts.silence(this)
    startActivity(
      Intent(Intent.ACTION_VIEW, Uri.parse("yooncall://incoming-call?answer=1"))
        .setPackage(packageName)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
    )
    finish()
  }

  private fun later() {
    CallAlerts.stopRinging(this)
    finish()
  }

  companion object {
    @Volatile private var current: WeakReference<IncomingCallActivity>? = null

    // 벨이 멈추면(거절·시간 초과·앱에서 받기) 떠 있는 수신 화면을 닫는다.
    fun close() {
      current?.get()?.let { activity -> activity.runOnUiThread { activity.finish() } }
    }
  }
}
