# 北千住SSS Analytics（非公式）

ピーアーク北千住SSS専用の分析アプリです。ジャラン水元とは別リポジトリで運用します。

## Web公開（初回のみ）

1. [Settings → Pages](https://github.com/mibu-33/kitasenju-sss-analytics/settings/pages) を開く。
2. **Build and deployment → Source = GitHub Actions** に設定する。
3. [Actions](https://github.com/mibu-33/kitasenju-sss-analytics/actions) の **SSS Data Sync and Deploy → Run workflow** を実行する。
4. Pagesのデプロイが成功したら https://mibu-33.github.io/kitasenju-sss-analytics/ に公開されます。

## データの取得状況・制約

データ出典: https://www.slorepo.com/hole/e38394e383bce382a2e383bce382afe58c97e58d83e4bd8f535353code/

- 自動更新: GitHub Actionsが日本時間9時/10時/11時に実行（遅延あり）
- **初回のGitHub ActionsからのスロレポアクセスはHTTP 403で失敗しました**。この制限が続く場合、自動データ取得は成功しません。
- アクセス制限の回避は行わず、取得エラーを画面と `data/status.json` に表示します。
- 台別データが取れない間は実際の島配置、通路左右、隣接分析に架空の数値を表示しません。
- **代替手段**: 取得許諾のある台別CSVを手元でアップロードできます（ヘッダーは `日付,台番号,機種,差枚,G数`、日付は `YYYY-MM-DD`）。読み込みデータはブラウザのその端末だけに保存され、他の利用者には共有されません。
- 島配置は画面から `台番,通路,左右,位置,開始日,終了日` のCSVを登録できます。台移動履歴は期間を分けて記録してください。
- おすすめ/ローテーションの記録は手動です。実際に確認した情報のみ登録してください。
- このバージョンの機種別集計は、スロレポの公開ページにある機種別日次集計または台別データを用います。差枚だけで高設定を断定する機能はありません。

## 開発者向け

- `scripts/sync.py`: 公開済み店舗・日別ページの集計。拒否された取得は中断。
- `.github/workflows/sync.yml`: 更新・データ保存・GitHub Pagesへの配置。
- `data/*.json`: 取得結果と履歴。
- `public/index.html`: Web UI。モバイル対応。
- 取込元のCSVをGitHubで共有する場合は、個人情報や権利条件を確認してください。

テスト環境での本体表示とGithub公開は異なります。公開状況はActionsの成功・失敗ログで確認してください。
