# 在真正的 Windows 桌面上点悬浮窗：最小化，再从设置和托盘打开。
# 记录每次之后窗口是否还在屏幕上。这不是调用顺序的单元测试。
$ErrorActionPreference = "Stop"
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$OutDir = Join-Path (Get-Location) "widget-click-out"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$LogPath = Join-Path $OutDir "click-log.txt"
function Log([string]$msg) {
  $line = "{0}  {1}" -f (Get-Date -Format "HH:mm:ss.fff"), $msg
  Add-Content -Path $LogPath -Value $line -Encoding utf8
  Write-Host $line
}

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

Add-Type @"
using System;
using System.Collections.Generic;
using System.Text;
using System.Runtime.InteropServices;
public static class NativeWin {
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll")] public static extern IntPtr GetDC(IntPtr hWnd);
  [DllImport("gdi32.dll")] public static extern int GetDeviceCaps(IntPtr hdc, int index);
  [DllImport("user32.dll")] public static extern int ReleaseDC(IntPtr hWnd, IntPtr hdc);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr FindWindow(string cls, string title);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

  public static List<string> VisibleTop() {
    var rows = new List<string>();
    EnumWindows((hWnd, lParam) => {
      if (!IsWindowVisible(hWnd)) return true;
      var cls = new StringBuilder(256);
      GetClassName(hWnd, cls, cls.Capacity);
      var title = new StringBuilder(256);
      GetWindowText(hWnd, title, title.Capacity);
      RECT rect;
      GetWindowRect(hWnd, out rect);
      int w = rect.Right - rect.Left;
      int h = rect.Bottom - rect.Top;
      if (w < 2 && h < 2) return true;
      rows.Add(hWnd.ToInt64() + "|" + cls.ToString() + "|" + title.ToString().Replace("|", "/") + "|" + rect.Left + "," + rect.Top + "," + w + "x" + h);
      return true;
    }, IntPtr.Zero);
    return rows;
  }

  public static List<string> WindowsByClassHint() {
    var rows = new List<string>();
    EnumWindows((hWnd, lParam) => {
      var cls = new StringBuilder(256);
      GetClassName(hWnd, cls, cls.Capacity);
      var title = new StringBuilder(256);
      GetWindowText(hWnd, title, title.Capacity);
      string c = cls.ToString();
      string t = title.ToString();
      if (c.IndexOf("Tray", StringComparison.OrdinalIgnoreCase) >= 0
        || c.IndexOf("Notify", StringComparison.OrdinalIgnoreCase) >= 0
        || c.IndexOf("Xaml", StringComparison.OrdinalIgnoreCase) >= 0
        || t.IndexOf("小日程", StringComparison.Ordinal) >= 0) {
        rows.Add(hWnd.ToInt64() + "|" + c + "|" + t.Replace("|", "/"));
      }
      return true;
    }, IntPtr.Zero);
    return rows;
  }
  public struct RECT { public int Left, Top, Right, Bottom; }

  public static List<string> ListForPid(uint pid) {
    var rows = new List<string>();
    EnumWindows((hWnd, lParam) => {
      uint owner;
      GetWindowThreadProcessId(hWnd, out owner);
      if (owner != pid) return true;
      var sb = new StringBuilder(512);
      GetWindowText(hWnd, sb, sb.Capacity);
      if (sb.Length == 0) return true;
      RECT rect;
      GetWindowRect(hWnd, out rect);
      rows.Add(string.Join("|", new string[] {
        hWnd.ToInt64().ToString(),
        sb.ToString().Replace("|", "/"),
        IsWindowVisible(hWnd) ? "1" : "0",
        IsIconic(hWnd) ? "1" : "0",
        rect.Left.ToString(),
        rect.Top.ToString(),
        (rect.Right - rect.Left).ToString(),
        (rect.Bottom - rect.Top).ToString()
      }));
      return true;
    }, IntPtr.Zero);
    return rows;
  }

  public static string RectOf(long hwnd) {
    RECT rect;
    GetWindowRect(new IntPtr(hwnd), out rect);
    return rect.Left + "," + rect.Top + "," + rect.Right + "," + rect.Bottom;
  }
}
"@

$script:WidgetHwnd = [IntPtr]::Zero
$script:SettingsHwnd = [IntPtr]::Zero
$script:AppPid = 0
$script:Proc = $null

function Screenshot([string]$name) {
  $path = Join-Path $OutDir $name
  $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  $bmp = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
  Log "screenshot $name ($($bounds.Width)x$($bounds.Height))"
}

function Get-DpiScale {
  $hdc = [NativeWin]::GetDC([IntPtr]::Zero)
  $dpi = [NativeWin]::GetDeviceCaps($hdc, 88)
  [void][NativeWin]::ReleaseDC([IntPtr]::Zero, $hdc)
  if ($dpi -lt 48) { return 1.0 }
  return [double]$dpi / 96.0
}

function Get-AppWindows {
  $rows = [NativeWin]::ListForPid([uint32]$script:AppPid)
  $found = @()
  foreach ($row in $rows) {
    $p = $row.Split("|")
    $found += [pscustomobject]@{
      Hwnd = [IntPtr]::new([int64]$p[0])
      Title = $p[1]
      Visible = $p[2] -eq "1"
      Iconic = $p[3] -eq "1"
      Left = [int]$p[4]
      Top = [int]$p[5]
      Width = [int]$p[6]
      Height = [int]$p[7]
    }
  }
  return $found
}

function Describe-Window($w) {
  $onScreen = $w.Visible -and -not $w.Iconic -and $w.Width -gt 80 -and $w.Height -gt 80 -and $w.Left -gt -2000 -and $w.Top -gt -2000
  return ("hwnd={0} title={1} visible={2} iconic={3} rect={4},{5},{6}x{7} onScreen={8}" -f $w.Hwnd, $w.Title, $w.Visible, $w.Iconic, $w.Left, $w.Top, $w.Width, $w.Height, $onScreen)
}

function Log-Windows([string]$label) {
  Log "---- $label ----"
  $wins = @(Get-AppWindows)
  if ($wins.Count -eq 0) { Log "(no titled windows for pid $($script:AppPid))" }
  foreach ($w in $wins) { Log (Describe-Window $w) }
  $widget = $wins | Where-Object { $_.Hwnd -eq $script:WidgetHwnd } | Select-Object -First 1
  if (-not $widget) {
    Log "WIDGET missing from enum"
    return $false
  }
  $onScreen = $widget.Visible -and -not $widget.Iconic -and $widget.Width -gt 80 -and $widget.Height -gt 80 -and $widget.Left -gt -2000 -and $widget.Top -gt -2000
  Log "WIDGET_ON_SCREEN=$onScreen"
  return $onScreen
}

function Click-At([int]$x, [int]$y, [string]$button) {
  Log "mouse $button at $x,$y"
  [void][NativeWin]::SetCursorPos($x, $y)
  Start-Sleep -Milliseconds 120
  if ($button -eq "right") {
    [NativeWin]::mouse_event(0x0008, 0, 0, 0, [UIntPtr]::Zero)
    [NativeWin]::mouse_event(0x0010, 0, 0, 0, [UIntPtr]::Zero)
  } else {
    [NativeWin]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
    [NativeWin]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
  }
  Start-Sleep -Milliseconds 400
}

function Click-Element($el, [string]$button) {
  $name = $el.Current.Name
  $pt = New-Object System.Windows.Point
  $ok = $el.TryGetClickablePoint([ref]$pt)
  if (-not $ok) {
    try {
      $scroll = $el.GetCurrentPattern([System.Windows.Automation.ScrollItemPattern]::Pattern)
      $scroll.ScrollIntoView()
      Start-Sleep -Milliseconds 300
    } catch {}
    $ok = $el.TryGetClickablePoint([ref]$pt)
  }
  if (-not $ok) {
    $r = $el.Current.BoundingRectangle
    if ($r.Width -lt 2 -or $r.Height -lt 2) { throw "no clickable point for $name" }
    $pt = New-Object System.Windows.Point (($r.X + $r.Width / 2), ($r.Y + $r.Height / 2))
  }
  Log "uia '$name' control=$($el.Current.ControlType.ProgrammaticName)"
  Click-At ([int]$pt.X) ([int]$pt.Y) $button
}

function Find-InWindow($hwnd, [string]$name, $controlType) {
  $root = [System.Windows.Automation.AutomationElement]::FromHandle($hwnd)
  $condName = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::NameProperty, $name)
  if ($null -eq $controlType) {
    return @($root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condName))
  }
  $condType = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty, $controlType)
  $both = New-Object System.Windows.Automation.AndCondition($condName, $condType)
  return @($root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $both))
}

function Dump-Names($hwnd, [string]$label) {
  Log "names in $label :"
  try {
    $root = [System.Windows.Automation.AutomationElement]::FromHandle($hwnd)
    $all = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
    $n = 0
    foreach ($el in $all) {
      $name = $el.Current.Name
      if ([string]::IsNullOrWhiteSpace($name)) { continue }
      if ($name -match "最小化|悬浮|设置|显示|隐藏") {
        Log ("  {0} | {1}" -f $el.Current.ControlType.ProgrammaticName, $name)
        $n++
      }
      if ($n -ge 40) { break }
    }
    if ($n -eq 0) { Log "  (no matching accessible names)" }
  } catch {
    Log "  dump failed: $($_.Exception.Message)"
  }
}

function Resolve-MainWindows {
  $wins = @(Get-AppWindows | Where-Object { $_.Title -eq "小日程" -and $_.Width -gt 200 -and $_.Height -gt 200 })
  $widget = $wins | Where-Object { $_.Width -lt 520 } | Sort-Object Width | Select-Object -First 1
  $settings = $wins | Where-Object { $_.Width -ge 700 } | Sort-Object Width -Descending | Select-Object -First 1
  if ($widget) { $script:WidgetHwnd = $widget.Hwnd }
  if ($settings) { $script:SettingsHwnd = $settings.Hwnd }
  return [pscustomobject]@{ Widget = $widget; Settings = $settings }
}

function Wait-App {
  $deadline = (Get-Date).AddSeconds(60)
  while ((Get-Date) -lt $deadline) {
    $pair = Resolve-MainWindows
    if ($pair.Widget -and $pair.Settings -and $pair.Widget.Hwnd -ne $pair.Settings.Hwnd) {
      return $pair
    }
    Start-Sleep -Milliseconds 500
  }
  return Resolve-MainWindows
}

function Click-Minimize {
  [void][NativeWin]::SetForegroundWindow($script:WidgetHwnd)
  Start-Sleep -Milliseconds 300
  $parts = [NativeWin]::RectOf($script:WidgetHwnd.ToInt64()).Split(",")
  $right = [int]$parts[2]
  $top = [int]$parts[1]
  # 默认是双人小窗：减号在卡片右上，大约距窗口右 24px、顶 20px。
  $points = @(
    @{ X = $right - 24; Y = $top + 20 },
    @{ X = $right - 18; Y = $top + 16 },
    @{ X = $right - 32; Y = $top + 28 },
    @{ X = $right - 40; Y = $top + 36 }
  )
  foreach ($p in $points) {
    Click-At $p.X $p.Y "left"
    Start-Sleep -Milliseconds 600
    $now = @(Get-AppWindows | Where-Object { $_.Hwnd -eq $script:WidgetHwnd })
    if ($now.Count -gt 0 -and $now[0].Iconic) {
      Log "minimize landed; window is iconic"
      return
    }
  }
  Log "minimize clicks did not make the widget iconic"
}

try {
  Log "sha=$(git rev-parse HEAD)"
  Log "session:"
  query user | ForEach-Object { Log $_ }
  $scale = Get-DpiScale
  Log "dpiScale=$scale"

  $exe = Get-ChildItem -Path "src-tauri\target" -Recurse -Filter "*.exe" |
    Where-Object { $_.FullName -notmatch "\\deps\\|\\build\\" -and $_.Name -notmatch "build-script" } |
    Sort-Object Length -Descending |
    Select-Object -First 1
  if (-not $exe) { throw "no app exe under src-tauri\target" }
  Log "exe=$($exe.FullName)"

  $script:Proc = Start-Process -FilePath $exe.FullName -WorkingDirectory $exe.DirectoryName -PassThru
  $script:AppPid = $script:Proc.Id
  Log "pid=$($script:AppPid)"
  Start-Sleep -Seconds 2
  $pair = Wait-App
  if (-not $pair.Widget -or -not $pair.Settings) { throw "settings and widget windows did not both appear" }
  Log ("startup widget " + (Describe-Window $pair.Widget))
  Log ("startup settings " + (Describe-Window $pair.Settings))
  Log "picked widget=$($script:WidgetHwnd) settings=$($script:SettingsHwnd)"
  Start-Sleep -Seconds 2
  Screenshot "01-started.png"
  $before = Log-Windows "before minimize"
  Log "BEFORE_MINIMIZE_VISIBLE=$before"

  Dump-Names $script:WidgetHwnd "widget"
  Log "clicking the minimize mark on the floating window"
  Click-Minimize
  Start-Sleep -Seconds 1
  Screenshot "02-after-minimize.png"
  $afterMin = Log-Windows "after minimize"
  Log "AFTER_MINIMIZE_VISIBLE=$afterMin"

  Log "opening settings button 打开悬浮窗"
  [void][NativeWin]::SetForegroundWindow($script:SettingsHwnd)
  Start-Sleep -Milliseconds 400
  Dump-Names $script:SettingsHwnd "settings"
  $gear = @(Find-InWindow $script:SettingsHwnd "设置" ([System.Windows.Automation.ControlType]::Button))
  if ($gear.Count -lt 1) { throw "could not find 设置 button" }
  Click-Element $gear[0] "left"
  Start-Sleep -Milliseconds 700
  $tab = @(Find-InWindow $script:SettingsHwnd "显示" $null | Where-Object { $_.Current.ControlType.ProgrammaticName -match "TabItem|Button|ListItem" })
  if ($tab.Count -lt 1) {
    $tab = @(Find-InWindow $script:SettingsHwnd "显示" $null)
  }
  if ($tab.Count -lt 1) { throw "could not find 显示 tab" }
  Click-Element $tab[0] "left"
  Start-Sleep -Milliseconds 500
  $openBtn = @(Find-InWindow $script:SettingsHwnd "打开悬浮窗" $null)
  if ($openBtn.Count -lt 1) {
    $stillOpen = @(Find-InWindow $script:SettingsHwnd "关闭悬浮窗" $null)
    Dump-Names $script:SettingsHwnd "settings-after-tab"
    if ($stillOpen.Count -gt 0) {
      throw "settings still says 关闭悬浮窗, so the widget was not minimized"
    }
    throw "could not find 打开悬浮窗"
  }
  Click-Element $openBtn[0] "left"
  Start-Sleep -Seconds 2
  Screenshot "03-after-settings.png"
  $afterSettings = Log-Windows "after settings 打开悬浮窗"
  Log "AFTER_SETTINGS_VISIBLE=$afterSettings"

  if ($afterSettings) {
    Log "minimizing again so the tray starts from a hidden widget"
    Click-Minimize
    Start-Sleep -Seconds 1
    $mid = Log-Windows "after second minimize"
    Log "AFTER_SECOND_MINIMIZE_VISIBLE=$mid"
  }

  Log "tray right-click"
  $trayClicked = $false
  Log "minimizing settings so the tray flyout is not covered"
  [void][NativeWin]::ShowWindow($script:SettingsHwnd, 6)
  Start-Sleep -Milliseconds 400
  $trayHwnd = [NativeWin]::FindWindow("Shell_TrayWnd", $null)
  $chevron = $null
  if ($trayHwnd -ne [IntPtr]::Zero) {
    foreach ($label in @("Show Hidden Icons", "Show hidden icons", "显示隐藏的图标")) {
      $hits = @(Find-InWindow $trayHwnd $label $null)
      if ($hits.Count -gt 0) { $chevron = $hits[0]; break }
    }
  }
  $icon = $null
  function Find-TrayIcon {
    $root = [System.Windows.Automation.AutomationElement]::RootElement
    $cond = New-Object System.Windows.Automation.PropertyCondition(
      [System.Windows.Automation.AutomationElement]::NameProperty, "小日程")
    $found = @($root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond))
    $hit = $null
    foreach ($el in $found) {
      $br = $el.Current.BoundingRectangle
      Log ("exact 小日程 {0} rect={1},{2},{3}x{4}" -f $el.Current.ControlType.ProgrammaticName, $br.X, $br.Y, $br.Width, $br.Height)
      if ($hit) { continue }
      if ($br.Width -gt 4 -and $br.Width -lt 80 -and $br.Height -gt 4 -and $br.Height -lt 80) { $hit = $el }
    }
    return $hit
  }
  if ($chevron) {
    $r = $chevron.Current.BoundingRectangle
    Log ("opening hidden icons rect={0},{1} {2}x{3}" -f $r.X, $r.Y, $r.Width, $r.Height)
    Click-At ([int]($r.X + $r.Width / 2)) ([int]($r.Y + $r.Height / 2)) "left"
    Start-Sleep -Milliseconds 700
    Screenshot "04a-overflow.png"
    foreach ($row in [NativeWin]::VisibleTop()) { Log "visible $row" }
    $icon = Find-TrayIcon
    if (-not $icon) {
      try {
        $invoke = $chevron.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
        Log "chevron Invoke"
        $invoke.Invoke()
        Start-Sleep -Milliseconds 700
      } catch {
        Log "chevron has no Invoke pattern"
      }
      foreach ($row in [NativeWin]::VisibleTop()) { Log "visible-after-invoke $row" }
      $icon = Find-TrayIcon
    }
  } else {
    Log "no hidden-icons chevron"
    foreach ($row in [NativeWin]::VisibleTop()) { Log "visible $row" }
    $icon = Find-TrayIcon
  }
  if ($icon) {
    Click-Element $icon "right"
    Start-Sleep -Milliseconds 700
    $popup = [NativeWin]::FindWindow("#32768", $null)
    $menu = @()
    if ($popup -ne [IntPtr]::Zero) {
      Dump-Names $popup "tray-menu"
      $menu = @(Find-InWindow $popup "显示/隐藏悬浮窗" $null)
    } else {
      Log "tray menu window was not found"
      foreach ($row in [NativeWin]::WindowsByClassHint()) { Log "after-right-click $row" }
    }
    Log "menu items: $($menu.Count)"
    if ($menu.Count -gt 0) {
      Click-Element $menu[0] "left"
      $trayClicked = $true
    }
  } else {
    Log "notification icon 小日程 was not in the hidden tray"
  }
  if (-not $trayClicked) { Log "TRAY_CLICK=failed" } else { Log "TRAY_CLICK=ok" }
  Start-Sleep -Seconds 2
  Screenshot "04-after-tray.png"
  $afterTray = Log-Windows "after tray"
  Log "AFTER_TRAY_VISIBLE=$afterTray"
  Log "DONE settingsVisible=$afterSettings trayClicked=$trayClicked trayVisible=$afterTray"
  if (-not $afterSettings -or -not $trayClicked -or -not $afterTray) { exit 2 }
  exit 0
} catch {
  Log "ERROR $($_.Exception.Message)"
  try { Screenshot "99-error.png" } catch {}
  try { Log-Windows "on error" | Out-Null } catch {}
  exit 1
} finally {
  if ($script:Proc -and -not $script:Proc.HasExited) {
    Stop-Process -Id $script:Proc.Id -Force -ErrorAction SilentlyContinue
    Log "killed pid $($script:Proc.Id)"
  }
}
