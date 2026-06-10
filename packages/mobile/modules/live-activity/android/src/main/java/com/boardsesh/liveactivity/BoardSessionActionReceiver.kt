package com.boardsesh.liveactivity

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Receives the Previous/Next taps from the ongoing session notification and
 * forwards them to SessionPresenceModule as `queueNavigate` events. The Android
 * analogue of the iOS widget's Darwin-notification → JS bridge; the JS-facing
 * payload ({ action, currentIndex, correlationId }) is identical, so
 * live-activity-bridge.tsx handles both platforms with no branching.
 */
class BoardSessionActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = when (intent.action) {
            BoardSessionService.ACTION_NAV_PREVIOUS -> "previous"
            BoardSessionService.ACTION_NAV_NEXT -> "next"
            else -> return
        }
        val currentIndex = intent.getIntExtra(BoardSessionService.EXTRA_CURRENT_INDEX, 0)
        val correlationId = intent.getStringExtra(BoardSessionService.EXTRA_CORRELATION_ID) ?: ""
        SessionPresenceModule.dispatchQueueNavigate(action, currentIndex, correlationId)
    }
}
