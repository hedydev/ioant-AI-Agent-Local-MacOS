# 网页 project_report 空对象：只读诊断

状态：**0.3.1 已加载，真实网页首尾分页复验通过，空对象现象已消失**。
关联固定执行任务 `alice_regression_20261030_7281ce874993` 不得重跑。

## 实际网页复验

用户完成前台重启和 Refresh 后，在网页调用 report offset=46200、offset=0，
分别返回 state=report、pageCharacters=64/4000、totalCharacters=46264，
logText 非空。独立读取原日志，首段和末尾 64 字符与用户报告一致，完整 SHA
仍等于原回执；原任务仍 passed，没有修改日志或重跑任务。

新前台 PID 46643/source child 46645、端口 63854（动态观测值）正常轮询；
云端 MCP observation 明确报告 server 0.3.1，新实例观察到四次 tools/call 全为
200。该计数支持新实例实际收到了调用，不把全部四次强行归于用户展示的两条
report。实际正文、页长和哈希核对是本次修正生效的主要证据。

验收范围为网页报告读取的行为修复。闭源端具体哪个解析分支导致原 {} 仍未
被直接观测，不从一次综合输出契约修正推断单一内部根因。不要继续重复加载、
Refresh、坐标探针或已完成的 Git/回归任务。

## 已有证据

- 用户在网页实际读取了 resume revision 6、enabled actions、passed/cached:true
  的执行回执。专项 7 项、全量 225 项（跳过 3 项）和 e12038b 提交均匹配。
- report offset=0 返回 `{}`，重复只读查询仍为空。新实例 tools/call=5，全为
  HTTP 200，与用户报告相符；HTTP 200 不证明正文正确。
- 同一源的全新 stdio MCP 客户端返回 state=report、4000 字符正文及原 SHA。
  本机原报告 46264 字符/字节，完整 SHA 与持久回执相同。
- 使用官方 tunnel-client v0.0.18 `dev proxy --backend go` 在独立、本地、有限
  生命周期的代理中复现相同调用。原始 HTTP JSON-RPC 返回完整 MCP content
  数组，内层业务 JSON 有 4000 字符正文；外层 result 约 4554 字节。
  因而文件读取及该版本客户端本地转发没有复现空对象。
- 此前正文从未作为 structuredContent 返回，也没有 report outputSchema；
  故障版本只有 MCP 文本块中的 JSON。业务 JSON 本身含 content 字符串。

本地 HTTP 转发之后的具体托管/网页解析分支仍不可直接观测。不能仅凭字段名称
或官方建议就宣称已定位闭源客户端内部根因；本次改动修正明确的输出契约缺口，
其行为结果由顶部的真实网页复验证据支撑。

## 此前最小对照（已完成）

此前请求用户让网页只调用 report offset=46200，预期末尾 64 字符，保留原始
返回。不调用 execute、不更改报告/回执，不重新运行 Git/Python。
用户已返回该次原始结果：64 字符末页也为 `{}`。因此不是仅在大正文时出现。
本地 Go 代理原始返回一直完整，仍无法直接观察托管/网页内部哪一步丢弃了字段。

## 0.3.1 输出契约修正

已将业务正文从 content 改为明确的 logText，新增 pageCharacters/totalCharacters，
为 report 声明严格 outputSchema，并同时返回 structuredContent 与内容一致的
JSON 文本块。MCP 协议顶层 content 保持文本块数组，不再与业务正文同名。
这是对已确认输出契约缺口的修正；不宣称已观测到闭源客户端的具体错误分支。

新增五项契约回归：空对象/缺正文/旧字段/超长页拒绝；错误/未就绪状态有效；
两通道数据一致；真实 SDK 接受 64/4000 字符；声明 schema 后拒绝文本单通道
或空 structuredContent。完整桥接回归 **1265/1265**，执行器逻辑未变。
独立官方 Go 代理发现 server 0.3.1、report outputSchema，HTTP 原始响应两通道
一致，首页 4000 和末页 64 字符通过，totalCharacters=46264、完整 SHA 未变。
原始正文未压缩、未缩短分页、未改回执/日志，也未重新执行任何任务。

真实前台 MCP 已由用户加载到 0.3.1 并 Refresh；上述网页首尾报告返回已确认。
本地 SDK/代理证据与真实网页证据分别记录，不把本地结果代替用户网页复验。

[OpenAI MCP 构建说明](https://developers.openai.com/plugins/build/mcp-server)
介绍 outputSchema 和 structuredContent；
[MCP 接口示例](https://developers.openai.com/api/docs/mcp)
要求结构化内容与 JSON 文本块一致。该契约可作为后续受控验证方案，但不应
把本地新增结构化结果的测试成功当作已修复真实网页故障。

## 隔离和发布检查

隔离诊断阶段没有重启现有前台 Tunnel、修改 Key、变更 Git/测试逻辑、运行模型、
使用旧 Worker 或操作桌面。修复发布的前台重启/私下密钥输入由用户完成。
诊断代理已自行退出；所有原始证据保存在 LunaDrive 私有 verification
目录，不入 Git。日志导出实际为 tar.gz（早期临时文件扩展名为 .zip），未向外发送。
运行中的日志导出未包含 RPC 载荷，因此不能从导出日志证明网页收到的原始正文。

另在独立 dev proxy 验证了“终止自己创建的 stdio 子进程后重新 initialize”：
当前客户端没有自动恢复该路径。**不要终止真实前台 MCP 子进程来试图热更新**。
修复准备和测试完成后，用户已完成正式加载；这个隔离实验不能成为杀真实子进程
或重复重启的理由。
