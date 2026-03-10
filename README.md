# Echo Loop

Canvas + HTML/CSS/JavaScript だけで作った、1ボタン操作のエンドレス横スクロール風アクションです。

## ゲーム概要
- プレイヤーは自動で右へ進みます。
- 右端まで行くと左端へループし、`Lap` が増えます。
- 画面下に落ちると、同じ x 座標のまま画面上から再登場します（ライフ減少なし）。
- 敵に当たるとライフが減り、0でゲームオーバーです。
- 最大の特徴: **前の Lap での自分の入力が、次 Lap でミラー敵として返ってきます**。

## 操作方法
- PC: `Space`
- スマホ: タップ / 長押し
- マウス: クリック / 長押し

入力判定（地上時）:
- タップ: 小ジャンプ
- 長押し中（約260ms以上）: 大ジャンプに昇格

## ファイル構成
- `index.html` : 画面構成（Canvas、HUD、オーバーレイ）
- `style.css` : レトロ調UI、レスポンシブ、タッチ誤操作抑制
- `main.js` : 起動エントリ（`bootGame()` 呼び出しのみ）
- `src/bootstrap.js` : 初期化・配線・ゲームループ
- `src/audio.js` : Audio Engine（BGM/SFX）
- `src/renderer.js` : 描画とHUD更新
- `src/systems/terrain.js` : 地形生成と難易度トレンド
- `src/systems/mirror.js` : 入力ログ圧縮とミラー敵スケジュール
- `src/systems/update-running.js` : ラン中のシミュレーション更新
- `src/core/config.js` : 定数設定
- `src/core/state.js` : `createInitialState` / `createPlayer`
- `src/core/utils.js` : 純関数ユーティリティ
- `src/input.js` : 入力イベント登録
- `docs/regression-checklist.md` : 手動回帰チェック表
- `docs/terrain-snapshot-baseline.json` : 地形スナップショット基準値
- `scripts/terrain-snapshot.mjs` : 地形スナップショット生成
- `scripts/check-terrain-snapshot.mjs` : 基準値との差分チェック

## ローカルでの遊び方
1. `index.html` をブラウザで開く
2. `Space` またはタップで開始

ビルドツールや外部ライブラリは不要です。GitHub Pages など静的ホスティングにもそのまま配置できます。

## 回帰チェック（分割安全網）
- 手動チェック: `docs/regression-checklist.md`
- 地形決定論チェック: `node scripts/check-terrain-snapshot.mjs`
