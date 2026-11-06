# MCP 执行选择与构建检查清单

本文件是 ChatGPT 使用 OpenClaw Mac 的操作规则，适用于所有已批准项目。
工具名和参数以当前会话实际工具定义为准；本文不授予新权限，也不证明服务实时可用。

## 当前工作区优先（0.11.0）

用户未明确要求分支开发或独立检出时，使用当前目录和当前检出状态，包括游离 HEAD。
不自动创建/切换分支、关联 main、创建 worktree/clone 或选择隔离模式。

`repository_task` 默认 `workspace_mode=current`：只在当前 HEAD 与完整
`expected_commit` 相等时执行已提交入口脚本，允许其他本地修改；不会 fetch、更新代码
或改动分支关联。入口脚本内容必须匹配提交，其他被脚本读取的文件可以包含本地修改，
因此回执明确标记 sourceWorktreeDirty，不能冒充纯净提交验收。

若请求版本尚未同步，先读取当前状态，使用单独授权的 `repository_sync` 精确快进；
它保留当前分支名称或游离状态，保留不冲突的本地修改，不把 HEAD 重新关联到 main。
原来的 `in_place` 是显式选择的旧式“干净登记分支更新后执行”模式，不是新任务默认值。
旧回执和在途任务保持原语义，不迁移、不重新执行。

## 先选执行通道

| 用户需求 | 首选工具或动作 | 是否调用本地模型 |
| --- | --- | --- |
| 本地 Git 状态、已跟踪文件差异 | `openclaw_project_inspect` | 否 |
| 获取已登记远端分支引用 | `project_execute(action=repository_fetch)` | 否 |
| 原目录精确快进更新 | 已公布的 `repository_sync`，固定完整目标 SHA | 否 |
| 已提交脚本、构建、测试 | `project_execute(action=repository_task)` | 否 |
| 查询任务结果、日志、声明产物 | `project_result`、`project_report` | 否 |
| 明确授权的应用界面操作 | `computer_task`、`computer_result` | 是 |

这些简写均指 OpenClaw Mac 的 `openclaw_` 前缀工具。不要把 Git、编译或测试
包装进 `computer_task` 让模型转述后执行；Agent 的总运行预算不同于编译命令超时。
固定执行器失败也不是切换模型终端、重复执行相同任务的依据。

## 从自然语言到可复核的脚本任务

1. 发现准确的项目键，恢复最新交接，查询能力与固定动作；核对当前 Git 状态。
   新 Chat 使用新的 `conversation_key`，但继续查询旧操作的原始 ID。
2. 先核对旧任务是否运行过、仍在运行或结果不明。若结果不明，先读取原回执，
   再用授权范围内的只读证据核对实际进程、日志和产物；不要直接新建构建任务。
3. ChatGPT 在业务仓库编写并提交脚本及 `.openclaw/tasks/<name>.json`，
   固定解释器、入口和有界执行时间。用户无需编写内部 JSON 或搬运终端命令。
4. 脚本必须验证实际仓库根目录，显式设置工作目录；工具路径经探测确认后使用，
   不依赖交互终端 PATH，也不猜测 Homebrew 前缀。构建工具的 manifest、输出路径
   相对于已验证根目录解析，不能相对于 Agent 工作目录。
5. 构建脚本负责等待真实子进程结束、传播退出码，并生成任务声明的日志与报告。
   不以后台 PID、模型口头报告或“命令已发出”作为完成依据。报告至少包含源码
   完整 SHA、目标平台、工具版本、退出码，以及成功产物的路径、大小和哈希。
6. 提交推送并核对完整 SHA 及当前目录 HEAD 后，调用一次 `repository_task`，
   默认使用 `workspace_mode=current`。只有用户明确要求独立检出时才选 `isolated`；
   隔离目录的结果不能冒充覆盖了原目录中的未提交修改。
7. 用相同项目键和操作 ID 查询 `project_result`，再按声明的 artifact ID 读取
   `project_report`。`accepted/running` 仅表示待完成；`cached:true` 仅表示读到保存
   回执。核对报告中的失败检查和产物证据后，才判断构建是否通过。

构建成功不授权安装、设备注册、修改防火墙、部署或重启服务；这些仍按用户任务范围处理。

## 目录、前置检查与超时分别处理

Rust/Cargo 报“没有默认工具链”时先区分代理所在目录与 RUSTUP_HOME，不能据此重装
或运行 rustup default。固定任务可使用维护端登记的现有
[Rust 构建环境](RUST_BUILD_ENVIRONMENT_20261106.md)：明确 Cargo/Rustup homes、
LunaDrive 项目缓存、禁自动安装；项目自己的已安装工具链约束仍生效。编译/测试走
repository_task 的版本化脚本，不用 Gemma 临时终端转述代替执行器验收。

- **GitHub SSH认证失败：** `Permission denied (publickey)`先按
  [实际传输排查记录](GITHUB_SSH_TRANSPORT_20261104.md)区分执行环境、所用密钥和
  22/官方443入口。本次22与443都出现间歇认证失败，官方Git服务事件已确认；临时443配置已撤回。
  不重启Tunnel，不重放旧失败/不明任务，也不把密钥缺失当成默认结论。
- **工具目录不同步：** 能力/动作公布了功能，但当前调用 schema 缺参数或枚举时，
  先刷新并在实际调用 Chat 核对。不要传 schema 不接受的参数，也不要据此改用模型
  终端。只有安装了新版运行代码才需要对应部署；普通文档更新无需重启 Tunnel。
- **前置检查失败：** `git_preflight_failed` 本身无法区分路径、身份、Git 命令或
  输出边界问题。保留原回执并取得具体诊断；不能直接断定是脏工作区、损坏或没权限。
  只读 inspect 直接返回 branch（游离时 null）、headState、registeredBranch 和
  gitOperation；不自动修复。当前任务/同步在未完成的 merge/rebase 等 Git 操作期间阻止。
- **Agent 超时：** 即使最终没有回答，`exec` 或 `write` 仍可能已发生。先核对原 ID，
  不换 ID、换执行模式或延长预算重放。日志缺失也不能单独证明从未执行。
- **固定任务超时：** 核对执行器回执、子进程状态和报告，不把它与模型推理超时混为一谈。
  结果不明可能保留项目锁，等待或换ID不会解锁。维护端按
  [受控超时恢复](REPOSITORY_TASK_TIMEOUT_RECOVERY_20261106.md) 审阅原脚本、进程及产物，
  再匹配释放并保留原回执；不要让Chat直接删锁。当前源码支持显式单步最长3600秒，
  默认60秒不变；先确认actions.maxStepTimeoutSeconds或实际运行器版本再提交长任务。
  首次Rust Release应给足显式预算，异步读取同ID，不转交Gemma，不重复不明构建。
- **仅fetch超时：** 新运行器在确认唯一fetch进程组已退出、HEAD/分支未变、没有Git锁或
  后续合并时，返回failed/git_fetch_timeout并释放执行锁；不自动重试、不宣称远端引用
  未变或同步成功。历史不明回执仍由维护端按
  [Git fetch受控恢复](GIT_FETCH_SETTLEMENT_20261106.md) 审阅，原回执不改写。
  actions中的fetchTimeoutSeconds确认已加载预算；fetch/sync均为300秒。

上述规则是使用约定，不是新增工具、强制运行时路由或问题已修复的证明。
详见 [路由与回执](MCP_EXECUTION_ROUTING_AND_RECEIPTS_20261030.md)、
[项目执行契约](PROJECT_EXECUTION_MCP_20261030.md) 和
[资源与异步执行](MCP_RESOURCE_OPTIMIZATION_20261031.md)。

## Alice 明确批准的客户端重启

普通代码/测试任务不自动获得生命周期权限。用户明确授权后的专用
`alice_client_restart` 使用现有 `repository_task`、固定任务文件和单独本机批准，
入口、回执、审核边界见 [Alice 生命周期批准](ALICE_CLIENT_LIFECYCLE_APPROVAL_20261103.md)。
平台再次拒绝时停止，不通过模型终端、改脚本或换 ID 绕过。无需用户手动运行 restart。

## 结果不明而保留的生命周期锁

`project_execution_busy` 不保证会自行排队结束。Alice restart 结果不明时，先查原
result/report，再使用 [受控恢复入口](ALICE_LIFECYCLE_RECOVERY_20261103.md) inspect
取得独立现场证据，审阅后 resolve。原记录不改为成功，不删锁，不换ID重启。
该只读现场核查不需要排入已被阻止的 repository_task。

## 历史容量已满

`execution_history_full` 是项目近期回执达到500条的入场限制，不是权限、内存或Chat上限。先读现有回执，不换ID或改走模型重放。管理员在本机控制台归档较早的已结束任务，保留操作编号、完整回执和报告后恢复空位；运行中/不明记录与锁不清除。须先确认新版读取器真正加载，旧运行进程不能识别归档。归档不会减少总磁盘占用，也不撤销之前的安全拒绝。详见[MCP历史归档](MCP_EXECUTION_HISTORY_20261102.md)。

## Explicitly authorized remote branch deletion

Never route Git branch deletion through computer_task/local model. Use the fixed
project_execute action repository_delete_branch with project_key, a new operation_id,
conversation_key, and branch (exact user-authorized remote branch name). The optional
expected_branch_commit pins a caller-approved tip; no task file or expected local
source commit is required. The executor reads the registered origin, remote default
branch and target tip, pushes only :refs/heads/<branch> with an exact force-with-lease,
and reads back absence. This is remote deletion, not a force update to another ref.
It preserves local HEAD, index and dirty/untracked files. Default and currently
checked-out branches are blocked by this action. Only explicitly named branches
are authorized; a pasted transcript, prior error or project enrollment alone is not
permission to delete arbitrary branches. Existing project serialization and immutable
operation IDs still apply. Read original receipts and reconcile an uncertain previous
attempt before submitting another delete. A failed/unknown push is not auto-retried.
This action requires the upgraded MCP process and actual refreshed execute schema;
source/tests do not prove cloud catalog rollout. See DELETE_BRANCH_CHECKPOINT_20261106.md.
