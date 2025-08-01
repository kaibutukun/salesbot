document.addEventListener('DOMContentLoaded', function() {
    
    // ====================================
    // Supabase設定とクライアント初期化
    // ====================================
    
    const supabaseConfig = {
        url: 'https://mqibubhzyvlprhekdjvf.supabase.co',
        anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1xaWJ1Ymh6eXZscHJoZWtkanZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc5MTcyMDgsImV4cCI6MjA2MzQ5MzIwOH0.RsiLZLsbL2A8dbs2e7lmYMl0gzFuvSkq70pdABr2a_I'
    };
    
    const supabaseClient = supabase.createClient(supabaseConfig.url, supabaseConfig.anonKey);

    // ====================================
    // グローバル変数
    // ====================================
    
    let progressMonitoringInterval = null;
    let isStopButtonActive = false;

    // ====================================
    // デバイスID管理
    // ====================================
    
    /**
     * デバイスIDを取得または生成する
     * @returns {Promise<string>} デバイスID
     */
    async function getDeviceId() {
        try {
            let deviceIdData = await chrome.storage.local.get(['deviceId']);
            if (!deviceIdData.deviceId) {
                const deviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
                await chrome.storage.local.set({ deviceId: deviceId });
                return deviceId;
            }
            return deviceIdData.deviceId;
        } catch (error) {
            return 'device_' + Date.now() + '_fallback';
        }
    }

    // ====================================
    // ExDBクラス（IndexedDBラッパー）
    // ====================================
    
    class ExDB {
        constructor() {
            this.dbName = "TodoDatabase";
            this.dbVersion = 1;
            this.storeName = "todos";
        }

        /**
         * データベースを開く
         * @returns {Promise<IDBDatabase>}
         */
        async openDB() {
            return new Promise((resolve, reject) => {
                let request = indexedDB.open(this.dbName, this.dbVersion);
                
                request.onerror = event => reject("DBオープンエラー: " + event.target.error);
                
                request.onupgradeneeded = event => {
                    let db = event.target.result;
                    let store = db.createObjectStore(this.storeName, {
                        keyPath: "id",
                        autoIncrement: true
                    });
                    store.createIndex("created", "created", { unique: false });
                };
                
                request.onsuccess = event => resolve(event.target.result);
            });
        }

        /**
         * Todoを追加
         * @param {string} title - タイトル
         * @param {Array} description - 説明（URLリスト等）
         * @returns {Promise<number>} 追加されたTodoのID
         */
        async addTodo(title, description) {
            try {
                let db = await this.openDB();
                return new Promise((resolve, reject) => {
                    let transaction = db.transaction([this.storeName], "readwrite");
                    let store = transaction.objectStore(this.storeName);
                    let todo = {
                        title: title,
                        description: description,
                        created: new Date(),
                        completed: false
                    };
                    let request = store.add(todo);
                    
                    request.onsuccess = () => {
                        resolve(request.result);
                    };
                    
                    request.onerror = event => {
                        reject("データの追加に失敗しました: " + event.target.error);
                    };
                });
            } catch (error) {
                throw error;
            }
        }

        /**
         * 全てのTodoを取得
         * @returns {Promise<Array>} Todoの配列
         */
        async getAllTodos() {
            try {
                let db = await this.openDB();
                return new Promise((resolve, reject) => {
                    let transaction = db.transaction([this.storeName], "readonly");
                    let store = transaction.objectStore(this.storeName);
                    let request = store.getAll();
                    
                    request.onsuccess = () => {
                        resolve(request.result || []);
                    };
                    
                    request.onerror = event => {
                        reject("データの取得に失敗しました: " + event.target.error);
                    };
                });
            } catch (error) {
                return [];
            }
        }

        /**
         * IDでTodoを取得
         * @param {number} id - TodoのID
         * @returns {Promise<Object|null>} Todoオブジェクト
         */
        async getTodoById(id) {
            try {
                let db = await this.openDB();
                return new Promise((resolve, reject) => {
                    let transaction = db.transaction([this.storeName], "readonly");
                    let store = transaction.objectStore(this.storeName);
                    let request = store.get(id);
                    
                    request.onsuccess = () => {
                        resolve(request.result);
                    };
                    
                    request.onerror = event => {
                        reject("データの取得に失敗しました: " + event.target.error);
                    };
                });
            } catch (error) {
                return null;
            }
        }

        /**
         * 最新のTodoを取得
         * @returns {Promise<Object|null>} 最新のTodoオブジェクト
         */
        async getLatestTodo() {
            try {
                let db = await this.openDB();
                return new Promise((resolve, reject) => {
                    let transaction = db.transaction([this.storeName], "readonly");
                    let store = transaction.objectStore(this.storeName);
                    let index = store.index("created");
                    let request = index.openCursor(null, "prev");
                    
                    request.onsuccess = event => {
                        let cursor = event.target.result;
                        if (cursor) {
                            resolve(cursor.value);
                        } else {
                            resolve(null);
                        }
                    };
                    
                    request.onerror = event => {
                        reject("データ取得エラー: " + event.target.error);
                    };
                });
            } catch (error) {
                return null;
            }
        }

        /**
         * Todoを更新
         * @param {number} id - TodoのID
         * @param {Object} updates - 更新データ
         * @returns {Promise<number>} 更新されたTodoのID
         */
        async updateTodo(id, updates) {
            try {
                let db = await this.openDB();
                return new Promise((resolve, reject) => {
                    let transaction = db.transaction([this.storeName], "readwrite");
                    let store = transaction.objectStore(this.storeName);
                    let request = store.get(id);
                    
                    request.onsuccess = () => {
                        let todo = { ...request.result, ...updates };
                        let updateRequest = store.put(todo);
                        
                        updateRequest.onsuccess = () => {
                            resolve(updateRequest.result);
                        };
                        
                        updateRequest.onerror = event => {
                            reject("更新に失敗しました: " + event.target.error);
                        };
                    };
                });
            } catch (error) {
                throw error;
            }
        }

        /**
         * Todoを削除
         * @param {number} id - TodoのID
         * @returns {Promise<boolean>} 削除成功時はtrue
         */
        async deleteTodo(id) {
            try {
                let db = await this.openDB();
                return new Promise((resolve, reject) => {
                    let transaction = db.transaction([this.storeName], "readwrite");
                    let store = transaction.objectStore(this.storeName);
                    let request = store.delete(id);
                    
                    request.onsuccess = () => {
                        resolve(true);
                    };
                    
                    request.onerror = event => {
                        reject("削除に失敗しました: " + event.target.error);
                    };
                });
            } catch (error) {
                throw error;
            }
        }

        /**
         * 全てのTodoを削除
         * @returns {Promise<boolean>} 削除成功時はtrue
         */
        async deleteAllTodos() {
            try {
                let db = await this.openDB();
                return new Promise((resolve, reject) => {
                    let transaction = db.transaction([this.storeName], "readwrite");
                    let store = transaction.objectStore(this.storeName);
                    let request = store.clear();
                    
                    request.onsuccess = () => {
                        resolve(true);
                    };
                    
                    request.onerror = event => {
                        reject("全データの削除に失敗しました: " + event.target.error);
                    };
                });
            } catch (error) {
                throw error;
            }
        }

        /**
         * 最新の未完了Todoを削除
         * @returns {Promise<boolean>} 削除した場合はtrue
         */
        async deleteLatestIncompleteTodo() {
            try {
                const latestTodo = await this.getLatestTodo();
                if (latestTodo && !latestTodo.completed) {
                    await this.deleteTodo(latestTodo.id);
                    return true;
                }
                return false;
            } catch (error) {
                throw error;
            }
        }
    }

    // ====================================
    // デフォルト除外ドメイン設定
    // ====================================
    
    const DEFAULT_EXCLUDE_DOMAINS = [
        "houjin", "prtimes", "initial", "wantedly", "wiki", "hrmos", "goo.ne.jp",
        "baseconnect", "mapion", "itp.ne.jp", "ipros", "its-mo", "e-shops",
        "kaisharesearch", "ekiten", "jinjibu", "gbiz.go.jp", "en-hyouban",
        "indeed", "nikkei", "yahoo", "hatarako", "jobtalk", "tabelog",
        "r-agent", "vorkers", "rikunabi", "atengineer", "doda", "g-search",
        "value-press", "atpress", "graffer", "salesnow", "akala.ai", "en-gage",
        "company-list", "biz-maps", "place.line.me", "hello-work", "career.net",
        "ecareer", "facebook", "uniqo", "xn--zcklx7evic7044c1qeqrozh7c",
        "infomart", "en-japan", "ocn.ne.jp", "connect.agent-bank.com",
        "adapter.jp", "biz.ne.jp", "imitsu.jp", "mapfan", "medley.life",
        "hotpepper", "rakuten", "goo-net.com", "instagram", "medley.com",
        "twitter", "metro.tokyo.jp", "hellowork", "lancers.jp",
        "job-medley.com", "stanby.com", "jos-senior.com", "fumadata.com",
        "irbank.net", "jpnumber", "knockbot", "page.line.me", "b-mall.ne.jp",
        "amazon", "alarmbox.jp", "itmedia.co.jp", "baitoru.com",
        "patent-i.com", "linkedin.com", "openwork.jp", "ameblo.jp",
        "weblio.jp", "buffett-code.com", "kotobank.jp", "databasesets.com",
        "toukibo.ai-con.lawyer", "founded-today.com"
    ];

    // ====================================
    // DOM要素取得のヘルパー関数
    // ====================================
    
    /**
     * 要素を取得する
     * @param {string} id - 要素のID
     * @returns {Element|null} DOM要素
     */
    function getElement(id) {
        const element = document.getElementById(id);
        return element;
    }

    // ====================================
    // DOM要素の取得
    // ====================================
    
    // ナビゲーション関連
    const navItems = document.querySelectorAll('.nav-item');
    const tabContents = document.querySelectorAll('.tab-content');
    const licenseStatus = getElement('licenseStatus');

    // URLリスト管理関連
    const urlListTextarea = getElement('urlListTextarea');
    const saveUrlListButton = getElement('saveUrlList');
    const executeFromUrlTabButton = getElement('executeFromUrlTab');
    const clearUrlListButton = getElement('clearUrlList');

    // プロフィール管理関連
    const profileSelect = getElement('profileSelect');
    const addNewProfileButton = getElement('addNewProfile');
    const deleteProfileButton = getElement('deleteProfile');
    const saveProfileButton = getElement('saveProfile');

    // 送信結果関連
    const resultSelect = getElement('resultSelect');
    const resultTitle = getElement('resultTitle');
    const saveResultTitleButton = getElement('saveResultTitle');
    const resultsList = getElement('resultsList');
    const exportResultsButton = getElement('exportResults');
    const deleteResultButton = getElement('deleteResult');
    const deleteAllResultsButton = getElement('deleteAllResults');

    // 設定関連
    const preventDuplicateSend = getElement('preventDuplicateSend');
    const saveGeneralSettingsButton = getElement('saveGeneralSettings');
    const excludeDomainsTextarea = getElement('excludeDomains');
    const saveExcludeDomainsButton = getElement('saveExcludeDomains');
    const resetExcludeDomainsButton = getElement('resetExcludeDomains');

    // 時間制限設定関連
    const enableTimeRestriction = getElement('enableTimeRestriction');
    const timeRestrictionSettings = getElement('timeRestrictionSettings');
    const restrictionStartTime = getElement('restrictionStartTime');
    const restrictionEndTime = getElement('restrictionEndTime');
    const weekdayCheckboxes = document.querySelectorAll('.weekday-checkbox');
    const saveTimeSettingsButton = getElement('saveTimeSettings');
    const saveWeekdaySettingsButton = getElement('saveWeekdaySettings');

    // ダッシュボード関連
    const sendingStatus = getElement('sendingStatus');
    const lastExecutionTime = getElement('lastExecutionTime');
    const totalSentUrls = getElement('totalSentUrls');
    const successRate = getElement('successRate');
    const progressCount = getElement('progressCount');
    const progressBar = getElement('progressBar');
    const recentResultsList = getElement('recentResultsList');
    const refreshDashboardButton = getElement('refreshDashboard');

    // ====================================
    // タブ切り替え機能
    // ====================================
    
    /**
     * 指定されたタブに切り替える
     * @param {string} tabId - タブのID
     */
    function switchToTab(tabId) {
        // 全てのナビゲーション項目とタブコンテンツから active クラスを削除
        navItems.forEach(navItem => navItem.classList.remove('active'));
        tabContents.forEach(content => content.classList.remove('active'));

        // 対象のナビゲーション項目とタブコンテンツに active クラスを追加
        const targetNavItem = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
        const targetTab = document.getElementById(tabId);

        if (targetNavItem) {
            targetNavItem.classList.add('active');
        }
        if (targetTab) {
            targetTab.classList.add('active');
        }

        // URLパラメータを更新
        window.history.replaceState(null, '', `?tab=${tabId}`);
    }

    /**
     * 初期タブを設定する
     */
    function setInitialTab() {
        const urlParams = new URLSearchParams(window.location.search);
        const tabParam = urlParams.get('tab');
        const targetTab = tabParam || 'dashboard';
        
        switchToTab(targetTab);

        // 結果タブの場合、特定の結果IDが指定されていれば選択
        if (tabParam === 'results') {
            const resultId = urlParams.get('id');
            if (resultId && resultSelect) {
                setTimeout(() => {
                    resultSelect.value = resultId;
                    loadSelectedResult();
                }, 100);
            }
        }
    }

    // ====================================
    // 停止状態管理
    // ====================================
    
    /**
     * 停止状態リスナーを設定する
     */
    function setupStopStateListener() {
        if (chrome.runtime.onMessage.hasListener) {
            chrome.runtime.onMessage.removeListener(setupStopStateListener.messageListener);
        }

        setupStopStateListener.messageListener = (message, sender, sendResponse) => {
            if (message.action === 'stopCompleted') {
                // 停止ボタンを実行ボタンに戻す
                if (executeFromUrlTabButton && isStopButtonActive) {
                    executeFromUrlTabButton.innerHTML = '<img class="icon" src="/icons/play.png" alt="送信開始" />送信開始';
                    executeFromUrlTabButton.className = 'primary-button';
                    executeFromUrlTabButton.disabled = false;
                    executeFromUrlTabButton.removeEventListener('click', stopButtonHandler);
                    executeFromUrlTabButton.addEventListener('click', executeButtonHandler);
                    isStopButtonActive = false;
                }

                // 送信状態を更新
                if (sendingStatus) {
                    sendingStatus.textContent = '停止完了';
                    sendingStatus.classList.remove('status-sending');
                }

                // 処理中URLの表示を非表示
                const currentProcessingUrl = getElement('currentProcessingUrl');
                if (currentProcessingUrl) {
                    currentProcessingUrl.style.display = 'none';
                }

                chrome.storage.local.remove('sendingInProgress');

                try {
                    sendResponse({ success: true });
                } catch (error) {
                    // エラーを無視
                }
            }
        };

        chrome.runtime.onMessage.addListener(setupStopStateListener.messageListener);
    }

    /**
     * 停止ボタンのイベントハンドラー
     */
    async function stopButtonHandler() {
        try {
            if (!confirm('送信処理を停止しますか？')) {
                return;
            }

            chrome.runtime.sendMessage({ action: 'stop' }, (response) => {
                if (chrome.runtime.lastError) {
                    // エラーを無視
                }
            });

            showToast('送信処理を停止しています...', 'info');

            if (sendingStatus) {
                sendingStatus.textContent = '停止処理中...';
                sendingStatus.classList.remove('status-sending');
            }

            if (executeFromUrlTabButton) {
                executeFromUrlTabButton.disabled = true;
                executeFromUrlTabButton.innerHTML = '<img class="icon" src="/icons/stop.png" alt="停止中" />停止中...';
            }

            chrome.storage.local.remove('sendingInProgress');
        } catch (error) {
            showToast('送信停止に失敗しました', 'error');
        }
    }

    /**
     * 送信状態を確認して復元する
     */
    async function checkAndRestoreSendingState() {
        try {
            const sendingData = await chrome.storage.local.get('sendingInProgress');
            
            if (sendingData.sendingInProgress) {
                const db = new ExDB();
                const latestTodo = await db.getLatestTodo();
                
                if (latestTodo && !latestTodo.completed && latestTodo.description) {
                    const hasProcessed = latestTodo.description.some(item => item.result !== '');
                    const allProcessed = latestTodo.description.every(item => item.result !== '');
                    
                    if (!allProcessed) {
                        // 送信中状態を復元
                        if (executeFromUrlTabButton) {
                            executeFromUrlTabButton.innerHTML = '<img class="icon" src="/icons/stop.png" alt="送信停止" />送信停止';
                            executeFromUrlTabButton.className = 'stop-button';
                            executeFromUrlTabButton.removeEventListener('click', executeButtonHandler);
                            executeFromUrlTabButton.addEventListener('click', stopButtonHandler);
                            isStopButtonActive = true;
                        }

                        if (sendingStatus) {
                            sendingStatus.innerHTML = '<span class="status-indicator"></span>送信中...';
                            sendingStatus.classList.add('status-sending');
                        }
                    } else {
                        chrome.storage.local.remove('sendingInProgress');
                    }
                } else {
                    chrome.storage.local.remove('sendingInProgress');
                }
            }
        } catch (error) {
            chrome.storage.local.remove('sendingInProgress');
        }
    }

    // ====================================
    // 初期化処理
    // ====================================
    
    /**
     * アプリケーションの初期化
     */
    async function init() {
        try {
            await checkLicenseStatus();
            await updateDeviceInfo();
            await loadUrlList();
            await loadProfiles();
            await loadResults();
            await loadSettings();
            await loadExcludeDomains();
            await loadTimeSettings();
            await refreshDashboard();
            setupStopStateListener();
            await checkAndRestoreSendingState();
            setInitialTab();
            startProgressMonitoring();
        } catch (error) {
            showToast('初期化中にエラーが発生しました', 'error');
        }
    }

    // ====================================
    // イベントリスナーの設定
    // ====================================
    
    // 初期化を実行
    init();

    // ナビゲーションタブのイベントリスナー
    navItems.forEach(item => {
        item.addEventListener('click', function() {
            const tabId = this.getAttribute('data-tab');
            switchToTab(tabId);
        });
    });

    // URLリスト管理のイベントリスナー
    if (saveUrlListButton) saveUrlListButton.addEventListener('click', saveUrlList);
    if (clearUrlListButton) clearUrlListButton.addEventListener('click', clearUrlList);
    if (executeFromUrlTabButton) {
        executeFromUrlTabButton.removeEventListener('click', executeButtonHandler);
        executeFromUrlTabButton.removeEventListener('click', stopButtonHandler);
        executeFromUrlTabButton.addEventListener('click', executeButtonHandler);
    }

    // プロフィール管理のイベントリスナー
    if (addNewProfileButton) addNewProfileButton.addEventListener('click', createNewProfile);
    if (deleteProfileButton) deleteProfileButton.addEventListener('click', deleteSelectedProfile);
    if (saveProfileButton) saveProfileButton.addEventListener('click', saveCurrentProfile);
    if (profileSelect) profileSelect.addEventListener('change', loadSelectedProfile);

    // 送信結果のイベントリスナー
    if (saveResultTitleButton) saveResultTitleButton.addEventListener('click', saveResultTitleHandler);
    if (resultSelect) resultSelect.addEventListener('change', loadSelectedResult);
    if (exportResultsButton) exportResultsButton.addEventListener('click', exportResultsToCSV);
    if (deleteResultButton) deleteResultButton.addEventListener('click', deleteSelectedResult);
    if (deleteAllResultsButton) deleteAllResultsButton.addEventListener('click', deleteAllResults);

    // 設定のイベントリスナー
    if (saveGeneralSettingsButton) saveGeneralSettingsButton.addEventListener('click', saveGeneralSettings);
    if (saveExcludeDomainsButton) saveExcludeDomainsButton.addEventListener('click', saveExcludeDomains);
    if (resetExcludeDomainsButton) resetExcludeDomainsButton.addEventListener('click', resetExcludeDomains);

    // 時間制限設定のイベントリスナー
    if (enableTimeRestriction) {
        enableTimeRestriction.addEventListener('change', function() {
            if (timeRestrictionSettings) {
                timeRestrictionSettings.style.display = this.checked ? 'block' : 'none';
            }
        });
    }
    if (saveTimeSettingsButton) saveTimeSettingsButton.addEventListener('click', saveTimeSettings);
    if (saveWeekdaySettingsButton) saveWeekdaySettingsButton.addEventListener('click', saveWeekdaySettings);

    // ダッシュボードのイベントリスナー
    if (refreshDashboardButton) {
        refreshDashboardButton.addEventListener('click', async function() {
            await refreshDashboard();
            showToast('ダッシュボードを更新しました', 'info');
        });
    }

    // ====================================
    // ライセンス・認証管理
    // ====================================
    
    /**
     * ライセンス状態を確認する
     * @returns {Promise<boolean>} ライセンスが有効な場合はtrue
     */
    async function checkLicenseStatus() {
        try {
            if (licenseStatus) {
                licenseStatus.textContent = '確認中...';
                licenseStatus.classList.remove('license-valid');
                licenseStatus.classList.remove('license-invalid');
            }

            const { data: { user } } = await supabaseClient.auth.getUser();
            
            if (user) {
                if (licenseStatus) {
                    licenseStatus.textContent = '有効なライセンス';
                    licenseStatus.classList.add('license-valid');
                }
                await chrome.storage.sync.set({ validLicense: true });
                return true;
            } else {
                const licenseData = await chrome.storage.sync.get('validLicense');
                if (licenseData.validLicense) {
                    if (licenseStatus) {
                        licenseStatus.textContent = '有効なライセンス';
                        licenseStatus.classList.add('license-valid');
                    }
                    return true;
                } else {
                    if (licenseStatus) {
                        licenseStatus.textContent = 'ログインが必要です';
                        licenseStatus.classList.add('license-invalid');
                    }
                    return false;
                }
            }
        } catch (error) {
            if (licenseStatus) {
                licenseStatus.textContent = 'ログインが必要です';
                licenseStatus.classList.add('license-invalid');
            }
            return false;
        }
    }

    /**
     * デバイス情報を更新する
     */
    async function updateDeviceInfo() {
        try {
            const deviceInfoElement = getElement('deviceInfo');
            if (!deviceInfoElement) return;

            deviceInfoElement.classList.remove('device-valid');
            deviceInfoElement.textContent = '端末情報取得中...';

            const { data: { user } } = await supabaseClient.auth.getUser();
            if (!user) {
                deviceInfoElement.style.display = 'none';
                return;
            }

            // ユーザー情報の取得
            const { data: userData, error: userError } = await supabaseClient
                .from('users')
                .select('max_devices')
                .eq('id', user.id)
                .maybeSingle();

            if (userError) {
                if (userError.code === 'PGRST116') {
                    // ユーザーが存在しない場合は作成
                    const { data: newUser, error: createError } = await supabaseClient
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
            }

            const maxDevices = userData?.max_devices || 5;

            // 現在のデバイス数を取得
            const { data: devices, error: devicesError } = await supabaseClient
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
            const deviceInfoElement = getElement('deviceInfo');
            if (deviceInfoElement) {
                deviceInfoElement.textContent = '端末情報エラー';
                deviceInfoElement.style.display = 'inline-block';
            }
        }
    }

    // 認証状態変更の監視
    supabaseClient.auth.onAuthStateChange((event, session) => {
        checkLicenseStatus();
        updateDeviceInfo();
    });

    // ====================================
    // トースト通知
    // ====================================
    
    /**
     * トースト通知を表示する
     * @param {string} message - 表示するメッセージ
     * @param {string} type - 通知のタイプ（info, success, warning, error）
     */
    function showToast(message, type = 'info') {
        const toast = getElement('toast');
        const toastContent = document.querySelector('.toast-content');
        
        if (!toast || !toastContent) return;

        toastContent.textContent = message;
        toast.className = `toast ${type}`;
        toast.classList.add('show');

        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    // ====================================
    // URLリスト管理
    // ====================================
    
    /**
     * URLリストを読み込む
     */
    async function loadUrlList() {
        try {
            if (!urlListTextarea) return;

            const db = new ExDB();
            const latestTodo = await db.getLatestTodo();

            if (latestTodo && !latestTodo.completed && latestTodo.description) {
                const urls = latestTodo.description.map(item => item.url).join('\n');
                urlListTextarea.value = urls;
            } else {
                urlListTextarea.value = '';
            }
        } catch (error) {
            showToast('URLリストの読み込みに失敗しました', 'error');
        }
    }

    /**
     * URLリストを保存する
     */
    async function saveUrlList() {
        try {
            if (!urlListTextarea) return;

            const urls = urlListTextarea.value.trim().split('\n').filter(url => url.trim() !== '');
            
            if (urls.length === 0) {
                showToast('URLを入力してください', 'warning');
                return;
            }

            const db = new ExDB();
            await db.deleteLatestIncompleteTodo();

            const date = new Date();
            const title = date.toLocaleString('ja-JP');
            const description = urls.map(url => ({
                url,
                result: '',
                contact: '',
                reason: ''
            }));

            await db.addTodo(title, description);
            showToast('URLリストを保存しました', 'success');
            await refreshDashboard();
        } catch (error) {
            showToast('URLリストの保存に失敗しました', 'error');
        }
    }

    /**
     * URLリストをクリアする
     */
    async function clearUrlList() {
        try {
            if (!urlListTextarea) return;

            if (!confirm('URLリストをクリアしますか？')) {
                return;
            }

            const db = new ExDB();
            await db.deleteLatestIncompleteTodo();
            urlListTextarea.value = '';
            await refreshDashboard();
            showToast('URLリストをクリアしました', 'info');
        } catch (error) {
            showToast('URLリストのクリアに失敗しました', 'error');
        }
    }

    // ====================================
    // プロフィール管理
    // ====================================
    
    /**
     * プロフィール一覧を読み込む
     */
    async function loadProfiles() {
        try {
            if (!profileSelect) return;

            const profileData = await chrome.storage.local.get(['optionPatterns', 'selectedPattern']);

            if (!profileData.optionPatterns || profileData.optionPatterns.length === 0) {
                // デフォルトプロフィールを作成
                const defaultProfile = {
                    id: 'default',
                    title: 'デフォルト',
                    company: '', department: '', position: '', industry: '', member: '',
                    url: '', email: '', sei: '', mei: '', seiKana: '', meiKana: '',
                    seiHira: '', meiHira: '', tel: '', fax: '', zip: '',
                    address1: '', address2: '', address3: '', address4: '',
                    subject: '', message: ''
                };

                await chrome.storage.local.set({
                    optionPatterns: [defaultProfile],
                    selectedPattern: 'default'
                });

                profileSelect.innerHTML = '';
                const option = document.createElement('option');
                option.value = defaultProfile.id;
                option.textContent = defaultProfile.title;
                profileSelect.appendChild(option);
                loadProfileData(defaultProfile);
            } else {
                profileSelect.innerHTML = '';
                profileData.optionPatterns.forEach(profile => {
                    const option = document.createElement('option');
                    option.value = profile.id;
                    option.textContent = profile.title;
                    profileSelect.appendChild(option);
                });

                if (profileData.selectedPattern) {
                    profileSelect.value = profileData.selectedPattern;
                    const selectedProfile = profileData.optionPatterns.find(
                        profile => profile.id === profileData.selectedPattern
                    );
                    if (selectedProfile) {
                        loadProfileData(selectedProfile);
                    }
                }
            }
        } catch (error) {
            showToast('プロフィールの読み込みに失敗しました', 'error');
        }
    }

    /**
     * プロフィールデータをフォームに読み込む
     * @param {Object} profile - プロフィールオブジェクト
     */
    function loadProfileData(profile) {
        const setElementValue = (id, value) => {
            const element = getElement(id);
            if (element) {
                element.value = value || '';
            }
        };

        // 全フィールドを初期化
        const fieldIds = [
            'profileName', 'company', 'department', 'position', 'industry', 'memberCount',
            'url', 'email', 'sei', 'mei', 'seiKana', 'meiKana', 'seiHira', 'meiHira',
            'tel1', 'tel2', 'tel3', 'fax1', 'fax2', 'fax3', 'zip1', 'zip2',
            'address1', 'address2', 'address3', 'address4', 'subject', 'message'
        ];

        fieldIds.forEach(id => setElementValue(id, ''));

        // プロフィールデータを設定
        if (profile.title) setElementValue('profileName', profile.title);
        if (profile.company) setElementValue('company', profile.company);
        if (profile.department) setElementValue('department', profile.department);
        if (profile.position) setElementValue('position', profile.position);
        if (profile.industry) setElementValue('industry', profile.industry);
        if (profile.member) setElementValue('memberCount', profile.member);
        if (profile.url) setElementValue('url', profile.url);
        if (profile.email) setElementValue('email', profile.email);
        if (profile.sei) setElementValue('sei', profile.sei);
        if (profile.mei) setElementValue('mei', profile.mei);
        if (profile.seiKana) setElementValue('seiKana', profile.seiKana);
        if (profile.meiKana) setElementValue('meiKana', profile.meiKana);
        if (profile.seiHira) setElementValue('seiHira', profile.seiHira);
        if (profile.meiHira) setElementValue('meiHira', profile.meiHira);
        if (profile.address1) setElementValue('address1', profile.address1);
        if (profile.address2) setElementValue('address2', profile.address2);
        if (profile.address3) setElementValue('address3', profile.address3);
        if (profile.address4) setElementValue('address4', profile.address4);
        if (profile.subject) setElementValue('subject', profile.subject);
        if (profile.message) setElementValue('message', profile.message);

        // 電話番号の分割
        if (profile.tel) {
            const telParts = profile.tel.match(/(\d{2,4})-?(\d{3,4})-?(\d{4})/);
            if (telParts) {
                setElementValue('tel1', telParts[1]);
                setElementValue('tel2', telParts[2]);
                setElementValue('tel3', telParts[3]);
            }
        }

        // FAX番号の分割
        if (profile.fax) {
            const faxParts = profile.fax.match(/(\d{2,4})-?(\d{3,4})-?(\d{4})/);
            if (faxParts) {
                setElementValue('fax1', faxParts[1]);
                setElementValue('fax2', faxParts[2]);
                setElementValue('fax3', faxParts[3]);
            }
        }

        // 郵便番号の分割
        if (profile.zip) {
            const zipParts = profile.zip.match(/(\d{3})-?(\d{4})/);
            if (zipParts) {
                setElementValue('zip1', zipParts[1]);
                setElementValue('zip2', zipParts[2]);
            }
        }

        // デフォルトプロフィールの削除ボタンは無効化
        if (deleteProfileButton) {
            deleteProfileButton.disabled = profile.id === 'default';
        }
    }

    /**
     * 選択されたプロフィールを読み込む
     */
    async function loadSelectedProfile() {
        try {
            if (!profileSelect) return;

            const selectedId = profileSelect.value;
            const profileData = await chrome.storage.local.get(['optionPatterns']);

            if (profileData.optionPatterns) {
                const selectedProfile = profileData.optionPatterns.find(
                    profile => profile.id === selectedId
                );
                if (selectedProfile) {
                    loadProfileData(selectedProfile);
                    await chrome.storage.local.set({ selectedPattern: selectedId });
                }
            }
        } catch (error) {
            showToast('プロフィールの読み込みに失敗しました', 'error');
        }
    }

    /**
     * 新しいプロフィールを作成する
     */
    async function createNewProfile() {
        try {
            const now = new Date();
            const id = `profile_${now.getTime()}`;
            const title = `新規プロフィール ${now.toLocaleString('ja-JP')}`;

            const newProfile = {
                id: id,
                title: title,
                company: '', department: '', position: '', industry: '', member: '',
                url: '', email: '', sei: '', mei: '', seiKana: '', meiKana: '',
                seiHira: '', meiHira: '', tel: '', fax: '', zip: '',
                address1: '', address2: '', address3: '', address4: '',
                subject: '', message: ''
            };

            const profileData = await chrome.storage.local.get(['optionPatterns']);
            let profiles = profileData.optionPatterns || [];
            profiles.push(newProfile);

            await chrome.storage.local.set({
                optionPatterns: profiles,
                selectedPattern: id
            });

            if (profileSelect) {
                const option = document.createElement('option');
                option.value = id;
                option.textContent = title;
                profileSelect.appendChild(option);
                profileSelect.value = id;
            }

            loadProfileData(newProfile);
            showToast('新規プロフィールを作成しました', 'success');
        } catch (error) {
            showToast('プロフィールの作成に失敗しました', 'error');
        }
    }

    /**
     * 現在のプロフィールを保存する
     */
    async function saveCurrentProfile() {
        try {
            if (!profileSelect) {
                showToast('プロフィールが選択されていません', 'warning');
                return;
            }

            const profileId = profileSelect.value;
            if (!profileId) {
                showToast('プロフィールが選択されていません', 'warning');
                return;
            }

            const profileData = await chrome.storage.local.get(['optionPatterns']);
            let profiles = profileData.optionPatterns || [];
            const index = profiles.findIndex(profile => profile.id === profileId);

            if (index === -1) {
                showToast('プロフィールが見つかりません', 'error');
                return;
            }

            const getElementValue = (id) => {
                const element = getElement(id);
                return element ? element.value : '';
            };

            // 電話番号の結合
            const tel1 = getElementValue('tel1');
            const tel2 = getElementValue('tel2');
            const tel3 = getElementValue('tel3');
            const tel = (tel1 && tel2 && tel3) ? `${tel1}-${tel2}-${tel3}` : '';

            // FAX番号の結合
            const fax1 = getElementValue('fax1');
            const fax2 = getElementValue('fax2');
            const fax3 = getElementValue('fax3');
            const fax = (fax1 && fax2 && fax3) ? `${fax1}-${fax2}-${fax3}` : '';

            // 郵便番号の結合
            const zip1 = getElementValue('zip1');
            const zip2 = getElementValue('zip2');
            const zip = (zip1 && zip2) ? `${zip1}-${zip2}` : '';

            const updatedProfile = {
                id: profileId,
                title: getElementValue('profileName'),
                company: getElementValue('company'),
                department: getElementValue('department'),
                position: getElementValue('position'),
                industry: getElementValue('industry'),
                member: getElementValue('memberCount'),
                url: getElementValue('url'),
                email: getElementValue('email'),
                sei: getElementValue('sei'),
                mei: getElementValue('mei'),
                seiKana: getElementValue('seiKana'),
                meiKana: getElementValue('meiKana'),
                seiHira: getElementValue('seiHira'),
                meiHira: getElementValue('meiHira'),
                tel: tel,
                fax: fax,
                zip: zip,
                address1: getElementValue('address1'),
                address2: getElementValue('address2'),
                address3: getElementValue('address3'),
                address4: getElementValue('address4'),
                subject: getElementValue('subject'),
                message: getElementValue('message')
            };

            profiles[index] = updatedProfile;
            await chrome.storage.local.set({ optionPatterns: profiles });

            // セレクトボックスのテキストを更新
            if (profileSelect) {
                const option = profileSelect.options[profileSelect.selectedIndex];
                if (option) {
                    option.textContent = updatedProfile.title;
                }
            }

            showToast('プロフィールを保存しました', 'success');
        } catch (error) {
            showToast('プロフィールの保存に失敗しました', 'error');
        }
    }

    /**
     * 選択されたプロフィールを削除する
     */
    async function deleteSelectedProfile() {
        try {
            if (!profileSelect) return;

            const profileId = profileSelect.value;
            if (!profileId) {
                showToast('プロフィールが選択されていません', 'warning');
                return;
            }

            if (profileId === 'default') {
                showToast('デフォルトプロフィールは削除できません', 'warning');
                return;
            }

            if (!confirm('このプロフィールを削除しますか？')) {
                return;
            }

            const profileData = await chrome.storage.local.get(['optionPatterns']);
            let profiles = profileData.optionPatterns || [];
            const filteredProfiles = profiles.filter(profile => profile.id !== profileId);

            await chrome.storage.local.set({
                optionPatterns: filteredProfiles,
                selectedPattern: 'default'
            });

            await loadProfiles();
            showToast('プロフィールを削除しました', 'success');
        } catch (error) {
            showToast('プロフィールの削除に失敗しました', 'error');
        }
    }

    // ====================================
    // 送信結果管理
    // ====================================
    
    /**
     * 送信結果一覧を読み込む
     */
    async function loadResults() {
        try {
            if (!resultSelect || !resultsList) return;

            const db = new ExDB();
            const todos = await db.getAllTodos();
            const completedTodos = todos.filter(todo => todo.completed).reverse();
            const previousValue = resultSelect.value;

            resultSelect.innerHTML = '';

            if (completedTodos.length === 0) {
                const option = document.createElement('option');
                option.textContent = '送信結果がありません';
                option.disabled = true;
                resultSelect.appendChild(option);

                if (resultTitle) resultTitle.value = '';
                resultsList.innerHTML = '<div class="no-results">送信結果はありません</div>';

                if (deleteResultButton) deleteResultButton.disabled = true;
                if (saveResultTitleButton) saveResultTitleButton.disabled = true;
                if (exportResultsButton) exportResultsButton.disabled = true;
                return;
            }

            completedTodos.forEach(todo => {
                const option = document.createElement('option');
                option.value = todo.id;
                option.textContent = todo.title;
                resultSelect.appendChild(option);
            });

            await new Promise(resolve => setTimeout(resolve, 0));

            let selectedTodo = null;
            if (previousValue) {
                const previousTodo = completedTodos.find(todo => todo.id == previousValue);
                if (previousTodo) {
                    selectedTodo = previousTodo;
                    resultSelect.value = previousValue;
                }
            }

            if (!selectedTodo) {
                selectedTodo = completedTodos[0];
                resultSelect.value = selectedTodo.id;
            }

            if (resultSelect.value != selectedTodo.id) {
                const correctIndex = Array.from(resultSelect.options).findIndex(
                    option => option.value == selectedTodo.id
                );
                if (correctIndex >= 0) {
                    resultSelect.selectedIndex = correctIndex;
                }
            }

            displayResult(selectedTodo);

            if (deleteResultButton) deleteResultButton.disabled = false;
            if (saveResultTitleButton) saveResultTitleButton.disabled = false;
            if (exportResultsButton) exportResultsButton.disabled = false;
        } catch (error) {
            showToast('送信結果の読み込みに失敗しました', 'error');
        }
    }

    /**
     * 選択された結果を読み込む
     */
    async function loadSelectedResult() {
        try {
            if (!resultSelect) return;

            const resultId = parseInt(resultSelect.value);
            if (!resultId || isNaN(resultId)) {
                for (let i = 0; i < resultSelect.options.length; i++) {
                    const option = resultSelect.options[i];
                    if (!option.disabled && option.value) {
                        resultSelect.selectedIndex = i;
                        await loadSelectedResult();
                        return;
                    }
                }
                return;
            }

            const db = new ExDB();
            const todo = await db.getTodoById(resultId);
            if (todo) {
                displayResult(todo);
            } else {
                await loadResults();
            }
        } catch (error) {
            showToast('送信結果の読み込みに失敗しました', 'error');
        }
    }

    /**
     * 結果を表示する
     * @param {Object} todo - Todoオブジェクト
     */
    function displayResult(todo) {
        if (!resultTitle || !resultsList) return;

        resultTitle.value = todo.title;
        resultsList.innerHTML = '';

        if (!todo.description || todo.description.length === 0) {
            resultsList.innerHTML = '<div class="no-results">データがありません</div>';
            return;
        }

        todo.description.forEach((item, index) => {
            const resultItem = document.createElement('div');
            resultItem.className = 'result-item';

            const statusClass = item.result === '成功' ? 'status-success' :
                               item.result === '失敗' ? 'status-failed' : 'status-pending';

            resultItem.innerHTML = `
                <div class="result-header">
                    <span class="result-number">${index + 1}</span>
                    <span class="result-url">${item.url}</span>
                    <span class="result-status ${statusClass}">${item.result || '未処理'}</span>
                </div>
                ${item.contact ? `<div class="result-contact">問い合わせページ: ${item.contact}</div>` : ''}
                ${item.reason ? `<div class="result-reason">理由: ${item.reason}</div>` : ''}
            `;

            resultsList.appendChild(resultItem);
        });
    }

    /**
     * 結果のタイトルを保存する
     */
    async function saveResultTitleHandler() {
        try {
            if (!resultSelect || !resultTitle) return;

            const resultId = parseInt(resultSelect.value);
            if (!resultId) {
                showToast('送信結果が選択されていません', 'warning');
                return;
            }

            const newTitle = resultTitle.value.trim();
            if (newTitle === '') {
                showToast('タイトルを入力してください', 'warning');
                return;
            }

            const db = new ExDB();
            const todo = await db.getTodoById(resultId);
            if (todo) {
                await db.updateTodo(resultId, { title: newTitle });

                const option = resultSelect.options[resultSelect.selectedIndex];
                if (option) {
                    option.textContent = newTitle;
                }

                showToast('タイトルを保存しました', 'success');
            }
        } catch (error) {
            showToast('タイトルの保存に失敗しました', 'error');
        }
    }

    /**
     * 結果をCSVでエクスポートする
     */
    function exportResultsToCSV() {
        try {
            if (!resultSelect) return;

            const resultId = parseInt(resultSelect.value);
            if (!resultId) {
                showToast('送信結果が選択されていません', 'warning');
                return;
            }

            (async () => {
                const db = new ExDB();
                const todo = await db.getTodoById(resultId);

                if (!todo || !todo.description || todo.description.length === 0) {
                    showToast('エクスポートするデータがありません', 'warning');
                    return;
                }

                let csvContent = 'URL,結果,問い合わせURL,理由\n';
                todo.description.forEach(item => {
                    const url = item.url ? `"${item.url.replace(/"/g, '""')}"` : '';
                    const result = item.result ? `"${item.result.replace(/"/g, '""')}"` : '';
                    const contact = item.contact ? `"${item.contact.replace(/"/g, '""')}"` : '';
                    const reason = item.reason ? `"${item.reason.replace(/"/g, '""')}"` : '';
                    csvContent += `${url},${result},${contact},${reason}\n`;
                });

                const bom = '\uFEFF';
                const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
                const urlObj = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.setAttribute('href', urlObj);
                link.setAttribute('download', `送信結果_${todo.title}.csv`);
                link.style.visibility = 'hidden';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);

                showToast('CSVファイルをエクスポートしました', 'success');
            })();
        } catch (error) {
            showToast('CSVエクスポートに失敗しました', 'error');
        }
    }

    /**
     * 選択された結果を削除する
     */
    async function deleteSelectedResult() {
        try {
            if (!resultSelect) return;

            const resultId = parseInt(resultSelect.value);
            const currentIndex = resultSelect.selectedIndex;

            if (!resultId) {
                showToast('送信結果が選択されていません', 'warning');
                return;
            }

            if (!confirm('この送信結果を削除しますか？')) {
                return;
            }

            const db = new ExDB();
            await db.deleteTodo(resultId);
            await loadResults();

            if (resultSelect.options.length > 0) {
                const newIndex = Math.min(currentIndex, resultSelect.options.length - 1);
                resultSelect.selectedIndex = newIndex;
                await loadSelectedResult();
            }

            showToast('送信結果を削除しました', 'success');
        } catch (error) {
            showToast('送信結果の削除に失敗しました', 'error');
        }
    }

    /**
     * 全ての結果を削除する
     */
    async function deleteAllResults() {
        try {
            if (!confirm('全ての送信結果を削除しますか？この操作は元に戻せません。')) {
                return;
            }

            const db = new ExDB();
            await db.deleteAllTodos();
            await loadResults();
            showToast('全ての送信結果を削除しました', 'success');
        } catch (error) {
            showToast('送信結果の削除に失敗しました', 'error');
        }
    }

    // ====================================
    // 設定管理
    // ====================================
    
    /**
     * 設定を読み込む
     */
    async function loadSettings() {
        try {
            const settingsData = await chrome.storage.sync.get(['DoNotDuplicateSend']);
            if (preventDuplicateSend) {
                preventDuplicateSend.checked = settingsData.DoNotDuplicateSend || false;
            }
        } catch (error) {
            showToast('設定の読み込みに失敗しました', 'error');
        }
    }

    /**
     * 時間制限設定を読み込む
     */
    async function loadTimeSettings() {
        try {
            const timeSettingsData = await chrome.storage.sync.get([
                'enableTimeRestriction',
                'restrictionStartTime',
                'restrictionEndTime',
                'restrictionWeekdays'
            ]);

            if (enableTimeRestriction) {
                enableTimeRestriction.checked = timeSettingsData.enableTimeRestriction || false;
            }

            if (timeRestrictionSettings) {
                timeRestrictionSettings.style.display = 
                    (enableTimeRestriction && enableTimeRestriction.checked) ? 'block' : 'none';
            }

            if (restrictionStartTime) {
                restrictionStartTime.value = timeSettingsData.restrictionStartTime || '22:00';
            }

            if (restrictionEndTime) {
                restrictionEndTime.value = timeSettingsData.restrictionEndTime || '08:00';
            }

            const weekdays = timeSettingsData.restrictionWeekdays || [0, 6];
            weekdayCheckboxes.forEach((checkbox, index) => {
                if (checkbox) {
                    checkbox.checked = weekdays.includes(index);
                }
            });
        } catch (error) {
            showToast('時間設定の読み込みに失敗しました', 'error');
        }
    }

    /**
     * 時間制限設定を保存する
     */
    async function saveTimeSettings() {
        try {
            const settings = {};

            if (enableTimeRestriction) {
                settings.enableTimeRestriction = enableTimeRestriction.checked;
            }
            if (restrictionStartTime) {
                settings.restrictionStartTime = restrictionStartTime.value;
            }
            if (restrictionEndTime) {
                settings.restrictionEndTime = restrictionEndTime.value;
            }

            await chrome.storage.sync.set(settings);
            showToast('時間制限設定を保存しました', 'success');
        } catch (error) {
            showToast('時間制限設定の保存に失敗しました', 'error');
        }
    }

    /**
     * 曜日制限設定を保存する
     */
    async function saveWeekdaySettings() {
        try {
            const selectedWeekdays = [];
            weekdayCheckboxes.forEach((checkbox, index) => {
                if (checkbox && checkbox.checked) {
                    selectedWeekdays.push(index);
                }
            });

            await chrome.storage.sync.set({ restrictionWeekdays: selectedWeekdays });
            showToast('曜日制限設定を保存しました', 'success');
        } catch (error) {
            showToast('曜日制限設定の保存に失敗しました', 'error');
        }
    }

    /**
     * 一般設定を保存する
     */
    async function saveGeneralSettings() {
        try {
            const settings = {};
            if (preventDuplicateSend) {
                settings.DoNotDuplicateSend = preventDuplicateSend.checked;
            }

            await chrome.storage.sync.set(settings);
            showToast('設定を保存しました', 'success');
        } catch (error) {
            showToast('設定の保存に失敗しました', 'error');
        }
    }

    /**
     * 除外ドメインを読み込む
     */
    async function loadExcludeDomains() {
        try {
            if (!excludeDomainsTextarea) return;

            const excludeData = await chrome.storage.local.get(['excludeDomain']);
            if (excludeData.excludeDomain) {
                excludeDomainsTextarea.value = excludeData.excludeDomain.join('\n');
            } else {
                excludeDomainsTextarea.value = DEFAULT_EXCLUDE_DOMAINS.join('\n');
                await chrome.storage.local.set({ excludeDomain: DEFAULT_EXCLUDE_DOMAINS });
            }
        } catch (error) {
            showToast('除外ドメインの読み込みに失敗しました', 'error');
        }
    }

    /**
     * 除外ドメインを保存する
     */
    async function saveExcludeDomains() {
        try {
            if (!excludeDomainsTextarea) return;

            const domains = excludeDomainsTextarea.value.trim().split('\n').filter(domain => domain.trim() !== '');
            await chrome.storage.local.set({ excludeDomain: domains });
            showToast('除外ドメインを保存しました', 'success');
        } catch (error) {
            showToast('除外ドメインの保存に失敗しました', 'error');
        }
    }

    /**
     * 除外ドメインをデフォルト設定にリセットする
     */
    async function resetExcludeDomains() {
        try {
            if (!excludeDomainsTextarea) return;

            if (!confirm('除外ドメインをデフォルト設定に戻しますか？')) {
                return;
            }

            excludeDomainsTextarea.value = DEFAULT_EXCLUDE_DOMAINS.join('\n');
            await chrome.storage.local.set({ excludeDomain: DEFAULT_EXCLUDE_DOMAINS });
            showToast('除外ドメインをデフォルト設定に戻しました', 'success');
        } catch (error) {
            showToast('除外ドメインのリセットに失敗しました', 'error');
        }
    }

    // ====================================
    // ダッシュボード機能
    // ====================================
    
    /**
     * ダッシュボードを更新する
     */
    async function refreshDashboard() {
        try {
            const db = new ExDB();
            const todos = await db.getAllTodos();
            const completedTodos = todos.filter(todo => todo.completed).reverse();

            // 統計情報の更新
            if (completedTodos.length > 0) {
                const latestTodo = completedTodos.sort((a, b) => new Date(b.created) - new Date(a.created))[0];

                if (lastExecutionTime) {
                    lastExecutionTime.textContent = new Date(latestTodo.created).toLocaleString('ja-JP');
                }

                let totalSent = 0;
                let totalSuccess = 0;

                if (latestTodo.description && latestTodo.description.length > 0) {
                    latestTodo.description.forEach(item => {
                        if (item.result) {
                            totalSent++;
                            if (item.result === '成功') {
                                totalSuccess++;
                            }
                        }
                    });
                }

                if (totalSentUrls) {
                    totalSentUrls.textContent = totalSent;
                }

                if (successRate) {
                    if (totalSent > 0) {
                        successRate.textContent = Math.round((totalSuccess / totalSent) * 100) + '%';
                    } else {
                        successRate.textContent = '0%';
                    }
                }
            } else {
                if (lastExecutionTime) lastExecutionTime.textContent = 'なし';
                if (totalSentUrls) totalSentUrls.textContent = '0';
                if (successRate) successRate.textContent = '0%';
            }

            // 進捗情報の更新
            const latestTodo = await db.getLatestTodo();
            if (latestTodo && !latestTodo.completed && latestTodo.description) {
                const hasProcessed = latestTodo.description.some(item => item.result !== '');

                if (hasProcessed) {
                    const total = latestTodo.description.length;
                    const processed = latestTodo.description.filter(item => item.result !== '').length;

                    if (progressBar) {
                        progressBar.max = total;
                        progressBar.value = processed;
                    }

                    if (progressCount) {
                        progressCount.textContent = `${processed}/${total}`;
                    }

                    const percentage = total > 0 ? Math.floor((processed / total) * 100) : 0;
                    const dashboardProgressPercentage = getElement('dashboardProgressPercentage');
                    if (dashboardProgressPercentage) {
                        dashboardProgressPercentage.textContent = `${percentage}%`;
                    }

                    if (sendingStatus) {
                        if (processed < total) {
                            sendingStatus.innerHTML = '<span class="status-indicator"></span>送信中...';
                            sendingStatus.classList.add('status-sending');
                        } else {
                            sendingStatus.innerHTML = '<span class="status-indicator"></span>完了処理中...';
                            sendingStatus.classList.add('status-sending');
                        }
                    }

                    const currentProcessingUrl = getElement('currentProcessingUrl');
                    if (currentProcessingUrl) {
                        const nextIndex = processed;
                        if (nextIndex < total) {
                            const inProgressItem = latestTodo.description[nextIndex];
                            if (inProgressItem) {
                                currentProcessingUrl.textContent = inProgressItem.url;
                                currentProcessingUrl.style.display = 'block';
                            }
                        } else {
                            currentProcessingUrl.style.display = 'none';
                        }
                    }
                } else {
                    if (isStopButtonActive) {
                        if (sendingStatus) {
                            sendingStatus.innerHTML = '<span class="status-indicator"></span>送信中...';
                            sendingStatus.classList.add('status-sending');
                        }
                    } else {
                        if (sendingStatus) {
                            sendingStatus.textContent = '待機中';
                            sendingStatus.classList.remove('status-sending');
                        }
                    }

                    if (progressBar) {
                        progressBar.value = 0;
                    }
                    if (progressCount) {
                        progressCount.textContent = '0/0';
                    }

                    const dashboardProgressPercentage = getElement('dashboardProgressPercentage');
                    if (dashboardProgressPercentage) {
                        dashboardProgressPercentage.textContent = '0%';
                    }

                    const currentProcessingUrl = getElement('currentProcessingUrl');
                    if (currentProcessingUrl) {
                        currentProcessingUrl.style.display = 'none';
                    }
                }
            } else {
                if (sendingStatus) {
                    sendingStatus.textContent = '待機中';
                    sendingStatus.classList.remove('status-sending');
                }

                if (progressBar) {
                    progressBar.value = 0;
                }
                if (progressCount) {
                    progressCount.textContent = '0/0';
                }

                const dashboardProgressPercentage = getElement('dashboardProgressPercentage');
                if (dashboardProgressPercentage) {
                    dashboardProgressPercentage.textContent = '0%';
                }

                const currentProcessingUrl = getElement('currentProcessingUrl');
                if (currentProcessingUrl) {
                    currentProcessingUrl.style.display = 'none';
                }
            }

            // 最近の結果表示
            const recentResults = completedTodos.slice(0, 3);
            if (recentResultsList) {
                if (recentResults.length === 0) {
                    recentResultsList.innerHTML = '<div class="no-results">送信結果はありません</div>';
                } else {
                    recentResultsList.innerHTML = '';
                    recentResults.forEach(todo => {
                        const resultItem = document.createElement('div');
                        resultItem.className = 'recent-result-item';

                        const total = todo.description ? todo.description.length : 0;
                        const success = todo.description ? todo.description.filter(item => item.result === '成功').length : 0;
                        const fail = total - success;

                        resultItem.innerHTML = `
                            <div class="recent-result-title">${todo.title}</div>
                            <div class="recent-result-stats">
                                <span class="recent-result-total">合計: ${total}</span>
                                <span class="recent-result-success">成功: ${success}</span>
                                <span class="recent-result-fail">失敗: ${fail}</span>
                            </div>
                        `;

                        resultItem.addEventListener('click', () => {
                            window.location.href = `main.html?tab=results&id=${todo.id}`;
                        });

                        recentResultsList.appendChild(resultItem);
                    });
                }
            }
        } catch (error) {
            showToast('ダッシュボードの更新に失敗しました', 'error');
        }
    }

    // ====================================
    // 送信実行機能
    // ====================================
    
    /**
     * 送信実行ボタンのイベントハンドラー
     */
    async function executeButtonHandler() {
        try {
            // ライセンス確認
            const licenseData = await chrome.storage.sync.get('validLicense');
            if (!licenseData.validLicense) {
                showToast('有効なライセンスが必要です', 'warning');
                return;
            }

            // URLリストの確認
            if (urlListTextarea) {
                const urls = urlListTextarea.value.trim().split('\n').filter(url => url.trim() !== '');
                if (urls.length === 0) {
                    showToast('送信先URLが入力されていません', 'warning');
                    return;
                }
            }

            const db = new ExDB();
            const latestTodo = await db.getLatestTodo();

            if (!latestTodo || !latestTodo.description || latestTodo.description.length === 0) {
                showToast('送信先URLが設定されていません', 'warning');
                return;
            }

            if (!latestTodo.completed) {
                const processed = latestTodo.description.filter(item => item.result !== '').length;
                if (processed > 0) {
                    showToast('送信処理が進行中です', 'warning');
                    return;
                }
            }

            if (!confirm(`${latestTodo.description.length}件のURLに対して送信を開始しますか？`)) {
                return;
            }

            // 新しいタスクを作成（完了済みの場合）
            if (latestTodo.completed) {
                const now = new Date();
                const title = now.toLocaleString('ja-JP');
                const newDescription = latestTodo.description.map(item => ({
                    url: item.url,
                    result: '',
                    contact: '',
                    reason: ''
                }));
                await db.addTodo(title, newDescription);
            }

            await chrome.storage.local.set({ sendingInProgress: true });

            // ボタンを停止ボタンに変更
            if (executeFromUrlTabButton) {
                executeFromUrlTabButton.innerHTML = '<img class="icon" src="/icons/stop.png" alt="送信停止" />送信停止';
                executeFromUrlTabButton.className = 'stop-button';
                executeFromUrlTabButton.removeEventListener('click', executeButtonHandler);
                executeFromUrlTabButton.addEventListener('click', stopButtonHandler);
                isStopButtonActive = true;
            }

            if (sendingStatus) {
                sendingStatus.innerHTML = '<span class="status-indicator"></span>送信中...';
                sendingStatus.classList.add('status-sending');
            }

            await refreshDashboard();

            // 処理用タブを作成
            const tab = await chrome.tabs.create({ url: 'process.html' });
            setTimeout(() => {
                chrome.runtime.sendMessage({ action: 'execute', tabId: tab.id });
            }, 1000);

            showToast('送信を開始しました', 'success');
        } catch (error) {
            showToast('送信の開始に失敗しました', 'error');
            chrome.storage.local.remove('sendingInProgress');

            if (executeFromUrlTabButton) {
                executeFromUrlTabButton.innerHTML = '<img class="icon" src="/icons/play.png" alt="送信開始" />送信開始';
                executeFromUrlTabButton.className = 'primary-button';
                executeFromUrlTabButton.removeEventListener('click', stopButtonHandler);
                executeFromUrlTabButton.addEventListener('click', executeButtonHandler);
                isStopButtonActive = false;
            }

            if (sendingStatus) {
                sendingStatus.textContent = '待機中';
                sendingStatus.classList.remove('status-sending');
            }
        }
    }

    // ====================================
    // 進捗監視機能
    // ====================================
    
    /**
     * 進捗監視を開始する
     */
    function startProgressMonitoring() {
        const progressBar = getElement('progressBar');
        const progressCount = getElement('progressCount');
        const dashboardProgressPercentage = getElement('dashboardProgressPercentage');
        const sendingStatus = getElement('sendingStatus');
        const currentProcessingUrl = getElement('currentProcessingUrl');

        let lastState = {
            processed: -1,
            total: -1,
            isCompleted: false,
            currentUrl: ''
        };

        /**
         * 進捗をチェックする
         */
        async function checkProgress() {
            try {
                const db = new ExDB();
                const latestTodo = await db.getLatestTodo();

                if (latestTodo) {
                    if (!latestTodo.completed && latestTodo.description) {
                        const total = latestTodo.description.length;
                        const processed = latestTodo.description.filter(item => item.result !== '').length;
                        const hasProcessed = processed > 0;

                        // 進捗が変更された場合のみ更新
                        if (lastState.processed !== processed || lastState.total !== total) {
                            lastState.processed = processed;
                            lastState.total = total;

                            if (progressBar) {
                                progressBar.max = total;
                                progressBar.value = processed;
                            }

                            if (progressCount) {
                                progressCount.textContent = `${processed}/${total}`;
                            }

                            const percentage = total > 0 ? Math.round((processed / total) * 100) : 0;
                            if (dashboardProgressPercentage) {
                                dashboardProgressPercentage.textContent = `${percentage}%`;
                            }
                        }

                        if (hasProcessed && isStopButtonActive) {
                            if (processed < total) {
                                if (sendingStatus && !sendingStatus.textContent.includes('送信中')) {
                                    sendingStatus.innerHTML = '<span class="status-indicator"></span>送信中...';
                                    sendingStatus.classList.add('status-sending');
                                }

                                const nextIndex = processed;
                                if (nextIndex < total) {
                                    const inProgressItem = latestTodo.description[nextIndex];
                                    if (inProgressItem && currentProcessingUrl) {
                                        const newUrl = inProgressItem.url;
                                        if (lastState.currentUrl !== newUrl) {
                                            lastState.currentUrl = newUrl;
                                            currentProcessingUrl.textContent = newUrl;
                                            currentProcessingUrl.style.display = 'block';
                                        }
                                    }
                                }
                            } else {
                                if (sendingStatus && !sendingStatus.textContent.includes('完了処理中')) {
                                    sendingStatus.innerHTML = '<span class="status-indicator"></span>完了処理中...';
                                    sendingStatus.classList.add('status-sending');
                                }

                                if (currentProcessingUrl) {
                                    currentProcessingUrl.style.display = 'none';
                                }
                            }
                        }
                    } else if (latestTodo.completed && !lastState.isCompleted) {
                        lastState.isCompleted = true;

                        chrome.storage.local.remove('sendingInProgress');

                        if (sendingStatus) {
                            sendingStatus.textContent = '待機中';
                            sendingStatus.classList.remove('status-sending');
                        }

                        if (executeFromUrlTabButton && isStopButtonActive) {
                            executeFromUrlTabButton.innerHTML = '<img class="icon" src="/icons/play.png" alt="送信開始" />送信開始';
                            executeFromUrlTabButton.className = 'primary-button';
                            executeFromUrlTabButton.disabled = false;
                            executeFromUrlTabButton.removeEventListener('click', stopButtonHandler);
                            executeFromUrlTabButton.addEventListener('click', executeButtonHandler);
                            isStopButtonActive = false;
                        }

                        if (currentProcessingUrl) {
                            currentProcessingUrl.style.display = 'none';
                        }

                        await refreshDashboard();
                    }
                } else if (!lastState.isCompleted) {
                    lastState.isCompleted = true;

                    if (sendingStatus) {
                        sendingStatus.textContent = '待機中';
                        sendingStatus.classList.remove('status-sending');
                    }

                    if (progressBar) {
                        progressBar.value = 0;
                    }
                    if (progressCount) {
                        progressCount.textContent = '0/0';
                    }
                    if (dashboardProgressPercentage) {
                        dashboardProgressPercentage.textContent = '0%';
                    }
                    if (currentProcessingUrl) {
                        currentProcessingUrl.style.display = 'none';
                    }
                }
            } catch (error) {
                // エラーは無視
            }
        }

        // 初回実行
        checkProgress();

        // 定期実行の設定
        if (progressMonitoringInterval) {
            clearInterval(progressMonitoringInterval);
        }
        progressMonitoringInterval = setInterval(checkProgress, 3000);
    }

});