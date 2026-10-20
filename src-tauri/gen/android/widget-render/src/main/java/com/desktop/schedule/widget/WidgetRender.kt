package com.desktop.schedule.widget

import android.graphics.Color
import android.view.View
import android.widget.RemoteViews
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject
import java.util.Calendar

data class WidgetOccurrence(
    val startMs: Long,
    val endMs: Long,
    val startDate: String,
    val sortKey: String,
    val title: String,
    val time: String,
    val tag: String,
    val tagColor: String,
)

data class WidgetSnapshot(
    val version: Int,
    val untilMs: Long,
    val selfName: String,
    val partnerName: String,
    val selfColor: String,
    val partnerColor: String,
    val self: List<WidgetOccurrence>,
    val partner: List<WidgetOccurrence>,
)

data class WidgetLaneText(
    val name: String,
    val ownerColor: String,
    val headline: String,
    val time: String,
    val tag: String,
    val tagColor: String,
    val next: String,
)

data class WidgetText(
    val mode: String,
    val kicker: String,
    val empty: Boolean,
    val emptyMessage: String,
    val lanes: List<WidgetLaneText>,
)

/** 与 src/lib/widget-snapshot.ts 的 renderHomeWidget 同一规则。 */
object WidgetRender {
    private const val INK = "#1C1612"
    private const val EMPTY_NONE = "打开小日程，日程会出现在这里"
    private const val EMPTY_STALE = "打开小日程更新"

    fun parse(json: String): WidgetSnapshot? {
        return try {
            val root = JSONObject(json)
            if (root.optInt("version") != 1) return null
            WidgetSnapshot(
                version = 1,
                untilMs = root.optLong("untilMs"),
                selfName = root.optString("selfName", "我"),
                partnerName = root.optString("partnerName", "对方"),
                selfColor = root.optString("selfColor", "#0f766e"),
                partnerColor = root.optString("partnerColor", "#a21caf"),
                self = occurrences(root.optJSONArray("self")),
                partner = occurrences(root.optJSONArray("partner")),
            )
        } catch (_: JSONException) {
            null
        }
    }

    fun render(snapshot: WidgetSnapshot?, mode: String, nowMs: Long): WidgetText {
        val resolved = if (mode == "self" || mode == "partner" || mode == "both") mode else "both"
        val kicker = when (resolved) {
            "self" -> "自己"
            "partner" -> "对方"
            else -> "双方"
        }
        if (snapshot == null || snapshot.version != 1) {
            return WidgetText(resolved, kicker, true, EMPTY_NONE, emptyList())
        }
        if (nowMs > snapshot.untilMs) {
            return WidgetText(resolved, kicker, true, EMPTY_STALE, emptyList())
        }
        val self = lane(snapshot.selfName, snapshot.selfColor, snapshot.self, nowMs)
        val partner = lane(snapshot.partnerName, snapshot.partnerColor, snapshot.partner, nowMs)
        val lanes = when (resolved) {
            "self" -> listOf(self)
            "partner" -> listOf(partner)
            else -> listOf(self, partner)
        }
        return WidgetText(resolved, kicker, false, "", lanes)
    }

    fun bind(views: RemoteViews, text: WidgetText) {
        views.setTextViewText(R.id.widget_kicker, text.kicker)
        if (text.empty) {
            views.setViewVisibility(R.id.widget_empty, View.VISIBLE)
            views.setViewVisibility(R.id.widget_body, View.GONE)
            views.setTextViewText(R.id.widget_empty, text.emptyMessage)
            return
        }
        views.setViewVisibility(R.id.widget_empty, View.GONE)
        views.setViewVisibility(R.id.widget_body, View.VISIBLE)
        bindLane(
            views,
            text.lanes[0],
            R.id.self_edge,
            R.id.self_name,
            R.id.self_title,
            R.id.self_time,
            R.id.self_tag,
            R.id.self_next,
        )
        if (text.lanes.size < 2) {
            views.setViewVisibility(R.id.lane_partner, View.GONE)
        } else {
            views.setViewVisibility(R.id.lane_partner, View.VISIBLE)
            bindLane(
                views,
                text.lanes[1],
                R.id.partner_edge,
                R.id.partner_name,
                R.id.partner_title,
                R.id.partner_time,
                R.id.partner_tag,
                R.id.partner_next,
            )
        }
    }

    private fun bindLane(
        views: RemoteViews,
        lane: WidgetLaneText,
        edge: Int,
        name: Int,
        title: Int,
        time: Int,
        tag: Int,
        next: Int,
    ) {
        views.setInt(edge, "setBackgroundColor", color(lane.ownerColor, Color.parseColor("#0f766e")))
        views.setTextViewText(name, lane.name)
        views.setTextViewText(title, lane.headline)
        views.setTextViewText(time, lane.time)
        views.setViewVisibility(time, if (lane.time.isEmpty()) View.GONE else View.VISIBLE)
        views.setTextViewText(tag, lane.tag)
        if (lane.tag.isEmpty()) {
            views.setViewVisibility(tag, View.GONE)
        } else {
            views.setViewVisibility(tag, View.VISIBLE)
            views.setTextColor(tag, color(lane.tagColor, Color.parseColor(INK)))
        }
        views.setTextViewText(next, lane.next)
        views.setViewVisibility(next, if (lane.next.isEmpty()) View.GONE else View.VISIBLE)
    }

    private fun lane(
        name: String,
        color: String,
        items: List<WidgetOccurrence>,
        nowMs: Long,
    ): WidgetLaneText {
        val current = items
            .filter { it.startMs <= nowMs && nowMs < it.endMs }
            .minWithOrNull(compareBy({ it.sortKey }, { it.startMs }))
        if (current != null) {
            return WidgetLaneText(name, color, current.title, current.time, current.tag, current.tagColor, "")
        }
        val today = formatDate(nowMs)
        val upcoming = items
            .filter { it.startDate == today && it.startMs > nowMs }
            .minByOrNull { it.startMs }
        val next = if (upcoming == null) "" else "下一程 ${upcoming.title} ${upcoming.time}"
        return WidgetLaneText(name, color, "空闲", "", "", "", next)
    }

    private fun occurrences(array: JSONArray?): List<WidgetOccurrence> {
        if (array == null) return emptyList()
        val out = ArrayList<WidgetOccurrence>(array.length())
        for (i in 0 until array.length()) {
            val item = array.optJSONObject(i) ?: continue
            out.add(
                WidgetOccurrence(
                    startMs = item.optLong("startMs"),
                    endMs = item.optLong("endMs"),
                    startDate = item.optString("startDate"),
                    sortKey = item.optString("sortKey"),
                    title = item.optString("title"),
                    time = item.optString("time"),
                    tag = item.optString("tag"),
                    tagColor = item.optString("tagColor"),
                ),
            )
        }
        return out
    }

    private fun formatDate(ms: Long): String {
        val cal = Calendar.getInstance()
        cal.timeInMillis = ms
        return "%04d-%02d-%02d".format(
            cal.get(Calendar.YEAR),
            cal.get(Calendar.MONTH) + 1,
            cal.get(Calendar.DAY_OF_MONTH),
        )
    }

    private fun color(hex: String, fallback: Int): Int {
        return try {
            Color.parseColor(hex)
        } catch (_: IllegalArgumentException) {
            fallback
        }
    }
}
