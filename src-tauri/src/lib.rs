mod widget_window;

use tauri::{AppHandle, Emitter, Manager};

#[cfg(desktop)]
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    WebviewWindow,
};

use widget_window::{should_conceal_widget, WIDGET_VISIBILITY_EVENT};

#[tauri::command]
fn show_settings(app: AppHandle) -> Result<(), String> {
    show_settings_window(&app)
}

fn notify_widget_visibility(app: &AppHandle, visible: bool) {
    let _ = app.emit(WIDGET_VISIBILITY_EVENT, visible);
}

/// 拉起悬浮窗。
///
/// Windows：先 `skip_taskbar(false)`，再 unminimize/show/focus，最后恢复置顶与跳过任务栏。
/// 若先 `skip_taskbar(true)` 或只靠 `show()`，最小化/收起后经常起不来。
#[cfg(desktop)]
fn reveal_widget(widget: &WebviewWindow) -> Result<(), String> {
    widget
        .set_skip_taskbar(false)
        .map_err(|e| e.to_string())?;
    // 短暂置顶，绕过 Windows 前台激活限制
    let _ = widget.set_always_on_top(true);
    widget.unminimize().map_err(|e| e.to_string())?;
    widget.show().map_err(|e| e.to_string())?;
    widget.set_focus().map_err(|e| e.to_string())?;
    widget
        .set_always_on_top(true)
        .map_err(|e| e.to_string())?;
    widget
        .set_skip_taskbar(true)
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(not(desktop))]
fn reveal_widget(widget: &tauri::WebviewWindow) -> Result<(), String> {
    widget.show().map_err(|e| e.to_string())
}

/// 收起悬浮窗。Windows 上避免 `hide()`（WebView2 常无法再 show）。
#[cfg(desktop)]
fn conceal_widget(widget: &WebviewWindow) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let _ = widget.set_always_on_top(false);
        widget
            .set_skip_taskbar(true)
            .map_err(|e| e.to_string())?;
        widget.minimize().map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(not(target_os = "windows"))]
    {
        widget.hide().map_err(|e| e.to_string())
    }
}

#[cfg(not(desktop))]
fn conceal_widget(widget: &tauri::WebviewWindow) -> Result<(), String> {
    widget.hide().map_err(|e| e.to_string())
}

#[tauri::command]
fn set_widget_visible(app: AppHandle, visible: bool) -> Result<(), String> {
    let Some(widget) = app.get_webview_window("widget") else {
        return Err("找不到悬浮窗".into());
    };
    if visible {
        reveal_widget(&widget)?;
    } else {
        conceal_widget(&widget)?;
    }
    notify_widget_visibility(&app, visible);
    Ok(())
}

#[tauri::command]
fn toggle_widget(app: AppHandle) -> Result<bool, String> {
    let Some(widget) = app.get_webview_window("widget") else {
        return Err("找不到悬浮窗".into());
    };
    let visible = widget.is_visible().map_err(|e| e.to_string())?;
    #[cfg(desktop)]
    let minimized = widget.is_minimized().map_err(|e| e.to_string())?;
    #[cfg(not(desktop))]
    let minimized = false;
    let next_visible = if should_conceal_widget(visible, minimized) {
        conceal_widget(&widget)?;
        false
    } else {
        reveal_widget(&widget)?;
        true
    };
    notify_widget_visibility(&app, next_visible);
    Ok(next_visible)
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

fn show_settings_window(app: &AppHandle) -> Result<(), String> {
    let Some(settings) = app.get_webview_window("settings") else {
        return Err("找不到设置窗口".into());
    };
    settings.show().map_err(|e| e.to_string())?;
    settings.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(desktop)]
fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let show_settings_i = MenuItem::with_id(app, "show_settings", "打开小日程", true, None::<&str>)?;
    let toggle_widget_i =
        MenuItem::with_id(app, "toggle_widget", "显示/隐藏悬浮窗", true, None::<&str>)?;
    let quit_i = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_settings_i, &toggle_widget_i, &quit_i])?;

    let _tray = TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("小日程")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show_settings" => {
                let _ = show_settings_window(app);
            }
            "toggle_widget" => {
                let _ = toggle_widget(app.clone());
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                let _ = show_settings_window(app);
            }
        })
        .build(app)?;

    Ok(())
}

#[cfg(desktop)]
fn intercept_settings_close(window: &WebviewWindow) {
    let window_ = window.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = window_.hide();
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init());

    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_autostart::init(
        tauri_plugin_autostart::MacosLauncher::LaunchAgent,
        None::<Vec<&str>>,
    ));

    builder
        .invoke_handler(tauri::generate_handler![
            show_settings,
            set_widget_visible,
            toggle_widget,
            quit_app
        ])
        .setup(|app| {
            #[cfg(not(desktop))]
            let _ = &app;
            #[cfg(desktop)]
            {
                app.handle()
                    .plugin(tauri_plugin_updater::Builder::new().build())?;
                app.handle().plugin(tauri_plugin_process::init())?;
                if let Some(settings) = app.get_webview_window("settings") {
                    intercept_settings_close(&settings);
                }
                if let Some(widget) = app.get_webview_window("widget") {
                    let widget_ = widget.clone();
                    let app_handle = app.handle().clone();
                    widget.on_window_event(move |event| {
                        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                            api.prevent_close();
                            if conceal_widget(&widget_).is_ok() {
                                notify_widget_visibility(&app_handle, false);
                            }
                        }
                    });
                }
                setup_tray(app.handle())?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
