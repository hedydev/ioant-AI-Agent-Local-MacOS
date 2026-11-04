# GitHub SSH 传输修复 — 2026-11-04

## 实际问题和边界

多个已登记项目出现 `Permission denied (publickey)`。维护端实际复现了默认
`github.com:22` 的认证失败，不能把它归因于 AI 没有 MCP 权限或仓库脏状态。
同一默认公钥仍在 GitHub 账号登记，通过官方 `ssh.github.com:443` 使用同一
密钥和既有可信主机密钥认证成功。22入口曾成功、随后失败；本次没有确定具体
是网络路径还是 GitHub 边缘服务造成，不能仅凭报错认定密钥丢失或已被撤销。

`ssh-add -l` 当时显示没有 identities，但默认磁盘密钥仍可完成443认证，因此
“Agent为空”不等同于“没有可用密钥”。未读取/导出私钥内容、恢复凭证、添加
GitHub SSH key、购买服务、调用模型或重启 Tunnel/Web。

## 本机修复

此前本机不存在 `~/.ssh/config`，维护端以独占创建、0600写入 GitHub 专用规则：

```sshconfig
Host github.com
  HostName ssh.github.com
  Port 443
  User git
  IdentityFile ~/.ssh/id_ed25519
  IdentitiesOnly yes
  HostKeyAlias github.com
  StrictHostKeyChecking yes
```

HostKeyAlias继续使用已验证的GitHub主机信任；没有关闭主机校验或盲目接受新指纹。
默认密钥文件只由SSH客户端正常使用。其他SSH主机和仓库origin URL均不变。
如果其他机器已有配置，不覆盖整份文件；此记录不是向所有设备自动部署配置的授权。

官方依据：[GitHub SSH over HTTPS port](https://docs.github.com/en/authentication/troubleshooting-ssh/using-ssh-over-the-https-port)。
443仍然是SSH传输，不是改用HTTPS密码或PAT。

## 实际验收

使用 `project-execution-command.mjs` 的真实 `executionEnvironment()` 与
`GIT_ARGS`，对以下三个本地仓库执行有界、只读 `git ls-remote origin HEAD`：

| 仓库 | 22入口复现 | 切换443后并发复测 |
| --- | --- | --- |
| ioant-AI-Agent-Local-MacOS | exit128/publickey | exit0、远端HEAD成功读取 |
| ioant-AI-Minecraft-Alice | exit128/publickey | exit0、远端HEAD成功读取 |
| ioant-netscale | exit128/publickey | exit0、远端HEAD成功读取 |

没有fetch、merge、sync、构建或业务部署，不能将此认证验收冒充业务任务通过。
新SSH连接即时读取本机配置，无须刷新插件、重启MCP/Tunnel或重新输入Runtime Key。
只读失败记录例如Alice `alice_r89_v10_acceptance_docs_sync_20261104_104`、NetScale
`netscale_ssh_audit_fetch_20261104_75`保持原样，维护端未重放。

## 后续AI排查规则

1. 确认失败发生在本机OpenClaw固定执行器还是其他远程环境。远程容器不会因为
   Mac配置已修复就自动拥有Mac密钥，不能把本机成功外推到所有执行环境。
2. 保留原操作ID，读取具体stderr/退出码。不要先换任务、清目录、生成新key或降级校验。
3. `ssh -G git@github.com`应显示官方443入口；使用BatchMode的只读远端引用检查，
   区分传输认证、仓库访问权限和普通Git预检。
4. 后续仍报错时重新查实际证据，不自动恢复22、改密钥或反复执行构建。
   原业务Chat先核对旧回执与在途状态，再继续用户已授权的工作。
5. 撤销本次本地变更只涉及上述新增Host块；不删除密钥/known_hosts，不覆盖其他
   后来添加的配置。本次没有改变MCP安全策略或项目授权。
