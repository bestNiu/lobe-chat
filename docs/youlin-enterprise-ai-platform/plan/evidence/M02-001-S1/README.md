# M02-001-S1 r1：真实 Keycloak 协议与容器回归

状态：隔离工程证据，**不是 M0～M2 完整交付、产品验收或生产批准**。全部运行断言在 Docker 内执行；独立只读静态代码审查完成，仅覆盖本轮实现代码，不代替运行或生产验收。没有公共 Acceptance 上传，未接产品 UI/真实员工数据。

## 实测结果

| 范围 | 结果 | 原始输出 |
| --- | --- | --- |
| Keycloak 26.6.2 真正签发/认证协议 | 14/14 | `r1-identity.txt` |
| 根 server 配置 | 33/33＝24撤权＋9认证器配置 | `r1-server.txt` |
| PostgreSQL + pg/Drizzle | 18/18 | `r1-nodepg.txt` |
| 原 SQL 用例全部移入 Docker | 20/20 | `r1-sql.txt` |
| 数据库所属配置 | 24/24＝13 PGlite＋11自有池配置 | `r1-database.txt` |
| 环境与进程工具 | 9/9＝5环境＋4进程 | `r1-runtime.txt` |
| 选定11文件 Lint | 通过，包含完整自动修复差异 | `r1-lint.txt` |
| 身份模块/配置测试 strict 类型 | 通过；独立 CLI、bundler 解析、skipLibCheck | `r1-types.txt` |
| GitLab YAML结构/选定安全属性 | 通过，不是远端 CI lint/执行 | `r1-ci.txt` |
| 人工 SIGTERM | 预期退出1，容器及合成凭据目录清理确认 | `r1-interrupt.txt` |

同一用例多入口不重复累计。全仓类型、完整构建、冷启动依赖安装仍未完成；不能用定向类型代替。原始输出/本轮源码 SHA-256 在 `r1-manifest.json` 中归档。

## 失败和修复保留

- `r1-otp-before.txt`：OTP正向用例失败，夹具误将 Base32 展示值当作 Keycloak 保存的原始 secret；按已锁版本实际实现改为公开 RFC6238 原始测试向量，再跑14项通过。
- `r1-type-entry-before.txt`：调用了不存在的旧 `bin/tsgo.js`。
- `r1-type-resolution-before.txt`：修正可执行入口后，NodeNext要求扩展名；按本仓库 bundler 解析运行定向检查通过，没有更改业务文件规避类型问题。
- `r1-review-status.txt`：首个独立只读 Codex 审查达到180秒观察截止（exit124），没有最终报告，不计通过。按审查流程使用一次独立 Pi 回退（只提供 read 工具、关闭上下文/扩展加载），完成且未发现本轮代码的新增缺陷；输出见 `r1-independent-review.txt`，没有由主代理自评冒充独立审查。
- `r1-catalog-before.txt`：责任认领后，旧负向用例隐含依赖基线 Owner 为 null 而失败；现显式构造无 Owner 夹具，并增加有 Owner 仍需批准证据的用例。14项复测见 `r1-catalog-tests.txt`。

## 可复现入口与边界

参见[Docker运行说明](../../../../../scripts/youlin/docker/README.md)和[身份实验说明](../../../../../scripts/youlin/identity/README.md)。Keycloak 是无网络/无端口的合成 H2 开发环境，不是正式可迁移应用部署；HTTP表单驱动不等于浏览器视觉或 Windows/macOS 验收。管理员角色测试不代替 master/基础设施管理员 MFA；角色变更后的 refresh、SMTP密码恢复和真实渠道仍待验证。

认证器验证 issuer/audience/azp/签名/过期，只返回主体，不做HR绑定或访问授权。停用后旧JWT仍能验签的反例已实测；未配置权威 reader 时撤权门明确拒绝。产品层身份、Session、PDP/PEP 和真实生产拓扑均未接入。

当前新增 CI 仅为 GitLab 私有受保护 Runner 候选模板，实际实例/Runner/Registry未接入。Eric 的责任认领不算独立复核，也未把父Spec改成验收通过。用户已有 `AGENTS.md` 修改保持原样，未包含在本轮实现范围内。
