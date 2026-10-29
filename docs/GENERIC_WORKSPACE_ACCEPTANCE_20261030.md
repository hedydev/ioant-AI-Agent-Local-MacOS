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
| ChatGPT 网页通用新项目接入 | 待验收 | 另一个原先未登记的自有 fixture 已准备，不能用本机 SDK 结果替代网页结果 |

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
新实例验证后退出。新客户端 ready，registered 动态模式；网页 Refresh 和
实际新版工具调用仍须继续核对。当前源码最新完整回归 1296/1296，通过新增
受限 UI 产物检查的专项测试；最终源码/网页结果完成后另记最新回归。
