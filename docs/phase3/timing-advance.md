# Timing Advance 大时延补偿

> **3GPP 版本定锚**
>
> | 内容 | 版本 | 规范 |
> |---|---|---|
> | TA 基础机制（N_TA / N_TA,offset） | **Rel-15** | 38.211 §4.3.1, 38.213 §4.2 |
> | NTN Common TA + Service Link TA | **Rel-17** | 38.821 §6.3.3 |
> | TA 预补偿有效时长与过期处理 | **Rel-17** | 38.331（ntn-UlSyncValidityDuration） |

---

## 📡 知识定位

```
Phase 3 NTN 前沿
│
├── ⬜ NTN 架构概览
│
├── ▶ Timing Advance          ← 我们在这里
│
├── ⬜ Doppler 频移补偿
└── ⬜ Rel-17 NTN 增强特性
```

---

🚧 **内容施工中** — 本节将覆盖：地面 TA 闭环 vs NTN 开环预补偿 / Common TA + Service Link TA 双层架构 / TA 预补偿的 GNSS 精度依赖 / K_offset 与 K_mac 参数 / TA 过期后 UE 回退行为。

---
