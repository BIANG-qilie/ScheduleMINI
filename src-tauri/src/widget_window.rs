//! 悬浮窗显示 / 收起策略。
//!
//! ## 0.3.0 最小化后再也出不来
//!
//! 设置「打开悬浮窗」和托盘右键都调用 `reveal_widget`。旧顺序在
//! `unminimize` 之前先 `set_always_on_top(true)`。Windows 上改置顶会顺手
//! `ShowWindow(SW_SHOW)`：还缩在任务栏里的窗口会被清掉「已最小化」，
//! 但并没有展开。后面的 `unminimize` 看到它已经不是最小化，就跳过
//! `SW_RESTORE`。两条入口因此都没有窗口可看。
//!
//! 拉起必须先 `skip_taskbar(false)`，再 unminimize，若外接矩形仍在所有
//! 显示器之外就搬回工作区，然后 show/focus，最后才置顶并重新跳过任务栏。
//! `hide()` 后的 WebView2 假死仍用 minimize 收起，不用 hide。
//!
//! ## 窗口停在屏幕外
//!
//! `is_visible && !is_minimized` 不够。Windows 可以把窗口停在
//! (-32000, -32000)，`showCmd` 仍是 `SW_SHOWNORMAL`，既不最小化也不在任何
//! 显示器上。这种窗口要当成没打开：先搬到最近一块显示器的工作区左上角，再显示。

/// 与前端 `widget-visibility-changed`、设置页按钮共用的事件名。
pub const WIDGET_VISIBILITY_EVENT: &str = "widget-visibility-changed";

/// 物理像素里的矩形。显示器范围用整块屏幕，不扣任务栏。
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ScreenRect {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

/// 一块显示器的完整范围，以及去掉任务栏之后的工作区。
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct MonitorLayout {
    pub bounds: ScreenRect,
    pub work: ScreenRect,
}

/// 和每一块显示器都没有正面积重叠，就是屏幕外。
/// 边只贴着不算在屏幕上。没有显示器数据时无法证明，不当成屏幕外。
/// 与 `src/lib/widget-placement.ts` 的 `isWidgetRectOnScreen` 同一条规则。
pub fn widget_rect_on_screen(widget: ScreenRect, monitors: &[ScreenRect]) -> bool {
    if monitors.is_empty() {
        return true;
    }
    if !positive_rect(widget) {
        return false;
    }
    monitors
        .iter()
        .any(|monitor| positive_area_overlap(widget, *monitor))
}

/// 可见、没最小化、并且外接矩形确实落在某块显示器上。
pub fn widget_is_presented(visible: bool, minimized: bool, on_screen: bool) -> bool {
    visible && !minimized && on_screen
}

/// 托盘「显示/隐藏」：只有真正开在屏幕上时才收起。
pub fn should_conceal_widget(visible: bool, minimized: bool, on_screen: bool) -> bool {
    widget_is_presented(visible, minimized, on_screen)
}

/// 屏幕外窗口要搬到的位置。已经在某块显示器上时返回 `None`。
///
/// 落点是最近一块显示器的工作区左上角。程序没有给悬浮窗写死坐标，
/// 第一次出现时系统也把它放在主屏工作区的左上角附近。
/// 距离相同用数组里更靠前的那块；调用方应把主屏放在第一位。
/// 与 `nearestWorkAreaOrigin` 同一条规则。
pub fn nearest_work_area_origin(
    widget: ScreenRect,
    monitors: &[MonitorLayout],
) -> Option<(i32, i32)> {
    if monitors.is_empty() || widget_rect_on_screen(widget, &bounds_of(monitors)) {
        return None;
    }
    let mut best = 0usize;
    let mut best_gap = gap_squared(widget, monitors[0].bounds);
    for (index, monitor) in monitors.iter().enumerate().skip(1) {
        let gap = gap_squared(widget, monitor.bounds);
        if gap < best_gap {
            best = index;
            best_gap = gap;
        }
    }
    Some((monitors[best].work.x, monitors[best].work.y))
}

fn bounds_of(monitors: &[MonitorLayout]) -> Vec<ScreenRect> {
    monitors.iter().map(|monitor| monitor.bounds).collect()
}

fn positive_rect(rect: ScreenRect) -> bool {
    rect.width > 0 && rect.height > 0
}

fn positive_area_overlap(a: ScreenRect, b: ScreenRect) -> bool {
    if !positive_rect(b) {
        return false;
    }
    let overlap_w = (a.x as i64 + a.width as i64).min(b.x as i64 + b.width as i64)
        - (a.x as i64).max(b.x as i64);
    let overlap_h = (a.y as i64 + a.height as i64).min(b.y as i64 + b.height as i64)
        - (a.y as i64).max(b.y as i64);
    overlap_w > 0 && overlap_h > 0
}

fn gap_squared(a: ScreenRect, b: ScreenRect) -> i64 {
    let ax2 = a.x as i64 + a.width as i64;
    let ay2 = a.y as i64 + a.height as i64;
    let bx2 = b.x as i64 + b.width as i64;
    let by2 = b.y as i64 + b.height as i64;
    let dx = if ax2 < b.x as i64 {
        b.x as i64 - ax2
    } else if bx2 < a.x as i64 {
        a.x as i64 - bx2
    } else {
        0
    };
    let dy = if ay2 < b.y as i64 {
        b.y as i64 - ay2
    } else if by2 < a.y as i64 {
        a.y as i64 - by2
    } else {
        0
    };
    dx * dx + dy * dy
}

/// 拉起小窗时的步骤（供回归测试锁定顺序）。
/// 置顶必须在 unminimize 之后。之前插入置顶会让 Windows 用 SW_SHOW
/// 把最小化标记清掉，还原就被跳过。
/// 停在屏幕外的窗口要在 show 之前搬回工作区。
pub const REVEAL_STEPS: &[&str] = &[
    "set_skip_taskbar(false)",
    "unminimize",
    "move_onto_screen",
    "show",
    "set_focus",
    "set_always_on_top(true)",
    "set_skip_taskbar(true)",
];

/// 0.3.0 实际发出的顺序：unminimize 之前先置顶。回归测试用它证明窗口出不来。
pub const REVEAL_STEPS_BROKEN_0_3_0: &[&str] = &[
    "set_skip_taskbar(false)",
    "set_always_on_top(true)",
    "unminimize",
    "show",
    "set_focus",
    "set_always_on_top(true)",
    "set_skip_taskbar(true)",
];

/// Windows 上收起小窗时的步骤：避免 hide()。
pub const CONCEAL_STEPS_WINDOWS: &[&str] = &[
    "set_always_on_top(false)",
    "set_skip_taskbar(true)",
    "minimize",
];

#[cfg(test)]
mod tests {
    use super::*;

    fn rect(x: i32, y: i32, width: i32, height: i32) -> ScreenRect {
        ScreenRect {
            x,
            y,
            width,
            height,
        }
    }

    fn layout(bounds: ScreenRect, work: ScreenRect) -> MonitorLayout {
        MonitorLayout { bounds, work }
    }

    #[test]
    fn conceal_only_when_shown_on_screen_and_not_minimized() {
        assert!(should_conceal_widget(true, false, true));
        assert!(!should_conceal_widget(true, false, false));
        assert!(!should_conceal_widget(true, true, true));
        assert!(!should_conceal_widget(true, true, false));
        assert!(!should_conceal_widget(false, false, true));
        assert!(!should_conceal_widget(false, true, false));
    }

    #[test]
    fn parked_at_minus_32000_is_off_every_monitor() {
        let primary = rect(0, 0, 1920, 1080);
        let secondary = rect(1920, 0, 1920, 1080);
        let left = rect(-1920, 0, 1920, 1080);
        let parked = rect(-32000, -32000, 272, 91);
        let minimized_parking = rect(-32000, -32000, 160, 28);
        assert!(!widget_rect_on_screen(parked, &[primary, secondary]));
        assert!(!widget_rect_on_screen(minimized_parking, &[primary]));
        assert!(!widget_rect_on_screen(parked, &[left, primary]));
        assert!(widget_rect_on_screen(rect(100, 80, 272, 91), &[primary]));
        assert!(widget_rect_on_screen(rect(-10, 40, 272, 91), &[primary]));
        assert!(!widget_rect_on_screen(rect(-272, 40, 272, 91), &[primary]));
        assert!(widget_rect_on_screen(parked, &[]));
    }

    #[test]
    fn parked_widget_moves_to_nearest_work_area_origin() {
        let primary = rect(0, 0, 1920, 1080);
        let secondary = rect(1920, 0, 1920, 1080);
        let parked = rect(-32000, -32000, 272, 91);
        let monitors = [
            layout(primary, rect(0, 40, 1920, 1040)),
            layout(secondary, rect(1920, 0, 1920, 1040)),
        ];
        assert_eq!(nearest_work_area_origin(parked, &monitors), Some((0, 40)));
        assert_eq!(
            nearest_work_area_origin(rect(4000, 100, 272, 91), &monitors),
            Some((1920, 0))
        );
        assert_eq!(
            nearest_work_area_origin(rect(100, 80, 272, 91), &monitors),
            None
        );
    }

    #[test]
    fn reveal_clears_skip_taskbar_before_unminimize() {
        let skip_false = REVEAL_STEPS
            .iter()
            .position(|s| *s == "set_skip_taskbar(false)")
            .unwrap();
        let unminimize = REVEAL_STEPS
            .iter()
            .position(|s| *s == "unminimize")
            .unwrap();
        let move_on_screen = REVEAL_STEPS
            .iter()
            .position(|s| *s == "move_onto_screen")
            .unwrap();
        let show = REVEAL_STEPS.iter().position(|s| *s == "show").unwrap();
        let skip_true = REVEAL_STEPS
            .iter()
            .position(|s| *s == "set_skip_taskbar(true)")
            .unwrap();
        assert!(skip_false < unminimize);
        assert!(unminimize < move_on_screen);
        assert!(move_on_screen < show);
        assert!(show < skip_true);
        let always_on_top = REVEAL_STEPS
            .iter()
            .position(|s| *s == "set_always_on_top(true)")
            .unwrap();
        assert!(unminimize < always_on_top);
        assert!(show < always_on_top);
    }

    /// Windows 小窗在 tao 里的可观察行为，用来复现 0.3.0 的两条入口。
    #[derive(Clone, Debug)]
    struct MiniWin {
        iconic: bool,
        shown: bool,
        skip_taskbar: bool,
        ghost: bool,
        stuck: bool,
        parked: bool,
    }

    fn minimized_widget() -> MiniWin {
        MiniWin {
            iconic: true,
            shown: false,
            skip_taskbar: false,
            ghost: false,
            stuck: false,
            parked: false,
        }
    }

    fn parked_widget() -> MiniWin {
        MiniWin {
            iconic: false,
            shown: false,
            skip_taskbar: true,
            ghost: false,
            stuck: false,
            parked: true,
        }
    }

    /// 按 tao / Win32 的实际效果走一步。
    ///
    /// - 最小化时改置顶会 SW_SHOW：清掉 iconic，但窗口并不出现（ghost）。
    /// - unminimize 只在仍然 iconic 时 SW_RESTORE；ghost 被当成「已经不是最小化」。
    /// - 还 iconic 时删任务栏按钮会卡住，之后的 SW_RESTORE 也出不来。
    /// - 停在屏幕外时，show 不会把它变到用户看得到的地方，必须先 move_onto_screen。
    fn apply_step(win: &mut MiniWin, step: &str) {
        match step {
            "set_skip_taskbar(false)" => win.skip_taskbar = false,
            "set_skip_taskbar(true)" => {
                win.skip_taskbar = true;
                if win.iconic {
                    win.stuck = true;
                    win.shown = false;
                }
            }
            "set_always_on_top(true)" | "set_always_on_top(false)" => {
                if win.iconic {
                    win.iconic = false;
                    win.ghost = true;
                    win.shown = false;
                }
            }
            "unminimize" => {
                if win.ghost || (win.stuck && win.skip_taskbar) {
                    return;
                }
                if win.iconic || win.stuck {
                    win.iconic = false;
                    win.ghost = false;
                    win.stuck = false;
                    win.shown = true;
                }
            }
            "move_onto_screen" => win.parked = false,
            "show" | "set_focus" => {
                if win.iconic || win.ghost || win.stuck || win.parked {
                    return;
                }
                win.shown = true;
            }
            "minimize" => {
                win.iconic = true;
                win.shown = false;
                win.ghost = false;
                if win.skip_taskbar {
                    win.stuck = true;
                }
            }
            other => panic!("unknown step {other}"),
        }
    }

    fn play(steps: &[&str], win: &mut MiniWin) {
        for step in steps {
            apply_step(win, step);
        }
    }

    #[test]
    fn minimized_widget_stays_hidden_with_0_3_0_reveal_order() {
        let mut from_settings = minimized_widget();
        play(REVEAL_STEPS_BROKEN_0_3_0, &mut from_settings);
        assert!(!from_settings.shown, "设置「打开悬浮窗」");

        let mut from_tray = minimized_widget();
        play(REVEAL_STEPS_BROKEN_0_3_0, &mut from_tray);
        assert!(!from_tray.shown, "托盘右键");
    }

    #[test]
    fn minimized_widget_shows_again_from_settings_and_tray() {
        let mut from_settings = minimized_widget();
        play(REVEAL_STEPS, &mut from_settings);
        assert!(from_settings.shown);
        assert!(!from_settings.iconic);
        assert!(from_settings.skip_taskbar);

        let mut from_tray = minimized_widget();
        play(REVEAL_STEPS, &mut from_tray);
        assert!(from_tray.shown);
        assert!(!from_tray.iconic);
    }

    #[test]
    fn parked_widget_stays_hidden_until_moved_before_show() {
        let mut without_move = parked_widget();
        let steps: Vec<&str> = REVEAL_STEPS
            .iter()
            .copied()
            .filter(|step| *step != "move_onto_screen")
            .collect();
        play(&steps, &mut without_move);
        assert!(!without_move.shown);

        let mut revealed = parked_widget();
        play(REVEAL_STEPS, &mut revealed);
        assert!(revealed.shown);
        assert!(!revealed.parked);
    }

    #[test]
    fn windows_conceal_avoids_hide() {
        assert!(CONCEAL_STEPS_WINDOWS.contains(&"minimize"));
        assert!(!CONCEAL_STEPS_WINDOWS.iter().any(|s| s.contains("hide")));
    }
}
