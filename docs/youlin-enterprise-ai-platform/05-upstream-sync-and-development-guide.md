# 企业二开分支与 LobeHub 上游同步规范

> 状态：执行规范 1.0  
> 企业长期分支：`feat/youlin-enterprise-ai-platform`  
> 上游仓库：`https://github.com/lobehub/lobehub.git`  
> 企业仓库：`https://github.com/bestNiu/lobe-chat.git`

## 1. 目标

本规范解决两个问题：

1. 企业功能持续开发，不污染用于跟踪官方版本的 `main`；
2. 可以周期性接收 LobeHub 官方更新，并以可审计、可测试、可回滚的方式合并。

## 2. Remote 定义

```text
upstream  LobeHub 官方仓库，只读取官方更新
origin    企业 Fork，保存企业分支、发布分支和备份
```

检查命令：

```bash
git remote -v
```

标准配置：

```bash
git remote add upstream https://github.com/lobehub/lobehub.git
git remote set-url origin https://github.com/bestNiu/lobe-chat.git
```

认证信息不允许写进 Remote URL。GitHub Token 应由 Git Credential Helper、系统 Keychain 或 CI Secret 管理。

## 3. 分支模型

```text
upstream/main
      │
      ▼
origin/main                         官方镜像分支，不放企业代码
      │
      └──── merge ────► feat/youlin-enterprise-ai-platform
                              │
                              ├── feat/cro-xxx
                              ├── fix/cro-xxx
                              ├── refactor/cro-xxx
                              └── release/youlin-x.y.z
```

### 3.1 分支职责

| 分支 | 职责 | 允许内容 |
| --- | --- | --- |
| `upstream/main` | 官方只读引用 | 官方代码 |
| `origin/main` | 官方镜像 | 不允许企业功能提交 |
| `feat/youlin-enterprise-ai-platform` | 企业长期集成分支 | 已评审的企业能力和上游合并 |
| `feat/cro-*` | 单项功能开发 | 小范围业务功能 |
| `fix/cro-*` | 企业缺陷修复 | 回归测试和修复 |
| `release/youlin-*` | 发布候选 | 冻结版本、只接收必要修复 |

`feat/youlin-enterprise-ai-platform` 是长期分支，因此同步上游时使用明确的 Merge Commit，不对已共享历史进行 Rebase 或 Force Push。短期个人功能分支可在合并前 Rebase 企业分支。

## 4. 首次开发

```bash
git fetch --all --prune
git switch feat/youlin-enterprise-ai-platform
git pull --ff-only origin feat/youlin-enterprise-ai-platform

git switch -c feat/cro-protocol-assistant
```

功能完成后发起 PR：

```text
feat/cro-protocol-assistant
    → feat/youlin-enterprise-ai-platform
```

不要把企业 PR 提交到官方 `main`，也不要直接在企业长期分支上开发大型功能。

## 5. 标准上游同步流程

建议每两周或官方重要版本发布后执行一次。不要在生产发布当天临时大跨度同步。

### 5.1 第一步：更新官方镜像

```bash
git fetch upstream main
git fetch origin --prune

git switch main
git merge --ff-only upstream/main
git push origin main
```

如果 `main` 不能 Fast-forward，说明企业镜像分支被误提交，不要强行合并或推送，应先调查并恢复镜像职责。

### 5.2 第二步：建立同步分支

```bash
git switch feat/youlin-enterprise-ai-platform
git pull --ff-only origin feat/youlin-enterprise-ai-platform

git switch -c chore/sync-lobehub-YYYYMMDD
git merge --no-ff main
```

在同步分支解决冲突、执行迁移和验证，不直接在企业长期分支现场处理大量冲突。

### 5.3 第三步：验证

至少完成：

```bash
pnpm install --frozen-lockfile
bun run check
```

如果全量检查受资源限制，应至少针对冲突文件、企业自定义包、认证权限、数据库和核心场景执行定向检查，并在 PR 中记录未执行项。

同步回归清单：

- 数据库迁移可以在测试环境完整执行；
- SSO、企业微信、账号绑定、禁用和组织同步正常；
- Web、Desktop、Workspace 和部门权限正常；
- Agent、Skill、Tool、Workflow 的创建、审核、发布和回滚正常；
- 个人/团队/企业/项目资源库及文件上传、预览、分享、下载、版本、回收站正常；
- OSS 原件/版本/预览对象与 PostgreSQL 元数据、RAG 索引对账正常；
- 个人记忆服务端同步、隔离、编辑、删除、导出和停用正常；
- Agent/Workflow 产出物 OSS 归档、分类和来源追踪正常；
- 资源发布为知识、权限检索和引用正常；
- MVP 已启用的 RAGFlow/Dify/Tool Adapter 契约测试通过；
- 审计、Tracing、配额和凭证策略正常；
- “有临员工工作助手”E2E 场景通过，包括权限、来源优先级、版本冲突、引用、拒答、转人工和产出物归档；
- 数据/API 控制面 E2E 通过，包括 Data Product、Keycloak Client、Scope/配额、行列过滤、脱敏、授权到期、契约和审计；
- 浏览器/Desktop 无法直连数据库、Trino、湖仓 OSS 或获得生产 Client Secret；
- Docker 镜像、Desktop 制品和部署清单可构建；
- 无跨 Workspace/部门权限泄漏。

### 5.4 第四步：PR 合并

```text
chore/sync-lobehub-YYYYMMDD
    → feat/youlin-enterprise-ai-platform
```

PR 必须记录：

- 上游起止 Commit/版本；
- 数据库迁移变化；
- 冲突文件和解决方式；
- 被上游替换或废弃的企业扩展点；
- 测试、验收和回滚结果；
- 已知风险。

合并后：

```bash
git switch feat/youlin-enterprise-ai-platform
git pull --ff-only origin feat/youlin-enterprise-ai-platform
git branch -d chore/sync-lobehub-YYYYMMDD
```

## 6. 冲突处理原则

按以下优先级处理：

1. 先理解上游变更意图，不机械选择 `ours` 或 `theirs`；
2. 保留上游安全修复、数据库约束和接口升级；
3. 将企业逻辑迁移到新的上游扩展点；
4. 对权限、审计、数据隔离采用更严格的实现；
5. 冲突解决后补充回归测试；
6. 对重大取舍编写 ADR。

高风险冲突目录：

```text
packages/database/src/schemas/
packages/database/migrations/
packages/agent-runtime/
packages/context-engine/
packages/model-runtime/
apps/server/src/routers/
apps/server/src/services/
src/auth.ts
src/spa/router/
```

## 7. 降低上游冲突的开发约束

### 7.1 优先扩展，不直接侵入

优先使用：

- 独立 `packages/clinical-*` 和 `packages/integration-*`；
- Adapter、Provider、Hook、事件和 Feature Flag；
- 独立后端 Router/Service；
- 独立 `src/features/Clinical*`；
- 配置化品牌和菜单。

### 7.2 必须修改上游文件时

- 改动保持最小；
- 不做无关格式化和重命名；
- 在 PR 中标记“上游热点文件”；
- 用测试锁定企业行为；
- 能向官方贡献的通用扩展点优先提交上游。

### 7.3 数据库规则

- 企业迁移只追加，不修改已发布迁移；
- 新表和索引使用清晰企业前缀或领域命名；
- Workspace/Study 隔离字段和索引必须成对设计；
- 外键删除策略、数据迁移和回滚方案必须评审；
- 同步上游前备份并在生产等规模副本演练迁移。

## 8. Commit 与 PR 规范

分支命名：

```text
feat/cro-<feature>
fix/cro-<issue>
refactor/cro-<scope>
chore/sync-lobehub-<date>
docs/cro-<topic>
release/youlin-<version>
```

Commit 延续仓库 gitmoji/Conventional 风格，例如：

```text
✨ feat(clinical): add study knowledge binding
🐛 fix(rbac): prevent cross-study document access
📝 docs(cro): add RAGFlow integration contract
🔀 chore(sync): merge LobeHub v2.3.0
```

每个 PR 应包含：

- 背景和范围；
- 架构/数据模型影响；
- 权限和合规影响；
- 测试证据；
- 数据库迁移；
- 回滚方法；
- 截图或实际验收证据。

## 9. 发布策略

从企业长期分支建立发布分支：

```bash
git switch feat/youlin-enterprise-ai-platform
git switch -c release/youlin-0.1.0
```

建议企业版本号保存两层信息：

```text
Youlin 0.1.0
Base LobeHub 2.2.17
Enterprise commit <sha>
```

发布制品必须可追溯到：

- LobeHub 基线 Commit；
- 企业 Commit；
- Docker 镜像 Digest；
- 数据库 Schema 版本；
- 配置版本；
- Agent/Skill/Workflow/模型版本；
- 验证和审批记录。

## 10. 回滚策略

代码回滚不能替代数据库和外部索引回滚。每次发布至少准备：

- 上一个应用镜像；
- 数据库备份和迁移影响说明；
- Feature Flag 关闭路径；
- RAGFlow Dataset/解析版本；
- Dify Workflow 上一个已批准版本；
- Agent/Skill 配置版本；
- 紧急只读或禁止高风险 Tool 的开关。

## 11. 分支保护建议

在 GitHub 对以下分支启用保护：

### `main`

- 禁止直接 Push；
- 仅允许官方同步 PR 或 Fast-forward 管理流程；
- 禁止 Force Push 和删除。

### `feat/youlin-enterprise-ai-platform`

- 必须 PR；
- 至少一名技术 Reviewer；
- 权限、合规或数据库变更要求对应负责人 Review；
- 必须通过 lint、类型检查、定向测试和安全扫描；
- 禁止 Force Push 和删除。

### `release/youlin-*`

- 仅 Release Manager 可合并；
- 必须附验证、发布和回滚记录；
- 发布后打不可变 Tag。

## 12. 当前仓库状态基线

本规范建立时：

- 本地已配置 `origin` 和 `upstream`；
- 企业长期分支为 `feat/youlin-enterprise-ai-platform`；
- 企业分支已合并 `origin/main` 的 LobeHub `v2.2.17` 基线；
- 企业规划文档位于 `docs/youlin-enterprise-ai-platform/`。

后续同步以实际 Commit SHA 为准，不只依赖版本字符串。
