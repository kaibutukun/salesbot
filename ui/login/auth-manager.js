/**
 * 認証管理モジュール
 * ログイン/ログアウト状態の管理とUI制御
 * 
 * このモジュールはSupabase認証とUI表示の統合管理を行います
 */

import { createSupabaseClient } from '../../shared/config.js';
import { getElement, setElementVisible, setElementText } from '../common/dom-helper.js';
import { logError, showToast, setSyncStorage, removeStorage } from '../common/chrome-api-helper.js';

// ====================================
// Supabaseクライアント管理
// ====================================

let supabaseClient = null;

/**
 * Supabaseクライアントを初期化する
 * @returns {Object} Supabaseクライアント
 */
export function initializeSupabaseClient() {
    if (!supabaseClient) {
        supabaseClient = createSupabaseClient();
    }
    return supabaseClient;
}

/**
 * Supabaseクライアントを取得する
 * @returns {Object} Supabaseクライアント
 */
export function getSupabaseClient() {
    if (!supabaseClient) {
        supabaseClient = initializeSupabaseClient();
    }
    return supabaseClient;
}

// ====================================
// 認証状態管理
// ====================================

/**
 * 認証状態をチェックしてUIを更新する
 * @param {Function} updateDeviceInfoCallback - デバイス情報更新コールバック
 * @returns {Promise<Object|null>} ユーザーオブジェクトまたはnull
 */
export async function checkAuthState(updateDeviceInfoCallback = null) {
    try {
        const client = getSupabaseClient();
        const { data: { user } } = await client.auth.getUser();
        
        if (user) {
            // ログイン状態のUI表示
            showLoggedInState(user);
            
            // デバイス情報更新（コールバックが提供されている場合）
            if (updateDeviceInfoCallback && typeof updateDeviceInfoCallback === 'function') {
                await updateDeviceInfoCallback(user.id);
            }
            
            // ライセンス情報をストレージに保存
            await setSyncStorage('validLicense', true);
            
            return user;
        } else {
            // ログアウト状態のUI表示
            showLoggedOutState();
            
            // ライセンス情報をストレージから削除
            await removeStorage('validLicense', true);
            
            return null;
        }
    } catch (error) {
        logError(error, 'checkAuthState');
        
        // エラーが発生した場合はログアウト状態を表示
        showLoggedOutState();
        return null;
    }
}

/**
 * ログイン状態のUIを表示する
 * @param {Object} user - ユーザーオブジェクト
 */
export function showLoggedInState(user) {
    try {
        // ログイン関連要素を非表示
        const loginElements = [
            'email',
            'password', 
            'loginButton'
        ];
        
        loginElements.forEach(id => {
            setElementVisible(id, false);
        });
        
        // ラベルを非表示
        document.querySelectorAll('label').forEach(label => {
            label.style.display = 'none';
        });
        
        // 成功メッセージとボタンを表示
        const successMessage = getElement('successMessage', false);
        if (successMessage) {
            setElementVisible('successMessage', true);
            setElementText('successMessage', `${user.email} としてログイン中`);
        }
        
        setElementVisible('openAppButton', true);
        setElementVisible('logoutButton', true);
        
        // デバイス情報要素を表示
        const deviceInfoElement = getElement('deviceInfo', false);
        if (deviceInfoElement) {
            setElementVisible('deviceInfo', true);
        }
        
    } catch (error) {
        logError(error, 'showLoggedInState');
    }
}

/**
 * ログアウト状態のUIを表示する
 */
export function showLoggedOutState() {
    try {
        // ログイン関連要素を表示
        const loginElements = [
            'email',
            'password',
            'loginButton'
        ];
        
        loginElements.forEach(id => {
            setElementVisible(id, true);
        });
        
        // ラベルを表示
        document.querySelectorAll('label').forEach(label => {
            label.style.display = 'block';
        });
        
        // 成功メッセージとボタンを非表示
        setElementVisible('successMessage', false);
        setElementVisible('openAppButton', false);
        setElementVisible('logoutButton', false);
        
        // デバイス情報要素を非表示
        const deviceInfoElement = getElement('deviceInfo', false);
        if (deviceInfoElement) {
            setElementVisible('deviceInfo', false);
        }
        
    } catch (error) {
        logError(error, 'showLoggedOutState');
    }
}

// ====================================
// ログアウト処理
// ====================================

/**
 * ログアウト処理を実行する
 * @returns {Promise<boolean>} 成功したかどうか
 */
export async function performLogout() {
    try {
        const client = getSupabaseClient();
        const { error } = await client.auth.signOut();
        
        if (error) {
            logError(error, 'performLogout');
            showToast('ログアウトに失敗しました', 'error');
            return false;
        }
        
        // UI状態を更新
        showLoggedOutState();
        
        // ストレージをクリア
        await removeStorage('validLicense', true);
        
        showToast('ログアウトしました', 'success');
        return true;
        
    } catch (error) {
        logError(error, 'performLogout');
        showToast('ログアウト中にエラーが発生しました', 'error');
        return false;
    }
}

// ====================================
// ユーザー情報管理
// ====================================

/**
 * 現在のユーザー情報を取得する
 * @returns {Promise<Object|null>} ユーザーオブジェクトまたはnull
 */
export async function getCurrentUser() {
    try {
        const client = getSupabaseClient();
        const { data: { user } } = await client.auth.getUser();
        return user;
    } catch (error) {
        logError(error, 'getCurrentUser');
        return null;
    }
}

/**
 * ユーザーが認証済みかどうかをチェックする
 * @returns {Promise<boolean>} 認証済みかどうか
 */
export async function isUserAuthenticated() {
    const user = await getCurrentUser();
    return user !== null;
}

// ====================================
// 認証セッション管理
// ====================================

/**
 * 認証セッションの変更を監視する
 * @param {Function} callback - セッション変更時のコールバック
 * @returns {Object} 購読解除関数
 */
export function subscribeToAuthChanges(callback) {
    try {
        const client = getSupabaseClient();
        
        const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
            if (typeof callback === 'function') {
                callback(event, session);
            }
        });
        
        return subscription;
        
    } catch (error) {
        logError(error, 'subscribeToAuthChanges');
        return null;
    }
}

/**
 * 認証セッション監視を停止する
 * @param {Object} subscription - 購読オブジェクト
 */
export function unsubscribeFromAuthChanges(subscription) {
    if (subscription && typeof subscription.unsubscribe === 'function') {
        subscription.unsubscribe();
    }
}