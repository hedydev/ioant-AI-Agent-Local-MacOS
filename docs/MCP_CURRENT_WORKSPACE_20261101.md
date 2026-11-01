# MCP 0.11.0：沿用当前工作区与检出状态

## 用户规则与已定位原因

用户明确要求：未主动要求分支开发时，沿用当前目录和检出状态。不自动创建/切换
分支、关联 main 或创建 worktree、clone、隔离目录。这取代以前的默认 main 与
“脏工作区可自动改用隔离”建议；保留仓库身份、精确提交和本地修改保护。

只读排查确认，一次分支预检 exitCode=1、stderr 为空的真实原因是游离 HEAD。
当时 HEAD 与本地 main 都指向同一提交，reflog 显示由 main 检出到该提交。
`symbolic-ref --quiet --short HEAD` 在游离状态返回 1 是 Git 的正常语义，
不能一概报告为 Git 不可用，更不代表用户授权重新关联 main。

## 行为与兼容性

- `project_inspect` 允许本地修改、游离 HEAD 和其他当前分支，返回实际 branch
  （游离时 null）、headState、registeredBranch、gitOperation，不进行修复。
  失败时保留有界脱敏 preflight 元数据。登记分支仍用于允许访问的远端来源。
- 新 `repository_task` 默认 `workspace_mode=current`：在原目录的当前完整 HEAD
  执行已提交任务和入口脚本，不 fetch、不更新、不切分支，不创建其他检出。
  允许其他本地修改，回执明确区分当前工作区验证与干净提交验证。
- 当前 HEAD 必须等于 expected_commit，入口脚本内容必须匹配提交。不同提交返回
  current_commit_mismatch；修改过的入口脚本拒绝执行。需要更新代码时，先检查状态，
  再执行独立授权的 repository_sync，不隐式更新后执行。
- 显式 repository_sync 保持当前分支名称或游离状态；精确远端提交、快进祖先检查、
  本地内容/索引哈希保全、冲突阻止和未知结果锁均保留。不关联 main。
- 当前任务和同步在 merge/rebase/cherry-pick/revert/bisect 等 Git 操作未结束时阻止，
  只读 inspect 可以报告状态；不删锁或终止操作。任务前后检测 HEAD/分支变化。
- 旧 in_place 模式仍是显式的干净登记分支更新路径；isolated 仅供用户明确要求的
  独立检出。工具说明、服务 instructions、能力目录与 Hero Skills 同步说明新默认。
- 旧持久任务无 workspace_mode 时保留原 in_place 语义和摘要身份；同 ID 查询或
  再提交只读取原结果，不把旧任务迁移成 current，也不重放不明业务操作。

固定任务仍运行仓库代码，不是 OS 沙箱。入口固定不代表所有导入文件都来自纯净
提交；当前目录中其他文件可以包含本地修改。构建通过也不等于部署、网络或业务验收。

## 验证与部署状态

源码回归及运行端重载已完成；最终调用 Chat 的缓存目录刷新仍需单独确认，见下方部署记录。
真实 Git 临时仓库测试覆盖 dirty detached/其他分支下任务执行、HEAD/索引/引用保留、
精确提交不匹配、入口脚本变化、Git 操作未结束、旧 ID 兼容及同步保留分支关联。
没有为了验收而更新 NetScale、重跑旧 Cargo、修改远端服务或加载本地模型。

Mac 验证命令：

```bash
cd "$HOME/Documents/workspace/ioant-AI-Agent-Local-MacOS"
bash scripts/dev-env.sh exec node --test --test-concurrency=2
bash scripts/tunnel-console-service.sh status
```

部署只重载已配置 Tunnel，不重启 Web/Gateway/Ollama，不恢复或输出密钥。
确认无在途任务后，在 http://127.0.0.1:18489 使用现有内存密钥重启 Tunnel；
若控制台报告不明确，只查状态，不重复重启。然后在调用 Chat 刷新工具目录，
确认 workspace_mode 包含 current。普通仓库新增项目不需要重复刷新。

只读网页验收可交给 ChatGPT Chat：

```text
仅使用 OpenClaw Mac，只读验收当前目录能力。检查实际 project_execute 的
workspace_mode 枚举是否包含 current，调用 openclaw_capabilities、所属项目的
openclaw_project_actions 与 openclaw_project_inspect。报告 defaultWorkspaceMode、
实际 branch/headState/registeredBranch/gitOperation 和 HEAD。
不要 execute、fetch/sync、关联或切换分支、克隆、调用模型或重跑旧任务。
```

该验收确认目录与诊断，不证明业务构建、Git 同步或桌面动作完成。

## 源码验证完成

完整回归 `node --test --test-concurrency=1`：1359/1359 通过，零失败/跳过/取消。
最终专项回归43/43通过，shell语法与 Git diff 检查通过。首次默认并发完整运行
1356/1359，三项旧浏览器 Worker 测试触发墙钟期限；降低并发为2时仍有旧测试超时，
单线程全量运行全部通过。未修改这些旧测试的期限或跳过它们；主机当时负载较高，
不据此断言所有超时的唯一原因。原日志保存在项目外的 LunaDrive verification 目录。

Hero Skills `ebd9b45689881b16f6b3d217ebe4ec8546f0235e` 已推送并核对远端，
Git Skill 验证器通过，项目消费引用已更新。没有安装模型、依赖或第三方桌面工具。

## 运行端部署与只读验收

源码提交 `c7d515cbcf11da710878aa3c149ae6814df7e3d8` 已推送，远端 SHA 已核对。
在控制台确认项目任务为零、MCP 推理 lane idle/admittedJobs=0、Tunnel 队列为0后，
仅停止受管理的旧 Tunnel。待控制台确认旧进程已退出（code0）且内存密钥仍保留后，
通过已有 start 接口启动新版，避开已知 stop/exit-event 竞态。未重启 Web/Gateway/Ollama，
未恢复、读取或输出 Runtime Key，未安装额外模型或调用付费推理。

控制台随后返回新 Tunnel ready（PID13369，stdio child PID13372）。独立本地 SDK
initialize 报告 MCP0.11.0，实际工具目录包含 current/in_place/isolated 与 repository_sync。
经现有云端 MCP 实际调用 capabilities，返回 defaultWorkspaceMode=current、三个模式、
lane idle 和空模型驻留；实际 project_inspect 返回 repository_inspection、headState、
branch、registeredBranch、gitOperation，保留本地修改，无模型/网络调用。

只读观察时 NetScale 已由其所属 Chat 的另一个操作恢复 main 关联；本 Chat 未替它
执行该修复、同步代码、重跑 Cargo 或运行审计脚本。游离 HEAD 的新行为由真实 Git
临时仓库回归证明，不能把当前已关联 main 的只读查询冒充真实游离仓库运行验收。

本 Codex Chat 注入的 project_execute schema 仍保留旧枚举，不能据源码/运行端已更新
就宣称所有调用 Chat 缓存已刷新。插件管理连接器无 Refresh tools 接口，本轮未操作
前台浏览器进行刷新。后续调用 Chat 在插件设置 Refresh tools 后用上面的只读提示
验收即可；无需再次重启 Tunnel。
当前默认模式即使省略 workspace_mode 也由运行端选择 current，但客户端旧说明不应
当作新能力缺失的证据。未做业务同步/构建验收，人的最终任务验收仍待确认。
