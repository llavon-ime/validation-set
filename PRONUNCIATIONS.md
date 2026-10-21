# 人工多讀音資料

[`dataset/pronunciations.jsonl`](dataset/pronunciations.jsonl) 的欄位格式見 [README](README.md#pronunciationsjsonl)。本文件說明資料規則與訓練時的用法。

## 資料規則

- 每格讀音依注音字串的 code unit 順序排序，同注音再依聲調數字排序；同一字的讀音不可重複。
- U+2028、U+2029 以 JSON escape 表示。
- 透過投稿網站提交時，讀音必須在 [ime-core](https://github.com/llavon-ime/ime-core) 的注音候選表內；本 repo 的驗證器只檢查格式，候選表日後更新不影響既有資料。
- 完全相同的資料重送不會重複寫入；說明不同即視為另一筆，不覆寫先前的標註。
- `description` 只供人閱讀，不當作模型 prompt 或讀音規則執行。

## 訓練用法

- 每筆是明確的人工標註，多讀音只適用於該筆資料的指定位置，不因文字相同就覆寫一般語料的讀音。
- 國字→注音：各可接受讀音以等比例 soft target 訓練。
- teacher forcing 及注音→國字（IME 輸入）：從人工標註的讀音中取樣，維持每筆資料的總權重不變。
