package com.desktop.schedule.widget

import android.telephony.PhoneNumberUtils
import java.util.Locale

/**
 * Prefer CallLog.Calls.CACHED_NORMALIZED_NUMBER.
 * Otherwise Android's own E.164 formatter for the device country.
 * Equality is the whole string. The last 11 digits are not a match.
 */
object CallAllowlist {
    fun normalize(raw: String?, cached: String?, countryIso: String): String? {
        val cachedTrimmed = cached?.trim().orEmpty()
        if (cachedTrimmed.isNotEmpty()) return cachedTrimmed
        val source = raw?.trim().orEmpty()
        if (source.isEmpty()) return null
        val country = countryIso.trim().uppercase(Locale.US)
        if (country.isEmpty()) return null
        return try {
            PhoneNumberUtils.formatNumberToE164(source, country)
        } catch (_: RuntimeException) {
            null
        }
    }

    fun matches(
        type: Int,
        durationSeconds: Long,
        raw: String?,
        cached: String?,
        countryIso: String,
        allowlist: Set<String>,
    ): Boolean {
        if (type != 1 && type != 2) return false
        if (durationSeconds <= 0L) return false
        if (allowlist.isEmpty()) return false
        val e164 = normalize(raw, cached, countryIso) ?: return false
        return allowlist.contains(e164)
    }
}
