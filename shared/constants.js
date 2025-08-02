/**
 * アプリケーション全体で使用する定数定義
 * Chrome拡張機能の動作に関わる重要な数値・文字列を管理
 */

// ====================================
// バッチ処理関連定数
// ====================================

/** バッチサイズ（一度に処理するURL数） */
export const BATCH_SIZE = 100;

/** バッチ間の遅延時間（ミリ秒） - サーバー負荷軽減のため */
export const BATCH_DELAY = 30000; // 30秒

// ====================================
// タイムアウト関連定数
// ====================================

/** キープアライブ間隔（ミリ秒） */
export const KEEPALIVE_INTERVAL = 20000; // 20秒

/** URL処理タイムアウト（ミリ秒） */
export const URL_PROCESSING_TIMEOUT = 90000; // 90秒

/** 一般的なフォーム操作タイムアウト（ミリ秒） */
export const FORM_TIMEOUT = 5000; // 5秒

/** 通常の送信タイムアウト（ミリ秒） */
export const SEND_TIMEOUT = 10000; // 10秒

/** reCAPTCHA対応の送信タイムアウト（ミリ秒） */
export const RECAPTCHA_TIMEOUT = 40000; // 40秒

/** 長時間待機のタイムアウト（ミリ秒） */
export const WAIT_TIMEOUT = 15000; // 15秒

// ====================================
// アクション名定数
// ====================================

/** フォーム探索アクション */
export const ACTION_EXPLORE = "explore";

/** フォーム送信アクション */
export const ACTION_SEND = "send";

/** 停止アクション */
export const ACTION_STOP = "stop";

/** 停止完了通知アクション */
export const ACTION_STOP_COMPLETED = "stopCompleted";

/** 確認アクション */
export const ACTION_CONFIRM = "confirm";

/** reCAPTCHAチェックアクション */
export const ACTION_RECHECK = "recheck";

/** 実行アクション */
export const ACTION_EXECUTE = "execute";

// ====================================
// UI関連定数
// ====================================

/** プログレス更新間隔（ミリ秒） */
export const PROGRESS_UPDATE_INTERVAL = 1000; // 1秒

/** 短時間待機（ミリ秒） */
export const SHORT_DELAY = 100;

// ====================================
// エラーメッセージ定数
// ====================================

/** 停止要求エラー */
export const ERROR_STOP_REQUESTED = 'STOP_REQUESTED';

/** 処理タイムアウトメッセージのテンプレート */
export const TIMEOUT_MESSAGE_TEMPLATE = (seconds) => `処理タイムアウト（${seconds}秒経過）`;

// ====================================
// デバッグ・ログ用定数
// ====================================

/** デバッグモード（開発時のみtrue） */
export const DEBUG_MODE = false;

/**
 * 定数の妥当性をチェックする
 * @returns {boolean} 全ての定数が妥当な場合true
 */
export function validateConstants() {
    const requiredPositive = [
        BATCH_SIZE,
        BATCH_DELAY,
        KEEPALIVE_INTERVAL,
        URL_PROCESSING_TIMEOUT,
        FORM_TIMEOUT,
        SEND_TIMEOUT,
        RECAPTCHA_TIMEOUT,
        WAIT_TIMEOUT
    ];
    
    return requiredPositive.every(value => typeof value === 'number' && value > 0);
}