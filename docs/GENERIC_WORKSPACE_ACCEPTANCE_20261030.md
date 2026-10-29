# 通用工作区 MCP：实际验收记录

## 已完成的本机 SDK 链路

使用拥有的临时验收仓库，不涉及 AWS/Alice 业务代码或远端服务器。
通过真实 stdio MCP 连接调用发现、接入、任务、回执和报告，非模拟 runner。

| 验收项 | 状态 | 证据 |
| --- | --- | --- |
| 动态项目接入 | 通过 | operation `backend_connect_f1738388`，新建独立 deny-all 原生 Agent；配置/私有目录/本机 live 核对通过 |
| 同一连接立即识别新项目 | 通过 | 项目数 2→3，无重启/Refresh、无工具 schema 项目枚举 |
| 实际精确 Git 更新 | 通过 | `backend_execute_f1738388`，2123fc3 → 658986009e7035a7065c6be40177622a4b1a7d09，fetch/树校验/ff-only 全通过 |
| 实际脚本与产物 | 通过 | Node 写 JSON、Python 写 ZIP；两个步骤退出 0，最终工作区干净 |
| 无模型/旧 Worker | 通过 | modelInferenceInvoked:false、workerUsed:false |
| 持久回执 | 通过 | state:passed、cached:true、doNotRepeat:true；原任务不得重做 |
| JSON/ZIP 成员可直接读取 | 通过 | summary、summary_zip 均 report；相同脱敏后 SHA `7eb398767ea6381af400fcd1cb8052ec0a03c69fb7f8edf57bf4327ebfb7f91c`，307 字符 |
| 实际内容 | 通过 | marker OPENCLAW_GENERIC_REPOSITORY_ACCEPTED，匹配原 operation/commit；synthetic password 字段被脱敏 |
| ChatGPT 网页通用新项目接入 | 通过 | 独立新 fixture 经真实网页发现/接入/执行/JSON与ZIP读回，详见下节 |

新 Agent 为 `repo-mcp-backend-acceptance-f1-bc18937eff`，没有电脑/exec/提权/跨 Agent
权限，不调用本地模型。所有其他 Agent/provider/defaults 保持不变，原始配置备份
留在本机私有目录。原始报告、connect/execute 回执和验收计划均不提交 Git。

## 浏览器通道的实际恢复

用户确认主动取消 Chrome Debug，后又明确授权完全操作电脑进行本轮测试。
原生 OpenClaw Computer Use 在唯一 Plugins 窗口识别工具栏 OpenClaw popup，
通过该扩展已有的 Allow on this tab 控件，仅恢复 Plugins 标签访问。
回读显示 Chrome 调试横幅与 Pause on this tab；Browser Relay 列出该页。
未重装扩展、修改 browser storage、复制 cookies、重置 TCC 或读写密钥。

只为测试创建了一个指向用户已提供的基础设施 Chat 的自有标签页，创建意图
和返回 target ID 存在私有 journal，原有被用户暂停的标签页没有强行重新授权。
未知网页发送结果不得自动重发。新增项目不需要这条浏览器通道；它只用于本轮
插件管理/验收，常规 Git/脚本/产物读取走独立 MCP runner。

MCP 0.6 的后继 Tunnel 成功认证/轮询后才停止 0.5 实例；原始旧实例同样在
新实例验证后退出。新客户端 ready，registered 动态模式；网页已 Refresh；View details 确认 Write6 + Read9 = 15 个工具。
新版全局工具和新项目执行已从真实网页调用通过。最终源码完整回归 1299/1299，
失败/跳过/取消均 0；专项、diff 检查通过。

## 真实 ChatGPT 网页端：普通聊天全链路通过

用户已授权发送基础设施测试消息。只向其给出的工作流 Chat 发送了一次带唯一
marker 的普通中文请求，没有要求用户提供工具 JSON、终端命令或上传文件。
新版网页 composer 没有旧 prompt-textarea ID，空编辑器包含结构换行；测试入口
按实际可见 Ask ChatGPT textbox 校验，既不覆盖用户草稿，也不把空白/不同文本
当作可发送内容。Browser Relay 的段落布局仅允许换行差异。发送意图先持久化；
未知结果只读取同一消息。真实用户气泡确认唯一 marker，最终网页 Response complete。

| 项目 | 实际结果 |
| --- | --- |
| 网页请求 marker | MCP_GENERIC_WEB_ACCEPTANCE_A8055DC5101BCB7F |
| 新仓库 | mcp-generic-acceptance-fixture-143a42f7，初始未注册 |
| 新项目/原生 Agent | repo-mcp-generic-acceptance-fi-11da3f9145，独立工作区，deny-all、无 heartbeat/跨 Agent/提权 |
| 接入 operation | mcp_generic_a8055dc5101bcb7f_connect_20261030，connected、nativeAgentCreated:true |
| 动态生效 | pluginRefreshRequired:false、tunnelRestartRequired:false；同一网页链路立即使用新键 |
| 执行 operation | mcp_generic_a8055dc5101bcb7f_exec_20261030，passed、cached:true、doNotRepeat:true |
| conversation_key | mcp_generic_web_a8055dc5101bcb7f |
| 实际 Git 更新 | 2123fc39d9dbdc5a8874fd1e636661dd4a8d073c → c8fda1bcf6aa90abf118744d6b81550ec2ec05ef |
| 执行阶段 | fetch/fetched_commit/validate_tree/fast_forward/write_report/write_archive 全部退出 0 |
| 最终工作区 | 干净，HEAD 独立读回匹配 |
| 产物 | summary 与 summary_zip 分别读取 report.json 和 ZIP 中 report.json；均 325 字符 |
| 两份报告 SHA-256 | 3405a759fa6a51a9bbdaae36db71fdcfad2c2946f0cfd61bce599f78fab757c7 |
| 内容 marker | OPENCLAW_GENERIC_REPOSITORY_ACCEPTED；operation/commit 一致，synthetic password 脱敏 |
| 模型/旧 Worker/电脑动作 | modelInferenceInvoked:false、workerUsed:false、computerOperationInvoked:false |

网页主动发现/接入/执行/查询/读产物，并在最终答复报告上述结果；本机额外只读
MCP 回执、原生配置和真实仓库 HEAD，独立核对了事实。没有借用已登记 workflow、
Alice 或另一个后端 fixture 代替该验收。既有任务没有重做。

这证明已批准根目录内的新普通 Git 项目可以走相同流程。它不证明任意未授权目录、
任意 shell、生产部署或业务效果验收；脚本以当前用户权限执行，不是操作系统沙箱。
新任务应由 ChatGPT 在目标提交中编写任务定义，普通用户只描述需求。新 Chat
恢复所属项目持久交接并使用新的会话键；不得从旧摘要推导新增权限。
