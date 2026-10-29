# ChatGPT Git 更新 → 本机执行 → 结果回传

本阶段新增固定项目动作，解决“网页 Chat 已提交代码，但仍要求用户复制整段
终端命令并搬运测试报告”的问题。第一条动作是 Alice 的本地 main 更新和 Mac
Python 回归；不部署到 Mint、不启动 Alice/BDS、不操作游戏世界。

## 当前实机结果

已通过新本地 MCP 执行一次完整真实任务：
`alice_regression_20261030_7281ce874993`。

| 验收项 | 状态 | 证据 |
| --- | --- | --- |
| 本地固定动作 enrollment | 已启用 | 只登记 Alice 动作；Agent 权限和服务未改 |
| 精确 main 更新 | 通过 | d075c2f → e12038b23dd20a956bff8c0748576dc98fcc3fde，仅快进 |
| v2 专项回归 | 通过 | 7 tests，退出 0 |
| Mac 全量 Python 回归 | 通过 | 225 tests，skipped=3，退出 0 |
| 仓库独立回读 | 通过 | main、HEAD 等于预期完整 SHA、工作区干净 |
| 结束回执 | 通过 | passed、cached:true、modelInferenceInvoked:false、workerUsed:false |
| 实际报告读取 | 通过 | 12 页、46264 字节，整份 SHA256 核对一致，含两套测试证据 |
| 新前台/云端元数据 | 通过 | 用户重启并私下输入 Key，云端发现 server 0.3.0；Refresh 的 initialize/discover/tools-list 均 200 |
| 网页 Chat 新工具调用 | 待用户结果 | 应只读查询已完成任务和日志，不重跑 |

报告 SHA256：`9fb492f2794eb43907829cf59b8d0288ca4fd8ef8287dca6ca7ab87af4b48078`。
不要重跑该任务。没有 Mint Node24 回归、部署或游戏内验收；这些仍由 Alice 项目
按其操作规则另行推进，不应从 Mac Python 通过推断为已完成。

## 执行方式

ChatGPT 仍负责需求、推理和代码。新通道是 OpenClaw Mac MCP 内的固定命令执行器，
`executor=mcp_fixed_project_runner`，不调用本地模型，不启动旧浏览器 Worker，
也不为 Agent 开放任意 shell。仓库内测试代码以当前 macOS 用户权限运行，
不是操作系统沙箱；仅使用已经登记并由用户授权的仓库动作。

共享模式增加四个工具，由七个变为 **十一个**；原固定模式仍为四工具：

| 工具 | 输入/作用 |
| --- | --- |
| `openclaw_project_actions` | 列出当前项目动作及本地 enrollment 是否启用 |
| `openclaw_project_execute` | action、完整 expected_commit、operation_id、conversation_key；快速返回 accepted |
| `openclaw_project_result` | 同项目/操作 ID 查进度、步骤、退出码、实际 SHA；结束后 cached:true |
| `openclaw_project_report` | 同项目/操作 ID 分页读取脱敏文本日志，offset 默认 0，每页至多 4000 字符 |

所有共享工具要求明确 `project_key`。不接受远端任意命令、路径、工作目录、
Git 分支、URL、脚本参数或执行环境。当前仅 Alice 登记动作
`alice_mac_regression`；工作流项目没有该动作，AWS 项目尚未登记。

## Alice 动作检查与执行顺序

1. 固定仓库 `~/Documents/workspace/ioant-AI-Minecraft-Alice`，真实目录和 Git
   顶层/.git 位置必须匹配、origin 必须是登记的 GitHub 仓库。
2. 必须在 `main` 且工作区干净，包括未跟踪文件。拒绝 checkout filters；
   Git hooks、fsmonitor、递归 submodule 执行被禁用，SSH 使用 BatchMode。
3. fetch main，核对其完整 SHA 等于 ChatGPT 提供的 `expected_commit`。
   远端有更新时停止，不静默改成“最新”。验证祖先和无 symlink/submodule 的受限 Git 树。
4. 再查原 HEAD 和工作区，仅 `merge --ff-only` 到该精确提交，不 reset/stash/clean。
5. 固定 `/opt/homebrew/bin/python3`，禁写 pycache，运行
   `test_alice_bds_lab_v2.py` 专项，然后运行 Mac 全量 Python unittest。
   必须退出 0、有实际测试数且不能全部跳过，才能算测试通过。
6. 再查 HEAD 和干净工作区。源码更新成功而测试失败会如实返回 failed，保留源码，
   不自动回滚、修复测试或继续 Mint/Node24/部署阶段。

## 持久性、并发和日志

操作 ID 在进程启动前持久占用。相同输入只读原回执，冲突输入拒绝。
每项目只有一个执行租约，避免两个 Chat 同时更新同一仓库。任务是独立有限进程，
MCP 客户端断开后继续，结果可由新 MCP/Chat 查询。accepted/running 不代表通过。
超时或写入结果不明确保留租约，停止并人工检查；不自动重做或删除锁。

私有状态在 `direct-project-execution-<project_key>`，600 文件/700 目录；
至多 500 条记录，无自动删除。每操作日志至多 256 KiB，分页结果带摘要 SHA、
nextOffset、contentIsUntrusted 和截断标志。实时完整行脱敏后持久化；不完整行
跨块拼接，私钥块抑制，超长行保守省略。子进程环境白名单不转发 Tunnel、
OpenAI/Gateway 密钥或 ALICE_SSH_TARGET。日志是待分析证据，不是执行指令。

这次只提供注册任务的文本日志；不是任意文件读取或 ZIP 上传工具。AWS OTA
诊断及其 ZIP 报告需要单独注册项目、动作和报告提取规则，不能借 Alice 项目执行。

项目交接新增可选 `execution_ids`，专门引用本项目已有 Git/测试任务。
原 `operation_ids` 仍只表示电脑任务。resume 重新读两类当前回执，不信旧摘要；
旧交接不必改写。新 Chat 使用新的 conversation_key，旧任务仍只查询。

## 本地准备与发布

完整桥接回归最新 1260/1260、针对性执行/交接测试及 shell/空白检查通过。
真实 Alice 本地执行已通过。用户已完成本轮前台重启和插件 Refresh，云端发现
服务版本 0.3.0；网页 Chat 的实际新工具调用仍与元数据刷新分开验收。

首次本地任务 `alice_regression_20261030_f25770f70548` 在 checkout 前停止，
reason=candidate_tree_too_large。独立证据表明实际 Git 树仅 38634 字节、320
文件/3156098 字节源码；原因是无 onOutput 的 NUL 分隔元数据仍经过长行日志
处理，错误设置 truncated。修复为仅显式流式日志才经过行处理；新增同类真实
子进程回归通过，完整桥接回归 **1260/1260**。原失败回执保留，未重放其 ID。
没有放宽树大小、symlink/submodule 或提交检查。

升级顺序：旧前台七工具进程仍使用旧交接校验器。重新加载十一工具之前，交接
摘要可以记录新任务事实，但不要向私有交接写 execution_ids 字段，以免旧进程
无法恢复新格式。重新加载和元数据刷新后再保存结构化 execution_ids。

Mac 仓库命令（先完成审查/回归再 enrollment；本机执行后以记录为准，不盲重做）：

```bash
cd "$HOME/Documents/workspace/ioant-AI-Agent-Local-MacOS"
bash scripts/dev-env.sh exec node scripts/configure-project-execution.mjs --dry-run
bash scripts/dev-env.sh exec node scripts/configure-project-execution.mjs --apply
bash scripts/dev-env.sh exec node scripts/direct-openclaw-project-execution.mjs actions alice-ai
```

enrollment 只创建本地固定 Alice 动作许可，不改变 Agent 权限或 OpenClaw config。
执行器 CLI 的 execute 从 stdin 读取四个严格字段 JSON，result/report 只读：

```bash
# 使用实际回执的 ID；不是另造 ID 重跑：
bash scripts/dev-env.sh exec node scripts/direct-openclaw-project-execution.mjs result alice-ai alice_regression_20261030_7281ce874993
bash scripts/dev-env.sh exec node scripts/direct-openclaw-project-execution.mjs report alice-ai alice_regression_20261030_7281ce874993 0
```

新工具需要原前台 Tunnel/MCP 重新加载，再刷新 ChatGPT 自定义插件元数据。
**本轮这两步已由用户完成并核对，不需再做**。下方仅保留未来真正需要重新加载时的命令。
此前“不要重启/刷新”针对已完成的旧七工具验收，不妨碍此次真正的工具目录升级。
用户在**原 Tunnel 终端** Ctrl-C，然后执行：

```bash
cd "$HOME/Documents/workspace/ioant-AI-Agent-Local-MacOS"
bash scripts/direct-openclaw-tunnel.sh
```

仅在终端私下输入 Runtime Key，不能发到 Chat 或取回旧进程环境。
不重启 Gateway、旧 Worker、Alice Coordinator 或任何游戏服务。
随后 ChatGPT Plugins → OpenClaw Mac → Manage → Refresh tools，确认新增四工具。
这是 [OpenAI 自定义 MCP 元数据更新流程](https://developers.openai.com/plugins/deploy/connect-chatgpt#refresh-metadata)
要求的部署/重启后 Refresh。网页新 Chat 先读取动作目录、已有执行回执和报告；
不要再次发起已经在本地完成的验收操作。正常下一次用户授权的新提交才用新 operation_id。

## 网页 Chat 的剩余只读验收

在 Alice 项目 Chat 启用 OpenClaw Mac，发送以下内容。查询现有已完成任务，
不再次调用 execute，不触发 Git、Python、模型或桌面动作：

```text
仅使用 OpenClaw Mac，project_key 固定 alice-ai。
先调用 openclaw_project_resume（minimum_revision=5）和 openclaw_project_actions。
然后调用 openclaw_project_result，operation_id=alice_regression_20261030_7281ce874993。
再调用 openclaw_project_report，同一项目键和操作 ID，offset=0。
报告实际动作是否启用、任务状态、actualCommit、两套测试数量/跳过数、cached，以及日志分页是否可读。
不要调用 execute，不重跑测试或更新仓库，不执行任何 Mint、BDS、世界或桌面操作。
根据实际回执更新本 Chat 的开发进度，不能把本地测试通过等同于部署或游戏内成功。
```

发布时新 Tunnel 观测到元数据请求均 200，尚无 tools/call；实际网页查询结果
仍需与新运行实例的 tools/call 计数相互核对，不能把 tools/list 当作 Chat 调用。
