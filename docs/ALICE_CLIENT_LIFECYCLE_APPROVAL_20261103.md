# Alice 客户端重启：明确批准的固定任务

本次用户明确授权修复并验收 ChatGPT 经 MCP 直接、安全重启 Alice 客户端。
采用已存在的 `repository_task`，专用任务名称为 `alice_client_restart`，任务文件保持
`.openclaw/tasks/alice_17879_client_restart.json`。不是重命名历史拒绝操作。

## 历史拒绝与权限层次

对 `alice_idle_late_drift_safe_reload_after_audit_20261102_h01` 的实际
`project_result` 查询返回 `not_found`。Alice 运维文档记录了执行平台在 MCP
入场前阻止该次调用；本次能取得的历史记录没有原始审核拒绝理由或规则编号。
因此不能声称查明了其内部规则，也不能把 `not_found` 单独当作“从未执行”的证据。
该编号被专用入口显式禁止复用。

本地 Agent full 工具配置、仓库脚本登记、本次专用生命周期批准和 ChatGPT 平台
审核是不同层。新增批准只收窄和说明本地操作范围，**不关闭、覆盖或模拟平台审核**。
若平台仍拒绝，停止此路径并向平台管理员提供本请求、批准哈希、原拒绝编号及
专用任务定义，请求审查 Alice-only 生命周期操作；不得改工具、ID、脚本绕行。
没有可由本仓库修改的 ChatGPT 平台安全审核配置。

## 本机批准

本机维护命令（由获用户授权的维护 AI 执行，不要求用户转抄终端命令）：

```bash
node scripts/approve-alice-client-restart.mjs --approve
```

写入 owner-only 的 `~/Library/Application Support/ioant-openclaw-ops/alice-client-lifecycle-grant.json`，
固定 `alice-ai` Agent/仓库/任务、任务定义 SHA256、入口脚本 SHA256、用户授权引用
`user_request_20261103` 和 `platformReview=required`。只在审阅并提交指定文件后批准。
代码改变须重新审阅批准；撤销用同一入口 `--revoke`，保留历史记录。MCP 不提供自行
授权的写接口。此文件不是 OS 沙箱或平台许可，不能授权任意 SSH/服务操作。

## 可调用入口

先用 `openclaw_project_actions({"project_key":"alice-ai"})` 检查
`approvedLifecycleTasks` 中 `name=alice_client_restart`、`enabled=true`。

```json
{
  "project_key": "alice-ai",
  "action": "repository_task",
  "workspace_mode": "current",
  "task_file": ".openclaw/tasks/alice_17879_client_restart.json",
  "expected_commit": "当前 Alice 仓库完整 SHA",
  "conversation_key": "本 Chat 自己的唯一会话键",
  "operation_id": "本次已授权维护的唯一操作编号"
}
```

这是 `openclaw_project_execute` 的参数；随后只用原编号查询 `project_result` 和
`project_report(artifact_id=alice_restart)`。沿用当前检出，不 fetch/更新/切换分支，
不创建 worktree、不清理修改。已有未完成执行持有项目锁时不能入场。

## 固定安全行为与回执

- 原 Mint 维护模块哈希先匹配已审阅版本；原世界 `Bedrock level`、17879、当前
  PID/出生标识、owner-only 新鲜心跳、游戏连接及会话均必须匹配。
- 仅健康 IDLE、无现有游戏任务、原安全 idleGate 许可时允许进入；原生产备份/
  区块预检保留。较慢预检完成后，在发退出信号前再次检查身份及安全状态。
- 复用现有 `AliceProcess.launch(env, owner)`：只用原进程配置，pidfd 身份检查
  SIGINT，等待原进程退出和原 BDS 登出门禁，再启动一个替代客户端。无强杀、
  删除锁、BDS restart、切换世界、玩家数据/认证清理或第二个并发游戏会话。
- Mac 项目锁加 Mint 生命周期锁序列化；Mint 每操作的持久 claim 在停机前写入。
  已有或不明 claim 只能读取，不重启。连接确认超时为 inconclusive，不自动重试。
- 标准 `lifecycle` 回执包含 oldPid/newPid、processAlive、heartbeatFresh、connected、
  sessionEstablished、replacementCount、state/failureReason 和审批哈希。只有新进程
  实际连接后才能 passed；脚本退出 0 不能把 blocked/inconclusive 转为成功。
  不明结果保留项目锁，供只读核查。

`repository_fetch`、`repository_sync`、通用任务和本地修改保护语义不变。
重启通过不代表坐标、移动、床、门或 HOME 的实机行为通过。

## 验证进度

源码阶段：MCP 相关 44 项回归通过；Alice 生命周期专项 9 项及完整 Python
320 项（跳过 3 项）通过。Mint 上原维护模块三份 SHA256 与批准版本逐一匹配。
最终完整 MCP 回归 **1,376/1,376**、生命周期专项 **9/9** 通过。

## 正式加载与实机验收（北京时间 2026-11-03 00:39）

- Alice 任务代码 `a7c1a5ef08859b406ff52b654cb785fdc6dd79be` 已推送；
  MCP 代码 `650363b`（基于 `001a870`）已推送。两仓库均在原目录开发。
- 本机维护命令完成正式批准，approvalSha256=
  `0b0b2ee78a0738b155c0334a00e9fe8292d5b3f60e5254030d0bac813385b99f`。
  首次批准因已有仓库标签带 `github.com/` 前缀而安全阻止，未写许可；修正为明确
  接受两种规范标签并仍严格核对原 origin，新增回归后成功，不放松目标仓库限制。
- 无在途项目执行锁时，通过现有控制台内存密钥重载 Tunnel；遇到旧控制台已知的
  `tunnel_starting` 退出事件竞争，先独立确认原进程已退出且不存在配置的 Tunnel，
  再用支持的 start API 启动。没有重启 Web、恢复/导出密钥或关闭身份检查。
  Tunnel PID60308 ready；此旧控制台竞争问题本轮未修复。
- 实际云端 `openclaw_project_actions(alice-ai)` 返回
  `approvedLifecycleTasks[name=alice_client_restart].enabled=true` 和上述批准哈希，
  同时 fetch/sync/generic task 保持启用。工具参数未改变，不需要刷新工具目录。
- 唯一真实维护操作：`alice_client_restart_approved_20261103_k4n8v2cs_01`。
  `project_execute` accepted；同编号 `project_result` **passed / cached=true**，
  `lifecycle.state=completed`、`failureReason=none`、旧PID3521245→新PID3633395。
  processAlive/heartbeatFresh/connected/sessionEstablished/ownerVerified/
  worldVerified/portVerified 全true，existingTask=false，replacementCount=1，
  bdsRestarted=false、worldChanged=false、modelInferenceInvoked=false。
- `project_report(artifact_id=alice_restart)` 实际读到完整非空 JSON，SHA256
  `5a807aa7410caab7630afe79a179e37f3ccb4932a7a7ffa75297eb7cfcac2ae7`。
  随后原维护入口独立 status 确认同PID、current_process、心跳0.3秒、连接/会话true、
  HP20/IDLE/no job。这是实际新会话证明，不只是进程启动或脚本退出0。

无需额外管理员操作或用户手动执行终端命令，本次平台调用获准正常完成。
旧 h01 的具体平台拒绝规则仍不可从现存记录确认；本次成功不能倒推旧拒绝原因，
也不是对未来平台拒绝的豁免。新会话独立 BDS 样本初始0，不代表移动验收。
