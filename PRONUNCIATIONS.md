# 人工多讀音資料

保存在既有 `llavon-ime/validation-set` 的 `dataset/pronunciations.jsonl`，與一般驗證集分開。

```json
{"schemaVersion":1,"license":"CC-BY-4.0","kind":"pronunciation","context":"","answer":"部署","readings":[[{"syllable":"ㄅㄨ","tone":4}],[{"syllable":"ㄕㄨ","tone":3},{"syllable":"ㄕㄨ","tone":4}]],"description":"署的四聲是口語讀法。"}
```

- `context`：前文，可空，最多 500 個 Unicode code point。
- `answer`：本筆標註的漢字，1–32 個 Unicode code point。
- `readings`：按 `answer` 的 Unicode code point 逐字對齊，每格 1–8 個不重複讀音，至少一格含兩個讀音。注音不含聲調符號；`tone` 以 1–5 表示一、二、三、四、輕聲。不要求出現在既有候選表。
- `description`：選填說明；未填保存為空字串，最多 1,000 個 Unicode code point，可換行。只供人閱讀，不直接當模型 prompt 或讀音規則執行。

字串為 NFC；canonical JSON 欄位順序固定如範例，每格讀音按注音字串 code unit 順序及聲調數字排序，U+2028、U+2029 使用 JSON escape。檔案為無 BOM 的 UTF-8，以 LF 結束每行。

每筆是明確人工標註的資料。多讀音只用於這筆資料及其指定位置，不依文字相同就全面覆寫一般語料。國字→注音使用等比例 soft target；teacher forcing 及注音→國字／IME 輸入則從這些人工標註的讀音取樣，維持原筆資料總權重。網頁不收集訓練超參數或權重。

`POST /api/pronunciations` 接受 `{ submissionId, sample, publicContributionConsent: true, trainingUseConsent: true, creditAsCoauthor }`。使用現有 same-origin、GitHub session 與版本化同意書檢查。`sample` 是上述資料。原本 `/api/submissions` 契約不變。

Repository dispatch 的 `event_type` 是 `append-pronunciation-sample`；`client_payload` 沿用 `{ submissionId, sample, payloadSha256, attribution }`。雜湊為不含結尾 LF 的 canonical sample UTF-8 bytes 的 SHA-256；Action 重新計算，不直接信任前端。`attribution` 為 null 或由登入 session 產生的 `{ githubId, githubLogin }`，只用於 commit。

完全相同的 canonical sample 重送不追加。不同的說明視為不同紀錄，避免後提交的說明覆蓋先前資料。寫入使用與驗證集相同的 concurrency group，避免兩個 workflow 同時 push 造成衝突。
