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
上线、脱敏和已退出替代进程分支已加入测试。完整MCP1387/1387、Alice Python321
（跳过3）通过。实机审阅/恢复结果在维护完成后补记。没有BDS重启、世界/玩家/认证清理或不明操作重放。


## 实际受控恢复与兼容性

北京时间04:44，维护端以原批准0b0b2ee7完成 inspect→resolve：两次固定取证一致、
旧runner不存在、原claim已结束，无旧/新PID或任何Alice候选，原receipt/digest一致。
独立审计decision=confirmed_offline，原receipt SHA
78f6e4db6ea7bd13f520d0e7394192b2be97a4f406e63d841f733d57ecd1de28不变，
原state仍inconclusive。只释放匹配锁，未重做原restart。

当前用户授权的后续单次正常 start 从原私有配置恢复PID3923865；独立status显示
current_process、心跳1.7秒、连接/会话建立、HP20/IDLE。未改BDS/世界/玩家/认证。
实际MCP alice_recovery_doc_sync_20261103_k4n8v2cs_01 passed/cached，e046ae1→f90c666，
两份维护文件修改校验完整保留，证明任务入场恢复。Alice脚本schema3已提交90b241e，
重新审阅批准hash=4a92be323ec2490de70dade1addd470243cfe05748bac66030f4198df54f733f。

原不明回执在云端MCP仍cached/inconclusive，并附reconciliation=resolved、
confirmed_offline、lockReleased=true；历史决策不代表当前Alice仍离线。新owner
必须独立读取，不能把旧PID/旧样本归到新会话。

恢复审计和review存入项目私有reconciliation子目录，不混入hot receipt的.json计数，
也不影响500条限制/归档读取器。0.13.0短期产生的旧根目录审计由有界迁移校验
operationId、原digest和receipt SHA后保留同一文件内容移至新目录，原回执/日志/
产物/claim不变。此存储兼容修正为0.13.1，新增回归覆盖。

新增恢复工具需要ChatGPT插件目录刷新才会出现在旧会话工具列表；当前用户正在
操作Chrome，维护端没有争抢前台或覆盖其他Chat草稿。原result/report/execute
不受此缓存影响，已有恢复及MCP同步已实际完成。SDK协议验收已通过：真实registered动态路由的0.13.1服务列出17工具，并实际调用
新reconcile的inspect读到resolved/cached=true、clientActionInvoked=false。它读取历史
审计，不是再次解锁或当前离线探测。网页缓存尚未刷新不冒充网页新工具验收。


最终现有云端MCP只读任务 alice_recovery_runtime_verify_20261103_k4n8v2cs_01 在
Alice提交90b241e执行passed/cached，声明产物client_audit实际读取，SHA256
9c8976d66820e0adfaa5ec558c0d1526f54613e3c9a19d375c2f9174b78b250e。
报告alive/heartbeatFresh/connected/sessionEstablished/statusSourceCurrent/worldVerified
全true，当前会话样本8；任务无BDS命令/客户端重启。这证明恢复后正常脚本与回读
链路也通过，不只Git入场。一次错误的短SHA参数被connector schema在入场前拒绝，
随后使用实际完整HEAD、同一未入场编号提交；没有执行或重做错误版本。

MCP全量1387/1387、最终恢复/生命周期/归档专项27/27、Alice321(skip3)/生命周期10通过。
SDK验收辅助最初用不支持的单项目shared模式，连接在任何工具调用前关闭；修正为
正式registered模式后通过，不涉及游戏操作。


最终服务加载验证：MCP0.13.1正常加载，新Tunnel PID46603 ready，Web未重启、
密钥仅沿用内存。实际云端actions返回lifecycleRecovery.tool=openclaw_project_reconcile、
independentOfProjectExecutionLock=true；原restart批准4a92be...733f启用。
云端原result实际读到新子目录审计并附resolved/lockReleased=true，旧inconclusive不变。
控制台history observed、activeCount0、locked=false、剩余229/500、旧uncertain1保留；
此1条是历史回执，不代表仍有保留的执行锁。未额外归档、删除claims或重放任何重启。
最终独立status仍为PID3923865/current_process、在线/心跳/会话true、HP20/IDLE。
