package com.desktop.schedule.widget

import android.graphics.Color
import android.os.Build
import android.util.TypedValue
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
    private const val FAINT = "#9C8F80"
    private const val FAINT_NIGHT = "#857868"
    private const val EMPTY_NONE = "打开小日程，日程会出现在这里"
    private const val EMPTY_STALE = "打开小日程更新"
    const val IDLE = "空闲"

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

    /**
     * narrow：不到约四格宽，两条上下排。short：很矮（约两格高以下），收起次要行，保证中文标题不被裁。
     * night 只给 Android 12 以下用；12 起颜色两套都交给桌面，跟随系统深浅色。
     */
    fun bind(
        views: RemoteViews,
        text: WidgetText,
        narrow: Boolean = false,
        short: Boolean = false,
        night: Boolean = false,
    ) {
        views.setTextViewText(R.id.widget_kicker, text.kicker)
        val crowded = narrow && short && text.lanes.size >= 2
        views.setViewVisibility(R.id.widget_header, if (crowded) View.GONE else View.VISIBLE)
        if (text.empty) {
            views.setViewVisibility(R.id.widget_empty, View.VISIBLE)
            views.setViewVisibility(R.id.widget_body, View.GONE)
            views.setTextViewText(R.id.widget_empty, text.emptyMessage)
            return
        }
        views.setViewVisibility(R.id.widget_empty, View.GONE)
        views.setViewVisibility(R.id.widget_body, View.VISIBLE)
        val two = text.lanes.size >= 2
        views.setViewVisibility(R.id.lane_divider, if (!narrow && two) View.VISIBLE else View.GONE)
        views.setViewVisibility(R.id.lane_rule, if (narrow && two) View.VISIBLE else View.GONE)
        val style = when {
            !two && !narrow -> LaneStyle(if (short) 22f else 26f, if (short) 1 else 2, 12f, meta = true, next = true)
            !two -> LaneStyle(if (short) 18f else 21f, 2, 12f, meta = true, next = false)
            !narrow -> LaneStyle(if (short) 17f else 20f, if (short) 1 else 2, 12f, meta = true, next = !short)
            else -> LaneStyle(if (short) 14f else 16f, 1, if (short) 10f else 11f, meta = !short, next = false)
        }
        bindLane(views, text.lanes[0], SELF_IDS, style, night)
        if (!two) {
            views.setViewVisibility(R.id.lane_partner, View.GONE)
        } else {
            views.setViewVisibility(R.id.lane_partner, View.VISIBLE)
            bindLane(views, text.lanes[1], PARTNER_IDS, style, night)
        }
    }

    private data class LaneStyle(
        val titleSp: Float,
        val titleLines: Int,
        val nameSp: Float,
        val meta: Boolean,
        val next: Boolean,
    )

    private class LaneIds(
        val edge: Int,
        val name: Int,
        val title: Int,
        val meta: Int,
        val time: Int,
        val mark: Int,
        val tag: Int,
        val next: Int,
    )

    private val SELF_IDS = LaneIds(
        R.id.self_edge, R.id.self_name, R.id.self_title, R.id.self_meta,
        R.id.self_time, R.id.self_mark, R.id.self_tag, R.id.self_next,
    )
    private val PARTNER_IDS = LaneIds(
        R.id.partner_edge, R.id.partner_name, R.id.partner_title, R.id.partner_meta,
        R.id.partner_time, R.id.partner_mark, R.id.partner_tag, R.id.partner_next,
    )

    private fun bindLane(views: RemoteViews, lane: WidgetLaneText, ids: LaneIds, style: LaneStyle, night: Boolean) {
        val owner = color(lane.ownerColor, Color.parseColor("#0f766e"))
        val idle = lane.headline == IDLE
        tint(views, ids.edge, "setColorFilter", owner, night)
        views.setTextViewText(ids.name, lane.name)
        views.setTextViewTextSize(ids.name, TypedValue.COMPLEX_UNIT_SP, style.nameSp)
        tint(views, ids.name, "setTextColor", owner, night)
        views.setTextViewText(ids.title, lane.headline)
        if (idle) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                views.setColor(ids.title, "setTextColor", R.color.widget_faint)
            } else {
                views.setTextColor(ids.title, Color.parseColor(if (night) FAINT_NIGHT else FAINT))
            }
        }
        views.setTextViewTextSize(ids.title, TypedValue.COMPLEX_UNIT_SP, if (idle) style.titleSp * 0.82f else style.titleSp)
        views.setInt(ids.title, "setMaxLines", style.titleLines)

        val hasMeta = lane.time.isNotEmpty() || lane.tag.isNotEmpty()
        views.setViewVisibility(ids.meta, if (style.meta && hasMeta) View.VISIBLE else View.GONE)
        views.setTextViewText(ids.time, lane.time)
        views.setViewVisibility(ids.time, if (lane.time.isEmpty()) View.GONE else View.VISIBLE)
        views.setTextViewText(ids.tag, lane.tag)
        if (lane.tag.isEmpty()) {
            views.setViewVisibility(ids.tag, View.GONE)
            views.setViewVisibility(ids.mark, View.GONE)
        } else {
            views.setViewVisibility(ids.tag, View.VISIBLE)
            views.setViewVisibility(ids.mark, View.VISIBLE)
            val tagColor = color(lane.tagColor, Color.parseColor(INK))
            tint(views, ids.tag, "setTextColor", tagColor, night)
            tint(views, ids.mark, "setColorFilter", tagColor, night)
        }
        val next = nextLine(lane.next)
        views.setTextViewText(ids.next, next)
        views.setViewVisibility(ids.next, if (style.next && next.isNotEmpty()) View.VISIBLE else View.GONE)
    }

    /** 「下一程 散步 18:00–19:00」→「接着 · 18:00 散步」：钟点在前，扫一眼就够。 */
    fun nextLine(next: String): String {
        if (!next.startsWith("下一程 ")) return next
        val rest = next.removePrefix("下一程 ")
        val cut = rest.lastIndexOf(' ')
        if (cut <= 0) return "接着 · $rest"
        val title = rest.substring(0, cut)
        val start = rest.substring(cut + 1).substringBefore('–')
        return "接着 · $start  $title"
    }

    private fun tint(views: RemoteViews, id: Int, method: String, color: Int, night: Boolean) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            views.setColorInt(id, method, color, onDark(color))
        } else {
            views.setInt(id, method, if (night) onDark(color) else color)
        }
    }

    /** 深色纸面上把主人色往亮处提一些，保持可读又不刺眼。 */
    fun onDark(color: Int): Int {
        val mix = 0.38f
        val r = Color.red(color) + ((255 - Color.red(color)) * mix)
        val g = Color.green(color) + ((255 - Color.green(color)) * mix)
        val b = Color.blue(color) + ((255 - Color.blue(color)) * mix)
        return Color.rgb(r.toInt(), g.toInt(), b.toInt())
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
        val today = formatDate(nowMs)
        val upcoming = items
            .filter { it.startDate == today && it.startMs > nowMs && it != current }
            .minByOrNull { it.startMs }
        val next = if (upcoming == null) "" else "下一程 ${upcoming.title} ${upcoming.time}"
        if (current != null) {
            return WidgetLaneText(name, color, current.title, current.time, current.tag, current.tagColor, next)
        }
        return WidgetLaneText(name, color, IDLE, "", "", "", next)
    }

    /**
     * 下一次画面会变的时刻：任一段开始或结束、本地零点（「今日下一程」换日）、快照过期。
     * 小组件不靠应用进程，按这个时刻排闹钟重算。
     */
    fun nextBoundary(snapshot: WidgetSnapshot?, nowMs: Long): Long? {
        if (snapshot == null) return null
        var best = Long.MAX_VALUE
        fun consider(t: Long) {
            if (t > nowMs && t < best) best = t
        }
        for (lane in listOf(snapshot.self, snapshot.partner)) {
            for (item in lane) {
                consider(item.startMs)
                consider(item.endMs)
            }
        }
        consider(nextMidnight(nowMs))
        consider(snapshot.untilMs + 1)
        return if (best == Long.MAX_VALUE) null else best
    }

    private fun nextMidnight(ms: Long): Long {
        val cal = Calendar.getInstance()
        cal.timeInMillis = ms
        cal.set(Calendar.HOUR_OF_DAY, 0)
        cal.set(Calendar.MINUTE, 0)
        cal.set(Calendar.SECOND, 0)
        cal.set(Calendar.MILLISECOND, 0)
        cal.add(Calendar.DAY_OF_MONTH, 1)
        return cal.timeInMillis
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
