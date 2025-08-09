// 共通設定のインポート
import { SUPABASE_CONFIG, createSupabaseClient } from '../shared/config.js';
import { 
    ACTION_STOP,
    ACTION_STOP_COMPLETED,
    ACTION_EXECUTE,
    PROGRESS_UPDATE_INTERVAL,
    SHORT_DELAY
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

        /**
         * 営業リスト初期化
         */
        initializeSalesList() {
            this.setupSalesListEventListeners();
            this.updateSalesListDisplay();
        }

        /**
         * 営業リストのイベントリスナー設定
         */
        setupSalesListEventListeners() {
            // 業種フィルター
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

        /**
         * フィルターを適用
         */
        applySalesFilter() {
            this.filteredData = [...this.data];

            if (this.currentIndustryFilter) {
                this.filteredData = this.filteredData.filter(item => 
                    item.industry === this.currentIndustryFilter
                );
            }
        }

        /**
         * 営業リスト表示更新
         */
        updateSalesListDisplay() {
            this.applySalesFilter();
            this.renderSalesListItems();
        }

        /**
         * 営業リスト項目を描画（表形式・リンク対応）
         */
        renderSalesListItems() {
            const salesListItems = document.getElementById('salesListItems');
            const salesNoDataMessage = document.getElementById('salesNoDataMessage');

            if (!salesListItems) return;

            // データなしメッセージを非表示
            if (salesNoDataMessage) salesNoDataMessage.style.display = 'none';

            if (this.filteredData.length === 0) {
                if (salesNoDataMessage) salesNoDataMessage.style.display = 'block';
                salesListItems.innerHTML = '';
                return;
            }

            // ページ用データを取得
            const startIndex = (this.currentPage - 1) * this.itemsPerPage;
            const endIndex = Math.min(startIndex + this.itemsPerPage, this.filteredData.length);
            const pageData = this.filteredData.slice(startIndex, endIndex);

            // 表形式のデータを生成（ファイル名をリンクに）
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

            // リンククリック時のイベントリスナー追加
            this.setupFileLinks();
        }

        /**
         * ファイルリンクのイベントリスナー設定
         */
        setupFileLinks() {
            const fileLinks = document.querySelectorAll('.sales-file-link');
            fileLinks.forEach(link => {
                link.addEventListener('click', (e) => {
                    const fileName = e.target.textContent;
                    const fileUrl = e.target.getAttribute('href');
                    
                    // トースト通知でダウンロード開始を表示
                    showToast(`ファイル「${fileName}」をダウンロード中...`, 'info');
                    
                    // リンクは通常通り新しいタブで開く
                    // e.preventDefault() は使用しない
                });
            });
        }

        /**
         * 総ページ数取得
         */
        getSalesTotalPages() {
            return Math.ceil(this.filteredData.length / this.itemsPerPage);
        }

        /**
         * 営業リストタブがアクティブになった時の処理
         */
        onSalesListTabActivated() {
            this.updateSalesListDisplay();
            showToast('営業リストを表示しました', 'info');
        }
    }


    // ====================================
    // Supabase設定とクライアント初期化は services/auth.service.js で管理
    // ====================================

    // ====================================
    // ユーティリティ関数の定義
    // ====================================
    
    /**
     * トーストメッセージを表示
     * @param {string} message - 表示メッセージ
     * @param {string} type - メッセージタイプ
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
    
    // 営業リスト管理インスタンス初期化
    const salesListManager = new SalesListManager();
    
    // 送信先リスト管理用プロフィール選択管理クラス
    class UrlProfileManager {
        constructor() {
            this.selectedProfileId = null;
            this.profiles = [];
            this.initializeUrlProfileSelect();
        }

        /**
         * 送信先リスト管理用プロフィール選択の初期化
         */
        async initializeUrlProfileSelect() {
            const urlProfileSelect = getElement('urlProfileSelect');
            if (!urlProfileSelect) return;

            // プロフィール変更イベントリスナー
            urlProfileSelect.addEventListener('change', (e) => {
                this.selectedProfileId = e.target.value;
                this.saveSelectedProfile();
                showToast(`プロフィール「${e.target.options[e.target.selectedIndex].text}」を選択しました`, 'info');
            });

            // 初期プロフィールを読み込み
            await this.loadUrlProfiles();
        }

        /**
         * プロフィール一覧を読み込み
         */
        async loadUrlProfiles() {
            try {
                // ProfileManagerからプロフィール一覧を取得
                const profileData = await storageService.getItem('optionPatterns') || [];
                this.profiles = profileData;

                // 保存された選択プロフィールを取得
                const savedProfileId = await storageService.getItem('urlSelectedProfile');
                this.selectedProfileId = savedProfileId;

                // ドロップダウンを更新
                this.updateUrlProfileSelect();
            } catch (error) {
                console.error('Failed to load URL profiles:', error);
                showToast('プロフィールの読み込みに失敗しました', 'error');
            }
        }

        /**
         * プロフィール選択ドロップダウンを更新
         */
        updateUrlProfileSelect() {
            const urlProfileSelect = getElement('urlProfileSelect');
            if (!urlProfileSelect) return;

            // 選択肢をクリア
            urlProfileSelect.innerHTML = '';

            // デフォルト選択肢を追加
            const defaultOption = document.createElement('option');
            defaultOption.value = '';
            defaultOption.textContent = 'プロフィールを選択してください';
            urlProfileSelect.appendChild(defaultOption);

            // プロフィール選択肢を追加
            this.profiles.forEach(profile => {
                const option = document.createElement('option');
                option.value = profile.id;
                option.textContent = profile.name || `プロフィール ${profile.id}`;
                urlProfileSelect.appendChild(option);
            });

            // 保存された選択プロフィールを復元
            if (this.selectedProfileId) {
                urlProfileSelect.value = this.selectedProfileId;
            }
        }

        /**
         * 選択されたプロフィールを保存
         */
        async saveSelectedProfile() {
            try {
                await storageService.setItem('urlSelectedProfile', this.selectedProfileId);
            } catch (error) {
                console.error('Failed to save selected profile:', error);
            }
        }

        /**
         * 現在選択されているプロフィールを取得
         */
        getSelectedProfile() {
            if (!this.selectedProfileId) return null;
            return this.profiles.find(profile => profile.id === this.selectedProfileId);
        }

        /**
         * プロフィール一覧を更新（ProfileManager連携用）
         */
        async refreshProfiles() {
            await this.loadUrlProfiles();
        }

        /**
         * 送信実行時に選択されたプロフィールのバリデーション
         */
        validateSelectedProfile() {
            const selectedProfile = this.getSelectedProfile();
            if (!selectedProfile) {
                showToast('送信実行前にプロフィールを選択してください', 'warning');
                return false;
            }
            return true;
        }
    }
    
    // 送信先リスト管理用プロフィール選択インスタンス初期化
    const urlProfileManager = new UrlProfileManager();
    
    // BatchServiceは他のサービスへの依存性があるため、後で初期化
    let batchService = null;

    // ====================================
    // グローバル変数（バッチ処理関連は services/batch.service.js に移動済み）
    // ====================================

    // ====================================
    // デバイスID管理
    // ====================================
    
    /**
     * デバイスIDを取得または生成する（StorageService経由）
     * @returns {Promise<string>} デバイスID
     */
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
    // データベースクラスは shared/database.js からインポート済み
    // ====================================

    // ====================================
    // デフォルト除外ドメイン設定は modules/settings-manager.js から取得
    // ====================================

    // ====================================
    // DOM要素の取得
    // ====================================
    
    // ナビゲーション関連
    const navItems = document.querySelectorAll('.nav-item');
    const tabContents = document.querySelectorAll('.tab-content');
    
    // ダッシュボード関連（エラー修正: refreshDashboardButton の定義追加）
    const refreshDashboardButton = getElement('refreshDashboard');
    
    // 認証関連は services/auth.service.js で管理

    // URL管理関連は modules/url-manager.js で管理

    // プロフィール管理関連は modules/profile-manager.js で管理

    // 送信結果関連は modules/results-manager.js で管理

    // 設定関連は modules/settings-manager.js で管理

    // ダッシュボード関連は modules/dashboard.js で管理

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

        // 営業リストタブがアクティブになった場合の特別処理
        if (tabId === 'sales-list') {
            salesListManager.onSalesListTabActivated();
        }

        // 送信先リスト管理タブがアクティブになった場合の特別処理
        if (tabId === 'url-list') {
            urlProfileManager.refreshProfiles();
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
            if (resultId) {
                setTimeout(() => {
                    resultsManager.switchToResult(parseInt(resultId));
                }, SHORT_DELAY);
            }
        }
    }

    // ====================================
    // 停止状態管理機能は services/batch.service.js に移動済み
    // ====================================

    // ====================================
    // 共通関数
    // ====================================
    
    /**
     * ダッシュボードを更新する
     */
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
    // 初期化処理
    // ====================================
    
    /**
     * アプリケーションの初期化
     */
    async function init() {
        try {
            // BatchServiceを初期化（依存性注入）
            batchService = new BatchService({
                showToast: showToast,
                urlManager: urlManager,
                dashboard: dashboard,
                authService: authService,
                refreshDashboard: refreshDashboard
            });
            
            // BatchServiceのProgressMonitorにStorageServiceを設定
            if (batchService.progressMonitor) {
                batchService.progressMonitor.setStorageService(storageService);
            }

            await authService.initializeAuth();
            await urlManager.loadUrlList();
            await profileManager.loadProfiles();
            
            // 送信先リスト管理用プロフィール選択を更新
            await urlProfileManager.refreshProfiles();
            
            await resultsManager.loadResults();
            await settingsManager.loadAllSettings();
            await refreshDashboard();
            
            // バッチ処理の状態復元
            await batchService.checkAndRestoreSendingState();
            
            // 実行ボタンのイベントリスナー設定
            const executeFromUrlTabButton = getElement('executeFromUrlTab');
            if (executeFromUrlTabButton) {
                // 送信実行時のプロフィール選択バリデーション機能を統合
                const originalExecuteHandler = batchService.getExecuteButtonHandler();
                const enhancedExecuteHandler = () => {
                    // プロフィール選択のバリデーション
                    if (!urlProfileManager.validateSelectedProfile()) {
                        return; // バリデーション失敗時は実行を中止
                    }
                    // バリデーション成功時は元の実行処理を継続
                    originalExecuteHandler();
                };
                urlManager.setExecuteButtonToExecuteState(enhancedExecuteHandler);
            }
            
            setInitialTab();
        } catch (error) {
            showToast('初期化中にエラーが発生しました', 'error');
            console.error('Initialization error:', error);
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
            if (tabId) {
                switchToTab(tabId);
            }
        });
    });

    // URL管理のイベントリスナーは modules/url-manager.js で設定済み
    // executeFromUrlTabButton のイベントリスナーは初期化処理内で設定

    // プロフィール管理のイベントリスナーは modules/profile-manager.js で設定済み

    // 送信結果のイベントリスナーは modules/results-manager.js で設定済み

    // 設定のイベントリスナーは modules/settings-manager.js で設定済み

    // ダッシュボードのイベントリスナー（エラー修正: 適切な位置に配置）
    if (refreshDashboardButton) {
        refreshDashboardButton.addEventListener('click', async function() {
            await refreshDashboard();
            showToast('ダッシュボードを更新しました', 'info');
        });
    }

    // ====================================
    // ライセンス・認証管理機能は services/auth.service.js に移動済み
    // ====================================

    // ====================================
    // トースト通知
    // ====================================
    
    // showToast関数は上部で定義済み

    // ====================================
    // URL管理機能は modules/url-manager.js に移動済み
    // ====================================

    // ====================================
    // プロフィール管理機能は modules/profile-manager.js に移動済み
    // ====================================

    // ====================================
    // 送信結果管理機能は modules/results-manager.js に移動済み
    // ====================================

    // ====================================
    // 設定管理機能は modules/settings-manager.js に移動済み
    // ====================================

    // ====================================
    // ダッシュボード機能
    // ====================================
    
    // refreshDashboard関数は上部で定義済み

    // ====================================
    // 送信実行機能は services/batch.service.js に移動済み
    // ====================================

    // ====================================
    // 進捗監視機能は services/batch.service.js に移動済み
    // ====================================

});