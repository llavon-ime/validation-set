# 拉風輸入法驗證集

本 repository 保存拉風輸入法模型的公開 validation set，用於比較模型版本、偵測功能退步及分析錯誤。投稿資料一般不直接作為模型訓練資料；本專案亦不保證目前或未來模型在相同語境下必然輸出資料所列答案。

## 資料檔案

所有樣本集中於 [`dataset/validation.jsonl`](dataset/validation.jsonl)。每一行是一筆獨立 JSON，可逐行串流讀取：

```json
{"schemaVersion":1,"license":"CC-BY-4.0","context":"下班後我想去超市買","answer":"牛奶","padding":[{"syllable":"ㄋㄧㄡ","tone":2},{"syllable":"ㄋㄞ","tone":3}],"difficulty":2}
```

| 欄位 | 說明 |
| --- | --- |
| `schemaVersion` | 格式版本，目前固定為 `1` |
| `license` | 固定為 `CC-BY-4.0` |
| `context` | 正確答案之前的文字，1–500 個 Unicode code point |
| `answer` | 唯一預期答案，1–32 個 Unicode code point |
| `padding` | 與答案逐字對齊的純注音及聲調 |
| `difficulty` | 整體判讀難度，整數 `1`–`5` |

`tone`：`1` 一聲、`2` 二聲、`3` 三聲、`4` 四聲、`5` 輕聲。

Node.js 讀取範例：

```js
import { readFile } from "node:fs/promises";

const text = await readFile("dataset/validation.jsonl", "utf8");
const samples = text.trimEnd().split("\n").filter(Boolean).map(JSON.parse);
```

Python 讀取範例：

```python
import json

with open("dataset/validation.jsonl", encoding="utf-8") as source:
    samples = [json.loads(line) for line in source if line.strip()]
```

## 自動寫入

投稿網站後端以 GitHub App installation token 發送 `append-validation-sample` repository dispatch。Action 會透過同一 concurrency group 依序處理投稿、驗證完整資料集、附加單一 JSONL 行，再建立 commit。

`client_payload` 契約：

```json
{
  "submissionId": "0262684d-61eb-4c2b-906f-62d168bcd021",
  "sample": {
    "schemaVersion": 1,
    "license": "CC-BY-4.0",
    "context": "下班後我想去超市買",
    "answer": "牛奶",
    "padding": [
      { "syllable": "ㄋㄧㄡ", "tone": 2 },
      { "syllable": "ㄋㄞ", "tone": 3 }
    ],
    "difficulty": 2
  },
  "payloadSha256": "canonical JSON UTF-8 bytes 的小寫 SHA-256 hex",
  "attribution": null
}
```

選擇 GitHub 個別貢獻紀錄時，`attribution` 改為：

```json
{ "githubId": 12345678, "githubLogin": "example" }
```

`payloadSha256` 是 `sample` 依上表固定欄位順序、無額外空白序列化後，不含結尾 LF 之 UTF-8 bytes 的 SHA-256。Action 會重新計算並比較；不相符時立即失敗，不寫入也不 commit。

## Unicode 與資料完整性

- HTTP、GitHub event 與 JSONL 全程使用 UTF-8，不使用 Base64 傳遞投稿文字。
- `context`、`answer` 與 `syllable` 必須為 Unicode NFC。
- 拒絕 BOM、無效 UTF-8、未成對 surrogate、非 canonical JSON 與 CRLF。
- JSON 內的換行由 JSON escape 表示；每筆樣本只能占一個 LF 分隔的實體行。
- Action 從 `GITHUB_EVENT_PATH` 讀取事件檔，不將投稿文字插入 YAML、shell 或命令列。
- 寫入後重新以 fatal UTF-8 decoder 讀取，逐行 parse、驗證及重新序列化；任何不一致均不得 commit。

本機檢查不需要安裝第三方套件：

```sh
npm test
npm run validate
```

## 授權

各投稿者保留其投稿內容之權利，並直接依 CC BY 4.0 授權公眾使用。必要姓名標示及法律實體說明請見 [LICENSE](LICENSE) 與 [ATTRIBUTION.md](ATTRIBUTION.md)。
