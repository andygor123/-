# DESIGN

## Product Frame

這不是泛社區 app，也不是普通二手平台。

它的核心定位是：

`一個面向單棟樓住戶、在微信內打開的 building memory + exchange layer。`

產品有兩條清楚但不平權的內容線：

- `换物`
  先解決「有咩可拎 / 邊個跟進緊 / 交接是否完成」
- `邻居问问`
  再解決「樓內高相關資訊會在群組沉底」

設計上永遠要守住：

1. `Available-first`
2. 手機優先，拇指友好
3. 看起來像樓內工具，不像開心農場式社交 feed
4. 比 WeChat 群更清楚，但不要比行政系統更冷

## Visual Thesis

整體氣質應該是：

- `溫暖`
  不做科技藍白，也不做冷感 dashboard
- `可信`
  要讓住戶覺得這裡的資訊是可依賴的
- `鄰里感`
  有人味，但不輕浮
- `中國大陸手機語境`
  文案、字體、按鈕密度、層次都要像微信內自然長出來的產品

一句話總結：

`像一塊被重新整理過的樓內告示板，而不是一個新世界。`

## Typography

### Primary stack

```css
font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif;
```

理由：

- 對簡中閱讀最穩
- 在 iPhone 微信內顯示自然
- 不要引入過份風格化字體，避免降低可信度

### Type roles

- `Hero / page titles`
  1.05rem - 1.25rem，字重偏 600
- `Section labels / eyebrow`
  0.82rem - 0.92rem，字重正常，但字色更淡
- `Body`
  0.95rem - 1rem，行高 1.5 左右
- `Meta`
  0.8rem - 0.92rem

### Tone rules

- 不使用過大字級去扮「品牌感」
- 所有字級都要服務於快速掃讀
- `问问` 可比 `换物` 多一點文字節奏，但不能像長文社交平台

## Color System

### Core palette

- `Ink`
  `#1c211b`
  主文本、主按鈕深色文字
- `Moss`
  `#202f1e`
  主 CTA、品牌主色
- `Leaf`
  `#d7f1cc`
  頂部氛圍光、溫和高亮
- `Paper`
  `#fffaf5`
  卡片底色
- `Warm Sand`
  `#f7f2e7`
  頁面底色起點
- `Mist`
  `#f2ede2`
  頁面底色收尾

### Semantic colors

- `Available`
  用 Moss / soft green family
- `Claimed`
  用偏灰藍中性色，不要太像錯誤或禁用
- `Removed / History`
  用偏灰褐色
- `Price / Paid`
  用偏青綠色，代表「清楚條件」，不要用紅色
- `Attention / Following`
  用偏暖黃色，表示「你已跟進」
- `Ask lane`
  比 exchange 更柔和一點，可用偏 sage / pale green 區分 section mood

### Color rules

1. 不要引入鮮豔高飽和點綴色
2. 不要把整個界面做成單調 beige
3. 同一屏最多一個強主色焦點
4. `邻居问问` 的社交感靠節奏與訊號，不靠彩虹色

## Surfaces

### App background

用暖底 + 頂部柔和 radial glow：

```css
background:
  radial-gradient(circle at top, rgba(215, 241, 204, 0.75), transparent 30%),
  linear-gradient(180deg, #f7f2e7 0%, #f2ede2 100%);
```

這個背景方向要保留。

### Cards

所有主卡片應像：

- 半透明紙面
- 有一點暖色陰影
- 圓角偏大
- 有輕微內高光

這會令產品更像「整理好的樓內板子」，而不是冰冷 app shell。

## Layout

### Width

- 主體寬度上限 `760px`
- 手機視角優先
- 不追求桌面 full-bleed

### Spacing rhythm

- 外圍 page padding：`12px`
- Card padding：`18px`
- 區塊之間：`12px - 14px`
- 內容密集區不要小於 `8px`

### Safe area

所有固定元素必須尊重：

- `env(safe-area-inset-top)`
- `env(safe-area-inset-bottom)`

尤其：

- toast
- FAB / bottom CTA
- overlay sheet

## Interaction Model

### Primary action

全局主動作永遠是底部 sticky `发布`。

點擊後先進雙入口選擇：

- `发布闲置`
- `发布求物`

不要跳過這一層。這個選擇卡是理解整個產品的關鍵一拍。

### Detail sheets

detail 不是資料倉庫，而是：

1. 理解狀態
2. 決定下一步
3. 執行動作

所以 detail 頁要：

- 先看狀態
- 再看物件/需求
- 再看 CTA

### Feedback

所有有後果的操作都要有兩層反饋：

- `就地 banner`
- `全局 toast`

例如：

- 感興趣
- 確認認領
- 移入完成記錄
- 發問 / 補充回覆
- 複製微信號

## Lane-Specific Rules

### 1. Exchange lane

#### Available

是整個產品的第一主敘事。

卡片應優先傳達：

1. 係乜
2. 免費 / 有價
3. 狀態
4. 是否值得點入去

首頁卡片只顯示核心訊號，詳細條件留 detail。

#### Wanted

不是冇圖版 Available。

它應該更像：

- 清楚求助
- 有條件
- 有心理價位

所以：

- 文案要像「向鄰居講需要」
- 卡片模式要和 Available 有明顯分別

#### History

是信任層，不是主列表。

它的角色是：

- 告訴新住戶這個板子真有人用
- 告訴屋主事情有被收口

不應該和 active cards 一樣重。

### 2. 邻居问问 lane

這條線應該像：

- 樓內高相關討論流
- 有人味
- 但仍然克制

不是：

- 泛社區論壇
- 長文知識庫
- 朋友圈複製品

#### Homepage preview

首頁 preview 規則：

- 顯示 2-3 條
- 只露問題，不露完整回覆
- 一定顯示 `回覆數 + 最近更新時間`

#### Feed tone

`邻居问问` 比 `换物` 多一點社交訊號：

- 提問者感
- 最近互動感
- 回覆節奏感

但仍沿用同一個設計系統，不可像完全不同 app。

#### Thread detail

header 要極簡：

- 問題
- 人
- 時間
- 回覆數

不要做成儀表板。

#### Nested replies

手機上只允許：

- 輕縮排
- 小層級提示
- 深層預設摺疊

絕對不要用重框線卡片套卡片。

## Component Guidance

### Pills

Pill 是核心語言之一：

- category
- status
- price
- following

Pill 要小而清楚，不要搶標題。

### Buttons

- 主按鈕：深色實心
- 次按鈕：淺綠 / 淺灰綠
- ghost：白底半透明

所有按鈕圓角都應偏大，維持微信內友善手感。

### Cards

卡片不要做得太扁，也不要做 dashboard tile。

每張卡都應像一張有內容、有節奏的小告示。

### Toast

toast 是現在產品的重要質感來源。

規則：

- 高對比
- 高可見
- 只停留 2-3 秒
- 一定要在安全區內

## Motion

動畫應該少，但有意義：

- toast slide-in
- sheet 進場
- button active scale

不要加：

- 花巧 micro-bounce
- 過度 spring
- 多餘 shimmer

這個產品需要的是「穩」，不是「炫」。

## Content Tone

整體語氣：

- 簡中
- 口語但不幼稚
- 像鄰居之間會說的話
- 不要太像平台官腔

### Exchange tone

- `发布闲置`
- `发布求物`
- `我感兴趣`
- `我可以帮忙`
- `复制TA微信号`
- `移入完成记录`

### Price tone

用這組：

- `免费送`
- `有偿转让`
- `心理价位`
- `预算上限`
- `价格可商量`
- `转让价`

不要回到：

- `免费 / 有价 / 价格`
這類太像欄位名稱的語氣。

## Accessibility

最少要守住：

- 文字對比足夠
- pill 不可只靠顏色區分
- button 高度不少於 `44px`
- 重要 toast 有 `aria-live`
- 深層回覆摺疊要有清楚可點擊文案

## What To Avoid

1. 不要把 `邻居问问` 做成完全不同產品
2. 不要把首頁做成資訊門戶
3. 不要引入冷科技藍、紫色、夜店黑
4. 不要過度卡片化到像 admin panel
5. 不要讓文案掉回平台術語

## Definition of Good

如果設計是對的，用戶打開時會感覺：

- `我知道樓裡而家有咩`
- `我知道呢件事下一步係咩`
- `我唔使返微信群翻舊訊息`
- `呢度係有住戶在用的，不是空殼`

如果之後任何新頁面加進來，問自己兩條：

1. 它更像整理樓內資訊，還是把產品變成另一個社交 app？
2. 它有冇破壞 `Available-first` 呢個核心 wedge？

答唔清楚，就先唔好加。
