# 全量 Spec 设计索引

> 41 项详细草案，118 项仅设计排期；全部未批准、未开发。角色均待实名认领。详见[滚动计划](../07-detailed-spec-design-plan.md)与[catalog](./catalog.json)。

| 里程碑 | Spec 数 | 详细草案 | 设计窗口 | 首轮 Review | 交付周 |
| --- | ---: | ---: | --- | --- | ---: |
| [M00](./M00/README.md) | 10 | 10 | W1 | W1～W2 | W2 |
| [M01](./M01/README.md) | 12 | 12 | W1～W3 | W1～W4 按切片 | W4 |
| [M02](./M02/README.md) | 9 | 9 | W1～W2 | W2～W3 | W5 |
| [M03](./M03/README.md) | 10 | 10 | W2～W3 | W3～W4 | W7 |
| [M04](./M04/README.md) | 8 | 0 | W1～W2 | W2～W3 | W8 |
| [M05](./M05/README.md) | 11 | 0 | W3～W5 | W5～W6；Review W8 | W10 |
| [M06](./M06/README.md) | 12 | 0 | W3～W6 | W6～W7 | W14 |
| [M07](./M07/README.md) | 10 | 0 | W5～W8 | W8～W9 | W15 |
| [M08](./M08/README.md) | 10 | 0 | W9～W12 | W12～W13 | W16 |
| [M09](./M09/README.md) | 12 | 0 | W2～W4 | W4～W6 按切片 | W18 |
| [M10](./M10/README.md) | 12 | 0 | W2～W6，C1/C2/C3 滚动 | C0 W6～W7；C1 W9/C2 W12/C3 W15 | W20 |
| [M11](./M11/README.md) | 14 | 0 | W3～W5，领域 UI 滚动 | W5～W6 骨架；规则 W8 | W22 |
| [M12](./M12/README.md) | 10 | 0 | W1～W4 策略；W18～W21 执行设计 | W21～W22 | W24 |
| [M13](./M13/README.md) | 9 | 0 | W20～W23 | W23～W24 | W26 |
| [M14](./M14/README.md) | 10 | 0 | W1～W12 指标；W23～W26 运营 | 指标 W16；运营 W26 | W32 |

## 使用说明

每项状态与依赖以 catalog 和对应草案同步维护。早期 Spec 的 specDependencies 是候选前置切片；后续 planned 项依赖尚待逐项分析，空数组不表示无依赖。

FR/AC 上下文只用于排期覆盖，具体签收仍需按[原追踪矩阵](../02-traceability-and-delivery-gates.md)确认。契约入口：[K01～K08](./contracts/README.md)。
