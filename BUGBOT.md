# Bugbot / 自动化审查提示

## 高优先

- 配置 JSON 损坏时是否静默写成 `defaultConfig()` 样例（应抛错 / 空日程 + 明确错误）
- `isCurrentItem` 是否覆盖跨日（`end < start`）
- Zod 与表单是否一致（禁止 `start === end`）
- `fs:scope` 是否重新引入 `$HOME/**`
- 工作标签日程在法定假日 / `dayOverrides.off` 是否仍出现

## 中优先

- 导入失败是否只 `alert`、未在设置页展示
- 空态文字对比度是否过低
- 品牌是否仍以 ScheduleMINI 盖过「小日程」

## 回归范围

见 [docs/acceptance.md](docs/acceptance.md)。Windows 原生安装包须在真实 Windows 上点验托盘 / 自启 / 通知。
