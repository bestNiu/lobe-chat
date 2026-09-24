# R4 — GitHub CI / 本机 Docker UAT 基线与私有清理确认记录

状态：工程增量已验证，仍未产品接入；不是 M0～M2 完整交付、远端 CI、真实 IdP 清理或正式 UAT。证据采集时未提交；后续提交状态以 Git 为准。原 R1/R2/R3 保持不变。

## 本轮交付边界

- 删除旧 GitLab 模板，新增默认不启用的 GitHub Actions 手动候选工作流：受保护默认**分支**、显式开关、专用临时私有 Runner、精确版本预置依赖/镜像。无宿主测试/安装回退，无公共证据上传。尚未配置/执行远端 Runner。
- 明确本机 Docker 是 UAT 目标；完整部署清单及31项缺口见 `plan/12-deployment-and-local-uat-runbook.md`、`plan/13-m0-m2-delivery-gap-register.md`。没有启动完整应用栈，没有复用/重启既有业务容器，没有将工程测试改称 UAT。
- `YoulinIdentityCredentialCleanup.recordCompletion` 是内部清理声明记录接口：默认关闭、专门且当前有效的服务权限、企业/因果撤权事件/精确当前epoch校验，只允许pending/disabled非终止主体。它不执行或验证外部IdP副作用；真实适配器必须先核实**全部**受影响provider清理。队列ACK、客户端布尔值或模糊HTTP结果不构成依据。
- 确认与receipt/audit/outbox原子；不激活、不恢复grant、不ACK运输队列。新的deny清除确认；历史幂等回执不覆盖新的epoch。真实适配器、Session/PEP、审批/MFA/双人职责分离仍缺。

## 检查与失败保留

- 最初73项身份测试通过；加入竞态用例后完整进程触及原45秒截止，**该次失败不计通过**。保留原始输出，不提高内存/CPU/时限，也不关闭测试文件隔离。
- 改为同一源码的两个串行互补分片，最初46+28=74项通过。审查补未知状态回归后：修复前1失败+74通过；修复后**47+28=75通过（67 PostgreSQL-backed +8 DTO，11文件）**。不累加各轮重复用例。归档校验在Docker内核实两片文件集合无交集、并集覆盖整个身份测试目录。
- Node隔离/runtime/process、CI合同和参数选择：**20通过**。工作流分支条件回归修复前失败，修复后通过。
- 修改文件定向Lint、身份类型闭包检查通过；不是全仓类型/构建通过。Lint自动修复输出保留。
- 当前批次重新回归：原SQL20、真实PG Reader18、Reader/PGlite与配置24、Keycloak真实协议14、Server Gate/Verifier33均通过。
- 文档/catalog与归档hash结果写入独立supplement，不修改已冻结manifest。日志包含各UUID资源定向清理结果。

## 独立审查

一次600秒预算初审、一次600秒预算修复复核，均exit0；静态只读，未将审查当作测试或产品验收。

初审3个P2均修复：
1. 保护tag可能满足短ref名条件 → 明确要求 `github.ref_type == 'branch'`。
2. 未知持久状态可能被确认 → pending/disabled显式允许列表，真实PG先失败后通过。
3. 部署文档旧计数/未分片入口 → 更新当前75项及两个必跑分片。

复核确认全部解决，无新增P0/P1/P2或本轮剩余阻断。原始初审、复核、输入、前后完整diff均保留于 `r4/`。

## 上线前仍需

默认分支保护、repository级显式开关及继承变量审查、Runner仓库限制/临时销毁、预置源码依赖镜像绑定、忽略凭据清除、失败/取消私有归档均须真实配置验证。还缺可信provider适配器及实际应用身份入口、全仓质量门/完整部署/恢复、本机产品UAT和后续目标环境发布。没有创建远端环境或宣称这些门禁已过。
