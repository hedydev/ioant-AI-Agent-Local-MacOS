# ChatGPT 换 Chat 后继续同一个 OpenClaw 项目

用户要求：ChatGPT Chat 达到上下文/聊天上限后，旧 Chat 给出交接话；用户在
同一项目创建 New chat，粘贴后继续。新 Chat 没有旧 Chat 的完整上下文。

## 项目保持固定，聊天可以更换

| 身份/状态 | 更换 Chat 时 |
| --- | --- |
| `project_key` | 保持，例如 `alice-ai` |
| OpenClaw Agent | 保持，项目固定绑定，不能由远端指定任意 Agent |
| 工作目录、电脑任务回执、项目交接记录 | 保留在本机各自独立的位置 |
| ChatGPT Chat URL、完整历史 | 不假定保留或相同 |
| `conversation_key` | 新 Chat 生成新的唯一值 |
| 本地模型会话 | 随新 conversation_key 建立；通过项目摘要接续，不假装拥有旧上下文 |

同一个 Tunnel 可以使用显式共享模式，当前注册：

- `openclaw-workflow` → `openclaw-dev`，已启用原生 computer。
- `alice-ai` → `alice-ai`，目前仍为无工具顾问；共享路由不会为它增加电脑权限。

项目键只是本机注册路由，不是经过认证的 ChatGPT Project ID。
同一私有插件可访问被本机显式启用的这些项目；模型必须根据用户明确的项目或
交接话选择键。此协议不能提供不同用户之间的授权隔离，也不提供操作系统沙箱。
没有从 ChatGPT URL 自动推断身份或自动创建任意 Agent 的功能。

## 七个共享模式工具

`openclaw_projects` 列出注册项目；其余工具均要求 `project_key`：

| 工具 | 功能 |
| --- | --- |
| `openclaw_agent_status` | 当前项目的本机策略状态，不调用模型或操作电脑 |
| `openclaw_agent_message` | 无工具顾问消息；电脑已启用的 Agent 应使用 task |
| `openclaw_computer_task` | 唯一 operation_id 的用户授权电脑任务 |
| `openclaw_computer_result` | 查询已保存回执，不重做任务 |
| `openclaw_project_resume` | 读取最新交接、修订号和被引用操作的当前回执 |
| `openclaw_project_handoff` | 按 expected_revision 保存摘要，并生成可复制交接话 |

旧固定模式 `--project <key>` 继续公开原有四个工具，不接受远端切换项目。
共享模式是新的本机启动选项；工具目录改变后，ChatGPT 插件也必须刷新。

## 旧 Chat 交接与新 Chat 恢复

1. 旧 Chat 先调用 `openclaw_project_resume`，得到最新 `revision`，空项目为 0。
2. 调用 `openclaw_project_handoff`：传入本 Chat 的 `conversation_key`、准确的
   `expected_revision`、不超过 1800 字符/6000 UTF-8 字节的事实摘要，以及最多
   20 个本项目已有 operation_id。摘要应包含目标、代码/文档位置、已验证结果、
   待办和限制；不要放密钥、长聊天记录或内部思维链。
3. 将返回的 `handoff_text` 交给用户。用户在同一项目新建 Chat、启用 MCP 并粘贴。
4. 新 Chat 按其中 `project_key` 和 `minimum_revision` 调用 resume，生成新的
   `conversation_key`，核对项目身份、摘要和当前用户意图后继续。
5. 已执行、进行中或不确定的 operation_id 只查回执。交接记录不是新的执行授权，
   换 Chat 或换 operation_id 都不能成为重复执行依据。

摘要存储为私有、不可覆盖的修订文件。并发/过期 expected_revision 返回冲突，
损坏的新记录会阻止恢复，不能偷偷使用更旧状态。读取时重新查询引用回执，
而非相信旧 Chat 写下的成功结论。每项目目前最多 100 个交接修订；达到上限需
人工规划归档，不会自动删除历史。普通无工具聊天 Agent 的跨 Chat 记忆设置不变。

MCP 不会自动取得网页 ChatGPT 的完整历史或聊天上限计量。建议在重要阶段或
接近上限时要求旧 Chat 保存交接；若已经硬性到限而未能保存，只能恢复最近
保存的摘要、项目文档和已有回执，未保存的聊天上下文不能凭空恢复。

本机状态位于私有 app-support 目录 `direct-project-state-<project_key>`，
电脑回执在 `direct-computer-<project_key>`。这些文件、密钥和原始界面记录不入 Git。

## 本次本机验证与发布边界

共享 stdio MCP 的初始化、七工具发现、工作流/Alice 独立状态查询已通过，未调用
模型或操作电脑。真实保存了工作流交接修订 1；另一个新 Node/MCP 进程成功恢复
摘要与三个已有操作的回执；Alice 查询仍为空。此证据证明本机跨进程持久性，
不等于 ChatGPT 网页的新 Chat 验收。

随后工作流交接更新到修订 2，并主动给 Alice 保存了独立的“连接配置交接”
修订 1；Alice 新进程恢复成功、引用操作为空。Alice 记录明确不代表已经接收
旧 Chat 的全部项目需求/开发进度。工作流的操作回执没有混入 Alice。

原生 Mac 节点在线，Tunnel 云端轮询成功。ChatGPT 自带 Computer Use 权限与
OpenClaw 是两套独立授权；本工作流不要求补前者的截图/扩展权限。
用户已明确授权通过 OpenClaw 打开 Chrome 插件页并 Refresh。两次本地模型界面
委托未在 120 秒内返回；查询历史确认只做了观察/激活，没有 URL 输入或 Refresh。
原任务回执保持不确定，不将它们整体重做。新增固定原生脚本用于这一已授权设置
步骤，复用 OpenClaw node、项目 computer 策略和只关闭自己 execution 的规则。
脚本不调用本地模型，不使用浏览器 Relay/CDP，不截图、不发送聊天消息。

首次实际原生 open 步骤只调用 list_windows，因存在多个 Chrome 窗口而停止，
没有执行输入/激活步骤，并收到自己 execution 的关闭 ACK。随后新增多窗口识别：
仅查询各 Chrome 窗口的地址栏，优先唯一 Plugins 地址，其次为用户本次打开、
已在项目注册表中的 Alice Chat 地址；没有唯一匹配就不输入。此处地址只用于
本次插件页面所在窗口的识别，不成为 MCP 项目绑定，也不假定未来 Chat URL 固定。
相关原生步骤测试 5/5 通过，后续实际执行待用户完成终端密钥输入。

最新完整回归已通过：`node --test --test-concurrency=4`，1234/1234。初次默认
并发运行中，旧 Worker 夹具的 17 秒等待
窗口未收到反馈；该测试单项复核通过，随后完整四并发套件通过。未修改其测试
断言/时限或旧 Worker 生产逻辑；原失败日志保留在本机私有验证目录。
源码已提交并推送（功能 `458a1e6`、多窗口识别 `4681f5a`），私有共享 Tunnel
配置已通过 dry-run、备份、写入和语义读回检查；这不代表旧进程已重新加载。
当前等待用户在原终端重启并私下输入 Runtime Key；期间不切走用户焦点。
尚待：新进程共享模式/云端轮询确认、更新后的原生页面步骤实际验证、插件
Refresh 至七个工具，以及 ChatGPT 网页的项目和新 Chat 接续验收。
同一个 Tunnel 原进程的 Runtime Key 只存在内存中，未保存；新进程需要用户在
终端私下输入，不能从旧进程环境取回密钥，也不能在 Chat 中提交。

## Mac 上的命令

```bash
cd "$HOME/Documents/workspace/ioant-AI-Agent-Local-MacOS"
# 只读本机 MCP 检查，不调用模型/电脑：
bash scripts/dev-env.sh exec node scripts/direct-openclaw-shared-smoke.mjs --status
bash scripts/dev-env.sh exec node scripts/direct-openclaw-shared-smoke.mjs --status alice-ai
bash scripts/dev-env.sh exec node scripts/direct-openclaw-project-state.mjs resume openclaw-workflow
# 一次性准备已有私有 Tunnel 配置（先 dry-run，已经 prepared 后不需重做）：
bash scripts/dev-env.sh exec node scripts/configure-direct-shared-tunnel.mjs --dry-run
bash scripts/dev-env.sh exec node scripts/configure-direct-shared-tunnel.mjs --apply
# 在原 Tunnel 前台终端 Ctrl-C 后启动；仅此组件重启：
bash scripts/direct-openclaw-tunnel.sh
```

不重启 Gateway、原 Worker 或 Alice Coordinator。隧道就绪后，在 ChatGPT Plugins
打开 OpenClaw Mac，Refresh，确认七个工具，再在新 Chat 验证。固定原生页面脚本
`scripts/openclaw-plugin-page.mjs` 的 `open/details/refresh <operation_id>` 都是
显式、一次性的界面操作；`inspect` 只读。不要把这些操作当作一般健康检查重跑。

官方刷新步骤：
https://developers.openai.com/plugins/deploy/connect-chatgpt#refresh-metadata
