/**
 * 認証サービス
 * Supabase認証、ライセンス管理、デバイス情報管理を担当
 */

// 共通モジュールのインポート
import { createSupabaseClient } from '../shared/config.js';

/**
 * 認証サービスクラス
 */
export class AuthService {
    constructor(showToastFn = null, getElementFn = null) {
        this.showToastFunction = showToastFn;
        this.getElementFunction = getElementFn;
        this.supabaseClient = createSupabaseClient();
        this.elements = this.initializeElements();
        this.setupAuthStateListener();
    }

    /**
     * DOM要素を初期化
     * @returns {Object} DOM要素の参照オブジェクト
     */
    initializeElements() {
        return {
            licenseStatus: this.getElement('licenseStatus'),
            deviceInfo: this.getElement('deviceInfo')
        };
    }

    /**
     * 要素を取得するヘルパー関数
     * @param {string} id - 要素のID
     * @returns {Element|null} DOM要素
     */
    getElement(id) {
        if (this.getElementFunction) {
            return this.getElementFunction(id);
        }
        return document.getElementById(id);
    }

    /**
     * トーストメッセージを表示
     * @param {string} message - 表示メッセージ
     * @param {string} type - メッセージタイプ
     */
    showToast(message, type = 'info') {
        if (this.showToastFunction) {
            this.showToastFunction(message, type);
        } else {
            console.log(`Toast: ${message} (${type})`);
        }
    }

    /**
     * 認証状態変更の監視を設定
     */
    setupAuthStateListener() {
        this.supabaseClient.auth.onAuthStateChange((event, session) => {
            this.checkLicenseStatus();
            this.updateDeviceInfo();
        });
    }

    /**
     * ライセンス状態を確認する
     * @returns {Promise<boolean>} ライセンスが有効な場合はtrue
     */
    async checkLicenseStatus() {
        try {
            if (this.elements.licenseStatus) {
                this.elements.licenseStatus.textContent = '確認中...';
                this.elements.licenseStatus.classList.remove('license-valid');
                this.elements.licenseStatus.classList.remove('license-invalid');
            }

            const { data: { user } } = await this.supabaseClient.auth.getUser();
            
            if (user) {
                if (this.elements.licenseStatus) {
                    this.elements.licenseStatus.textContent = '有効なライセンス';
                    this.elements.licenseStatus.classList.add('license-valid');
                }
                await chrome.storage.sync.set({ validLicense: true });
                return true;
            } else {
                const licenseData = await chrome.storage.sync.get('validLicense');
                if (licenseData.validLicense) {
                    if (this.elements.licenseStatus) {
                        this.elements.licenseStatus.textContent = '有効なライセンス';
                        this.elements.licenseStatus.classList.add('license-valid');
                    }
                    return true;
                } else {
                    if (this.elements.licenseStatus) {
                        this.elements.licenseStatus.textContent = 'ログインが必要です';
                        this.elements.licenseStatus.classList.add('license-invalid');
                    }
                    return false;
                }
            }
        } catch (error) {
            if (this.elements.licenseStatus) {
                this.elements.licenseStatus.textContent = 'ログインが必要です';
                this.elements.licenseStatus.classList.add('license-invalid');
            }
            return false;
        }
    }

    /**
     * デバイス情報を更新する
     */
    async updateDeviceInfo() {
        try {
            const deviceInfoElement = this.elements.deviceInfo;
            if (!deviceInfoElement) return;

            deviceInfoElement.classList.remove('device-valid');
            deviceInfoElement.textContent = '端末情報取得中...';

            const { data: { user } } = await this.supabaseClient.auth.getUser();
            if (!user) {
                deviceInfoElement.style.display = 'none';
                return;
            }

            // ユーザー情報の取得
            let userData;
            const { data: existingUser, error: userError } = await this.supabaseClient
                .from('users')
                .select('max_devices')
                .eq('id', user.id)
                .maybeSingle();

            if (userError) {
                if (userError.code === 'PGRST116') {
                    // ユーザーが存在しない場合は作成
                    const { data: newUser, error: createError } = await this.supabaseClient
                        .from('users')
                        .insert({
                            id: user.id,
                            max_devices: 5
                        })
                        .select()
                        .single();

                    if (createError) {
                        throw createError;
                    }
                    userData = newUser;
                } else {
                    throw userError;
                }
            } else {
                userData = existingUser;
            }

            const maxDevices = userData?.max_devices || 5;

            // 現在のデバイス数を取得
            const { data: devices, error: devicesError } = await this.supabaseClient
                .from('user_devices')
                .select('id')
                .eq('user_id', user.id);

            if (devicesError) {
                throw devicesError;
            }

            const deviceCount = devices?.length || 0;

            deviceInfoElement.textContent = `端末: ${deviceCount}/${maxDevices}`;
            deviceInfoElement.classList.add('device-valid');
            deviceInfoElement.style.display = 'inline-block';

        } catch (error) {
            const deviceInfoElement = this.elements.deviceInfo;
            if (deviceInfoElement) {
                deviceInfoElement.textContent = '端末情報エラー';
                deviceInfoElement.style.display = 'inline-block';
            }
        }
    }

    /**
     * 現在のユーザー情報を取得する
     * @returns {Promise<Object|null>} ユーザー情報またはnull
     */
    async getCurrentUser() {
        try {
            const { data: { user } } = await this.supabaseClient.auth.getUser();
            return user;
        } catch (error) {
            console.error('Failed to get current user:', error);
            return null;
        }
    }

    /**
     * ライセンスが有効かどうかを確認する（UIアップデートなし）
     * @returns {Promise<boolean>} ライセンスが有効な場合はtrue
     */
    async isLicenseValid() {
        try {
            const { data: { user } } = await this.supabaseClient.auth.getUser();
            
            if (user) {
                return true;
            } else {
                const licenseData = await chrome.storage.sync.get('validLicense');
                return licenseData.validLicense || false;
            }
        } catch (error) {
            return false;
        }
    }

    /**
     * デバイス情報を取得する（UIアップデートなし）
     * @returns {Promise<Object>} デバイス情報オブジェクト
     */
    async getDeviceInfo() {
        try {
            const { data: { user } } = await this.supabaseClient.auth.getUser();
            if (!user) {
                return { deviceCount: 0, maxDevices: 0, isValid: false };
            }

            // ユーザー情報の取得
            let userData;
            const { data: existingUser, error: userError } = await this.supabaseClient
                .from('users')
                .select('max_devices')
                .eq('id', user.id)
                .maybeSingle();

            if (userError) {
                if (userError.code === 'PGRST116') {
                    // ユーザーが存在しない場合は作成
                    const { data: newUser, error: createError } = await this.supabaseClient
                        .from('users')
                        .insert({
                            id: user.id,
                            max_devices: 5
                        })
                        .select()
                        .single();

                    if (createError) {
                        throw createError;
                    }
                    userData = newUser;
                } else {
                    throw userError;
                }
            } else {
                userData = existingUser;
            }

            const maxDevices = userData?.max_devices || 5;

            // 現在のデバイス数を取得
            const { data: devices, error: devicesError } = await this.supabaseClient
                .from('user_devices')
                .select('id')
                .eq('user_id', user.id);

            if (devicesError) {
                throw devicesError;
            }

            const deviceCount = devices?.length || 0;

            return {
                deviceCount,
                maxDevices,
                isValid: true,
                hasCapacity: deviceCount < maxDevices
            };

        } catch (error) {
            console.error('Failed to get device info:', error);
            return { deviceCount: 0, maxDevices: 0, isValid: false };
        }
    }

    /**
     * 新規デバイスを登録する
     * @param {string} deviceName - デバイス名
     * @returns {Promise<boolean>} 登録成功時はtrue
     */
    async registerDevice(deviceName) {
        try {
            const { data: { user } } = await this.supabaseClient.auth.getUser();
            if (!user) {
                return false;
            }

            const deviceInfo = await this.getDeviceInfo();
            if (!deviceInfo.hasCapacity) {
                this.showToast('デバイス登録上限に達しています', 'warning');
                return false;
            }

            const { error } = await this.supabaseClient
                .from('user_devices')
                .insert({
                    user_id: user.id,
                    device_name: deviceName,
                    created_at: new Date().toISOString()
                });

            if (error) {
                throw error;
            }

            await this.updateDeviceInfo();
            this.showToast('デバイスが正常に登録されました', 'success');
            return true;

        } catch (error) {
            console.error('Failed to register device:', error);
            this.showToast('デバイス登録に失敗しました', 'error');
            return false;
        }
    }

    /**
     * 認証・ライセンス状態を初期化する
     */
    async initializeAuth() {
        await Promise.all([
            this.checkLicenseStatus(),
            this.updateDeviceInfo()
        ]);
    }

    /**
     * 認証状態をリフレッシュする
     */
    async refreshAuthState() {
        await this.initializeAuth();
    }

    /**
     * ライセンス状態をキャッシュからクリアする
     */
    async clearLicenseCache() {
        try {
            await chrome.storage.sync.remove('validLicense');
            await this.checkLicenseStatus();
        } catch (error) {
            console.error('Failed to clear license cache:', error);
        }
    }
}

/**
 * 認証サービスインスタンスを作成
 * @param {Function} showToastFn - トースト表示関数
 * @param {Function} getElementFn - 要素取得関数
 * @returns {AuthService} 認証サービスインスタンス
 */
export function createAuthService(showToastFn, getElementFn) {
    return new AuthService(showToastFn, getElementFn);
}