/**
 * タブ管理モジュール
 * メイン画面のタブ切り替えとナビゲーション管理
 * 
 * このモジュールはタブUI制御とURL管理を行います
 */

import { getElement, setElementVisible, toggleElementClass } from '../common/dom-helper.js';
import { logError } from '../common/error-handler.js';

// ====================================
// タブ管理
// ====================================

/**
 * 指定されたタブに切り替える
 * @param {string} tabId - 切り替え先のタブID
 */
export function switchToTab(tabId) {
    try {
        // 全てのタブコンテンツを非表示
        const tabContents = document.querySelectorAll('.tab-content');
        tabContents.forEach(content => {
            toggleElementClass(content, 'active', false);
        });

        // 全てのナビゲーションアイテムを非アクティブ
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(item => {
            toggleElementClass(item, 'active', false);
        });

        // 指定されたタブコンテンツを表示
        const targetTabContent = getElement(tabId, false);
        if (targetTabContent) {
            toggleElementClass(targetTabContent, 'active', true);
        }

        // 対応するナビゲーションアイテムをアクティブ
        const targetNavItem = document.querySelector(`[data-tab="${tabId}"]`);
        if (targetNavItem) {
            toggleElementClass(targetNavItem, 'active', true);
        }

        // URLのハッシュを更新（ブラウザの戻る/進むボタン対応）
        if (window.location.hash !== `#${tabId}`) {
            window.history.pushState({ tabId }, '', `#${tabId}`);
        }

        // タブ切り替え時の追加処理
        handleTabSwitch(tabId);

    } catch (error) {
        logError(error, 'switchToTab');
    }
}

/**
 * タブ切り替え時の追加処理
 * @param {string} tabId - 切り替えたタブID
 */
function handleTabSwitch(tabId) {
    try {
        // 各タブに特化した処理
        switch (tabId) {
            case 'dashboard':
                // ダッシュボードタブの処理
                handleDashboardTabSwitch();
                break;
            case 'url-management':
                // URL管理タブの処理
                handleUrlManagementTabSwitch();
                break;
            case 'profile-management':
                // プロフィール管理タブの処理
                handleProfileManagementTabSwitch();
                break;
            case 'results-management':
                // 結果管理タブの処理
                handleResultsManagementTabSwitch();
                break;
            case 'settings':
                // 設定タブの処理
                handleSettingsTabSwitch();
                break;
            default:
                // 未知のタブの場合は何もしない
                break;
        }
    } catch (error) {
        logError(error, 'handleTabSwitch');
    }
}

/**
 * ダッシュボードタブ切り替え時の処理
 */
function handleDashboardTabSwitch() {
    // ダッシュボードデータの更新が必要な場合はここで実行
    // 例: dashboard.refreshDashboard();
}

/**
 * URL管理タブ切り替え時の処理
 */
function handleUrlManagementTabSwitch() {
    // URL一覧の再読み込みが必要な場合はここで実行
    // 例: urlManager.loadUrlList();
}

/**
 * プロフィール管理タブ切り替え時の処理
 */
function handleProfileManagementTabSwitch() {
    // プロフィール一覧の再読み込みが必要な場合はここで実行
    // 例: profileManager.loadProfiles();
}

/**
 * 結果管理タブ切り替え時の処理
 */
function handleResultsManagementTabSwitch() {
    // 結果一覧の再読み込みが必要な場合はここで実行
    // 例: resultsManager.loadResults();
}

/**
 * 設定タブ切り替え時の処理
 */
function handleSettingsTabSwitch() {
    // 設定値の再読み込みが必要な場合はここで実行
    // 例: settingsManager.loadAllSettings();
}

// ====================================
// 初期タブ設定
// ====================================

/**
 * URLパラメータに基づいて初期タブを設定する
 */
export function setInitialTab() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const hash = window.location.hash.substring(1);
        
        // URLパラメータ'tab'またはハッシュからタブIDを取得
        let initialTab = urlParams.get('tab') || hash || 'dashboard';
        
        // 特定の結果IDが指定されている場合
        const resultId = urlParams.get('id');
        if (resultId && initialTab === 'results') {
            initialTab = 'results-management';
        }
        
        // 有効なタブIDかチェック
        const validTabs = [
            'dashboard',
            'url-management', 
            'profile-management',
            'results-management',
            'settings'
        ];
        
        if (!validTabs.includes(initialTab)) {
            initialTab = 'dashboard';
        }
        
        // タブを切り替え
        switchToTab(initialTab);
        
        // 結果管理タブで特定の結果を表示する場合
        if (initialTab === 'results-management' && resultId) {
            handleSpecificResult(resultId);
        }
        
    } catch (error) {
        logError(error, 'setInitialTab');
        // エラーが発生した場合はダッシュボードを表示
        switchToTab('dashboard');
    }
}

/**
 * 特定の結果を表示する
 * @param {string} resultId - 結果ID
 */
function handleSpecificResult(resultId) {
    try {
        // 結果管理モジュールに結果の表示を依頼
        // この処理は結果管理モジュールが読み込まれた後に実行される必要がある
        setTimeout(() => {
            if (window.resultsManager && typeof window.resultsManager.switchToResult === 'function') {
                window.resultsManager.switchToResult(resultId);
            }
        }, 100);
    } catch (error) {
        logError(error, 'handleSpecificResult');
    }
}

// ====================================
// ブラウザ履歴管理
// ====================================

/**
 * ブラウザの戻る/進むボタンに対応したイベントリスナーを設定
 */
export function setupBrowserHistoryHandler() {
    window.addEventListener('popstate', (event) => {
        try {
            const tabId = event.state?.tabId || window.location.hash.substring(1) || 'dashboard';
            switchToTab(tabId);
        } catch (error) {
            logError(error, 'popstate handler');
        }
    });
}

// ====================================
// ナビゲーションイベント設定
// ====================================

/**
 * ナビゲーションアイテムのイベントリスナーを設定
 */
export function setupNavigationEventListeners() {
    try {
        const navItems = document.querySelectorAll('.nav-item');
        
        navItems.forEach(item => {
            item.addEventListener('click', function(event) {
                event.preventDefault();
                const tabId = this.getAttribute('data-tab');
                if (tabId) {
                    switchToTab(tabId);
                }
            });
        });
        
    } catch (error) {
        logError(error, 'setupNavigationEventListeners');
    }
}

// ====================================
// ユーティリティ
// ====================================

/**
 * 現在アクティブなタブIDを取得する
 * @returns {string|null} アクティブなタブID
 */
export function getCurrentActiveTab() {
    try {
        const activeNavItem = document.querySelector('.nav-item.active');
        return activeNavItem ? activeNavItem.getAttribute('data-tab') : null;
    } catch (error) {
        logError(error, 'getCurrentActiveTab');
        return null;
    }
}

/**
 * 指定したタブが存在するかチェックする
 * @param {string} tabId - チェックするタブID
 * @returns {boolean} タブが存在するかどうか
 */
export function isValidTab(tabId) {
    const tabElement = getElement(tabId, false);
    const navElement = document.querySelector(`[data-tab="${tabId}"]`);
    return tabElement !== null && navElement !== null;
}

/**
 * タブマネージャーを初期化する
 */
export function initializeTabManager() {
    try {
        setupNavigationEventListeners();
        setupBrowserHistoryHandler();
        setInitialTab();
    } catch (error) {
        logError(error, 'initializeTabManager');
    }
}