# Hono × ElectroDB × DynamoDB Local: クロージャで作る DDD 集約

クラスを使わず、**検証済み値オブジェクト + 非公開の状態 + 凍結した操作オブジェクト**で User 集約と Order（注文）集約を表現する TypeScript の学習用サンプルです。

> **ソースコード公開用であり、API のインターネット公開用ではありません。**
> 認証・認可・レート制限・TLS・監査ログ・パスワード漏洩検査は未実装です。
> 実在人物の情報、実際のパスワード、AWS 認証情報を入力しないでください。
> API / DB はループバック専用です。DB 停止時にサンプルデータは消えます。

## 起動

前提: Node.js 22.18 以上の 22系、または 24.11 以上、npm、Docker Compose v2。API はホストで、DB だけ Docker で動かします。

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

レスポンスは `{ id, name, email, status, version }` のみ。ハッシュ・平文パスワードは返しません。
不正入力 400、現在パスワード不一致 403、未存在 404、競合/不正状態操作 409、過大ボディ 413、非対応Content-Type 415、内部障害 500。
`GET /health` はプロセスの生存確認であり、DB 疎通確認ではありません。

## DDD の責務

```text
src/
  domain/
    entities/
      user.ts                 User 集約と不変なドメイン操作
      order.ts                注文の集約ルート
      order-line.ts           注文明細の子エンティティ（単独Repositoryなし）
    value-objects/
      user-id.ts              UUID のブランド型
      user-name.ts            表示名のルール
      email-address.ts        メールアドレスの構文ルール
      user-status.ts          active / disabled
      order-*.ts              注文/明細のID、注文状態
      product-code.ts         商品コード
      quantity.ts             数量1〜99
      unit-price-yen.ts       整数の円単価
      new-password.ts        新規・変更用の平文入力
      password-candidate.ts  照合用入力（新規ルールと区別）
      password-hash.ts        保存済み Argon2id PHC の検証
      password.ts             ハッシュ化・照合・復元を担う不変 Password
      index.ts                HTTP/ユースケース向け公開窓口
    repositories/
      user-repository.ts     User集約のRepository契約
      order-repository.ts    Order集約全体のRepository契約
    services/
      password-hasher.ts     ハッシュアルゴリズムの抽象
    errors/
      domain-rule-error.ts   不正状態操作・現在パスワード不一致
  application/
    user-service.ts          登録・取得・改名・メール/パスワード変更・状態操作
    order-service.ts         顧客確認・注文作成・明細変更・確定
  infrastructure/
    persistence/
      user-model.ts          UserのElectroDB保存モデル
      order-model.ts         注文全体を1アイテムにする保存モデル
    user-repository.ts       User用ElectroDBアダプター
    order-repository.ts      Order用、ルートversion条件で全明細を一括保存
    password-hasher.ts       Argon2id アダプター
    dynamodb.ts              ローカル専用接続
    init-table.ts            テーブル初期化
  presentation/
    http/contracts.ts        UserのZod/OpenAPI定義
    http/order-contracts.ts  OrderのZod/OpenAPI定義
    middleware/
      request-context.ts     相関ID・計測・HTTPヘッダ
  testing/
    memory-user-repository.ts テスト専用Repository
  app.ts                     OpenAPIHono、ルート登録、エラー変換
  server.ts                  依存関係の組み立て
```

- **User 集約**: ID とユーザー名、メール、状態、パスワード、バージョンを一貫した単位として扱います。
- **値オブジェクト**: それぞれ独立ファイルで検証済みブランド型を定義します。`Password` はさらに、非公開ハッシュと `matches()` を持つ凍結した操作オブジェクトです。ソルト付きハッシュの単純比較をパスワードの等価判定には使いません。
- **境界検証**: HTTP の unknown を Zod で検証してからユースケース・集約に渡します。ブランド型は実行時の防御ではないため、生成・復元時にも検証します。
- **不変更新**: `user.rename(name)` は同じ ID の新しい User を返し、元を変更しません。保存はユースケースがリポジトリに依頼します。
- **閉じた状態**: 状態はクロージャ、外部には `Object.freeze` した操作オブジェクトだけを渡します。値はプリミティブだけなので浅い freeze で足ります。入れ子を追加するなら防御的コピーや深い不変性が必要です。
- **Repository**: DTO ではなく集約を受け取り、取得時も集約を返します。DB の生レコードを `User.restore(unknown)` で検証し直します。
- **並行更新**: 読み込んだ version を条件に保存し、競合を検出します。1回の更新は1回のドメイン操作を想定します。HTTP クライアントの長時間保持した古い画面に対する ETag / If-Match は未実装です。
- この規模ではドメインイベント、Unit of Work、複数集約のトランザクションなどは不要なため省略しています。

## OpenAPI・ミドルウェア・手動 DI

- [OpenAPI JSON](http://127.0.0.1:3000/openapi.json): OpenAPI 3.1
- [Swagger UI](http://127.0.0.1:3000/docs): ローカルで起動してから参照
- `@hono/zod-openapi` の `OpenAPIHono / createRoute` で、Zod 入力検証と仕様を同じ定義から生成します。
- Hono 4.13.14 / Zod 4.6.7 / `@hono/zod-openapi` 1.6.3 の peer dependencies を確認済み。
- パスワード入力は `writeOnly`。公開レスポンスにハッシュスキーマを含めません。
- Zod の独自 refine や状態遷移などは OpenAPI だけでは完全表現できないため、ドメインとテストを正とします。
- Swagger UI の JavaScript / CSS は CDN から読み込みます。オフライン利用は JSON を参照するかアセットを自前配信してください。
- 仕様や UI があることは、認証が実装されていることを意味しません。認証済みを装う security 宣言はありません。

### DDD でのミドルウェアの責務

`presentation/middleware/request-context.ts` は HTTP 固有の横断処理だけを扱います。

1. サーバーが相関 ID を生成し、クライアントの任意ヘッダを本人確認として扱わない。
2. 応答時間を計測し、レスポンスへ相関 ID と timing ヘッダを返す。
3. 成功・検証エラー・内部エラーの全てに no-store / nosniff / frame DENY / referrer ヘッダを付ける。
4. ボディサイズ制限は HTTP 境界で適用。パスワードや生の DB レコードはログ出力しない。

ユーザーが有効か、現在のパスワードが一致するか、といった業務ルールはミドルウェアに置きません。
User 集約が判定し、ユースケースが取得/保存を調整し、HTTP 層がステータスへ変換します。

`server.ts` が **Composition Root** です。DI コンテナを使わず、
DynamoDB client → User/OrderのElectroDB Repository → UserService/OrderService → Hono app の順で手動で組み立てます。
`createApp(userService, orderService)` にテスト用サービスを注入でき、相関 ID 生成と時計もテストで差し替えられます。
domain / application は Hono の Context を参照しません。

## ElectroDB の役割

DynamoDB 向けモデリングライブラリとして **ElectroDB** を採用しています。
AWS SDK v3 の DynamoDBDocumentClient を注入し、Local の接続先は従来どおり固定します。
ドメインは ElectroDB を import しません。ElectroDB の `Entity` は保存モデルであって、DDD の User 集約ではありません。

- `create()` が重複作成を拒否し、`put().where(version = expectedVersion)` が並行更新を拒否します。
- キーはカスタム template で既存の `id` 単独キーを維持。テーブル変更や再作成は不要です。
- `get().go({ data: 'raw', consistent: true })` で生レコードを取得し、既知のモデルメタデータだけを除去してドメインで再検証します。
- 別モデル名/別モデルバージョン、未知フィールド、不正なドメイン値は復元失敗とします。
- 初版のメタデータなしレコードも読めます。null のメールは保存時に省略し、復元時に null へ戻します。
- ElectroDB はテーブルを自動作成しないため、`npm run db:init` は AWS SDK を使用します。
- Drizzle は導入しません（このサンプルの保存先は DynamoDB のままです）。

## User の生成・復元 API

操作の入り口は凍結した `User` オブジェクトにまとめています。クラスや static state ではありません。

```ts
const user = await User.create(validName, validPassword, hasher, validEmail);
const restored = User.restore(databaseRecord);
const row = User.toPersistenceSnapshot(restored); // リポジトリ専用・外部出力禁止
const dto = restored.snapshot();                  // HTTP に渡せる公開 DTO
```

`User` は TypeScript 上の型名と値名を兼ねます。各インスタンスは独立したクロージャを持ちます。
`User.toPersistenceSnapshot` をまとめても情報を全公開するわけではなく、WeakMap に登録された
正規のインスタンスだけを受け付けます。ただし呼び出し元の権限を強制する仕組みではありません。

## パスワードと公開境界

`NewPassword` は 15〜128 の JavaScript 文字列長で検証し、trim / 正規化しません。
この長さルールはサンプル上の業務ルールであり、包括的な認証ポリシーではありません。
Argon2id はメモリ 64 MiB、反復 3、並列度 1、ランダムソルト 16 bytes、ハッシュ 32 bytes。
`PasswordHasher` インターフェースをドメイン側に置き、ライブラリ依存はインフラに隔離します。

`snapshot()` は公開専用です。`User.toPersistenceSnapshot(user)` はモジュール内 WeakMap から
保存用スナップショットを取り出すリポジトリ専用アクセサーです。
操作オブジェクトにはハッシュの読み取りプロパティを置きません。
ただし accessor の import を禁止する暗号学的な仕組みではありません。
**同一プロセス内の悪意あるコードへの防壁ではなく、設計上の情報隠蔽です。**
保存用スナップショットはログ・HTTP に出さないでください。

復元時はこのサンプルが生成する Argon2id パラメータと PHC 形式だけを許可します。
パラメータ変更には保存データの互換性・移行設計が必要です。
パスワード変更 API は現在のパスワードとの一致を必須にしています。ただしセッション認証・
レート制限・CSRF対策は未実装で、これだけで本番の認可を満たすものではありません。
照合専用 API と管理者向け無効化/再有効化 API は公開していません。
`disable()` 後は名前・メール・パスワードの変更を拒否し、正しいパスワードでも照合結果は false。
`reactivate()` は disabled からだけ遷移できます。

### メール・パスワード変更

```sh
curl -sS -X PATCH "http://127.0.0.1:3000/users/$USER_ID/email" \
  -H 'Content-Type: application/json' -d '{"email":"demo@example.com"}'
curl -sS -X PATCH "http://127.0.0.1:3000/users/$USER_ID/password" \
  -H 'Content-Type: application/json' \
  -d '{"currentPassword":"demo-only-long-password","newPassword":"different-demo-password"}'
```

登録時の `email` は任意で、未設定時は null。メールは公開 DTO に含まれるため実在のアドレスを使わないでください。
形式検証は所有権確認や一意性保証ではありません。
初版の保存レコードは email 未設定・status 未設定なら null / active として復元できます。
明示された不正値は拒否し、次回保存時に新しい形式で保存します。

### Password をエンティティにしない理由

メールやパスワードは独立した識別子・ライフサイクルを必要としないので、User 集約内の値オブジェクトです。
ファイル数のために PasswordEntity を作らず、振る舞いと責務を独立させています。
一方、注文の明細には注文内で追跡するIDがあるため、下記のOrderLineは子エンティティです。

## 集約の具体例: Order と OrderLine

```text
User 集約                   Order 集約（保存・競合制御の単位）
  UserId <── customerId ──── Order（集約ルート）
                               └─ OrderLine[]（子エンティティ、最大20件）
```

OrderLine の ID は数量変更後も変わりません。一方、変更操作は **Order ルート**から行います。
ルートは子の操作オブジェクトを返さず、深く凍結したスナップショットだけを返すため、
取り出した明細を書き換えて注文の不変条件を迂回することはできません。

- 下書き（draft）だけが明細追加・数量変更・削除できる。
- 同一商品コードの重複は拒否し、追加ではなく数量変更を使う。
- 空注文は確定不可。確定（confirmed）後は明細変更・再確定を拒否。
- 別注文の明細 ID や存在しない明細 ID を指定しても変更できない。
- 単価は0〜1,000,000円の整数、数量は1〜99、最大20明細。
- 明細金額と合計は再計算し、DBには保存しない。最大合計1,980,000,000円は安全な整数範囲内。
- 復元時も明細の型だけでなく、重複・件数・確定状態を集約全体で検証する。

### なぜ子専用 Repository を作らないか

`OrderRepository` はルートだけを入出力し、ElectroDB の1アイテムに全明細を含めます。
`version = expectedVersion` 条件付きの1回の Put なので、**競合した場合に明細だけ一部変更されることはありません**。
子を別アイテムへ分割していないため、この例で TransactWrite は不要です。
競合は409で返し、古い状態に基づくドメイン判断を自動リトライしません。利用側で再取得して判断し直します。

DynamoDB のアイテム上限400KBに対し、最大20明細・短いASCIIコードという制限で十分小さく保ち、
保存アダプターにも32KiBのJSONサイズ上限を設けています（正確なDynamoDB課金サイズ計算ではありません）。
大量明細が必要な業務へ変更する場合は、集約境界・アイテム配置・トランザクションを再設計してください。

User は Order に丸ごと入れず、`customerId` で参照します。
注文作成ユースケースはUserの存在・有効状態を確認しますが、**User確認とOrder保存は別操作**です。
並行したUser無効化との厳密な整合性や集約間トランザクションは、この小さなサンプルの対象外です。

### API で試す

前のUser作成結果を `USER_ID` に設定してから実行します。

```sh
curl -sS http://127.0.0.1:3000/orders \
  -H 'Content-Type: application/json' -d "{\"customerId\":\"$USER_ID\"}"

ORDER_ID='作成結果の注文UUID'
curl -sS http://127.0.0.1:3000/orders/$ORDER_ID/lines \
  -H 'Content-Type: application/json' \
  -d '{"productCode":"PEN","unitPriceYen":150,"quantity":2}'

LINE_ID='返却されたlines[0].id'
curl -sS -X PATCH http://127.0.0.1:3000/orders/$ORDER_ID/lines/$LINE_ID \
  -H 'Content-Type: application/json' -d '{"quantity":3}'
curl -sS -X POST http://127.0.0.1:3000/orders/$ORDER_ID/confirm
# 確定後の数量変更は409になる
```

削除は `DELETE /orders/{id}/lines/{lineId}`、取得は `GET /orders/{id}`。
全6操作はOpenAPIとSwagger UIにも掲載しています。
学習用のため商品カタログ・在庫・税・送料・決済・認証/認可はありません。
特に**単価をリクエストから受け取る設計は本番の決済に使わないでください**。
この「確定」は集約の状態遷移であって、支払い・在庫引当・発注ではありません。

### 公開型の重複を減らす

`PublicUser` / `PublicOrder` は保存型から **Pickによる許可リスト**で公開フィールドを選びます。
秘密フィールドが将来追加された際に自動公開されないよう、単に「ハッシュ以外を全部」というOmitにはしません。
型のPick/Omitは実行時に値を削除しないため、`snapshot()` でも公開項目を明示的に取り出します。
HTTP側でも公開Zodスキーマを用い、ハッシュが応答に現れないことをテストしています。

## テスト

```sh
npm run check                 # 分割代入AST検査 + 型検査 + テスト（DB不要）
docker compose up -d
npm run db:init
npm run test:integration      # 実 DynamoDB Local: 保存/復元/メール/パスワード/状態遷移/競合/破損レコード
docker compose down
```

統合テストは自分で作成した UUID のレコードだけを削除します。
テスト用テーブル名は `ClosureSampleUsers` と `ClosureSampleOrders`。AWS 実環境への接続機能はありません。
`src/infrastructure/dynamodb.ts` の認証情報 `local/local` は DynamoDB Local 用のダミーです。
テストは実装ファイルの隣に配置しています（例: `entities/user.ts` と `entities/user.test.ts`）。
実 DB 統合テストも `infrastructure/user-repository.integration.ts` に配置しています。
`scripts/run-tests.ts` が再帰的に収集するので、POSIX / PowerShell の glob や環境変数構文に依存しません。

## 公開前の注意

このディレクトリ単体を公開対象にしてください。親ワークスペースや他のリポジトリは含めません。
`node_modules`・環境ファイル・DB データは Git 除外済みです。
実データを追加しないこと、依存関係監査とテストを実施することを確認してください。
ライセンスは利用者の選択に委ね、このサンプルには未指定です。

参考:
- [Hono の Node.js ガイド](https://hono.dev/docs/getting-started/nodejs)
- [AWS の DynamoDB Local ガイド](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.DownloadingAndRunning.html)
- [node-argon2](https://github.com/ranisalt/node-argon2)

ElectroDB 公式参考:
- [AWS SDK v3 クライアント](https://electrodb.dev/en/reference/dynamodb-client/)
- [条件付き create](https://electrodb.dev/en/mutations/create/)
- [put と where 条件](https://electrodb.dev/en/mutations/put/)
- [カスタムキーの定義](https://electrodb.dev/en/modeling/indexes/)

OpenAPI 公式参考:
- [Hono Zod OpenAPI](https://hono.dev/examples/zod-openapi)
- [Hono Swagger UI](https://hono.dev/examples/swagger-ui)

### コードの書き方

管理する実装・テスト・スクリプトはTypeScriptのみです。scriptsも型検査に含め、JavaScript生成物を公開しません。
実装・テスト・設定コードでは object/array の分割代入を使いません。
`npm run check:style` が AST の ObjectPattern / ArrayPattern を検出し、宣言・関数引数・代入・catch 等を検査します。管理対象のJS/mjs/cjsファイルも検出して失敗させます。
名前付き import/export は分割代入ではないため許可します。

- [DynamoDBのアイテムサイズ制約](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Constraints.html)
- [DynamoDBの条件付き書き込み](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/WorkingWithItems.html)
