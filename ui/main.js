// 共通設定のインポート
import { SUPABASE_CONFIG, createSupabaseClient } from '../shared/config.js';
import { 
    ACTION_STOP,
    ACTION_STOP_COMPLETED,
    ACTION_EXECUTE,
    PROGRESS_UPDATE_INTERVAL,
    SHORT_DELAY,
    SENDING_STATES,
    STORAGE_KEYS,
    isValidSendingState
} from '../shared/constants.js';
import { ExDB } from '../shared/database.js';
import { SALES_LIST_DATA } from '../shared/sales-data.js';
import { Dashboard } from '../modules/dashboard.js';
import { ProfileManager } from '../modules/profile-manager.js';
import { UrlManager } from '../modules/url-manager.js';
import { ResultsManager } from '../modules/results-manager.js';
import { SettingsManager, DEFAULT_EXCLUDE_DOMAINS } from '../modules/settings-manager.js';
import { AuthService } from '../services/auth.service.js';
import { BatchService } from '../services/batch.service.js';
import { FormService } from '../services/form.service.js';
import { StorageService } from '../services/storage.service.js';
import { ProgressMonitor } from '../modules/progress-monitor.js';

document.addEventListener('DOMContentLoaded', function() {

    // ====================================
    // 営業リスト管理クラス
    // ====================================
    
    class SalesListManager {
        constructor() {
            this.data = SALES_LIST_DATA;
            this.filteredData = [...this.data];
            this.currentPage = 1;
            this.itemsPerPage = 20;
            this.currentIndustryFilter = '';
            
            this.initializeSalesList();
        }

        initializeSalesList() {
            this.setupSalesListEventListeners();
            this.updateSalesListDisplay();
        }

        setupSalesListEventListeners() {
            const industryFilter = document.getElementById('industryFilter');
            if (industryFilter) {
                industryFilter.addEventListener('change', (e) => {
                    this.currentIndustryFilter = e.target.value;
                    this.currentPage = 1;
                    this.applySalesFilter();
                    this.updateSalesListDisplay();
                    showToast(`フィルター設定: ${e.target.value || 'すべて'}`, 'info');
                });
            }
        }

        applySalesFilter() {
            this.filteredData = [...this.data];

            if (this.currentIndustryFilter) {
                this.filteredData = this.filteredData.filter(item => 
                    item.industry === this.currentIndustryFilter
                );
            }
        }

        updateSalesListDisplay() {
            this.applySalesFilter();
            this.renderSalesListItems();
        }

        renderSalesListItems() {
            const salesListItems = document.getElementById('salesListItems');
            const salesNoDataMessage = document.getElementById('salesNoDataMessage');

            if (!salesListItems) return;

            if (salesNoDataMessage) salesNoDataMessage.style.display = 'none';

            if (this.filteredData.length === 0) {
                if (salesNoDataMessage) salesNoDataMessage.style.display = 'block';
                salesListItems.innerHTML = '';
                return;
            }

            const startIndex = (this.currentPage - 1) * this.itemsPerPage;
            const endIndex = Math.min(startIndex + this.itemsPerPage, this.filteredData.length);
            const pageData = this.filteredData.slice(startIndex, endIndex);

            salesListItems.innerHTML = pageData.map(item => `
                <tr>
                    <td>
                        <a href="${item.fileURL}" target="_blank" class="sales-file-link" title="ファイルをダウンロード">
                            ${item.fileName}
                        </a>
                    </td>
                    <td>${item.industry}</td>
                    <td>${item.companyCount}</td>
                </tr>
            `).join('');

            this.setupFileLinks();
        }

        setupFileLinks() {
            const fileLinks = document.querySelectorAll('.sales-file-link');
            fileLinks.forEach(link => {
                link.addEventListener('click', (e) => {
                    const fileName = e.target.textContent;
                    showToast(`ファイル「${fileName}」をダウンロード中...`, 'info');
                });
            });
        }

        onSalesListTabActivated() {
            this.updateSalesListDisplay();
        }
    }

    // ====================================
    // 送信先リスト管理用プロフィール選択クラス（最適化版）
    // ====================================
    
    class UrlProfileManager {
        constructor() {
            this.selectedProfileId = null;
            this.profiles = [];
            this.initialize();
        }

        async initialize() {
            await this.loadProfiles();
            this.setupEventListeners();
            this.setupStorageWatcher();
        }

        setupEventListeners() {
            const urlProfileSelect = getElement('urlProfileSelect');
            if (!urlProfileSelect) return;

            urlProfileSelect.addEventListener('change', (e) => {
                this.selectedProfileId = e.target.value;
                this.saveSelection();
                
                if (e.target.value) {
                    const selectedText = e.target.options[e.target.selectedIndex].text;
                    showToast(`プロフィール「${selectedText}」を選択しました`, 'info');
                }
            });
        }

        setupStorageWatcher() {
            chrome.storage.onChanged.addListener((changes, areaName) => {
                if (areaName === 'local' && changes.optionPatterns) {
                    this.loadProfiles();
                }
            });
        }

        async loadProfiles() {
            try {
                const result = await chrome.storage.local.get(['optionPatterns', 'urlSelectedProfile']);
                this.profiles = result.optionPatterns || [];
                this.selectedProfileId = result.urlSelectedProfile || null;
                this.updateDropdown();
            } catch (error) {
                console.error('Failed to load profiles:', error);
                showToast('プロフィールの読み込みに失敗しました', 'error');
            }
        }

        // profile-manager.jsの実装パターンを参考にした最適化版
        updateDropdown() {
            const urlProfileSelect = getElement('urlProfileSelect');
            if (!urlProfileSelect) return;

            // 現在の選択値を保持
            const currentValue = urlProfileSelect.value;
            
            // ドロップダウンをクリア
            urlProfileSelect.innerHTML = '';

            // プロフィール選択肢を追加（profile-manager.jsと同じパターン）
            this.profiles.forEach(profile => {
                const option = document.createElement('option');
                option.value = profile.id;
                option.textContent = profile.title; // profile-manager.jsと同じtitleフィールドを使用
                urlProfileSelect.appendChild(option);
            });

            // 選択状態を復元
            if (this.selectedProfileId && this.profiles.find(p => p.id === this.selectedProfileId)) {
                urlProfileSelect.value = this.selectedProfileId;
            } else if (this.profiles.length > 0) {
                // プロフィールが存在する場合は最初のプロフィールを選択
                this.selectedProfileId = this.profiles[0].id;
                urlProfileSelect.value = this.selectedProfileId;
                this.saveSelection();
            }
        }

        async saveSelection() {
            try {
                await chrome.storage.local.set({ 'urlSelectedProfile': this.selectedProfileId });
                
                // 送信機能で使用するプロフィールとして設定
                if (this.selectedProfileId) {
                    const selectedProfile = this.getSelectedProfile();
                    if (selectedProfile) {
                        await chrome.storage.local.set({ 'selectedPattern': this.selectedProfileId });
                    }
                }
            } catch (error) {
                console.error('Failed to save profile selection:', error);
            }
        }

        getSelectedProfile() {
            if (!this.selectedProfileId) return null;
            return this.profiles.find(profile => profile.id === this.selectedProfileId);
        }

        validateSelectedProfile() {
            const selectedProfile = this.getSelectedProfile();
            if (!selectedProfile) {
                showToast('送信実行前にプロフィールを選択してください', 'warning');
                
                const urlProfileSelect = getElement('urlProfileSelect');
                if (urlProfileSelect) {
                    urlProfileSelect.focus();
                    urlProfileSelect.style.border = '2px solid #f4b400';
                    setTimeout(() => {
                        urlProfileSelect.style.border = '';
                    }, 3000);
                }
                return false;
            }
            return true;
        }

        async refreshOnTabSwitch() {
            await this.loadProfiles();
        }
    }

    // ====================================
    // ユーティリティ関数
    // ====================================
    
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

    function getElement(id) {
        return document.getElementById(id);
    }

    // ====================================
    // モジュールインスタンス初期化
    // ====================================
    
    const formService = new FormService(showToast);
    const storageService = new StorageService(showToast);
    const dashboard = new Dashboard(showToast);
    const profileManager = new ProfileManager(showToast, getElement, formService, storageService);
    const urlManager = new UrlManager(showToast, getElement, () => dashboard.refreshDashboard());
    const resultsManager = new ResultsManager(showToast, getElement);
    const settingsManager = new SettingsManager(showToast, getElement);
    const authService = new AuthService(showToast, getElement);
    
    // 営業リスト・プロフィール管理インスタンス
    const salesListManager = new SalesListManager();
    const urlProfileManager = new UrlProfileManager();
    
    let batchService = null;

    // ====================================
    // デバイスID管理
    // ====================================
    
    async function getDeviceId() {
        try {
            let deviceId = await storageService.getDeviceId();
            if (!deviceId) {
                deviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
                await storageService.setDeviceId(deviceId);
            }
            return deviceId;
        } catch (error) {
            return 'device_' + Date.now() + '_fallback';
        }
    }

    // ====================================
    // DOM要素の取得
    // ====================================
    
    const navItems = document.querySelectorAll('.nav-item');
    const tabContents = document.querySelectorAll('.tab-content');
    const refreshDashboardButton = getElement('refreshDashboard');

    // ====================================
    // タブ切り替え機能
    // ====================================
    
    async function switchToTab(tabId) {
        navItems.forEach(navItem => navItem.classList.remove('active'));
        tabContents.forEach(content => content.classList.remove('active'));

        const targetNavItem = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
        const targetTab = document.getElementById(tabId);

        if (targetNavItem) targetNavItem.classList.add('active');
        if (targetTab) targetTab.classList.add('active');

        // タブ固有の処理
        if (tabId === 'sales-list') {
            salesListManager.onSalesListTabActivated();
        } else if (tabId === 'url-list') {
            await urlProfileManager.refreshOnTabSwitch();
        }

        window.history.replaceState(null, '', `?tab=${tabId}`);
    }

    async function setInitialTab() {
        const urlParams = new URLSearchParams(window.location.search);
        const tabParam = urlParams.get('tab');
        const targetTab = tabParam || 'dashboard';
        
        await switchToTab(targetTab);

        if (tabParam === 'results') {
            const resultId = urlParams.get('id');
            if (resultId) {
                setTimeout(() => {
                    resultsManager.switchToResult(parseInt(resultId));
                }, SHORT_DELAY);
            }
        }
    }

    // ====================================
    // 共通関数
    // ====================================
    
    async function refreshDashboard() {
        try {
            if (dashboard) {
                await dashboard.refreshDashboard();
            }
        } catch (error) {
            console.error('Failed to refresh dashboard:', error);
        }
    }

    // ====================================
    // 送信制御機能（詳細状態対応版）
    // ====================================
    
    /**
     * 送信停止処理
     */
    async function handleSendingStop() {
        try {
            // BatchServiceの停止ハンドラーを使用
            if (batchService) {
                const stopHandler = batchService.getStopButtonHandler();
                if (stopHandler) {
                    await stopHandler();
                }
            } else {
                // フォールバック処理
                const response = await chrome.runtime.sendMessage({ action: ACTION_STOP });
                
                if (response && response.success) {
                    showToast('送信を停止しました', 'success');
                } else {
                    showToast('送信停止中にエラーが発生しました', 'error');
                }
            }
        } catch (error) {
            console.error('Failed to stop sending:', error);
            showToast('送信停止中にエラーが発生しました', 'error');
        }
    }

    // ====================================
    // 軽量化されたリアルタイム状態同期システム（解決策B最適化版）
    // ====================================

    // Debounce制御変数
    let syncDebounceTimer = null;
    let lastSyncState = null;
    let dashboardRefreshTimer = null;

    /**
     * 軽量な状態同期処理（Debounce付き）
     * @param {string} newState - 新しい送信状態
     * @param {string|undefined} oldState - 以前の送信状態
     */
    function syncComponentsToState(newState, oldState = undefined) {
        // 同じ状態への変更は無視
        if (lastSyncState === newState) {
            return;
        }

        // Debounce処理で連続する状態変更を統合
        if (syncDebounceTimer) {
            clearTimeout(syncDebounceTimer);
        }

        syncDebounceTimer = setTimeout(() => {
            syncComponentsImmediate(newState, oldState);
            syncDebounceTimer = null;
            lastSyncState = newState;
        }, 50); // 50ms のDebounce
    }

    /**
     * 即座に実行される軽量な状態同期処理
     * @param {string} newState - 新しい送信状態
     * @param {string|undefined} oldState - 以前の送信状態
     */
    function syncComponentsImmediate(newState, oldState) {
        try {
            console.log(`main.js: Lightweight sync from ${oldState} to ${newState}`);

            // ====================================
            // 必要最小限のダッシュボード更新
            // ====================================
            
            if (dashboard) {
                // 状態表示のみ更新（重いリフレッシュは制限）
                switch (newState) {
                    case SENDING_STATES.IDLE:
                        dashboard.updateSendingStatus('待機中', false);
                        break;
                    case SENDING_STATES.SENDING:
                        dashboard.updateSendingStatus('送信中...', true);
                        break;
                    case SENDING_STATES.STOPPING:
                        dashboard.updateSendingStatus('停止処理中...', false);
                        break;
                    case SENDING_STATES.COMPLETED:
                        dashboard.updateSendingStatus('完了', false);
                        // 完了時のみ遅延リフレッシュ（Debounce付き）
                        scheduleDashboardRefresh();
                        break;
                }
            }

            // ====================================
            // 選択的なトースト通知（重要な遷移のみ）
            // ====================================
            
            if (oldState && oldState !== newState) {
                switch (newState) {
                    case SENDING_STATES.COMPLETED:
                        if (oldState === SENDING_STATES.SENDING || oldState === SENDING_STATES.STOPPING) {
                            showToast('送信処理が完了しました', 'success');
                        }
                        break;
                    case SENDING_STATES.STOPPING:
                        if (oldState === SENDING_STATES.SENDING) {
                            showToast('送信停止処理中です', 'info');
                        }
                        break;
                    // 他の状態変更は通知を抑制してレスポンス改善
                }
            }

            console.log(`main.js: Lightweight sync completed for state ${newState}`);

        } catch (error) {
            console.error('main.js: Error during lightweight state sync:', error);
        }
    }

    /**
     * ダッシュボードリフレッシュをスケジュール（Debounce付き）
     */
    function scheduleDashboardRefresh() {
        // 既存のタイマーをクリア
        if (dashboardRefreshTimer) {
            clearTimeout(dashboardRefreshTimer);
        }

        // 1秒後にリフレッシュ実行（重複実行を防止）
        dashboardRefreshTimer = setTimeout(async () => {
            try {
                if (dashboard) {
                    await dashboard.refreshDashboard();
                    console.log('main.js: Dashboard refresh completed');
                }
            } catch (error) {
                console.error('main.js: Dashboard refresh failed:', error);
            }
            dashboardRefreshTimer = null;
        }, 1000);
    }

    /**
     * 軽量化されたリアルタイム状態同期リスナーを設定
     */
    function setupOptimizedRealtimeStateSync() {
        chrome.storage.onChanged.addListener((changes, areaName) => {
            // ローカルストレージ以外は早期リターン
            if (areaName !== 'local') {
                // syncストレージのライセンス変更のみ処理
                if (areaName === 'sync' && changes.validLicense && authService) {
                    console.log('main.js: License status changed');
                    authService.updateLicenseStatus(changes.validLicense.newValue);
                }
                return;
            }

            // ====================================
            // メインの送信状態変更監視（軽量化）
            // ====================================
            
            if (changes[STORAGE_KEYS.SENDING_STATE]) {
                const oldState = changes[STORAGE_KEYS.SENDING_STATE].oldValue;
                const newState = changes[STORAGE_KEYS.SENDING_STATE].newValue;
                
                console.log(`main.js: Storage state change detected: ${oldState} -> ${newState}`);
                
                // 有効な状態のみ軽量同期実行
                if (isValidSendingState(newState)) {
                    syncComponentsToState(newState, oldState);
                } else {
                    console.warn(`main.js: Invalid state received: ${newState}`);
                }
                return; // 他の処理をスキップ
            }

            // ====================================
            // 後方互換性処理（条件を厳格化して軽量化）
            // ====================================
            
            if (changes[STORAGE_KEYS.SENDING_IN_PROGRESS] && !changes[STORAGE_KEYS.SENDING_STATE]) {
                // 詳細状態が設定されていない場合のみフォールバック
                const isInProgress = changes[STORAGE_KEYS.SENDING_IN_PROGRESS].newValue;
                const legacyState = isInProgress ? SENDING_STATES.SENDING : SENDING_STATES.IDLE;
                
                console.log(`main.js: Legacy state sync to ${legacyState}`);
                syncComponentsToState(legacyState);
                return;
            }

            // ====================================
            // その他の設定変更（軽量化）
            // ====================================
            
            // プロフィール変更時の処理（遅延実行で軽量化）
            if (changes.optionPatterns && urlProfileManager) {
                setTimeout(() => {
                    console.log('main.js: Profiles updated, refreshing UI components');
                    urlProfileManager.loadProfiles();
                }, 100);
            }
        });

        console.log('main.js: Optimized realtime state sync system initialized');
    }

    // ====================================
    // 初期化処理（修正版）
    // ====================================
    
    async function init() {
        try {
            // Step 1: 基本サービスとマネージャーの初期化
            await authService.initializeAuth();
            await urlManager.loadUrlList();
            await profileManager.loadProfiles();
            await resultsManager.loadResults();
            await settingsManager.loadAllSettings();
            await refreshDashboard();
            
            // Step 2: BatchServiceの初期化（URLManagerが初期化済み状態で実行）
            batchService = new BatchService({
                showToast: showToast,
                urlManager: urlManager,
                dashboard: dashboard,
                authService: authService,
                refreshDashboard: refreshDashboard
            });
            
            if (batchService.progressMonitor) {
                batchService.progressMonitor.setStorageService(storageService);
            }

            // Step 3: 送信状態の復元（詳細状態対応）
            await batchService.checkAndRestoreSendingState();
            
            // Step 4: 送信実行ボタンの設定（修正版）
            const executeFromUrlTabButton = getElement('executeFromUrlTab');
            const stopFromUrlTabButton = getElement('stopFromUrlTab');
            
            if (executeFromUrlTabButton && stopFromUrlTabButton) {
                // プロフィール選択バリデーション付きの実行ハンドラーを作成
                const enhancedExecuteHandler = () => {
                    // プロフィール選択のバリデーション
                    if (!urlProfileManager.validateSelectedProfile()) {
                        return;
                    }
                    
                    // BatchServiceの実行ハンドラーを呼び出し
                    const batchExecuteHandler = batchService.getExecuteButtonHandler();
                    if (batchExecuteHandler) {
                        batchExecuteHandler();
                    } else {
                        showToast('送信処理の初期化に失敗しました', 'error');
                    }
                };

                // URLManagerの状態復元機能を使用（詳細状態対応）
                const restoredState = await urlManager.restoreButtonStateFromStorage(
                    enhancedExecuteHandler,
                    handleSendingStop
                );

                console.log(`main.js: Button states restored to ${restoredState}`);
            }

            // Step 5: 軽量化されたリアルタイム状態同期システムを設定
            setupOptimizedRealtimeStateSync();
            
            // Step 6: 初期タブ設定
            await setInitialTab();
            
            console.log('main.js: Initialization completed successfully');
            
        } catch (error) {
            showToast('初期化中にエラーが発生しました', 'error');
            console.error('Initialization error:', error);
        }
    }

    // ====================================
    // イベントリスナーの設定
    // ====================================
    
    init();

    navItems.forEach(item => {
        item.addEventListener('click', async function() {
            const tabId = this.getAttribute('data-tab');
            if (tabId) {
                await switchToTab(tabId);
            }
        });
    });

    if (refreshDashboardButton) {
        refreshDashboardButton.addEventListener('click', async function() {
            await refreshDashboard();
            showToast('ダッシュボードを更新しました', 'info');
        });
    }

    // ====================================
    // 停止完了通知の処理（詳細状態対応）
    // ====================================
    
    // バックグラウンドからの停止完了通知を受信
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === ACTION_STOP_COMPLETED) {
            console.log('main.js: Stop completion notification received', {
                timestamp: message.timestamp,
                sender: sender
            });
            
            // BatchServiceが自動的に状態を更新するため、追加の処理は最小限に
            // ダッシュボードのリフレッシュは状態同期システムで自動実行される
            
            sendResponse({ 
                received: true, 
                timestamp: Date.now(),
                source: 'main.js'
            });
            
            return true; // 非同期応答を示す
        }
    });

});