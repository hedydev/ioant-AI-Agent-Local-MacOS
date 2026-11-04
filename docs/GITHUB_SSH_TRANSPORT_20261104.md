# GitHub SSH / Git服务异常排查 — 2026-11-04

## 最终结论与实际证据

多个MCP项目的publickey报错已在本机真实执行器环境复现，并非只有AI口头报告。
默认22端点曾成功、随后拒绝同一公钥；官方443端点也先成功、后出现同样拒绝。
因此不能宣称切到443已经解决，也不能仅凭Agent为空认定密钥失效。

本机默认公钥指纹仍与GitHub账号公开登记一致；SSH曾多次识别为正确账号。
使用project-execution-command.mjs的executionEnvironment/GIT_ARGS，OpenClaw、
Alice、NetScale三个仓库的只读ls-remote曾全部成功，之后再次出现认证失败。
文档推送还遇到了远端`fatal error in commit_refs` / `remote rejected main (failure)`，
说明同时存在GitHub端仓库引用更新故障，不能靠改本机Git分支/权限解决。

官方状态API实际读回Git Operations degraded_performance，事件为：
[Incident with Pull Requests, Git Operations and Issues](https://www.githubstatus.com/incidents/smtdswd1h2w4)，
开始时间北京时间2026-11-04 17:49:55，记录时仍investigating。
该事件与失败时段一致；官方尚未披露根因，不将所有SSH失败强行归为某个内部机制。

## 本地设置已恢复

维护中曾临时为github.com创建SSH443专用配置，保留既有密钥及严格主机校验。
复测443仍波动后，只在文件内容/owner与本次创建值完全一致时删除该临时文件，
恢复原先没有~/.ssh/config的状态；原config.save、密钥、known_hosts未改动。
没有读取或导出私钥内容、恢复凭证、添加GitHub key、停用主机校验、修改origin、
重启Tunnel/Web或重放任何业务任务。443可以作为今后网络故障的受控诊断选项，
不自动安装，也不作为这次服务故障的根治方案。
官方说明：[SSH over HTTPS port](https://docs.github.com/en/authentication/troubleshooting-ssh/using-ssh-over-the-https-port)。

## 后续AI处理

1. 先查官方事件和原MCP回执/具体stderr；区分本Mac执行器与其他远程容器。
2. 不反复生成/更换密钥、改权限、清目录/锁、换ID重跑构建，或绕过平台审核。
3. 故障恢复后先做一次有界只读远端引用检查；成功不等于旧业务任务已执行。
4. push失败或返回不明确时，先核对远端完整SHA，避免把已生效提交误判成未推送。
5. 只在旧回执明确终结、且用户原授权仍有效时，由原业务Chat继续对应工作。
   本次没有重放Alice `alice_r89_v10_acceptance_docs_sync_20261104_104` 或NetScale
   `netscale_ssh_audit_fetch_20261104_75`。

本诊断文档可能仅本地提交：远端故障期间不能声称已推送，需核实具体提交状态。
