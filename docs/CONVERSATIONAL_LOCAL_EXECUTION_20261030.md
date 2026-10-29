# 普通聊天驱动本地执行：当前方向

## 后续实现检查点：0.4.0 候选版

通用任务现在已接入异步 MCP admission、持久 runner、私有产物和项目登记：

- `openclaw_project_execute` 支持 `action=repository_task`，额外带
  `task_file=.openclaw/tasks/<name>.json`。ChatGPT 自己提交脚本/任务数据，
  用户继续普通聊天；工具说明和 server instructions 明确要求自行选择调用。
- 项目、独立 Agent/工作区、仓库/分支/origin、脚本根目录和解释器路径来自
  本机私有 `direct-repository-task-grants.json`。旧 Alice grant 不改写。
- 新的 `scripts/configure-repository-tasks.mjs --dry-run|--apply <private-file>`
  是本机一次性登记入口，校验已有独立 Agent、私有工作区、仓库 clean/origin/branch
  和解释器；只追加，不悄悄替换现有授权，不调用模型或重启服务。
  输入文件由实施 AI 在本机准备，不要求用户编写 JSON。
- `--shared-projects registered` 可在启动时加载本机登记项目；现有显式双项目
  profile 兼容。新项目仍需要自己的已配置 Agent，登记不会复制旧 Agent 的权限。
  没有新建任意业务项目或扩大旧 Worker 的 Agent allowlist。
- runner 在快进前验证远端 task/script blob，更新后逐步核对 HEAD/脚本；复用
  原 operation ID digest、锁、超时未知状态和回执缓存。旧动作 digest 保持兼容。
- 每次操作有私有 output 目录。声明的 text/JSON/ZIP 指定成员被校验和脱敏后
  存成独立快照，通过 `project_report` 的 `artifact_id` 分页读取；默认仍读
  execution_log，保留 logText 双通道契约。
- ZIP 不解压，限制大小/条目/展开比例，拒绝路径穿越、加密、符号链接和重复
  成员；JSON 对凭据字段脱敏，文本复用原脱敏器。脱敏不构成任意敏感数据外发授权。
- 两个独立临时 Git 项目使用同一通用 MCP 入口/runner 完成真实 fetch、精确提交
  快进、脚本执行、JSON 产物、脱敏、缓存回执和篡改拒绝。另验证缺失声明报告时
  即使脚本 exit 0 也不算 passed，以及官方 MCP SDK 的通用产物结构化输出。

当前线上还是此前的 0.3.1。0.4.0 源码测试不等于网页上线验收；旧任务/坐标验收
不要重做。上线时只需一次原前台隧道重启（原 Runtime Key 在终端私下输入），
然后 OpenClaw Mac Refresh tools。不要把密钥发到聊天。新动作要先查询 actions，
结果不明确只查原 operation ID，不能自动重提。

新版上线操作（本机仓库已经更新后，在原终端 Ctrl-C 停止原前台隧道）：

```bash
cd "$HOME/Documents/workspace/ioant-AI-Agent-Local-MacOS"
bash scripts/direct-openclaw-tunnel.sh
```

这次是完整新版工具契约上线所需的一次重载，与下面历史“仅内核无需重启”的
检查点不同。网页确认新 `repository_task` 和 `artifact_id` 后再作新任务验收。
新的 Chat 启用 OpenClaw Mac，resume 项目交接并使用新的 conversation_key。
普通聊天工具选择仍受 ChatGPT 与插件可用性/授权影响，不保证每轮一定调用。

完整回归：1278/1278 通过，0 失败/跳过/取消；全部 scripts/*.sh 语法检查和
git diff --check 通过。原始验证日志保留在本机 LunaDrive verification 下。

## 历史：初始内核检查点


用户在 2026-10-30 明确纠正：AWS 和 Alice 都是说明沟通方式的例子，
**不要为每个项目在桥接代码里编写专用处理**。目标是继续像普通聊天一样向
ChatGPT 描述工作；ChatGPT 根据工具说明自行判断何时调用 MCP，本机返回结果，
ChatGPT 再分析、修复、提交并继续。不要求用户手写 JSON、复制命令或搬运报告。

启用了 OpenClaw Mac 的 Chat 能看到实际发布的工具描述/参数；能力发现、自动
工具选择和实际已授权执行范围要一致。没有发布的源码能力不能宣称已经可用。
新 Chat 仍需启用插件并恢复项目交接；无法凭空恢复旧 Chat 的全部历史。

## 通用实现边界

- 项目一次绑定工作区、仓库身份、分支、Agent/会话和执行范围。这些应是本地
  登记数据，不是为项目修改桥接源码，也不能从任意网页/交接文本自动授予权限。
- ChatGPT 在项目仓库中编写脚本和任务定义并提交；任务定义是内部实现资料，
  由 ChatGPT 管理，不是用户的聊天输入格式。
- 通用执行器同步精确 Git 提交，读取该提交中的任务定义，执行登记范围内的
  tracked regular scripts。解释器和脚本根目录由本地工作区许可指定，任务
  数据不能选择任意主机二进制、注入环境变量或传递 shell 命令字符串。
- 脚本参数作为 argv 数据传递；执行仍是当前用户权限，不是操作系统沙箱。
  任务文件、模型输出、日志和交接文本不是新的权限凭证。
- 继续复用异步操作 ID、项目租约、缓存结果和交接；不明确的执行只读回执，
  不能换 ID 重做。模型推理仍由 ChatGPT Chat 完成，本地执行不必调用模型。
- 通用报告约定写入本机为该操作创建的私有输出目录。任务可声明文本、JSON、
  ZIP 中的指定成员；后续接入有界、校验哈希、脱敏的读取，不能成为任意文件读取。

## 已完成的内核

`integrations/chatgpt-openclaw/repository-task.mjs` 提供：

1. 严格、有限的任务定义解析，支持 node/python/bash 脚本、literal argv、超时
   和声明产物；拒绝任务内 shell 命令、环境覆盖、路径穿越和未知字段。
2. 从指定提交的 `.openclaw/tasks/<name>.json` 读取定义，验证定义和脚本都是
   该提交的普通 Git blob，脚本必须在本地登记的根目录中。
3. 执行前核对实际 HEAD 和脚本 blob，拒绝未提交脚本修改；输出目录和操作 ID
   由执行器注入，不从环境读取 Tunnel/API 密钥。
4. 使用同一个内核处理两个独立临时 Git 仓库，没有项目名称分支；另执行了
   一个真实 tracked fixture script，验证参数不会被 shell 展开。

此模块是通用执行层基础，**尚未接入在线 MCP 的派发/权限/产物读取**。
现有在线版本仍是 0.3.1 和已有固定动作；其网页回执/日志修复已通过。
不要为本阶段基础模块重启隧道或 Refresh 插件。

## 必须继续完成

1. 数据化项目登记与本地一次性工作区许可，保留现有项目和旧回执兼容性。
2. MCP 通用 repository_task 派发、与现有持久 job runner 的集成；任务由
   ChatGPT 在仓库中创建，不新增项目专用动作名。
3. 私有输出目录和通用 text/JSON/ZIP 产物读取，复用已验证的 logText 结构化
   输出契约；用户不再手工上传诊断 ZIP 才能让 ChatGPT 读取证据。
4. 自然语言工具说明/项目接续指令，以及两个隔离项目完整端到端验证。
   完成后才统一加载新版 MCP、刷新一次元数据并验收；不逐个小改反复重启。

AWS 专用解析草稿已撤回、未提交。只有只读查看现有源码/文档及报告元数据，
没有改 AWS 仓库、创建 AWS Agent、执行远端诊断或改变服务/DNS/防火墙。

本阶段没有需要用户运行的部署命令，因为在线服务和配置未变。开发者可在
Mac 仓库验证内核（只使用临时 fixture 仓库，不操作实际项目）：

```bash
cd "$HOME/Documents/workspace/ioant-AI-Agent-Local-MacOS"
bash scripts/dev-env.sh exec node --test test/repository-task.test.mjs
```

## 本次额度检查点

五小时额度检查时剩余约 11%，按用户约 10% 检查点要求提前保存。
完整 Node 回归：1270/1270 通过（包含新增 5 项通用任务测试）；没有失败、
跳过或取消。证据为本机 LunaDrive verification/generic-repository-task-tests-20261030.log，
原始测试日志不提交。任务 f2afc52b-24c6-4bf1-a94f-1fbdc4e3a2af 保持 in_progress；
未宣称通用 MCP 接入或线上端到端验收完成。
