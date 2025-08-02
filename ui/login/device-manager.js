/**
 * デバイス管理モジュール  
 * デバイスID生成、制限チェック、情報表示の管理
 * 
 * このモジュールはデバイス認証とライセンス管理を行います
 */

import { getSupabaseClient } from './auth-manager.js';
import { getDeviceId, setLocalStorage, getLocalStorage } from '../common/chrome-api-helper.js';
import { getElement, setElementText, setElementVisible } from '../common/dom-helper.js';
import { logError, showToast } from '../common/error-handler.js';

// ====================================
// デバイスID管理
// ====================================

/**
 * デバイスIDを取得または生成する（既存のchrome-api-helperを使用）
 * @returns {Promise<string>} デバイスID
 */
export async function getOrCreateDeviceId() {
    return await getDeviceId();
}

/**
 * デバイス情報をローカルストレージに保存する
 * @param {Object} deviceInfo - デバイス情報
 * @returns {Promise<boolean>} 成功したかどうか
 */
export async function saveDeviceInfo(deviceInfo) {
    try {
        await setLocalStorage('deviceInfo', deviceInfo);
        return true;
    } catch (error) {
        logError(error, 'saveDeviceInfo');
        return false;
    }
}

/**
 * デバイス情報をローカルストレージから取得する
 * @returns {Promise<Object|null>} デバイス情報
 */
export async function getStoredDeviceInfo() {
    try {
        return await getLocalStorage('deviceInfo');
    } catch (error) {
        logError(error, 'getStoredDeviceInfo');
        return null;
    }
}

// ====================================
// デバイス制限チェック
// ====================================

/**
 * ユーザーのデバイス制限をチェックする
 * @param {Object} user - ユーザーオブジェクト
 * @returns {Promise<boolean>} 制限内かどうか
 */
export async function checkDeviceLimit(user) {
    try {
        const client = getSupabaseClient();
        const deviceId = await getOrCreateDeviceId();

        // ユーザーの最大デバイス数を取得
        const { data: userData, error: userError } = await client
            .from('users')
            .select('max_devices')
            .eq('id', user.id)
            .single();

        if (userError) {
            throw userError;
        }

        const maxDevices = userData?.max_devices || 5;

        // 現在のデバイス一覧を取得
        const { data: devices, error: devicesError } = await client
            .from('user_devices')
            .select('device_id')
            .eq('user_id', user.id);

        if (devicesError) {
            throw devicesError;
        }

        const deviceList = devices || [];
        const currentDeviceExists = deviceList.some(d => d.device_id === deviceId);

        // 現在のデバイスが既に登録されている場合はOK
        if (currentDeviceExists) {
            return true;
        }

        // デバイス数が制限に達している場合はエラー
        if (deviceList.length >= maxDevices) {
            throw new Error(`デバイス制限に達しています（最大${maxDevices}台）。新しいデバイスでご利用いただくには、他のデバイスでログアウトしてください。`);
        }

        // 新しいデバイスを登録
        const { error: insertError } = await client
            .from('user_devices')
            .insert({
                user_id: user.id,
                device_id: deviceId,
                device_name: await generateDeviceName(),
                registered_at: new Date().toISOString()
            });

        if (insertError) {
            throw insertError;
        }

        return true;

    } catch (error) {
        logError(error, 'checkDeviceLimit');
        throw error; // 呼び出し元でハンドリング
    }
}

/**
 * デバイス名を生成する
 * @returns {Promise<string>} デバイス名
 */
async function generateDeviceName() {
    try {
        // ブラウザ情報を取得
        const userAgent = navigator.userAgent;
        let browserName = 'Unknown Browser';
        let osName = 'Unknown OS';

        // ブラウザの判定
        if (userAgent.includes('Chrome')) {
            browserName = 'Chrome';
        } else if (userAgent.includes('Firefox')) {
            browserName = 'Firefox';
        } else if (userAgent.includes('Safari')) {
            browserName = 'Safari';
        } else if (userAgent.includes('Edge')) {
            browserName = 'Edge';
        }

        // OSの判定
        if (userAgent.includes('Windows')) {
            osName = 'Windows';
        } else if (userAgent.includes('Mac')) {
            osName = 'macOS';
        } else if (userAgent.includes('Linux')) {
            osName = 'Linux';
        } else if (userAgent.includes('Android')) {
            osName = 'Android';
        } else if (userAgent.includes('iOS')) {
            osName = 'iOS';
        }

        const timestamp = new Date().toLocaleDateString('ja-JP', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });

        return `${browserName} on ${osName} (${timestamp})`;

    } catch (error) {
        logError(error, 'generateDeviceName');
        return `Device ${Date.now()}`;
    }
}

// ====================================
// デバイス情報表示
// ====================================

/**
 * デバイス情報を更新して表示する
 * @param {string} userId - ユーザーID
 * @returns {Promise<boolean>} 成功したかどうか
 */
export async function updateDeviceInfo(userId) {
    try {
        const deviceInfoElement = getElement('deviceInfo', false);
        if (!deviceInfoElement) {
            return false;
        }

        const client = getSupabaseClient();
        const deviceId = await getOrCreateDeviceId();

        // ユーザーのデバイス情報を取得
        const { data: devices, error: devicesError } = await client
            .from('user_devices')
            .select('device_id, device_name, registered_at')
            .eq('user_id', userId);

        if (devicesError) {
            throw devicesError;
        }

        // ユーザーの最大デバイス数を取得
        const { data: userData, error: userError } = await client
            .from('users')
            .select('max_devices')
            .eq('id', userId)
            .single();

        if (userError) {
            throw userError;
        }

        const deviceList = devices || [];
        const maxDevices = userData?.max_devices || 5;
        const currentDeviceCount = deviceList.length;

        // デバイス情報のHTML生成
        const deviceInfoHTML = `
            <div class="device-info">
                <h4>デバイス情報</h4>
                <div class="device-count">
                    登録デバイス数: ${currentDeviceCount} / ${maxDevices}
                </div>
                <div class="device-list">
                    ${deviceList.map(device => `
                        <div class="device-item ${device.device_id === deviceId ? 'current-device' : ''}">
                            <div class="device-name">${device.device_name}</div>
                            <div class="device-date">${new Date(device.registered_at).toLocaleDateString('ja-JP')}</div>
                            ${device.device_id === deviceId ? '<span class="current-label">このデバイス</span>' : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        deviceInfoElement.innerHTML = deviceInfoHTML;
        setElementVisible('deviceInfo', true);

        // デバイス情報をローカルストレージに保存
        await saveDeviceInfo({
            deviceId,
            deviceCount: currentDeviceCount,
            maxDevices,
            devices: deviceList,
            lastUpdated: new Date().toISOString()
        });

        return true;

    } catch (error) {
        logError(error, 'updateDeviceInfo');
        
        // エラー時はシンプルな表示
        const deviceInfoElement = getElement('deviceInfo', false);
        if (deviceInfoElement) {
            setElementText(deviceInfoElement, 'デバイス情報の取得に失敗しました');
            setElementVisible('deviceInfo', true);
        }
        
        return false;
    }
}

/**
 * デバイス情報表示をクリアする
 */
export function clearDeviceInfo() {
    const deviceInfoElement = getElement('deviceInfo', false);
    if (deviceInfoElement) {
        deviceInfoElement.innerHTML = '';
        setElementVisible('deviceInfo', false);
    }
}

// ====================================
// デバイス管理ユーティリティ
// ====================================

/**
 * 現在のデバイスがユーザーに登録されているかチェックする
 * @param {string} userId - ユーザーID
 * @returns {Promise<boolean>} 登録されているかどうか
 */
export async function isCurrentDeviceRegistered(userId) {
    try {
        const client = getSupabaseClient();
        const deviceId = await getOrCreateDeviceId();

        const { data: device, error } = await client
            .from('user_devices')
            .select('device_id')
            .eq('user_id', userId)
            .eq('device_id', deviceId)
            .single();

        return !error && device !== null;

    } catch (error) {
        logError(error, 'isCurrentDeviceRegistered');
        return false;
    }
}

/**
 * デバイスの登録を解除する
 * @param {string} userId - ユーザーID
 * @param {string} deviceId - デバイスID（省略時は現在のデバイス）
 * @returns {Promise<boolean>} 成功したかどうか
 */
export async function unregisterDevice(userId, deviceId = null) {
    try {
        const client = getSupabaseClient();
        const targetDeviceId = deviceId || await getOrCreateDeviceId();

        const { error } = await client
            .from('user_devices')
            .delete()
            .eq('user_id', userId)
            .eq('device_id', targetDeviceId);

        if (error) {
            throw error;
        }

        showToast('デバイスの登録を解除しました', 'success');
        return true;

    } catch (error) {
        logError(error, 'unregisterDevice');
        showToast('デバイスの登録解除に失敗しました', 'error');
        return false;
    }
}