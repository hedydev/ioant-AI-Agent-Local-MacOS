# AI-OpenClaw 工作流 — ChatGPT 项目交接（2026-10-28）

> **这是项目所有权交接材料，不是自动切换完成凭证。** 2026-10-28 ChatGPT 对话达到 UI 长度上限，由原项目 ChatGPT 负责写作和核实本文，保存于 GitHub。新会话需要在同一个 `AI-OpenClaw工作流` ChatGPT Project 内由用户创建，并自行确认此文和现场。不得以此文冒充新聊天授权、DOM 收据或 Worker 重绑定完成证明。

## 1. 项目目的与不可混淆的角色

**用户目标**：多个 ChatGPT Project 会话各自主导各自项目的分析、架构、代码编写与审核、测试证据判定及最终验收；OpenClaw 本地 Worker、Ollama 模型和可选本地 Agents 仅是受控的工具执行者及咨询者。用户希望 Worker 有原生 macOS Computer Use（视觉 + 授权操作）能力，能帮助发现 Chrome 中具体的项目 Chat，并执行受控任务。所有复杂操作应 **先提交 GitHub repo 脚本并测试部署，Worker 只执行短命令**。主机报告、截图和诊断日志放在 Mac 桌面，私人运行状态放 LunaDrive。

**Chat 权威边界**：
- `openclaw-workflow` ChatGPT Chat（旧/当前会话 `6adfdfb9-65b0-83ec-b6ac-155e7852c6af`）拥有 OpenClaw 工作流开发及验收，仓库 `hedydev/ioant-AI-Agent-Local-MacOS`。
- `alice-ai` ChatGPT Chat（单独 ChatGPT 项目，会话 `6ade11a5-f0c0-83ec-add1-8a0cff00c938`）**独占** Minecraft AliceAI 项目的代码分析、开发决策与验收，仓库 `hedydev/ioant-AI-Minecraft-Alice`。本 OpenClaw Chat 和本地 `alice-ai` Ollama/OpenClaw Agent 均不能替代 Alice 项目 Chat 作决定。
- 本地 AliceAI 多角色 DAG 的七个 Worker 是**逻辑角色标签**，不是七个浏览器写入进程或独立 ChatGPT 聊天。

## 2. 环境、运行与两条独立 Chat 路由

- Mac：M1 Pro 32 GB；OpenClaw CLI 与 App `2026.10.7`；Gateway `127.0.0.1:18789`；Ollama `127.0.0.1:11435`；Chrome 扩展浏览器配置 `chrome`。
- 主 ops Worker：LaunchAgent `com.ioant.openclaw.safe-watcher`，绑定上面的 OpenClaw Chat；曾观察到 PID 99222，**仅历史观察值，需现场重新查 PID**。
- AliceAI 协调 Worker：`com.ioant.openclaw.alice-coordinator`，绑定独立 AliceAI Chat；上次观察 PID 3199，**仅历史观察值**；其 host 动作严格只读，握手 `alice-coordinator-verify-20261027-103` 仍为 `requested`。不可由本 Chat 伪造 AliceAI Chat 的授权。
- Main Worker 本地脚本安全发布操作：`action: "project-update-verify"`；允许的已授权本会话 `mac-terminal` 可执行短的、已部署脚本命令。**旧会话授权不可自动延续给新 Chat**。
- 主要脚本源代码存在 repo `stage2/`、`scripts/`；私有部署运行根 `$HOME/Library/Application Support/ioant-openclaw-ops/runtime`；运行服务和浏览器边界详见 `AGENTS.md`、`docs/CHATGPT_PROJECT_OWNER_AUTHORITY_20261027.md`。

## 3. AliceAI Chat 的 Chrome Relay 定位问题（尚未解决）

- 用户展示的 Chrome 截图显示 **正确 AliceAI 项目会话 URL**（结尾 `/c/6ade11a5-f0c0-83ec-add1-8a0cff00c938`）、扩展绿色 `ON` 和 `"OpenClaw" started debugging this browser` 横幅。
- 多次 **OpenClaw CLI** `browser --browser-profile chrome --json tabs` 观察：`visibleTabs=9`, `chatgptTabs=3`, `aliceMatches=0`。项目标题提示也未匹配。注意这只证明 CLI 返回的清单中找不到 AliceAI Chat，不能声称物理 Chrome 窗口里不存在它。
- 任务 `137` 的 browser doctor：Gateway endpoint OK，`chrome (extension)` OK，运行中，Chrome 扩展 running 2.3.0 与 bundled 2.3.0 匹配，configured profiles=3，tabs=9。CDP status `cdpReady=true`, port `18799`。
- Alice coordinator 日志一直报 `different_chat_visible`, `sameConversationId=0`。**不要靠重复重启 Worker、强制导航、换 CDP 读取、绕过 Browser Relay/权限来假装连上 Alice Chat。** 必须在确切同一 Project Chat 上验证用户消息与回执。
- 后续原计划：通过配对 Mac Node 截图，并由获授权的本地视觉模型协助判断 Chrome/扩展界面差异，而非继续只读同一 tabs 清单。

## 4. 原生 macOS 视觉节点：最新真实验收

已实施并部署可直接复用的 `scripts/openclaw-mac-visual.mjs`，模式：
- `inspect`：只读调用 OpenClaw `nodes status --json`，识别 Mac Node；不截屏，不点击/输入。
- `capture`：显式触发一次已经配对的 Mac Node `screen.snapshot`，限制大小格式，并保存 owner-only JPEG/PNG 到 Mac Desktop。**不调用 `computer.act`，不自动上传图像，不自动分析。**

功能与安全测试：
1. GitHub 提交 `4e4c455d4d56ac22867cca7b6f716ab5c328d541`（首次脚本、测试与 Script First 规则）；`project-update-verify` 更新，回归 **552/552 PASS**。
2. 首次 `inspect` 在任务 `139B` 失败 `active_macos_node_unavailable`，原因是严格假设 `activeNodeId===nodes[].id`，而实际需要 `nodeId`。
3. 修复提交 `0fd016c443c93016da0ab9f1c4b232301beaa885`；节点选择支持 `nodeId`，唯一在线 Mac 可选，多台在线 Mac 必须无歧义。任务 `139C` `project-update-verify` **555/555 PASS**，从 `4e4c455` 更新到 `0fd016c`。
4. `139D` 真机 `inspect` **PASSED**：`platform=macOS 27.0.1`, `selection=active_connected_mac`, `identifierField=nodeId`, `snapshotAdvertised=true`, `computerActAdvertised=true`, `state=observed`, `invokedComputerAct=false`。
5. **最新任务 `139E` 真机 capture PASSED**，已生成 Mac 本地文件：
   - `/Users/ted/Desktop/IOANT-Mac-Visual-Snapshot-20261027T170252Z-5f965fc6.jpg`
   - `1280x720`、`142132` bytes、SHA-256 `0921882d0523aeacaa558235c6bb9cd940ae8229b08c889dad144fe9654536ad`
   - 结果日志 `/Users/ted/Desktop/IOANT-Mac-Visual-Result-20261027T170252Z-d1f9315f.log`
   - 这是真实截图回执，但**图像内容尚未在本 Chat 读取/分析，也尚未送给本地视觉模型**。用户如想让新 ChatGPT 直接检查，需要把该 JPEG 附件上传给新 Chat；或新 Chat 决定实现经批准的本地视觉识别脚本。上传时注意屏幕可能含私人信息。
- `computer.act` 只是节点声明支持，**没有验证操作授权，也从未在以上任务调用**。
- **GitHub 最新并行开发**：在本交接整理期间，main 已从 `0fd016c443c93016da0ab9f1c4b232301beaa885` 前进，经 `84a8c32a1ff7b5e6fce012b5f08ed7ca04194d46` 到 `2a80eeb93c80a71112b82617d288482949c06c0d`。新增 `scripts/openclaw-mac-vision.mjs` / `test/openclaw-mac-vision.test.mjs`：已写出基于 SHA-256 锁定截图、仅在本机 Ollama 127.0.0.1:11435 做视觉建议的**候选实现**，并增加 UUID 脱敏；`docs/CHATGPT_PROJECT_OWNER_AUTHORITY_20261027.md` 已记录界限。
- **不要把 HEAD 与部署状态混淆**：本聊天最后一份 `project-update-verify` 回执只证明 `0fd016c` 已部署且 555/555 通过；`84a8c32` 和 `2a80eeb` 的完整测试、Mac 部署和视觉推理本聊天**没有收到验收回执**。新 Chat 需要读取当前 main HEAD 并确认部署/测试再使用。
- 本交接文档自身提交也会使 GitHub main HEAD 再次前移，**不代表 Mac Worker 已重新部署新文档**。

## 5. 用户确认的 Script First 工作规范

- **必须**优先在 GitHub `hedydev/ioant-AI-Agent-Local-MacOS` 编写、提交、测试复杂流程，以 `project-update-verify` 部署后，才让 Worker 执行 `node scripts/name.mjs inspect` 这种短命令。停止发送大段 `node -e`、冗长 `zsh` 或 here-doc 脚本。
- 把 bounded JSON 结果和证据/日志放 Desktop。不得凭单一退出码自动批准开发成果。
- 新的浏览器消息发送、会话创建/路由变更、截图/电脑操作需要明确许可和可验证回执；脚本不改变权限模型。

## 6. 已有 ChatGPT 会话交接能力与实际局限

项目确实有：
- `stage2/chat-handoff.mjs`：请求/文稿/新 Chat 验证/收据/Agent ack/提升的纯状态机，包含 `IOANT_CHAT_HANDOFF_V1`、`IOANT_CHAT_HANDOFF_RECEIPT_V1`。
- `stage2/handoff-journal.mjs`：LunaDrive 私有、原子 journal，write-ahead send intent，防重复投递。
- `stage2/chat-projects-cli.mjs`：`status`、`handoff-status <project>`、`preview <project> <id>`、`check-successor <project> <url>`；只读/建议功能。
- 文档 `docs/HANDOFF_JOURNAL.md` 和 `docs/MULTI_CHAT_ROUTING_HANDOFF.md`。

**当前未实现：** 自动在同一 ChatGPT Project 创建新 Chat；实际浏览器写入交接消息；原始会话/新会话双向收据确认；安全停止旧 watcher 并重新注册 LaunchAgent 绑定；重新由用户授权 `mac-terminal`/macOS 窗口操作。现有核心状态机不代表上述已落地。**不能让 Worker 自己生成 URL 或无授权跨会话发送、篡改 registry、冒用新 Chat 权限。**

## 7. 建议给新 ChatGPT 会话的工作顺序

1. 用户在 **同一个 `AI-OpenClaw工作流` ChatGPT Project** 新建聊天，发送以下接手要求或直接引用本 GitHub 文档。先读取 `AGENTS.md`、本交接文档、`docs/CHATGPT_PROJECT_OWNER_AUTHORITY_20261027.md`、`docs/MULTI_CHAT_ROUTING_HANDOFF.md` 和 `docs/HANDOFF_JOURNAL.md`；现场核对仓库与部署版本。
2. 继续视觉诊断：先核对仓库已有 `scripts/openclaw-mac-vision.mjs` 候选实现是否已完成回归与 Mac 部署，再用固定 Desktop JPEG 名称和 SHA-256 进行独立授权的本地视觉分析；或者请用户将上述 JPEG 上传到新 Chat 直接检查。不能自动获得 `computer.act` 权限。
3. 实现并验收**同项目新 Chat 安全迁移**，顺序为：用户创建新 Chat → 精确 Project/会话身份校验 → 交接文本与 hash/确认 → 停旧 watcher 且不乱清除锁 → 独立授权下重绑主 Worker → 新 Chat 实际双向回执。先证明每一步，再宣称迁移成功。优先利用现有 handoff state machine/journal，不重复实现。
4. 随后继续排查 AliceAI Chrome Relay 在正确页面仍 `aliceMatches=0` 的问题。Alice 的 Minecraft 代码验收依旧归 Alice ChatGPT Project Chat。
5. 不重启/改写 Minecraft BDS、Gateway/Worker、浏览器访问权限或现有 DAG Revision 24，除非对应授权与现场证据清晰。Alice workflow 最近 `alice-local-pilot` revision 24，`requirements` `verification_pending`，1 个 receipt，6 个待执行，不可强行放行。

## 8. 给新 ChatGPT 的简短接手消息

> 接手 AI-OpenClaw 工作流。先读取私有 GitHub `hedydev/ioant-AI-Agent-Local-MacOS` 的 `docs/HANDOFF_OPENCLAW_WORKFLOW_20261028.md` 和其中列出的关联文件，核对 HEAD、已有独立 Worker、`script-first` 规范和 ChatGPT Project Chat 的项目所有权边界。旧 OpenClaw Chat 达到长度上限，Mac Node 视觉截图任务 `139E` 已通过，Mac Desktop JPEG 需要分析；但主 Worker 仍绑定旧 Chat，新 Chat 的授权与路由迁移尚未完成。优先复用既有 `chat-handoff.mjs` / `handoff-journal.mjs`，安全实现新 Chat 接管并继续视觉定位 AliceAI Chrome Relay。先报告能够验证的接管状态，不可冒称已经重绑定或获得旧终端权限。复杂任务一律 GitHub 提交脚本、测试后短命令给 Worker，日志桌面。

## 9. 明确尚未完成或未经实测的部分

- 新 Chat 与主 ops Worker 的安全重绑定、实际消息发送/接收。
- 本地视觉建议脚本已经在 GitHub 出现，但本次会话**未收到**模型调用或截图识别成功回执；`computer.act` 实际授权/动作也未验收。
- AliceAI Chat 的浏览器 exact-tab 可见性修复、握手成功、正式 Alice 项目验收。
- 新交接文档提交后 Mac 运行副本与 GitHub HEAD 的一致性。
