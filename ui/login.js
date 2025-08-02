// 共通設定のインポート
import { SUPABASE_CONFIG, createSupabaseClient } from '../shared/config.js';

document.addEventListener('DOMContentLoaded', function() {
    
    // ====================================
    // Supabase設定とクライアント初期化
    // ====================================
    
    const supabaseClient = createSupabaseClient();

    // ====================================
    // デバイスID管理
    // ====================================
    
    /**
     * デバイスIDを取得または生成する
     * @returns {Promise<string>} デバイスID
     */
    async function getDeviceId() {
        let deviceIdData = await chrome.storage.local.get(['deviceId']);
        
        if (!deviceIdData.deviceId) {
            const deviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
            await chrome.storage.local.set({ deviceId: deviceId });
            return deviceId;
        }
        
        return deviceIdData.deviceId;
    }

    // ====================================
    // DOM要素の取得
    // ====================================
    
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const loginButton = document.getElementById('loginButton');
    const errorMessage = document.getElementById('errorMessage');
    const successMessage = document.getElementById('successMessage');
    const openAppButton = document.getElementById('openAppButton');
    const logoutButton = document.getElementById('logoutButton');
    const deviceInfoElement = document.getElementById('deviceInfo');

    // ====================================
    // 認証状態管理
    // ====================================
    
    /**
     * 認証状態をチェックしてUIを更新する
     */
    async function checkAuthState() {
        try {
            const { data: { user } } = await supabaseClient.auth.getUser();
            
            if (user) {
                // ログイン状態のUI表示
                showLoggedInState(user);
                await updateDeviceInfo(user.id);
                chrome.storage.sync.set({ validLicense: true });
            } else {
                // ログアウト状態のUI表示
                showLoggedOutState();
                chrome.storage.sync.remove("validLicense");
            }
        } catch (error) {
            // エラーは無視（UI状態はそのまま）
        }
    }

    /**
     * ログイン状態のUIを表示する
     * @param {Object} user - ユーザーオブジェクト
     */
    function showLoggedInState(user) {
        emailInput.style.display = 'none';
        passwordInput.style.display = 'none';
        loginButton.style.display = 'none';
        document.querySelectorAll('label').forEach(label => label.style.display = 'none');
        
        successMessage.style.display = 'block';
        successMessage.textContent = `${user.email} としてログイン中`;
        openAppButton.style.display = 'block';
        logoutButton.style.display = 'block';
        
        if (deviceInfoElement) {
            deviceInfoElement.style.display = 'block';
        }
    }

    /**
     * ログアウト状態のUIを表示する
     */
    function showLoggedOutState() {
        emailInput.style.display = 'block';
        passwordInput.style.display = 'block';
        loginButton.style.display = 'block';
        document.querySelectorAll('label').forEach(label => label.style.display = 'block');
        
        successMessage.style.display = 'none';
        openAppButton.style.display = 'none';
        logoutButton.style.display = 'none';
        
        if (deviceInfoElement) {
            deviceInfoElement.style.display = 'none';
        }
    }

    // ====================================
    // デバイス情報管理
    // ====================================
    
    /**
     * デバイス情報を更新して表示する
     * @param {string} userId - ユーザーID
     */
    async function updateDeviceInfo(userId) {
        try {
            if (!deviceInfoElement) return;

            deviceInfoElement.classList.remove('device-valid');
            deviceInfoElement.textContent = '端末情報取得中...';

            // ユーザーの最大デバイス数を取得
            const { data: userData, error: userError } = await supabaseClient
                .from('users')
                .select('max_devices')
                .eq('id', userId)
                .maybeSingle();

            if (userError) {
                throw userError;
            }

            const maxDevices = userData?.max_devices || 5;

            // 現在のデバイス数を取得
            const { data: devices, error: devicesError } = await supabaseClient
                .from('user_devices')
                .select('id')
                .eq('user_id', userId);

            if (devicesError) {
                throw devicesError;
            }

            const deviceCount = devices?.length || 0;

            // デバイス情報を表示
            deviceInfoElement.innerHTML = `
                <div class="device-info">
                    <span class="device-count">使用中の端末: ${deviceCount} / ${maxDevices}</span>
                </div>
            `;
            deviceInfoElement.classList.add('device-valid');
            deviceInfoElement.style.display = 'inline-block';

        } catch (error) {
            deviceInfoElement.textContent = 'デバイス情報の取得に失敗しました';
            deviceInfoElement.style.display = 'inline-block';
        }
    }

    // ====================================
    // ログイン処理
    // ====================================
    
    /**
     * ログインボタンのイベントハンドラー
     */
    loginButton.addEventListener('click', async function() {
        const email = emailInput.value.trim();
        const password = passwordInput.value;

        // 入力値のバリデーション
        if (!email || !password) {
            showError('メールアドレスと認証キーを入力してください。');
            return;
        }

        // ログインボタンを無効化
        setLoginButtonState(true, 'ログイン中...');
        errorMessage.style.display = 'none';

        try {
            // Supabaseでの認証
            const { data, error } = await supabaseClient.auth.signInWithPassword({
                email: email,
                password: password
            });

            if (error) {
                throw error;
            }

            const user = data.user;

            // ユーザー情報の確認・作成
            await ensureUserExists(user);

            // デバイス制限の確認
            await checkDeviceLimit(user);

            // 成功処理
            successMessage.style.display = 'block';
            chrome.storage.sync.set({ validLicense: true });
            await checkAuthState();

        } catch (error) {
            handleLoginError(error);
        } finally {
            setLoginButtonState(false, 'ログイン');
        }
    });

    /**
     * ユーザーの存在確認・作成
     * @param {Object} user - ユーザーオブジェクト
     */
    async function ensureUserExists(user) {
        let { data: existingUser, error: userCheckError } = await supabaseClient
            .from('users')
            .select('max_devices')
            .eq('id', user.id)
            .maybeSingle();

        if (userCheckError && userCheckError.code !== 'PGRST116') {
            throw userCheckError;
        }

        if (!existingUser) {
            const { data: newUser, error: createUserError } = await supabaseClient
                .from('users')
                .insert({
                    id: user.id,
                    max_devices: 5
                })
                .select()
                .single();

            if (createUserError) {
                throw createUserError;
            }

            existingUser = newUser;
        }

        return existingUser;
    }

    /**
     * デバイス制限の確認と登録
     * @param {Object} user - ユーザーオブジェクト
     */
    async function checkDeviceLimit(user) {
        const existingUser = await ensureUserExists(user);
        const maxDevices = existingUser.max_devices || 4;

        // 現在のデバイス一覧を取得
        const { data: devices, error: devicesError } = await supabaseClient
            .from('user_devices')
            .select('id, device_id')
            .eq('user_id', user.id);

        if (devicesError) {
            throw devicesError;
        }

        const deviceCount = devices?.length || 0;
        const deviceId = await getDeviceId();
        const existingDevice = devices?.find(device => device.device_id === deviceId);

        // 新しいデバイスで制限に達している場合
        if (!existingDevice && deviceCount >= maxDevices) {
            await supabaseClient.auth.signOut();
            throw new Error(`端末数制限に達しています (最大${maxDevices}台)。他の端末でログアウトしてから再度お試しください。`);
        }

        // デバイス情報の登録・更新
        const deviceInfo = {
            user_id: user.id,
            device_id: deviceId,
            last_login: new Date().toISOString(),
            browser: navigator.userAgent,
            name: existingDevice ? existingDevice.name : `端末 #${deviceCount + 1}`,
        };

        const { data: upserted, error: upsertError } = await supabaseClient
            .from('user_devices')
            .upsert(deviceInfo, {
                onConflict: 'user_id,device_id',
                ignoreDuplicates: false
            })
            .select();

        if (upsertError) {
            throw upsertError;
        }
    }

    /**
     * ログインエラーのハンドリング
     * @param {Error} error - エラーオブジェクト
     */
    function handleLoginError(error) {
        if (error.message.includes('Invalid login credentials')) {
            showError('メールアドレスまたはパスワードが正しくありません。');
        } else if (error.message.includes('端末数制限')) {
            showError(error.message);
        } else {
            showError(`ログインに失敗しました: ${error.message}`);
        }
    }

    /**
     * エラーメッセージを表示する
     * @param {string} message - エラーメッセージ
     */
    function showError(message) {
        errorMessage.style.display = 'block';
        errorMessage.textContent = message;
    }

    /**
     * ログインボタンの状態を設定する
     * @param {boolean} disabled - 無効化するかどうか
     * @param {string} text - ボタンのテキスト
     */
    function setLoginButtonState(disabled, text) {
        loginButton.disabled = disabled;
        loginButton.textContent = text;
    }

    // ====================================
    // その他のイベントハンドラー
    // ====================================
    
    /**
     * アプリを開くボタンのイベントハンドラー
     */
    openAppButton.addEventListener('click', function() {
        chrome.tabs.create({ url: 'main.html' });
    });

    /**
     * ログアウトボタンのイベントハンドラー
     */
    logoutButton.addEventListener('click', async function() {
        try {
            const { data: { user } } = await supabaseClient.auth.getUser();
            
            if (user) {
                const deviceId = await getDeviceId();
                
                // デバイス情報を削除
                const { error: deleteError } = await supabaseClient
                    .from('user_devices')
                    .delete()
                    .eq('user_id', user.id)
                    .eq('device_id', deviceId);
                
                if (deleteError) {
                    // エラーは無視（ログアウトは継続）
                }
            }

            // Supabaseからログアウト
            await supabaseClient.auth.signOut();
            
            // UI状態をリセット
            errorMessage.style.display = 'none';
            successMessage.style.display = 'none';
            chrome.storage.sync.remove("validLicense");
            
            await checkAuthState();
            
        } catch (error) {
            showError('ログアウトに失敗しました。');
        }
    });

    /**
     * パスワード入力でのEnterキー処理
     */
    passwordInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            loginButton.click();
        }
    });

    // ====================================
    // 初期化処理
    // ====================================
    
    // 初期認証状態チェック
    checkAuthState();

    // 認証状態変更の監視
    supabaseClient.auth.onAuthStateChange((event, session) => {
        checkAuthState();
    });
    
});