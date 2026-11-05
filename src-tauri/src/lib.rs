mod widget_window;

use tauri::{AppHandle, Emitter, Manager};

#[cfg(desktop)]
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    WebviewWindow,
};

use widget_window::{
    nearest_work_area_origin, should_conceal_widget, widget_rect_on_screen, MonitorLayout,
    ScreenRect, WIDGET_VISIBILITY_EVENT,
};

#[tauri::command]
fn show_settings(app: AppHandle) -> Result<(), String> {
    show_settings_window(&app)
}

fn notify_widget_visibility(app: &AppHandle, visible: bool) {
    let _ = app.emit(WIDGET_VISIBILITY_EVENT, visible);
}

/// 拉起悬浮窗。设置「打开悬浮窗」和托盘「显示/隐藏」都走这里。
///
/// 必须整段在主线程做完再返回，否则显隐事件会早于窗口真正出现。
/// 步骤见 `reveal_widget_now`：先取消跳过任务栏，再 unminimize/show，
/// 最后才置顶并重新跳过任务栏。
#[cfg(desktop)]
fn reveal_widget(widget: &WebviewWindow) -> Result<(), String> {
    let widget = widget.clone();
    let (tx, rx) = std::sync::mpsc::channel();
    widget
        .clone()
        .run_on_main_thread(move || {
            let _ = tx.send(reveal_widget_now(&widget));
        })
        .map_err(|e| e.to_string())?;
    rx.recv()
        .map_err(|_| "悬浮窗没有在主线程拉起".to_string())?
}

/// 真正的拉起顺序。调用方必须已经在主线程上。
///
/// 不要在 `unminimize` 之前 `set_always_on_top`。Windows 改置顶时会顺手
/// `ShowWindow(SW_SHOW)`。窗口还最小化时，这一下会清掉「已最小化」，
/// 但窗口并不展开；紧接着的 `unminimize` 看到它已经不是最小化，就不再
/// `SW_RESTORE`。设置和托盘因此都像没点到。
#[cfg(desktop)]
fn reveal_widget_now(widget: &WebviewWindow) -> Result<(), String> {
    widget.set_skip_taskbar(false).map_err(|e| e.to_string())?;
    widget.unminimize().map_err(|e| e.to_string())?;
    // 真正最小化的窗口会先回到上次的正常位置。若外接矩形仍然在每块
    // 显示器之外（包括停在 -32000 的情况），再搬到最近工作区，然后才显示。
    move_parked_widget_on_screen(widget)?;
    widget.show().map_err(|e| e.to_string())?;
    widget.set_focus().map_err(|e| e.to_string())?;
    widget.set_always_on_top(true).map_err(|e| e.to_string())?;
    widget.set_skip_taskbar(true).map_err(|e| e.to_string())?;
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
        widget.set_skip_taskbar(true).map_err(|e| e.to_string())?;
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
    #[cfg(desktop)]
    let next_visible = {
        let widget = widget.clone();
        let (tx, rx) = std::sync::mpsc::channel();
        widget
            .clone()
            .run_on_main_thread(move || {
                let _ = tx.send(toggle_widget_now(&widget));
            })
            .map_err(|e| e.to_string())?;
        rx.recv()
            .map_err(|_| "悬浮窗没有在主线程切换".to_string())??
    };
    #[cfg(not(desktop))]
    let next_visible = {
        let visible = widget.is_visible().map_err(|e| e.to_string())?;
        if should_conceal_widget(visible, false, true) {
            conceal_widget(&widget)?;
            false
        } else {
            reveal_widget(&widget)?;
            true
        }
    };
    notify_widget_visibility(&app, next_visible);
    Ok(next_visible)
}

/// 托盘切换。调用方必须已经在主线程上，这样读到的外接矩形和随后的搬动是同一帧。
#[cfg(desktop)]
fn toggle_widget_now(widget: &WebviewWindow) -> Result<bool, String> {
    let visible = widget.is_visible().map_err(|e| e.to_string())?;
    let minimized = widget.is_minimized().map_err(|e| e.to_string())?;
    let on_screen = widget_on_screen(widget)?;
    if should_conceal_widget(visible, minimized, on_screen) {
        conceal_widget(widget)?;
        Ok(false)
    } else {
        reveal_widget_now(widget)?;
        Ok(true)
    }
}

/// 读不到位置或显示器时不当成屏幕外，避免把还在屏幕上的窗口收掉。
#[cfg(desktop)]
fn widget_on_screen(widget: &WebviewWindow) -> Result<bool, String> {
    let Ok(pos) = widget.outer_position() else {
        return Ok(true);
    };
    let Ok(size) = widget.outer_size() else {
        return Ok(true);
    };
    let rect = ScreenRect {
        x: pos.x,
        y: pos.y,
        width: u32_to_i32(size.width),
        height: u32_to_i32(size.height),
    };
    let Ok(layouts) = monitor_layouts(widget) else {
        return Ok(true);
    };
    let bounds: Vec<ScreenRect> = layouts.iter().map(|monitor| monitor.bounds).collect();
    Ok(widget_rect_on_screen(rect, &bounds))
}

/// 停在所有显示器之外时，搬到最近一块的工作区左上角。
#[cfg(desktop)]
fn move_parked_widget_on_screen(widget: &WebviewWindow) -> Result<(), String> {
    let Ok(pos) = widget.outer_position() else {
        return Ok(());
    };
    let Ok(size) = widget.outer_size() else {
        return Ok(());
    };
    let rect = ScreenRect {
        x: pos.x,
        y: pos.y,
        width: u32_to_i32(size.width),
        height: u32_to_i32(size.height),
    };
    let Ok(layouts) = monitor_layouts(widget) else {
        return Ok(());
    };
    let Some((x, y)) = nearest_work_area_origin(rect, &layouts) else {
        return Ok(());
    };
    widget
        .set_position(tauri::PhysicalPosition::new(x, y))
        .map_err(|e| e.to_string())
}

#[cfg(desktop)]
fn monitor_layouts(widget: &WebviewWindow) -> Result<Vec<MonitorLayout>, String> {
    let monitors = widget.available_monitors().map_err(|e| e.to_string())?;
    let primary_at = widget
        .primary_monitor()
        .ok()
        .flatten()
        .map(|monitor| (monitor.position().x, monitor.position().y));
    let mut layouts: Vec<MonitorLayout> = monitors.iter().map(layout_of).collect();
    if let Some(at) = primary_at {
        if let Some(index) = layouts
            .iter()
            .position(|monitor| monitor.bounds.x == at.0 && monitor.bounds.y == at.1)
        {
            let primary = layouts.remove(index);
            layouts.insert(0, primary);
        }
    }
    Ok(layouts)
}

#[cfg(desktop)]
fn layout_of(monitor: &tauri::Monitor) -> MonitorLayout {
    let bounds = ScreenRect {
        x: monitor.position().x,
        y: monitor.position().y,
        width: u32_to_i32(monitor.size().width),
        height: u32_to_i32(monitor.size().height),
    };
    let work = monitor.work_area();
    let work_rect = if work.size.width == 0 || work.size.height == 0 {
        bounds
    } else {
        ScreenRect {
            x: work.position.x,
            y: work.position.y,
            width: u32_to_i32(work.size.width),
            height: u32_to_i32(work.size.height),
        }
    };
    MonitorLayout {
        bounds,
        work: work_rect,
    }
}

#[cfg(desktop)]
fn u32_to_i32(value: u32) -> i32 {
    i32::try_from(value).unwrap_or(i32::MAX)
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
    let show_settings_i =
        MenuItem::with_id(app, "show_settings", "打开小日程", true, None::<&str>)?;
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
