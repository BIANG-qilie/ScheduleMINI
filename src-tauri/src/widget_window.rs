//! 悬浮窗显示 / 收起策略。
//!
//! ## 为什么 #29 的 unminimize 仍不够
//!
//! 1. **托盘不回写前端**：`toggle_widget` 只改原生窗，从不通知
//!    `widgetVisible`，所以设置页按钮纹丝不动。
//! 2. **Windows + WebView2**：对小窗调 `hide()` 后再 `show()`/`unminimize()`
//!    经常起不来（wry/WebView2 旧疾）。收起应改成 `minimize` +
//!    `skip_taskbar(true)`；拉起前必须先 `skip_taskbar(false)`。

/// 与前端 `widget-visibility-changed`、设置页按钮共用的事件名。
pub const WIDGET_VISIBILITY_EVENT: &str = "widget-visibility-changed";

/// 托盘「显示/隐藏」：只有真正浮在前台时才收起，最小化/已隐藏一律拉回。
pub fn should_conceal_widget(visible: bool, minimized: bool) -> bool {
    visible && !minimized
}

/// 拉起小窗时的步骤（供回归测试锁定顺序）。
/// Windows 上必须先取消 skip_taskbar，再 unminimize/show/focus，最后恢复浮窗样式。
pub const REVEAL_STEPS: &[&str] = &[
    "set_skip_taskbar(false)",
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
        assert!(unminimize < show || unminimize < skip_true);
        assert!(show < skip_true);
    }

    #[test]
    fn windows_conceal_avoids_hide() {
        assert!(CONCEAL_STEPS_WINDOWS.contains(&"minimize"));
        assert!(!CONCEAL_STEPS_WINDOWS.iter().any(|s| s.contains("hide")));
    }
}
