# Doppler 频移补偿

> **3GPP 版本定锚**
>
> | 内容 | 版本 | 规范 |
> |---|---|---|
> | Doppler 基础与 CFO 影响 | **Rel-15** | 38.211 §5.3 |
> | NTN 频率预补偿（开环） | **Rel-17** | 38.821 §6.3.2 |
> | 星历辅助 Doppler 计算 | **Rel-17** | 38.331（ntn-SatelliteInfo-r17） |

---

## 📡 知识定位

```
Phase 3 NTN 前沿
│
├── ⬜ NTN 架构概览
├── ⬜ Timing Advance 大时延补偿
│
├── ▶ Doppler 频移补偿        ← 我们在这里
│
└── ⬜ Rel-17 NTN 增强特性
```

---

🚧 **内容施工中** — 本节将覆盖：LEO 卫星多普勒量级定量分析 / UE 频率预补偿原理 / 星历辅助 Doppler 计算 / 残余多普勒对 OFDM 子载波正交性的影响 / S-band vs Ka-band 多普勒差异 / GNSS 精度对补偿误差的贡献。

---
