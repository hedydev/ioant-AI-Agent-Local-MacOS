# Alice 重启结果不明：取证、审阅、受控释放

## 实际故障

用户要求维护端解决 Alice 项目持续 `project_execution_busy`。原操作
`alice_r66_collision_restart_04` 在 `e046ae1` 执行，旧PID3849498→新PID3877694，
55秒没有确认新会话，原回执为 inconclusive/login_not_yet_verified。
原日志及回执保持不变，不复用该编号重做重启。

这不是普通排队：固定执行器刻意保留 unknown-outcome 项目锁；普通脚本（包括
通过 repository_task 包装的只读脚本）不能入场。原 result/report 读取仍可用。

本次原维护入口 status/diagnose 独立确认：无 owner、无 Alice 候选、旧/新PID均不在。
Mint 私有原操作 claim 已结束，生命周期 flock 可独占取得；新PID的32条带PID
前缀日志及其续行只有固定脱敏摘要返回：TypeError/fetch_failed、ECONNRESET、
transport_ended，没有 start_game/spawn 成功标记。日志分类不返回原文、登录码、
身份或凭据。证据支持“启动期间网络请求失败并退出”，不是碰撞代码错误的证明，
也不授权清理认证或更改 VPN/防火墙。

## 新维护入口

MCP0.13.0 新增 `openclaw_project_reconcile`，共享路由必须 project_key=alice-ai。
它独立于项目任务入场锁，不调用模型、游戏动作或任意脚本：

```json
{"project_key":"alice-ai","operation_id":"原不明操作ID","mode":"inspect"}
```

只有原操作是已批准的专用 restart、原回执 inconclusive/login_not_yet_verified、
原批准哈希仍匹配、本机旧 runner 已退出、远端原 claim 已结束且 lifecycle 锁空闲，
并证明无任何 Alice 进程，或精确的原替代 PID/出生时间/原世界端口/新鲜心跳和
真实游戏会话都匹配，才返回 review_ready 和60秒有效的 review_digest。

审阅确认后：

```json
{"project_key":"alice-ai","operation_id":"同一原操作ID","mode":"resolve","review_digest":"上一步摘要"}
```

再次独立取证、比较证据指纹/时间窗、核对原回执完整SHA与 active.lock 的
operationId/digest，先持久化审阅 sidecar，再调用现有 store.release 进行匹配释放。
不删除原回执、日志、声明产物、操作 claim；不会改成 passed，不会停止或启动 Alice。
审阅已完成的重复调用只读缓存，绝不释放后来另一项任务的锁。原 project_result
增加 reconciliation 摘要，原 state/inconclusive 不变。损坏的 sidecar 不妨碍读取原回执。

本机维护端使用同一实现（用户无需转抄命令）：

```bash
node scripts/reconcile-alice-client.mjs inspect 原操作ID
node scripts/reconcile-alice-client.mjs resolve 原操作ID review_digest
```

它不是删锁后重试的脚本，也不会把新的客户端启动偷偷包含在 resolve 中。
真正离线后的恢复启动必须是当前用户授权的另一项维护操作：使用原维护
`alice-mac.sh start`，保留原私有配置，确认无进程及原BDS登出门禁后仅启动一次；
保存启动返回及独立心跳/连接证明，不重跑那次失败的 restart。

## 防止再次无限 busy

Alice 重启回执 schema3 增加 exitVerified。等待登录时，如果现场再次证明旧/新
PID均不存在、无 owner、无任何 Alice 候选，则返回 failed/client_exited_before_login，
不自动重试；固定执行器保留失败记录并正常释放锁。只有仍无法查明的状态继续
inconclusive/保留锁。schema2历史仍兼容，不能根据其默认false推断退出。

## 验证与实机结果

恢复、旧回执不变、其他锁保护、过期/改变的审阅、活动runner/远端操作、迟到
上线、脱敏和已退出替代进程分支已加入测试。完整MCP1386/1386、Alice Python321
（跳过3）通过。实机审阅/恢复结果在维护完成后补记。没有BDS重启、世界/玩家/认证清理或不明操作重放。
