# 通用 MCP：动态项目发现与接入

## 已观察的问题

用户报告网页 Chat 只能列出 workflow / Alice，于是想通过桌面探测 AWS 入口。
源码核对：隧道命令固定两个项目名，project_key 的工具 schema 是固定 enum；
即使选择 registered，旧实现也只在启动时取一次项目快照。另缺少独立于已登记
项目的工作区发现/接入工具。通用任务内核本身不需要项目专用代码，入口却仍
要求人工在外部创建 Agent 和 grant。这是本轮要纠正的接口边界。

## 实现目标

- 一个插件 / 一个隧道；registered 模式每次调用从本机登记加载项目，schema
  使用通用 project_key 格式，新增项目不改变工具目录，不必再次刷新或重启。
- 本机一次授予明确的工作区根目录；通用工具只在这些根目录发现直接子 Git
  仓库，返回安全元数据。无截图、窗口枚举、遍历整机或任意用户文件读取。
- ChatGPT 根据用户当前项目请求自行发现、连接；接入生成独立的 native Agent、
  私有 workspace、grant、会话和回执命名空间。新 Agent 默认 deny-all，不执行
  模型；任务脚本仍走已有确定性 runner，不通过 UI 终端绕过项目登记。
- 原有项目优先复用其已登记的独立身份，保留原权限；新建 Agent 仅添加一个
  deny-all 本地条目，不修改其他 Agent / provider / 默认模型或电脑权限。
- 接入前持久化 operation_id；不明确的结果只读原回执，不换 ID 重做。
  对 config / grant 写入保留备份、全局互斥和前后核对；不隐瞒部分完成。
- MCP 共用不意味着共享项目记忆、自动获得生产权限或使用别的项目执行器。
  AWS 在本轮仍是例子，不运行迁移、远端诊断或服务操作。

## 验证计划

1. 原封闭枚举/静态路由的回归检查：同一服务连接看到后来登记的第三项目。
2. 两个独立临时 Git 仓库通过通用发现/接入，并保留独立 Agent/回执。
3. 未授权根、路径穿越、symlink、凭据 origin、重复/不明确接入均拒绝。
4. no-tools Agent patch 保留所有原配置；失败明确记录且不自动再次写入。
5. 完整回归、本机真实 stdio SDK，再部署原隧道、刷新一次插件，最后在
   ChatGPT 网页中发送获授权的基础设施测试消息，核对实际工具回执。

OpenAI Docs 说明工具/描述/schema/server instructions 修改后需 Refresh。
项目登记是已有工具的数据变化，不应再把项目名写入工具 schema：
[Connect and test your plugin](https://developers.openai.com/plugins/deploy/connect-chatgpt)。

本文件是实施计划，不代表上述新功能已经上线或验收通过。

## 源码验证检查点

0.5.0 已实现：13 工具的 registered 动态模式（原固定模式和显式双项目模式
保持兼容）、全局工作区发现/接入、独立 deny-all 原生 Agent 创建、只追加 grant、
接入持久回执和不明确结果的配置互斥保留。工具列表不再包含项目名枚举。
同一连接追加第三项目后可立即查询/路由，目录 schema 完全不变。

完整 Node 回归 1291/1291 通过（0 失败/跳过/取消），bash 语法和 diff 检查通过。
实际 Chrome Browser Relay 能读取已授权的基础设施 Chat 与插件页；Codex 自身
CUA 权限不可用，因此后续网页验收走用户请求的既有 OpenClaw 浏览器工具，不
安装扩展、不修改 TCC、不重置权限、不访问 Alice/AWS 会话内容。
当前还没部署新版本或完成网页验收；这些证据须另记。

新增短的网页验收 helper 固定到获授权的基础设施 Chat / Plugins：只允许观察到的
Refresh/页面导航/Allow once 控件，不允许卸载、扩大总权限或发送密钥；发送前
要求空闲空草稿、唯一精确 tab 和测试 marker，发送意图先落盘，未知结果不重发。
原生 Agent patch 已通过安装版本 CLI 的 --dry-run --json 实际验证，没有配置写入。
浏览器最初列出目标 Chat 和插件页且插件快照成功；随后 tabs 返回空而 status
仍 running/pageReady，helper 在输入前拒绝继续。此运行态差异尚待查明，不宣称
网页验收通过，也不通过换浏览器、安装扩展或重置权限掩盖它。
