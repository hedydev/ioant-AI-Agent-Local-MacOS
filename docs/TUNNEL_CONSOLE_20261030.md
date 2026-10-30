# 本机 Tunnel 控制台与隔离验收

## 启动与日志

在 Mac 的 zsh/bash 中：

```bash
cd "$HOME/Documents/workspace/ioant-AI-Agent-Local-MacOS"
bash scripts/tunnel-console-service.sh start
bash scripts/tunnel-console-service.sh status
open http://127.0.0.1:18489
```

停止 Web 服务（无需执行，只有想关闭服务时才用）：

```bash
cd "$HOME/Documents/workspace/ioant-AI-Agent-Local-MacOS"
bash scripts/tunnel-console-service.sh stop
```

`start` 幂等检查私有 PID/启动时间/入口身份，创建脱离聊天 PTY 的独立会话，
重定向输入输出并保存私有进程记录；已实际核对后台进程 PPID=1、独立进程组和
HTTP 可用。它不是开机自启，也不是系统权限提升。关闭浏览器标签不会停止服务。
直接前台运行仍可用 `bash scripts/tunnel-console.sh`，但终端退出可能影响它。

曾尝试当前登录会话的 launchd 管理；实际日志证明该运行上下文无法读取受 TCC
保护的 Documents 源码目录，已停止本次的特定 job。没有修改 TCC 或申请 FDA。
最终入口采用已授权环境内的独立后台会话，源码仍在本仓库，不复制隐藏凭据。

启动日志：`~/Library/Application Support/ioant-openclaw-ops/tunnel-console/launcher.log`。
结构化脱敏日志：同目录 `sessions/session-*/events*.jsonl`；每段512KiB、最多4段
轮换，保留最近20个已关闭会话。日志路径也显示在网页。不要把私有日志提交 Git。

## 可见功能与边界

- 仅监听127.0.0.1:18489，Host/Origin检查、会话nonce、JSON请求上限和CSP。
- 状态来自官方客户端的 readyz、metrics、status 和 logs；分别显示成功轮询新鲜度、
  进程身份、累计命令、缓冲长度、运行项目任务，而不把进程存在当作连通证明。
- 复用官方客户端的日志缓冲，控制台持续保存脱敏事件。HTTP正文/密钥/完整环境不记录。
- MCP0.8的调用审计只记录工具名、项目/操作ID、状态、耗时与错误码；不记录对话正文、
  参数全文或报告正文。审计在新MCP服务加载后生效，不能补回旧服务历史。
- 行为列表读取已有项目回执；报告面板直接分页读取声明产物，查看不会执行任务。
- 项目列表按实际检出目录命名，验收副本标“测试”；没有删除测试Agent或历史回执。
- 中英语言、浅/深/系统主题、响应式布局和SSE只读更新；断线重连不重发控制请求。

网页“启动通道”通过密码框接收 Runtime Key，只留服务内存；关闭服务后需重新输入。
此前在聊天暴露的密钥已经从AI工具内存清除，不从进程环境或浏览器存储恢复。
“接管/重启”先用原官方客户端doctor核对新凭据/配置，再停止已验证的旧PID，等它
退出后才启动单个替代实例。stdio不支持同一个Tunnel重叠双实例。启动时会拒绝已
存在的相同profile进程；停止仅给经过UID、二进制、profile和启动时间核对的PID
发送SIGTERM，不做pkill/强杀，不关闭Gateway或已分离执行的项目脚本。

Web服务退出会停止它自己启动且仍可验证的Tunnel；仅纳入监控的外部Tunnel不受影响。
不能把Web服务可访问等同于Tunnel已连接：目前应用重启后旧Tunnel已停止，待在网页
私下输入Runtime Key启动新版。不要重复旧业务任务作为连接测试。

## 预检与隔离执行

用户提供的失败回执只有git_preflight_failed和空日志。实际只读复现证明Git status
退出0，但--untracked-files=all产生大输出被截断；原逻辑把truncated统一归为Git失败。
新预检按normal聚合未跟踪目录，明确识别dirty_worktree，保存失败检查、退出码、
超时/截断标志和有界脱敏stderr。成功的dirty输出不再冒充Git命令失败。

repository_task新增可选 `workspace_mode`：

- `in_place`（默认）：原有干净工作区、完整提交核对、ff-only机制不变。
- `isolated`：明确授权的测试/编译可以保留原目录改动，在操作私有产物目录下创建
  新Git检出，从同一已批准origin/branch浅拉取，核对expected_commit，在自有新目录
  checkout该提交后运行已跟踪脚本。不会更新、重置、清理或复制原工作区文件。

新模式不授予生产操作或OS沙箱。临时检出保留便于核查；它允许生成未跟踪编译文件，
但若脚本修改跟踪文件，任务失败。回执区分原目录dirty、实际commit、checkout路径和
生成文件。旧操作ID/digest兼容；isolation模式进入新操作身份，不能拿它重放未知任务。

## 验证事实

完整回归1317项通过，0失败/跳过/取消；包含原始业务执行器回归和新增控制台安全、
脱敏、MCP元数据、预检分类、真实临时Git隔离验收和UI目录一致性测试。
实际本机SDK读取15工具、新workspace_mode schema和0.8版本；只读调用产生审计。
真实浏览器页面读取了项目、状态与旧回执。独立后台服务实际启动并HTTP核对通过。

仍待运行凭据：新版Tunnel真实启动/停止往返、云端工具目录Refresh和网页调用新模式。
这些不能由单元测试或本机SDK结果替代。没有重做NetScale任务、安装VPN或改动AWS服务。

## 中文终端重复启动误报端口占用：已修正

同一60134进程在C/en_US语言下的ps lstart是英文日期，在zh_CN/zh_TW语言下
是本地化日期。旧身份比较使用继承语言的字符串，因而丢失对同一服务的识别，
随后HTTP探测看到已有服务就报console_port_already_in_use。已实际在中文终端
环境复现后固定所有进程身份ps调用的LC_ALL=C。没有忽略真正的端口冲突或停止
已有服务。四种语言环境重复start均核对相同PID与ready=true；身份/控制/API
专项6项通过。未为此清除进程记录或重新启动用户服务。
