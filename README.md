# Hono × DynamoDB Local: クロージャで作る DDD User 集約

クラスを使わず、**検証済み値オブジェクト + 非公開の状態 + 凍結した操作オブジェクト**で User 集約を表現する TypeScript の学習用サンプルです。

> **ソースコード公開用であり、API のインターネット公開用ではありません。**
> 認証・認可・レート制限・TLS・監査ログ・パスワード漏洩検査は未実装です。
> 実在人物の情報、実際のパスワード、AWS 認証情報を入力しないでください。
> API / DB はループバック専用です。DB 停止時にサンプルデータは消えます。

## 起動

前提: Node.js 22 以上、npm、Docker Compose v2。API はホストで、DB だけ Docker で動かします。

```sh
npm ci
docker compose up -d
# DB 起動直後に接続できない場合は数秒後に再実行
npm run db:init
npm run dev
```

起動先: http://127.0.0.1:3000 。通常起動は `npm start` でも可能です。
Docker イメージは `amazon/dynamodb-local:3.3.2`、npm の依存関係は lockfile で固定しています。
`package.json` の `private: true` は npm への誤公開防止であり、GitHub 公開を制限しません。

## 試す

下記は学習用のダミー値です。返却される UUID を後続の `USER_ID` に設定します。

```sh
curl -sS http://127.0.0.1:3000/users \
  -H 'Content-Type: application/json' \
  -d '{"name":"サンプルユーザー","password":"demo-only-long-password"}'

USER_ID='ここに作成結果のUUID'
curl -sS "http://127.0.0.1:3000/users/$USER_ID"
curl -sS -X PATCH "http://127.0.0.1:3000/users/$USER_ID/name" \
  -H 'Content-Type: application/json' -d '{"name":"新しい名前"}'
```

レスポンスは `{ id, name, version }` のみ。ハッシュ・平文パスワードは返しません。
不正入力 400、未存在 404、競合 409、過大ボディ 413、内部障害 500。
`GET /health` はプロセスの生存確認であり、DB 疎通確認ではありません。

## DDD の責務

```text
src/
  domain/
    value-objects.ts       Zod 検証とブランド型
    user.ts                User 集約、生成・復元、振る舞い
    user-repository.ts     集約を入出力する Repository 契約
  application/
    user-service.ts        登録・取得・改名ユースケース
  infrastructure/
    user-repository.ts     DynamoDB アダプター、条件付き保存
    password-hasher.ts     Argon2id アダプター
    dynamodb.ts            ローカル専用接続
    init-table.ts          テーブル初期化
  app.ts                   HTTP 入出力とエラー変換
  server.ts                依存関係の組み立て
```

- **User 集約**: ID とユーザー名、パスワードハッシュ、バージョンを一貫した単位として扱います。
- **値オブジェクト**: `UserName` / `NewPassword` / `UserId` / `PasswordHash` は検証済みブランド文字列です。構造体を必要としない最小表現です。
- **境界検証**: HTTP の unknown を Zod で検証してからユースケース・集約に渡します。ブランド型は実行時の防御ではないため、生成・復元時にも検証します。
- **不変更新**: `user.rename(name)` は同じ ID の新しい User を返し、元を変更しません。保存はユースケースがリポジトリに依頼します。
- **閉じた状態**: 状態はクロージャ、外部には `Object.freeze` した操作オブジェクトだけを渡します。値はプリミティブだけなので浅い freeze で足ります。入れ子を追加するなら防御的コピーや深い不変性が必要です。
- **Repository**: DTO ではなく集約を受け取り、取得時も集約を返します。DB の生レコードを `restoreUser(unknown)` で検証し直します。
- **並行更新**: 読み込んだ version を条件に保存し、競合を検出します。1回の更新は1回のドメイン操作を想定します。HTTP クライアントの長時間保持した古い画面に対する ETag / If-Match は未実装です。
- この規模ではドメインイベント、Unit of Work、複数集約のトランザクションなどは不要なため省略しています。

## パスワードと公開境界

`NewPassword` は 15〜128 の JavaScript 文字列長で検証し、trim / 正規化しません。
この長さルールはサンプル上の業務ルールであり、包括的な認証ポリシーではありません。
Argon2id はメモリ 64 MiB、反復 3、並列度 1、ランダムソルト 16 bytes、ハッシュ 32 bytes。
`PasswordHasher` インターフェースをドメイン側に置き、ライブラリ依存はインフラに隔離します。

`snapshot()` は公開専用です。`persistenceSnapshot(user)` はモジュール内 WeakMap から
保存用スナップショットを取り出すリポジトリ専用アクセサーです。
操作オブジェクトにはハッシュの読み取りプロパティを置きません。
ただし accessor の import を禁止する暗号学的な仕組みではありません。
**同一プロセス内の悪意あるコードへの防壁ではなく、設計上の情報隠蔽です。**
保存用スナップショットはログ・HTTP に出さないでください。

復元時はこのサンプルが生成する Argon2id パラメータと PHC 形式だけを許可します。
パラメータ変更には保存データの互換性・移行設計が必要です。
パスワード変更・照合は集約のテストで実演しますが、認証未実装のため HTTP には公開していません。

## テスト

```sh
npm run check                 # 型検査 + ドメイン/HTTP テスト（DB不要）
docker compose up -d
npm run db:init
npm run test:integration      # 実 DynamoDB Local: 保存/復元/競合/破損レコード
docker compose down
```

統合テストは自分で作成した UUID のレコードだけを削除します。
テスト用テーブル名は `ClosureSampleUsers`。AWS 実環境への接続機能はありません。
`src/infrastructure/dynamodb.ts` の認証情報 `local/local` は DynamoDB Local 用のダミーです。
`npm run test:integration` の環境変数設定は POSIX シェル用です。
PowerShell は `$env:RUN_DYNAMODB_TESTS='1'; node --import tsx --test test/dynamodb.integration.ts` を使ってください。

## 公開前の注意

このディレクトリ単体を公開対象にしてください。親ワークスペースや他のリポジトリは含めません。
`node_modules`・環境ファイル・DB データは Git 除外済みです。
実データを追加しないこと、依存関係監査とテストを実施することを確認してください。
ライセンスは利用者の選択に委ね、このサンプルには未指定です。

参考:
- [Hono の Node.js ガイド](https://hono.dev/docs/getting-started/nodejs)
- [AWS の DynamoDB Local ガイド](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.DownloadingAndRunning.html)
- [node-argon2](https://github.com/ranisalt/node-argon2)
