# 拉風輸入法驗證集

拉風輸入法的公開資料集，包含兩個獨立的 JSONL 檔：

| 檔案 | 內容 | 用途 |
| --- | --- | --- |
| [`dataset/validation.jsonl`](dataset/validation.jsonl) | 前文＋正確答案＋逐字注音＋難度 | 比較模型版本、偵測退步、分析錯誤。**不作為訓練資料** |
| [`dataset/pronunciations.jsonl`](dataset/pronunciations.jsonl) | 人工標註的多讀音 | 可用於模型訓練 |

資料一律透過投稿網站（[llavon-ime/validation-web](https://github.com/llavon-ime/validation-web)）提交，由 GitHub Actions 驗證後寫入。請勿以 Pull Request 手動加入資料。

## 格式

兩個檔案都是無 BOM 的 UTF-8、以 LF 結尾，每行一筆 canonical JSON，所有字串皆為 Unicode NFC。

注音以 `{ "syllable": "ㄋㄞ", "tone": 3 }` 表示：`syllable` 為不含聲調符號的注音，`tone` 為 `1`–`5`（一、二、三、四聲、輕聲）。

### validation.jsonl

```json
{"schemaVersion":1,"license":"CC-BY-4.0","context":"下班後我想去超市買","answer":"牛奶","padding":[{"syllable":"ㄋㄧㄡ","tone":2},{"syllable":"ㄋㄞ","tone":3}],"difficulty":2}
```

| 欄位 | 說明 |
| --- | --- |
| `context` | 答案之前的文字，可為空字串，最多 500 字 |
| `answer` | 這個語境下唯一預期的輸出，1–32 字 |
| `padding` | 與 `answer` 逐字對齊的注音；答案中的英文字母填該字母本身，`tone` 為 `1` |
| `difficulty` | 整體判讀難度 `1`–`5`，依語境歧義與詞彙罕見度判斷，與模型表現無關 |

本資料集不保證任何模型在相同語境下必然輸出所列答案。

### pronunciations.jsonl

```json
{"schemaVersion":1,"license":"CC-BY-4.0","kind":"pronunciation","answer":"部署","readings":[[{"syllable":"ㄅㄨ","tone":4}],[{"syllable":"ㄕㄨ","tone":3},{"syllable":"ㄕㄨ","tone":4}]],"description":"署的四聲是口語讀法。"}
```

| 欄位 | 說明 |
| --- | --- |
| `answer` | 標註的漢字，1–32 字 |
| `readings` | 與 `answer` 逐字對齊；每字 1–8 個可接受讀音，至少一字有兩個以上 |
| `description` | 選填說明，未填為空字串，最多 1,000 字 |

訓練時的使用方式見 [PRONUNCIATIONS.md](PRONUNCIATIONS.md)。

`schemaVersion` 目前固定為 `1`，`license` 固定為 `CC-BY-4.0`。字數皆以 Unicode code point 計算。

## 讀取

```python
import json

with open("dataset/validation.jsonl", encoding="utf-8") as f:
    samples = [json.loads(line) for line in f if line.strip()]
```

```js
import { readFile } from "node:fs/promises";

const text = await readFile("dataset/validation.jsonl", "utf8");
const samples = text.split("\n").filter(Boolean).map(JSON.parse);
```

## 授權

各投稿者保留權利，並依 [CC BY 4.0](LICENSE) 授權公眾使用。散布時請依 [ATTRIBUTION.md](ATTRIBUTION.md) 標示：

> 拉風輸入法組織（llavon-ime），《拉風輸入法驗證集》，https://github.com/llavon-ime/validation-set，依 CC BY 4.0 授權。

## 維護

修改驗證器、文件或修正既有資料時可開 Pull Request，請先執行（不需安裝套件）：

```sh
npm test
npm run validate
```

### 寫入流程

投稿網站以 GitHub App 發送 `repository_dispatch`，對應的 workflow 驗證後附加一行並 commit：

| `event_type` | Workflow | 寫入檔案 |
| --- | --- | --- |
| `append-validation-sample` | [`append-validation-sample.yml`](.github/workflows/append-validation-sample.yml) | `validation.jsonl` |
| `append-pronunciation-sample` | [`append-pronunciation-sample.yml`](.github/workflows/append-pronunciation-sample.yml) | `pronunciations.jsonl` |

兩者的 `client_payload` 相同：

```json
{
  "submissionId": "0262684d-61eb-4c2b-906f-62d168bcd021",
  "sample": { "...": "上述格式的一筆資料" },
  "payloadSha256": "canonical sample 的 SHA-256",
  "attribution": null
}
```

- `payloadSha256`：`sample` 序列化為 canonical JSON（不含結尾 LF）後 UTF-8 bytes 的小寫 SHA-256 hex。Action 會重新計算，不符即失敗，不會寫入。
- `attribution`：`null`，或投稿者選擇署名時的 `{ "githubId": 12345678, "githubLogin": "example" }`，只用於在 commit 加上 `Co-authored-by`，不寫進資料。
- 完全相同的 canonical sample 重送不會重複寫入。
- 兩個 workflow 共用 `validation-jsonl-writer` concurrency group，依序執行，避免 push 衝突。
- Action 從 `GITHUB_EVENT_PATH` 讀取事件，不把投稿文字插入 shell 或命令列；寫入後會重新讀回整個檔案驗證，任何不一致都不 commit。
