# CHAMPAGNE CALL DJ

シャンパンコール用のDJアプリです。ブラウザで開いて、そのままアプリとしてインストールできます（Windows / Android / iPhone）。

- コール音源をコールごとに TRACK 1〜3 として取り込み
- 効果音パッド（連打で重ね鳴らし）
- 低音・音量のタッチフェーダー
- オフラインで動作。音源は各端末の中に保存

音源ファイルはこのリポジトリには含まれません。

## 自動同期（Cloudflare）

Cloudflare Workers + R2 で動かすと、同じ同期パスワードで接続した全端末に音源・名前・順番が自動で届きます。

- `src/worker.js` … 同期サーバー（`/api/*`）。それ以外はアプリ本体を返します
- `wrangler.jsonc` … R2バケット `champagne-dj-audio` を `AUDIO` として使います
- シークレット `STORE_KEY` … お店の同期パスワード（Cloudflareの設定画面で登録）

GitHub Pages で開いた場合は同期なし（端末内保存＋バックアップ）で動きます。
