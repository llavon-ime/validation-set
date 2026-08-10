# 貢獻方式

一般資料投稿請使用拉風輸入法驗證集貢獻網站。網站會驗證答案、逐字注音、難度、必要同意及 GitHub OAuth 身分，再以 `repository_dispatch` 交由本 repository 的 GitHub Actions 依序寫入 `validation.jsonl`。

請勿以 Pull Request 手動加入一般投稿資料。格式、驗證器、授權文件或既有資料修正可透過 Pull Request 提交，並應先執行：

```sh
npm test
npm run validate
```

所有文字資料必須為 Unicode NFC；`validation.jsonl` 必須是無 BOM 的有效 UTF-8，並以 LF 換行。驗證失敗時不得略過檢查或以 Base64 等方式繞過編碼問題。

投稿內容依 [LICENSE](LICENSE) 與 [ATTRIBUTION.md](ATTRIBUTION.md) 所載 CC BY 4.0 條件提供。
