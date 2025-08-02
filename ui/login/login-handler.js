/**
 * ログイン処理モジュール
 * ログイン/ログアウトの具体的な処理とエラーハンドリング
 * 
 * このモジュールはログイン処理の実装とユーザー管理を行います
 */

import { getSupabaseClient, checkAuthState, performLogout } from './auth-manager.js';
import { checkDeviceLimit, updateDeviceInfo } from './device-manager.js';
import { getElement, getElementValue, setElementValue } from '../common/dom-helper.js';
import { 
    showErrorMessage, 
    showSuccessMessage, 
    clearMessages, 
    setButtonState, 
    getUserFriendlyErrorMessage,
    logError,
    showToast
} from '../common/error-handler.js';
import { setSyncStorage } from '../common/chrome-api-helper.js';

// ====================================
// ログイン処理
// ====================================

/**
 * ログイン処理を実行する
 * @returns {Promise<boolean>} 成功したかどうか
 */
export async function performLogin() {
    try {
        // 入力値の取得
        const email = getElementValue('email', '').trim();
        const password = getElementValue('password', '');

        // 入力値のバリデーション
        const validationError = validateLoginInputs(email, password);
        if (validationError) {
            showErrorMessage('errorMessage', validationError);
            return false;
        }

        // UI状態の更新
        setButtonState('loginButton', true, 'ログイン中...');
        clearMessages('errorMessage', 'successMessage');

        // Supabaseでの認証
        const client = getSupabaseClient();
        const { data, error } = await client.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) {
            throw error;
        }

        const user = data.user;
        if (!user) {
            throw new Error('ユーザー情報の取得に失敗しました');
        }

        // ユーザー情報の確認・作成
        await ensureUserExists(user);

        // デバイス制限の確認
        await checkDeviceLimit(user);

        // ライセンス情報の保存
        await setSyncStorage('validLicense', true);

        // 成功メッセージの表示
        showSuccessMessage('successMessage', 'ログインに成功しました');

        // 認証状態の更新
        await checkAuthState(updateDeviceInfo);

        showToast('ログインしました', 'success');
        return true;

    } catch (error) {
        handleLoginError(error);
        return false;
    } finally {
        setButtonState('loginButton', false, 'ログイン');
    }
}

/**
 * ログイン入力値のバリデーション
 * @param {string} email - メールアドレス
 * @param {string} password - パスワード
 * @returns {string|null} エラーメッセージまたはnull
 */
function validateLoginInputs(email, password) {
    if (!email || !password) {
        return 'メールアドレスと認証キーを入力してください。';
    }

    // メールアドレスの形式チェック
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return 'メールアドレスの形式が正しくありません。';
    }

    // パスワードの長さチェック
    if (password.length < 6) {
        return '認証キーは6文字以上である必要があります。';
    }

    return null;
}

/**
 * ログインエラーのハンドリング
 * @param {Error} error - エラーオブジェクト
 */
function handleLoginError(error) {
    logError(error, 'login');

    let userMessage = getUserFriendlyErrorMessage(error);

    // Supabase固有のエラーメッセージの変換
    if (error.message) {
        const message = error.message.toLowerCase();
        
        if (message.includes('invalid login credentials') || 
            message.includes('email not confirmed') ||
            message.includes('invalid email or password')) {
            userMessage = 'メールアドレスまたは認証キーが正しくありません。';
        } else if (message.includes('email rate limit exceeded')) {
            userMessage = '短時間に多くのログイン試行が行われました。しばらく待ってから再試行してください。';
        } else if (message.includes('signup is disabled')) {
            userMessage = '新規登録は現在無効になっています。';
        } else if (message.includes('デバイス制限')) {
            userMessage = error.message; // デバイス制限のメッセージはそのまま表示
        }
    }

    showErrorMessage('errorMessage', userMessage);
    showToast(userMessage, 'error');
}

// ====================================
// ユーザー管理
// ====================================

/**
 * ユーザーの存在確認・作成
 * @param {Object} user - ユーザーオブジェクト
 * @returns {Promise<Object>} ユーザーデータ
 */
export async function ensureUserExists(user) {
    try {
        const client = getSupabaseClient();

        // 既存ユーザーの確認
        let { data: existingUser, error: userCheckError } = await client
            .from('users')
            .select('id, max_devices, created_at')
            .eq('id', user.id)
            .maybeSingle();

        // エラーが発生した場合（PGRST116は「見つからない」エラーなので無視）
        if (userCheckError && userCheckError.code !== 'PGRST116') {
            throw userCheckError;
        }

        // ユーザーが存在しない場合は新規作成
        if (!existingUser) {
            const { data: newUser, error: createUserError } = await client
                .from('users')
                .insert({
                    id: user.id,
                    email: user.email,
                    max_devices: 5,
                    created_at: new Date().toISOString(),
                    last_login: new Date().toISOString()
                })
                .select()
                .single();

            if (createUserError) {
                throw createUserError;
            }

            existingUser = newUser;
        } else {
            // 既存ユーザーの最終ログイン時刻を更新
            const { error: updateError } = await client
                .from('users')
                .update({ 
                    last_login: new Date().toISOString(),
                    email: user.email // 念のためメールアドレスも更新
                })
                .eq('id', user.id);

            if (updateError) {
                // ログイン時刻の更新に失敗しても処理を継続
                logError(updateError, 'updateLastLogin');
            }
        }

        return existingUser;

    } catch (error) {
        logError(error, 'ensureUserExists');
        throw new Error('ユーザー情報の処理に失敗しました: ' + error.message);
    }
}

// ====================================
// ログアウト処理
// ====================================

/**
 * ログアウトボタンの処理
 * @returns {Promise<void>}
 */
export async function handleLogoutClick() {
    try {
        setButtonState('logoutButton', true, 'ログアウト中...');
        
        const success = await performLogout();
        
        if (success) {
            // フォームをクリア
            setElementValue('email', '');
            setElementValue('password', '');
            clearMessages('errorMessage', 'successMessage');
        }
        
    } finally {
        setButtonState('logoutButton', false, 'ログアウト');
    }
}

// ====================================
// フォーム管理
// ====================================

/**
 * ログインフォームをクリアする
 */
export function clearLoginForm() {
    setElementValue('email', '');
    setElementValue('password', '');
    clearMessages('errorMessage', 'successMessage');
}

/**
 * ログインフォームの入力値を取得する
 * @returns {Object} フォームデータ
 */
export function getLoginFormData() {
    return {
        email: getElementValue('email', '').trim(),
        password: getElementValue('password', '')
    };
}

/**
 * ログインフォームの入力値を設定する
 * @param {Object} formData - フォームデータ
 */
export function setLoginFormData(formData) {
    if (formData.email !== undefined) {
        setElementValue('email', formData.email);
    }
    if (formData.password !== undefined) {
        setElementValue('password', formData.password);
    }
}

// ====================================
// イベントハンドラーセットアップ
// ====================================

/**
 * ログインフォームのイベントリスナーを設定する
 */
export function setupLoginEventListeners() {
    // ログインボタンのクリックイベント
    const loginButton = getElement('loginButton', false);
    if (loginButton) {
        loginButton.addEventListener('click', performLogin);
    }

    // ログアウトボタンのクリックイベント
    const logoutButton = getElement('logoutButton', false);
    if (logoutButton) {
        logoutButton.addEventListener('click', handleLogoutClick);
    }

    // Enterキーでのログイン
    const passwordInput = getElement('password', false);
    if (passwordInput) {
        passwordInput.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                performLogin();
            }
        });
    }

    // メイン画面を開くボタン
    const openAppButton = getElement('openAppButton', false);
    if (openAppButton) {
        openAppButton.addEventListener('click', () => {
            chrome.tabs.create({ url: 'ui/main.html' });
        });
    }
}

/**
 * イベントリスナーを削除する
 */
export function removeLoginEventListeners() {
    // 必要に応じて実装
    // 通常は単一ページアプリケーションなので不要
}