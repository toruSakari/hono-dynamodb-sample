# 検証結果

検証環境: Node.js v24.22.1 / npm 11.9.0 / Java 21 / DynamoDB Local 3.3.2。

- 分割代入禁止の AST 検査: 実装・テスト・スクリプトを検査し成功。
- Vite+ 1.4.0: starter準拠の全体整形・型付きlint（unsafe any検査を含む）・型チェック成功。
- TypeScript 型検査: src / scripts / vite.config.ts を含め成功。管理対象のJS/mjs/cjsなし。
- ドメイン・Hono リクエストテスト: 59 件成功。
- ElectroDB + 実 DynamoDB Local 統合テスト: 2 件成功。
  Orderはルート+全明細の一括保存、競合時の部分変更なし、厳格なネスト復元、未存在更新拒否を確認。
  Userは保存・復元・パスワード照合/変更・メール変更・無効化/復帰・改名・条件付き保存の競合・破損データ拒否・旧形式互換・未知フィールド/他モデル拒否を確認。
- 実 HTTP サーバー + ElectroDB + 実 DynamoDB のスモーク: 登録・メール変更・現在パスワード不一致拒否・パスワード変更成功。
  注文作成・明細追加/数量変更・確定・確定後の変更拒否・再取得も成功。
  公開レスポンスのプロパティは id / name / email / status / version のみ。
- 依存差し替えはアプリ組立時に一度だけ選択され、リクエスト時にoptionsを再参照しないことを確認。
- Service.createでRepository/Hasherを注入し、凍結したService間で依存が混ざらないこと、各操作が業務引数だけを受け取ることを確認。
- 公開スキーマは秘密/未知項目を除去し、snapshotと生HTTP応答にハッシュが含まれないこと、Orderの深い凍結を確認。
- ContextのDBモデル同一性・外部入力での置換不可・Repositoryにはモデルのみ/ServiceにはRepositoryのみの受渡し: 成功。
- OpenAPI 3.1 生成、公開 DTO とエラー契約、Swagger UI HTML、相関 ID / timing / セキュリティヘッダ: 成功。
  Swagger UI のブラウザ描画自体は未検証です。
- npm audit（開発依存も含む）: 検証時点で 0 vulnerabilities。
  この結果は将来の安全性を保証しないため、利用時にも再実行してください。
- 公開対象に実認証情報・実人物の情報なし。DB 認証情報とサンプル値はダミー。
- Docker Compose の実行: **未検証**。検証環境に Docker CLI がありません。
  同バージョンの AWS 公式 DynamoDB Local JAR で実 DB テストを実施しました。
  Docker Hub に 3.3.2 タグが存在することは確認済みです。

通常の利用手順は README の Docker Compose 手順です。
