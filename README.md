# 自動フォーム営業ツール

フォームベースの問い合わせページを自動で検出・入力・送信し、営業活動を効率化するChrome拡張機能です。

* お問い合わせフォームに必要な情報（会社名、氏名、メールアドレス、電話番号、住所、営業メッセージ など）をあらかじめ設定しておけば、ボタンひとつで自動入力から送信まで行えます。
* iframe対応、禁止文言検出、reCAPTCHA待機、確認画面への対応など、実際のWebサイトで発生する多くのケースに対応。
* Supabaseを使ったライセンス認証・デバイス管理機能、IndexedDBを使った送信結果のダッシュボード表示付き。

## 🚀 主な機能

* **タグパラメータ**による動的メッセージ置換 (`[param1]`〜`[param5]`)
* **営業お断り文言検出**（「営業お断り」「遠慮」などを検知して自動送信をスキップ）
* **select / radio / checkbox / textarea / input** の自動入力
* **iframe内フォーム**のサポート
* **reCAPTCHA検出**→一定時間待機 → 自動再送信
* **送信結果の管理**：IndexedDB（ExDB）に履歴を保存、ダッシュボードで進捗・成功率を可視化
* **Supabase連携**：ユーザー認証 → ライセンス確認 → デバイス数管理

## 📦 必要条件

* Google Chrome 最新版
* Chrome拡張機能の開発者モードを有効化
* Supabase プロジェクト（ライセンス認証用）

## 🛠️ セットアップ手順

1. リポジトリをクローン／ダウンロード

   ```bash
   git clone https://github.com/yourname/auto-form-sales-tool.git
   cd auto-form-sales-tool
   ```
2. `main.js` にSupabaseの環境変数を設定

   ```js
   const supabaseConfig = {
     url: 'https://<YOUR_PROJECT>.supabase.co',
     anonKey: '<YOUR_ANON_KEY>'
   };
   ```
3. Chromeで `chrome://extensions` を開き、右上の「デベロッパーモード」をオン
4. 「パッケージ化されていない拡張機能を読み込む」をクリックし、プロジェクトのルートフォルダを選択
5. 拡張アイコンが表示されたら、ポップアップ設定画面で **プロフィールパターン** を追加し、**タグパラメータ** を入力のうえ、実行ボタンを押下

## ⚙️ プロフィール設定

* カスタムパターンを最大5つまで登録可能。項目：

  * `title`: プロファイル名（例: デフォルト営業）
  * `company`, `department`, `position`, `industry`, `member` など企業情報
  * `url`, `email`, `sei`, `mei`, `seiKana`, `meiHira`, `tel`, `fax`, `zip`, `address1`〜`address4` など入力フィールド対応
  * `subject`: 問い合わせ件名
  * `message`: 営業メッセージ本文（`[param1]`等の置換可）

## 🎛️ ダッシュボード機能

* 保存されたURLリストから未処理・処理済みの履歴を確認
* 最新送信日時、送信総数、成功率、進捗バーによる可視化
* 実行中のタブ制御（開始／停止）
* CSV エクスポート／タイトル編集／削除機能

## 🧩 アーキテクチャ概要

```text
popup.html  ←─ main.js ── Chrome storage ↔ プロフィール／設定／送信履歴 (IndexedDB)
              │
              └─ background.js ── chrome.runtime.onMessage ── send.js ── フォーム自動入力・送信

Supabase ↔ main.js ↔ ライセンス認証・デバイス管理
```

## 🛡️ セキュリティ・注意点

* フォーム自動送信は相手サイトの規約を順守のうえご利用ください。無断営業やスパム行為は自己責任です。
* reCAPTCHAには完全対応していない場合があります。必要に応じて手動確認を推奨します。
* ライセンスキー・Supabase anonKey は公開リポジトリに直書きせず、環境変数や `chrome.storage.sync` で管理してください。

## 🤝 貢献・開発参加

1. Issue を立てる
2. `feature/xxx` ブランチを切る
3. 修正 → `git push origin feature/xxx` → プルリクエスト
4. レビュー・マージ

## 📄 ライセンス

MIT License

---

*README は随時更新しています。バグ報告や要望、大歓迎です！*
