use tauri::{AppHandle, Manager};

#[cfg(desktop)]
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    WebviewWindow,
};

#[tauri::command]
fn show_settings(app: AppHandle) -> Result<(), String> {
    show_settings_window(&app)
}

#[tauri::command]
fn set_widget_visible(app: AppHandle, visible: bool) -> Result<(), String> {
    let Some(widget) = app.get_webview_window("widget") else {
        return Err("找不到悬浮窗".into());
    };
    if visible {
        widget.show().map_err(|e| e.to_string())?;
        #[cfg(desktop)]
        widget
            .set_always_on_top(true)
            .map_err(|e| e.to_string())?;
    } else {
        widget.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn toggle_widget(app: AppHandle) -> Result<bool, String> {
    let Some(widget) = app.get_webview_window("widget") else {
        return Err("找不到悬浮窗".into());
    };
    let visible = widget.is_visible().map_err(|e| e.to_string())?;
    if visible {
        widget.hide().map_err(|e| e.to_string())?;
        Ok(false)
    } else {
        widget.show().map_err(|e| e.to_string())?;
        #[cfg(desktop)]
        widget
            .set_always_on_top(true)
            .map_err(|e| e.to_string())?;
        Ok(true)
    }
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
                    widget.on_window_event(move |event| {
                        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                            api.prevent_close();
                            let _ = widget_.hide();
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
