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
//! 拉起必须先 `skip_taskbar(false)`，再 unminimize/show/focus，最后才置顶
//! 并重新跳过任务栏。`hide()` 后的 WebView2 假死仍用 minimize 收起，不用 hide。

/// 与前端 `widget-visibility-changed`、设置页按钮共用的事件名。
pub const WIDGET_VISIBILITY_EVENT: &str = "widget-visibility-changed";

/// 托盘「显示/隐藏」：只有真正浮在前台时才收起，最小化/已隐藏一律拉回。
pub fn should_conceal_widget(visible: bool, minimized: bool) -> bool {
    visible && !minimized
}

/// 拉起小窗时的步骤（供回归测试锁定顺序）。
/// 置顶必须在 unminimize 之后。之前插入置顶会让 Windows 用 SW_SHOW
/// 把最小化标记清掉，还原就被跳过。
pub const REVEAL_STEPS: &[&str] = &[
    "set_skip_taskbar(false)",
    "unminimize",
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

    #[test]
    fn conceal_only_when_shown_and_not_minimized() {
        assert!(should_conceal_widget(true, false));
        assert!(!should_conceal_widget(true, true));
        assert!(!should_conceal_widget(false, false));
        assert!(!should_conceal_widget(false, true));
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
        let show = REVEAL_STEPS.iter().position(|s| *s == "show").unwrap();
        let skip_true = REVEAL_STEPS
            .iter()
            .position(|s| *s == "set_skip_taskbar(true)")
            .unwrap();
        assert!(skip_false < unminimize);
        assert!(unminimize < show);
        assert!(show < skip_true);
        let always_on_top = REVEAL_STEPS
            .iter()
            .position(|s| *s == "set_always_on_top(true)")
            .unwrap();
        assert!(unminimize < always_on_top);
    }

    /// Windows 小窗在 tao 里的可观察行为，用来复现 0.3.0 的两条入口。
    #[derive(Clone, Debug)]
    struct MiniWin {
        iconic: bool,
        shown: bool,
        skip_taskbar: bool,
        ghost: bool,
        stuck: bool,
    }

    fn minimized_widget() -> MiniWin {
        MiniWin {
            iconic: true,
            shown: false,
            skip_taskbar: false,
            ghost: false,
            stuck: false,
        }
    }

    /// 按 tao / Win32 的实际效果走一步。
    ///
    /// - 最小化时改置顶会 SW_SHOW：清掉 iconic，但窗口并不出现（ghost）。
    /// - unminimize 只在仍然 iconic 时 SW_RESTORE；ghost 被当成「已经不是最小化」。
    /// - 还 iconic 时删任务栏按钮会卡住，之后的 SW_RESTORE 也出不来。
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
            "show" | "set_focus" => {
                if win.iconic || win.ghost || win.stuck {
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
    fn windows_conceal_avoids_hide() {
        assert!(CONCEAL_STEPS_WINDOWS.contains(&"minimize"));
        assert!(!CONCEAL_STEPS_WINDOWS.iter().any(|s| s.contains("hide")));
    }
}
