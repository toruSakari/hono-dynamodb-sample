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
    entities/                    User / Order / OrderLine と横置きテスト
    value-objects/               ブランドVO / Password と横置きテスト
    repositories/                集約を入出力するRepository契約
    services/password-hasher.ts  ハッシュアルゴリズムの抽象
    errors/                      ドメインルール違反・集約共通の競合
  application/use-cases/
    user-service.ts              UserService契約とUserユースケース
    order-service.ts             OrderService契約とOrderユースケース
  infrastructure/
    dynamodb/
      client.ts                  Local専用SDKクライアント
      init-tables.ts             テーブル初期化
      models/                    User / OrderのElectroDB保存モデル
      repositories/              集約単位の保存実装と横置き実DB統合テスト
    security/
      argon2-password-hasher.ts  Argon2idアダプター
  presentation/
    app.ts                       HTTPアプリの配線
    database.ts                  Contextに保持するDBモデルの型
    dependencies.ts              HTTP組立時の依存とテスト用差替え
    schemas/                     公開DTO・HTTP入力のZodスキーマ
    routes/                      OpenAPIルート定義・ハンドラー登録・横置きテスト
    middleware/                  DB Context設定・相関ID・時間・HTTPヘッダ・エラー変換
    testing/                     HTTPテストのunknown境界・DB不要のfactory差替え
  bootstrap/
    server.ts                    手動DIのComposition Rootとサーバー起動
  testing/repositories/          User / Orderのメモリ版テストアダプター

scripts/
  run-tests.ts                   node:testの収集と実行
  check-no-destructuring.ts      全分割代入・JS混入のASTチェック
vite.config.ts                  Vite+のformat / 型付きlint設定
```

- **User 集約**: ID とユーザー名、メール、状態、パスワード、バージョンを一貫した単位として扱います。
- **値オブジェクト**: それぞれ独立ファイルで検証済みブランド型を定義します。`Password` はさらに、非公開ハッシュと `matches()` を持つ凍結した操作オブジェクトです。ソルト付きハッシュの単純比較をパスワードの等価判定には使いません。
- **境界検証**: HTTP の unknown を Zod で検証してからユースケース・集約に渡します。ブランド型は実行時の防御ではないため、生成・復元時にも検証します。
- **不変更新**: `user.rename(name)` は同じ ID の新しい User を返し、元を変更しません。保存はユースケースがリポジトリに依頼します。
- **閉じた状態**: 状態はクロージャ、外部には `Object.freeze` した操作オブジェクトだけを渡します。Userの状態はプリミティブですが、Orderの明細には配列と子があるため、防御的コピーと深い凍結を行います。
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

`src/bootstrap/server.ts` が **Composition Root** です。DI コンテナを使わず、
DynamoDB clientからUser/OrderのElectroDBモデルを生成し、`db` とHasherを `createApp(dependencies)` へ渡します。
ミドルウェアが `c.set("db", db)` でモデルを設定し、HTTPハンドラーが `c.get("db")` から必要なモデルだけを取り出してRepositoryを組み立てます。Serviceに渡すのはRepository契約だけです。テストでは第2引数のfactoryやサービス・時計を差し替えられます。
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
const dto = restored.snapshot(); // HTTP に渡せる公開 DTO
```

`User` は TypeScript 上の型名と値名を兼ねます。各インスタンスは独立したクロージャを持ちます。
`User.toPersistenceSnapshot` をまとめても情報を全公開するわけではなく、WeakMap に登録された
正規のインスタンスだけを受け付けます。ただし呼び出し元の権限を強制する仕組みではありません。

### 同じ責務は同じ書き方にする

- 状態と振る舞いを持つ `User` / `Order` / `OrderLine` / `Password` は、
  `Object.freeze({ create() {}, restore() {}, toPersistenceSnapshot() {} })` に直接メソッドを定義します。
  別の公開関数を束ねるだけの形にはしません。
- インスタンス、ユースケース、Repositoryの操作オブジェクトも直接メソッド記法で揃えます。
  `map` などの短いコールバックにはアロー関数を使います。
- 単純な文字列・数値のVOは `XxxSchema` と `Xxx` ブランド型のペアに統一します。
  振る舞いのないVOを不要なオブジェクトで包みません。
- `Password.create()` はハッシュ計算があるためasync、保存スナップショットはハッシュ文字列です。
  この意味のある違いは、他のオブジェクトと無理に同一化しません。
- メモリ版Repositoryも凍結した直接メソッドで、命名は `MemoryUserRepository.create()` /
  `MemoryOrderRepository.create()` に統一。テストは責務ごとに実装横へ置きます。

## パスワードと公開境界

`NewPassword` は 15〜128 の JavaScript 文字列長で検証し、trim / 正規化しません。
この長さルールはサンプル上の業務ルールであり、包括的な認証ポリシーではありません。
`Password.matches(candidate, hasher)` ではなく、生成した値の `password.matches(candidate, hasher)` で照合します。
`Password.toPersistenceSnapshot(password)` は保存境界専用で、公開DTOに含めません。
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

## Vite+ と明示型

`agent-ready-boilerplate` の設定を参照して **vite-plus 1.4.0** と
`vite = npm:@voidzero-dev/vite-plus-core@1.4.0` を導入しています。通常のViteだけではありません。
参照先の0.3.3には間接依存のVitestに既知の脆弱性があったため、設定方針は保ちつつ修正済みの1.4.0を使用しています。
このAPIはNode上で実行するため、フロントエンド用React/Cloudflare設定やjsdomは持ち込みません。

- `npm run format`: starterと同じVite+ formatter。幅100、LF、末尾改行、ダブルクォート、セミコロン、objectWrap preserve。
- `npm run check:vite`: `vp check` でformat・型付きlint・型チェック。
- `npm run typecheck`: `tsc --noEmit`。src/scripts/vite.config.ts、strict、未使用・未検査index・exactOptionalPropertyTypesを確認。
- explicit anyとunsafe assignment/member access/return/argument/callは型付きlintで拒否。
- 公開factory・ドメイン操作・UserService/OrderService・Repositoryには引数/戻り値型を明示。
  Hono/ElectroDBの型安全なジェネリックcallback推論は維持し、不必要な型アサーションは使いません。
- 外部JSONやSDKのanyを含む結果はunknownとして受け、Zod等で検証してから扱います。
- 元のテストはnode:testなので、`vp test`へ機械的に置換せず、TypeScriptのテストランナーを維持。
- クラスではなくクロージャfactoryに操作群をまとめるため、その範囲と長い統合シナリオだけ関数長の警告基準を調整。
  型ルール、全分割代入禁止、JS混入禁止は緩めません。

`import ".../user.js"` はNodeNextのモジュール指定です。管理する実ファイルは `.ts` だけで、
tsxがTypeScriptへ解決します。JavaScript生成物をリポジトリに追加するものではありません。

## テスト

```sh
npm run check                 # AST + Vite+ format/型付きlint + tsc + テスト（DB不要）
docker compose up -d
npm run db:init
npm run test:integration      # 実 DynamoDB Local: 保存/復元/メール/パスワード/状態遷移/競合/破損レコード
docker compose down
```

統合テストは自分で作成した UUID のレコードだけを削除します。
テスト用テーブル名は `ClosureSampleUsers` と `ClosureSampleOrders`。AWS 実環境への接続機能はありません。
`src/infrastructure/dynamodb/client.ts` の認証情報 `local/local` は DynamoDB Local 用のダミーです。
テストは実装ファイルの隣に配置しています（例: `entities/user.ts` と `entities/user.test.ts`）。
実 DB 統合テストも `infrastructure/dynamodb/repositories/user-repository.integration.ts` に配置しています。
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

### 読みやすさのための小さな共通化

- User / Order と公開DTOのversion制約は `AggregateVersionSchema` を共有します。
- DynamoDB Repositoryの共通部分は、同じディレクトリの `repository-support.ts` にまとめています。version遷移検証・条件不一致の例外変換・raw応答形式だけが対象です。
- `create` / 条件付き `put` は各Repositoryに残し、モデルの型やOrder専用のサイズ制限をその場で読めるようにしています。
- Entityの基底クラスや汎用factoryは作りません。Userの状態ルール、Orderの明細整合性、Passwordの秘密状態は別々に保ちます。Orderの深い凍結は同じファイル内の関数で再利用します。

### Serviceは直接オブジェクトとして使う

`UserService` / `OrderService` は `Object.freeze` した操作オブジェクトです。生成関数や共通updateを挟まず、各メソッドにRepositoryやHasherを渡します。各操作に取得・ドメイン操作・保存を明記し、競合時も自動でやり直しません。

```ts
const user = await UserService.rename(userRepository, userId, validatedName);
const order = await OrderService.confirm(orderRepository, orderId);
```

手動DIの組立場所は `bootstrap/server.ts` です。HTTP層はContext内の設定済みDBモデルからRepositoryを組み立て、Repositoryと必要なHasherだけをServiceへ渡します。DynamoDB接続やハッシュ実装そのものはHTTPハンドラー内で生成しません。

### Repositoryはcreate → buildで組み立てる

```ts
// コントローラー内。dbはミドルウェアが設定した型付きContext変数。
const db = c.get("db");
const repository = DynamoUserRepository.create(db.users);
const user = await UserService.rename(repository, userId, validatedName);
```

`DynamoUserRepository` / `DynamoOrderRepository` の凍結した操作オブジェクトから `create` を呼ぶと、非公開の `build` がメソッド付きの凍結Repositoryを返します。Repositoryが受け取るのは接続先・テーブルを設定済みのElectroDBモデル（db）だけです。モデル組立はbootstrap側に置き、HTTPミドルウェア経由でContextに設定します。コントローラーはContext全体ではなく `db.users` / `db.orders` だけをRepositoryに渡します。Hono ContextもDBモデルもユースケースへ渡しません。

`MemoryUserRepository.create()` / `MemoryOrderRepository.create()` も同じ構造ですが、呼び出すたびに独立したMapを生成します。サービスは直接オブジェクト方式のままで、生成済みRepositoryを引数で受け取ります。

DBモデルは起動時に生成して共有し、リクエストごとにDB接続を作り直しません。Repositoryは各コントローラーで軽量な操作オブジェクトとして組み立てます。Contextへの設定は認証やテナント分離ではありません。
