# 5G NR 核心网注册 & PDU 会话全流程交互仿真 · 2.0 项目 Instructions

## 项目目标
1.0（initial-access-v2）讲完了 **L1/L2/RRC 空口接入（AS 层）**：UE 从上电到 `RRC_CONNECTED`。
2.0 接着把故事讲到能上网：**NAS 注册（5GMM）→ 鉴权 → PDU 会话建立（5GSM）→ 首个 IP 包**。
一句话边界：1.0 的主角是「时频网格（物理层）」，2.0 的主角是「泳道（信令交互）+ 服务化总线（SBA）」。

技术栈：纯静态 HTML/JS/CSS（无构建工具），SVG 动画，预计算数据嵌入。**完全沿用 1.0 的 engine.js / 数据总线 / 对话协议框架。**
受众：通信工程专业学生 / 入行工程师（与 1.0 一致）。

**与 1.0 的关系（核心卖点）**：2.0 来还 1.0 故意留下的三笔「越界欠条」——
- 1.0 Stage 8 把 `K_gNB` 标为「源自 NAS 鉴权（越界）」→ 2.0 Stage 2 的 5G-AKA **就是产出 K_gNB 的地方**，用「空投」动画还债。
- 1.0 Stage 8 终点卡写「CONNECTED ≠ 能上网」→ 2.0 终点正是首个用户面 IP 包经 N6 吐给 DN。
- 1.0 Stage 8 RRCSetupComplete 携带的 NAS PDU → 2.0 Stage 1 接着把它送进 AMF。

---

## 规划中的 Stage 列表（2.0 · 7 Stage）

| Stage | 主题 | 核心教学点 |
|-------|------|-----------|
| 0 | 5GC 架构与 SBA | AMF/SMF/UPF/AUSF/UDM 分工、CP/UP 分离（CUPS）、N1~N6/N11 参考点 + 服务化总线（HTTP/2 RESTful API） |
| 1 | NAS 上行接管 | RRCSetupComplete 携 Registration Request → gNB 透明转发 → Initial UE Message（NGAP/N2）→ AMF；**SUCI（ECIES 隐藏 SUPI，UDM 私钥解，毙掉伪基站）** |
| 2 | 5G-AKA 鉴权 | **倒生长密钥树** K→K_AUSF→K_SEAF→K_AMF→K_gNB；RAND/AUTN/RES* 挑战应答；**K_gNB「空投」还 1.0 债** |
| 3 | NAS 安全激活 | NAS SMC/SMP；5G-IA/5G-EA（NAS 命名 vs 1.0 AS 的 NIA/NEA，同核不同名）；NAS+AS **双层安全**为何并存 |
| 4 | 注册完成 | Registration Accept、**5G-GUTI 分配**（SUCI→GUTI 临时身份轮换）、注册 / 周期注册定时器 |
| 5 | PDU 会话建立（CP） | PDU Session Establishment Request 捎带、SMF 选择、**N4/PFCP 给 UPF 装隧道**、DNN/S-NSSAI/SSC、UE IP 地址分配 |
| 6 | QoS 与 DRB 落地（UP） | 5QI/QFI、QoS Flow→DRB 映射、**新角色 SDAP「分拣快递」**、RRCReconfiguration 回 AS 建 DRB、**首个 IP 包从 UPF 经 N6 吐给 DN** |

**终点边界（楚河汉界，必须坚守，5GC 是无底洞）：**
- **N6 接口是物理世界的尽头**：只讲到 IP 包从 UPF 吐给 DN（Data Network）。外部 Internet 路由（BGP 等）一律黑盒。
- **PCF（策略）与 CHF（计费）隐身**：声明「本沙盘采用默认静态 QoS 与计费策略，不涉及 PCF 动态下发」。
- **多切片浅尝辄止**：仅 Stage 5 提一句 `S-NSSAI` 用于路由选择，不展开 NSSF（切片选择功能）。
- DRB 在 UE↔gNB 之间，由 RRCReconfiguration 建立——这是 2.0 唯一一次「回到 1.0 的 AS 层」，把空口和核心网缝合。

---

## 文件架构

```
nas-pdu-session-v1/
├── CLAUDE.md              ← 本文件（Claude 每次对话开始前必读）
├── design-system.css      ← 全局样式（从 1.0 复制，新增网元色变量；唯一入口）
├── engine.js              ← 状态机核心（从 1.0 原样复制，勿改 API）
├── stage-data.js          ← NR_CTX（含 .nas 扩展）+ 所有 Stage 数据字典
├── index.html             ← Hub 导航（侧边栏 + iframe）
├── stage-0-5gc-sba.html       ← 🔧 待实现
├── stage-1-nas-uplink.html    ← 🔧 待实现
├── stage-2-5g-aka.html        ← 🔧 待实现
├── stage-3-nas-security.html  ← 🔧 待实现
├── stage-4-reg-accept.html    ← 🔧 待实现
├── stage-5-pdu-setup.html     ← 🔧 待实现
└── stage-6-qos-drb.html       ← 🔧 待实现
```

**Master Mode 预留**：NR_CTX 在 1.0/2.0 同名延续，只要浏览器不刷新，参数可从 1.0 的 0.509ns 基带时钟
一路流转到 2.0 发出的首个带目的 IP 的报文。两个项目各自独立沙盘可跑，未来可串成一条全栈数据流时间线。

---

## 架构契约（与 1.0 完全一致，违反必出 bug）

### 数据结构
```js
// ✅ 正确：必须用 { subSteps:[...] } 包裹
var S2 = { subSteps: [ discuss(...), sim(...), sim(...) ] };
// ❌ 错误：裸数组，subSteps=undefined，步骤切换全失效
```

### Engine Hooks（每个 Stage HTML 必须实现，签名同 1.0）
```js
Engine.renderVizSVG  = function(subIdx){ ... };  // 返回 HTML 字符串注入 #vizContainer
Engine.onAfterRender = function(subIdx){ ... };  // DOM 就绪后启动动画
Engine.onStageExit   = function(){ ... };         // 清理所有定时器
Engine.boot({ stageIdx: N });                    // 最后一行
```

### SVG 规范（同 1.0）
- `<svg viewBox="0 0 720 495" width="100%" height="100%" style="display:block;">`，禁止写死 `max-height`
- 所有 `<text>` 加 `dominant-baseline="central"`
- `<text>` 内禁裸 `&` `<` `>`：`&`→`&amp;`、`<<`→`&lt;&lt;`、上下标用实体（`N_ID²`→`N_ID&#178;`）；`&nbsp;`→`&#160;`
- 侧栏 theoryCard 是 innerHTML（HTML，浏览器宽容）；只有 SVG `<text>` 才严格

### 动画性能规则（同 1.0）
- 静态 DOM 只改属性（fill/stroke/transform/opacity/textContent），不每帧重建 SVG
- 例外：数据量 < 500 节点的屏可整图重绘
- 定时器经 `Engine.addTimer(tid)` 注册，`onStageExit` 清理；预计算数据嵌入 JS 字面量，动画不重算
- 比特带/卡片做成数据驱动数组，loop 用 `fields.length`，加字段只改数组（同 1.0 踩坑 #11）

---

## 颜色系统（2.0 新体系：按「网元 / 功能域」分配色相）

参照标准：1.0 的 Stage 0/1 配色哲学（渐变背景卡 / 三级文字明度 / 答案色稀缺）整套继承。
2.0 把「颜色即信号身份」升级为「**颜色即网元身份**」——同一套哲学的延伸。

### 1 · 网元主色分配
| 网元 | 角色隐喻 | 主色 | 深 / 浅 |
|------|---------|------|--------|
| **AMF** 接入与移动性管理 | 5GC 大管家 / 信令枢纽（权威） | 紫 `#7c3aed` | `#5b21b6` / `#ede9fe` |
| **SMF** 会话管理 | 控制水管走向 | 青蓝 `#0891b2` | `#0e7490` / `#cffafe` |
| **UPF** 用户面路由 | 宽广的数据海洋（UP） | 深宝蓝 navy `#1e3a8a` | `#172554` / `#dbeafe` |
| **UDM/AUSF** 鉴权与数据中心 | 钥匙 / 密码 / 核心资产 | 金/琥珀 `#d97706` | `#b45309` / `#fff7ed` |
| **gNB** 基站转发 | 在 2.0 退居「透明数据管道」 | 中性灰 `#94a3b8` | `#64748b` / `#e2e8f0` |

公共角色色（跨网元）：
- **答案 / 成功色** 绿 `#059669`（沿用 1.0 语义：判决成功、注册完成、IP 包跑通等里程碑，稀缺出现）
- **高光 / 告警 / 越界色** 红 `#dc2626`（全屏最稀缺，只给「锁定那一刻」「物理失真警告」「越界灰区」）

> 注：AMF 紫 / SMF 青蓝在 1.0 也出现过（扰码紫 / SSB 青），但 2.0 是**独立沙盘、独立页面**，
> 与 1.0 不同屏，语义已重新分配给网元身份，不构成冲突。**每屏仍须遵守 1.0 的五色角色规则**
> （主角色 / 答案色 / 对照色 / 高光色 / 底层色），不可只靠网元色单调铺满。

### 2 · 三条执行红线（同 1.0）
- ❌ 主色 + 灰、缺第三色相 → 必须加入答案色或对照色
- ❌ 背景全部同一个浅灰 → 至少一处局部卡片用渐变或深色翻转
- ❌ 红色泛滥（超过 1 个用途）→ 红色只给「锁定 / 越界」那一刻

---

## SBA / 泳道 可视化母版规范（2.0 核心新构件，替代 1.0 的「时频网格」地位）

2.0 的画面主体不再是天线和子载波，而是**多实体泳道 + 服务化总线**。建议封装一套可复用母版：

### 1 · 实体泳道（vertical lifelines）
- 每屏按需取相关网元子集（不必每屏全画 6 条）；典型左→右顺序：`UE | gNB | AMF | SMF | UPF | (UDM/AUSF)`
- 每条泳道顶部画「网元盒」头，**用该网元主色填充**（gNB 用中性灰，体现「透明管道」）
- 泳道生命线为竖直虚线，向下延伸
- 横向交互箭头标注 **接口名 + 消息名**，方向用箭头头部表示

### 2 · 服务化总线（N-Bus，IT/互联网学生的共鸣点）
- 在 CP 网元（AMF/SMF/AUSF/UDM）**顶部或底部**画一条水平「SBA 服务化总线」
- 强调这些 NF 之间本质是互相调用 **HTTP/2 的 RESTful API**（如 `Namf_Communication` / `Nausf_UEAuthentication` / `Nudm_UEAuthentication` / `Nsmf_PDUSession`）
- **不是 4G 的点对点 Diameter（HSS）**——这是 5G SBA 相对 4G EPC 的架构革命，务必点破

### 3 · CP / UP 分离（CUPS）的视觉表达
- 控制面（AMF/SMF + 信令）与用户面（UPF + 数据流）建议用**分区 / 分色 / 分隔线**区分
- 用户面数据流（N3 gNB→UPF / N6 UPF→DN）用 navy 深宝蓝「数据流」质感，与 CP 信令箭头区分

### 4 · 接口编号速查（标错=物理错误，写进每个 Stage 前核对）
| 接口 | 两端 | 协议/性质 |
|------|------|----------|
| N1 | UE ↔ AMF | NAS，**逻辑接口**，物理穿 gNB 透明转发（别画成 UE 直连 AMF 的物理线） |
| N2 | gNB ↔ AMF | NGAP（NG-AP） |
| N3 | gNB ↔ UPF | GTP-U（用户面隧道） |
| N4 | SMF ↔ UPF | PFCP（CP 配 UP） |
| N6 | UPF ↔ DN | 用户面出口（2.0 终点边界） |
| N11 | AMF ↔ SMF | 会话建立请求转发 |
| Nausf/Nudm/Namf… | CP NF 之间 | 服务化接口（走 N-Bus，HTTP/2 RESTful） |

---

## NR_CTX 全局上下文（延续 1.0，新增 `.nas` 命名空间）

2.0 起点消费 1.0 写入的：`c_rnti`（0x4601）、`rrc_state`（'CONNECTED'）、`pci`、`as_security` 等。
新增一个 `nas` 子对象，2.0 内部读写：

```js
window.NR_CTX.nas = {
  supi:   null,   // 真实身份(IMSI/NAI)：UE/USIM 本地有，空口【绝不明文出现】
  suci:   null,   // ECIES 隐藏标识：上空口的是这个（S1 写）
  k_ausf: null,   // 鉴权派生(S2)
  k_seaf: null,   // 锚点密钥(S2)
  k_amf:  null,   // AMF 层根(S2)
  k_nas_int: null, k_nas_enc: null,   // NAS 安全(S3)
  k_gnb:  null,   // ★ 从 K_AMF 派生后【空投】给 gNB —— 还清 1.0 Stage 8 的债(S2)
  guti:   null,   // 5G-GUTI：注册成功后 AMF 分配的临时身份(S4)
  reg_state: null,// 'DEREGISTERED' → 'REGISTERED'(S4)
  pdu_sessions: []// 每条：{ id, dnn, snssai, type, ue_ip, qos_flows:[{qfi, fiveqi}], drb_id }(S5/S6)
};
```

写入仍用 `Engine.ctxSet(key, val)`（顶栏标签自动刷新；如需顶栏显示 nas 字段，在 engine.js 的 `_TAG_MAP`
里加键，格式参考 1.0 的 c_rnti）。**原则不变：只有真正鉴权/解码/分配出来之后才写，不能「还没算就先知」。**

---

## 物理诚实点总纲（受众工程师，贯穿全程；宁可减少视觉冲击，不可引入物理错误）

- **SUPI 绝不上空口**：上行明文出现的必须是 SUCI。动画里画错 = 泄密级物理错误（S1）。
- **SUCI 只有归属网络 UDM（SIDF）能解**：拜访网络 / 伪基站拿到也无用——5G 相比 4G 最大的安全升级（S1）。
- **N1 是逻辑接口**：NAS 消息物理上穿 gNB 透明转发，gNB 不解读 NAS 内容（S1）。
- **K_gNB 从 K_AMF 派生**，不是从 K_SEAF 直接出；空投给 gNB 后，1.0 的 K_RRC*/K_UP* 才有源头（S2）。
- **NAS 安全 ≠ AS 安全**：双层并存，密钥不同源（NAS 用 K_AMF 派生、AS 用 K_gNB 派生）；算法命名 5G-IA/5G-EA ≠ NIA/NEA（同核不同名）（S3）。
- **GUTI 是临时身份**：注册成功后 AMF 分配，后续用 GUTI 替代 SUCI 进一步减少身份暴露（S4）。
- **CP/UP 分离**：SMF（控制）通过 N4/PFCP 指挥 UPF（转发）装隧道，二者不是一个盒子（S5）。
- **SDAP 是 5G AS 层新增**：4G 是 EPS Bearer 一管到底，5G 拆成 QoS Flow（核心网粒度）+ DRB（空口粒度），SDAP 负责 QFI→DRB 分拣（S6）。
- **N6 之后是黑盒**：IP 包吐给 DN 即终点，外部 Internet 路由不在范围内（S6）。
- **本沙盘静态策略**：不涉及 PCF 动态 QoS / CHF 计费（全程声明）。

---

## 对话协议（与 1.0 完全一致）

### 工作流程（每个 Stage 均适用）
**第一阶段：Claude 出初版** — ① 读基线（engine.js / 1.0 参考 Stage HTML / design-system.css）→
② 数值验证（node/Python 算真实数据）→ ③ 预渲染验证（cairosvg 栅格化肉眼检查布局/配色）→
④ `node -c` 语法检查 → ⑤ 直接交付完整文件（含 `stage-data-S*.js` 数据块）。
**第二阶段：你审查 + 提意见**（实机运行 / 看渲染截图；意见可参考性或指令性）。
**第三阶段：Claude 精确落地**（逐条判断取/舍/部分取并说明理由，涉及物理准确性尤其说清；
全部 `str_replace` 局部改，不重出整份文件除非改动 >40% 行；每次改后重新 node -c + 关键态重栅格化）。

### 开启新 Stage 时发送
```
🎯 目标：Stage N · [主题]
```

### 物理诚实性争议
Claude 有权标出「建议措辞」与「参考意见措辞」的差异并给物理理由；你可接受或坚持（Claude 记录并在备忘注明）。

### 更新 CLAUDE.md
每个 Stage 完整交付后，你提供「文件架构 / 实现要点备忘 / 历史踩坑」三段更新版，替换对应内容。

---

## 历史踩坑（1.0 继承 + 2.0 新增，禁止重犯）

**从 1.0 继承（仍然适用）：**
1. `S = [...]` 不加 `subSteps` 包装 → 步骤切换全失效
2. SVG `<text>` 内裸 `&`/`<`/`>` → cairosvg ParseError；`&`→`&amp;`、`<<`→`&lt;&lt;`、`&nbsp;`→`&#160;`
3. `max-height` 写死 SVG → 不同子步骤高度不一致
4. 动画数据没预计算直接在 setInterval 里每帧重算 → 卡顿
5. 判决写总线过早（还没算就 ctxSet）→ 破坏「零先验」叙事
6. 没有基线文件就猜 API 签名 → 必出返工
7. 顶部并排短标签文字过长会重叠 → 并排用短名，全称放下方表头或理论卡
8. 比特带各字段位长之和必须 = 标题宣称的 SDU 总长（1.0 踩坑 #19）；loop 用 `fields.length` 不写死
9. 时序类别为「故事顺」失真：如实标注「越界」「在 X 之后」（1.0 踩坑 #20）

**2.0 新增（SBA / NAS 特有）：**
10. **接口编号 / 方向标错** → 物理错误。每屏前核对速查表（N1 逻辑穿 gNB、N3=gNB-UPF、N4=SMF-UPF…）。
11. **N1 画成 UE 直连 AMF 的物理线** → 错。NAS 是逻辑接口，物理穿 gNB 透明转发，必须经 gNB 泳道中转。
12. **SUPI 上了空口** → 泄密级物理错误。上行明文必须是 SUCI；SUPI 只在 UE 本地 + UDM 深处出现。
13. **K_gNB 画成从 K_SEAF 直接派生** → 错。链路是 K_SEAF→K_AMF→K_gNB，少一层。
14. **NAS 算法标成 NIA/NEA** → NAS 层是 5G-IA/5G-EA（同算法核、不同命名）；别和 1.0 AS 层混标。
15. **把 5GC NF 间画成点对点 Diameter** → 5G 是 SBA 服务化（HTTP/2 RESTful），别沿用 4G HSS 心智。
16. **QoS Flow 与 DRB 混为一谈** → 5G 是两级（QoS Flow 核心网粒度 / DRB 空口粒度），SDAP 做 QFI→DRB 映射；画成 4G「一根 bearer 到底」是物理失真。
17. **越界内容（PCF 动态策略 / NSSF 切片选择 / N6 外路由 / NAS 鉴权之上的 K 根来源）** 画成主线 → 必须灰标「越界 / 黑盒」，克制。

---

## 本地运行
```bash
cd nas-pdu-session-v1 && python3 -m http.server 8081
# 打开 http://localhost:8081/index.html
# （端口与 1.0 的 8080 错开，便于 Master Mode 同开两个沙盘）
```
