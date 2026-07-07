package expo.modules.memorytrim

import android.content.ComponentCallbacks2
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MemoryTrimPolicyTest {
    @Test
    fun `foreground pressure levels are left to stock Glide`() {
        assertFalse(MemoryTrimPolicy.shouldFullClear(ComponentCallbacks2.TRIM_MEMORY_RUNNING_MODERATE))
        assertFalse(MemoryTrimPolicy.shouldFullClear(ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW))
        assertFalse(MemoryTrimPolicy.shouldFullClear(ComponentCallbacks2.TRIM_MEMORY_RUNNING_CRITICAL))
    }

    @Test
    fun `ui hidden window full-clears`() {
        assertTrue(MemoryTrimPolicy.shouldFullClear(ComponentCallbacks2.TRIM_MEMORY_UI_HIDDEN))
        assertTrue(MemoryTrimPolicy.shouldFullClear(ComponentCallbacks2.TRIM_MEMORY_BACKGROUND - 1))
    }

    @Test
    fun `background and above are left to stock Glide's own full clear`() {
        assertFalse(MemoryTrimPolicy.shouldFullClear(ComponentCallbacks2.TRIM_MEMORY_BACKGROUND))
        assertFalse(MemoryTrimPolicy.shouldFullClear(ComponentCallbacks2.TRIM_MEMORY_MODERATE))
        assertFalse(MemoryTrimPolicy.shouldFullClear(ComponentCallbacks2.TRIM_MEMORY_COMPLETE))
    }
}
