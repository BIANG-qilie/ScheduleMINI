//! 悬浮窗显示/隐藏策略。
//!
//! 最小化后窗口在系统里往往仍算「可见」，只调 `show()` 不会还原；
//! 关掉再打开时 Windows 也可能按上次的最小化状态恢复。因此显示路径必须
//! `unminimize`，并重新套上置顶 + 跳过任务栏的小窗样式。

/// 托盘「显示/隐藏」：已显示且未最小化才隐藏，否则一律拉回前台。
pub fn should_hide_widget(visible: bool, minimized: bool) -> bool {
    visible && !minimized
}

#[cfg(test)]
mod tests {
    use super::should_hide_widget;

    #[test]
    fn hide_only_when_shown_and_not_minimized() {
        assert!(should_hide_widget(true, false));
        assert!(!should_hide_widget(true, true));
        assert!(!should_hide_widget(false, false));
        assert!(!should_hide_widget(false, true));
    }
}
