# K01/K02/K03：首批可执行合同子集（draft）

> 仅设计工具与合成夹具；不是服务器实现、正式 OpenAPI、完整合同或供应商能力证明。159 项 Spec 状态不变。

## 文件与执行

- [contracts.schema.json](./contracts.schema.json)：JSON Schema Draft 7，关闭未定义属性；不依赖外部 `$ref`。
- [examples.json](./examples.json)：4 个纯合成示例，不含真实账号、凭据、组织或业务数据。
- [check_contracts.py](./check_contracts.py)：字段与少量跨字段校验、纯函数状态转换预期模型。
- [test_contracts.py](./test_contracts.py)：正负向设计回归；**不是** Keycloak/数据库/PDP/队列测试。

在仓库根执行：

```bash
python3 docs/youlin-enterprise-ai-platform/plan/specs/contracts/executable/check_contracts.py
python3 docs/youlin-enterprise-ai-platform/plan/specs/contracts/executable/test_contracts.py
```

需要已有 Python 3.10+、`jsonschema >=3.2,<5` 环境；本轮实际使用系统 `jsonschema 3.2.0`，未安装或更新依赖。未验证该范围内所有版本。主 `validate_docs.py` 仍保持原有依赖，不会把本测试缺失误报为运行通过；这两个命令必须单独执行。后续 CI 需锁定批准工具链。

Schema 中 `.invalid` URL 只是版本标识，不是已发布服务；校验不访问该地址。JSON Schema 校验结构，Python 补充日历/字段关系；其他语言消费者必须移植并重跑这些语义断言，不能只调用 AJV 就称等价。

## 覆盖边界

| 合同 | 本次子集 | 尚不覆盖 |
| --- | --- | --- |
| K01 / M02-006 | `RevocationCommand`、`RevocationState`；expectedEpoch、源版本与安全整数范围 | issuer/sub 映射、JWT/Session 验证、启用、单 Session 注销、Workload Grant、数据库约束、真实幂等 |
| K02 / M03-006 | `ScopeRef`、`AccessIntent`；project 显式可空、动作/资源版本、Purpose/Audience 引用 | 当前成员/资源/字段授权、PDP 结果与义务、查询预过滤、历史/输出授权、可信主体生成 |
| K03 / M01-011 | 一种 `SubjectRevokedEvent` CloudEvents 1.0 严格应用剖面 | Outbox/Inbox、审计持久化、Broker 认证/ACL、Job 状态/Lease、重试/DLQ/取消 |

字段长度、动作枚举、整数上限、类型命名都是 **0.1 候选**，需与现有 ID/版本兼容后批准；未知动作拒绝，不能自动加通配符。`resource.version` 本切片要求确定版本，集合查询将使用另行设计的合同，不能传 `latest` 冒充冻结版本。

## 信任与一致性规则

1. Command 的 `subjectRef` 是待禁用对象，不是调用者。调用者必须由受信认证链提供；Schema 拒绝 body 中的 actor/roles/Token，但这不等于已鉴权。
2. 本切片的 `RevocationState` 按全局 `(kind,id)` 定位，账号禁用适用于其所有 Workspace。Project 离项是独立 Membership 撤权，不能用此全局禁用命令代替。
3. `sourceVersion` 假设来自同一主体的规范化身份变更序列，**不是**把 HR、管理员等不同源的原始计数直接比较。序列产生、乱序仲裁、返聘与再启用仍受 D01/D10 阻断。
4. 预期模型检查新命令 `expectedEpoch == current.authEpoch`、源版本递增、epoch 加一且不溢出；它无存储/事务/并发或幂等能力。真实服务先查绑定 actor/操作/参数 Hash 的幂等回执，再做 CAS、deny、审计与 Outbox 原子提交。
5. 事件 `previousEpoch + 1 == authEpoch` 是生产者单次变更断言；消费者可能漏收/乱序，不能据此要求每条接收序列连续，也不能将旧事件覆盖到新状态。缺版本须查源/对账。
6. `time` 只验证 UTC 与有效日历，不证明消息新鲜或源可信；事件类型、source、auditRef 通过也不证明签名或审计真实存在。
7. AccessIntent 中 workspace/project/resource/purpose/audience 均不可信，服务端必须解析并重新授权。测试刻意证明“外部 Workspace ID 的合法格式也会通过 Schema”，防止把格式检查当权限检查。
8. 禁用先阻断，IdP 注销/队列/缓存清理后补；真实 PEP、事务原子性和撤权时效必须通过[首批 Spike](../../../08-implementation-readiness-and-spikes.md)证明。

## 当前证据等级

本轮只产生工具测试结果。原 752 条 Spec 用例仍待实际执行；不写入产品 `verificationEvidence`，不提升 design/delivery 状态。`catalog.schemaRefs` 暂不填为完整 Spec 合同，本子集通过 K01～K03 和对应 Spec 链接追踪；完整物理合同补齐后再登记。

[合同目录](../README.md) · [K01](../K01-identity-and-revocation.md) · [K02](../K02-scope-and-authorization.md) · [K03](../K03-events-audit-and-jobs.md)
