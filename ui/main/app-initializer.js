/**
 * アプリケーション初期化モジュール
 * メイン画面の各モジュール初期化と依存関係管理
 * 
 * このモジュールは各専門モジュールの初期化順序と依存関係を管理します
 */

// モジュールインポート（main.jsから移植）
import { ExDB } from '../../shared/database.js';
import { Dashboard } from '../../modules/dashboard.js';
import { ProfileManager } from '../../modules/profile-manager.js';
import { UrlManager } from '../../modules/url-manager.js';
import { ResultsManager } from '../../modules/results-manager.js';
import { SettingsManager, DEFAULT_EXCLUDE_DOMAINS } from '../../modules/settings-manager.js';
import { AuthService } from '../../services/auth.service.js';
import { BatchService } from '../../services/batch.service.js';
import { FormService } from '../../services/form.service.js';
import { StorageService } from '../../services/storage.service.js';
import { ProgressMonitor } from '../../modules/progress-monitor.js';

import { getElement } from '../common/dom-helper.js';
import { logError, showToast } from '../common/error-handler.js';
import { getDeviceId } from '../common/chrome-api-helper.js';

// ====================================
// モジュールインスタンス管理
// ====================================

let moduleInstances = {};

/**
 * モジュールインスタンスを取得する
 * @param {string} moduleName - モジュール名
 * @returns {Object|null} モジュールインスタンス
 */
export function getModuleInstance(moduleName) {
    return moduleInstances[moduleName] || null;
}

/**
 * 全てのモジュールインスタンスを取得する
 * @returns {Object} モジュールインスタンスのオブジェクト
 */
export function getAllModuleInstances() {
    return { ...moduleInstances };
}

// ====================================
// ユーティリティ関数
// ====================================

/**
 * デバイスIDを取得する（既存の共通モジュールを使用）
 * @returns {Promise<string>} デバイスID
 */
async function getDeviceIdForApp() {
    return await getDeviceId();
}

/**
 * ダッシュボードをリフレッシュする
 * @returns {Promise<void>}
 */
async function refreshDashboard() {
    try {
        const dashboard = getModuleInstance('dashboard');
        if (dashboard && typeof dashboard.refreshDashboard === 'function') {
            await dashboard.refreshDashboard();
        }
    } catch (error) {
        logError(error, 'refreshDashboard');
    }
}

// ====================================
// モジュール初期化
// ====================================

/**
 * 基本サービスを初期化する
 * @returns {Promise<Object>} 初期化されたサービス群
 */
async function initializeBasicServices() {
    try {
        // FormServiceの初期化
        const formService = new FormService(showToast);
        
        // StorageServiceの初期化  
        const storageService = new StorageService(showToast);
        
        // AuthServiceの初期化
        const authService = new AuthService(showToast, getElement);
        
        return {
            formService,
            storageService,
            authService
        };
    } catch (error) {
        logError(error, 'initializeBasicServices');
        throw new Error('基本サービスの初期化に失敗しました');
    }
}

/**
 * UIモジュールを初期化する
 * @param {Object} services - 基本サービス群
 * @returns {Promise<Object>} 初期化されたUIモジュール群
 */
async function initializeUIModules(services) {
    try {
        const { formService, storageService, authService } = services;
        
        // Dashboardの初期化
        const dashboard = new Dashboard(showToast);
        
        // ProfileManagerの初期化
        const profileManager = new ProfileManager(showToast, getElement, formService, storageService);
        
        // UrlManagerの初期化
        const urlManager = new UrlManager(showToast, getElement, refreshDashboard);
        
        // ResultsManagerの初期化
        const resultsManager = new ResultsManager(showToast, getElement);
        
        // SettingsManagerの初期化
        const settingsManager = new SettingsManager(showToast, getElement);
        
        return {
            dashboard,
            profileManager,
            urlManager,
            resultsManager,
            settingsManager
        };
    } catch (error) {
        logError(error, 'initializeUIModules');
        throw new Error('UIモジュールの初期化に失敗しました');
    }
}

/**
 * BatchServiceを初期化する
 * @param {Object} services - 基本サービス群
 * @param {Object} uiModules - UIモジュール群
 * @returns {Promise<Object>} 初期化されたBatchService
 */
async function initializeBatchService(services, uiModules) {
    try {
        const { storageService, authService } = services;
        const { dashboard, urlManager } = uiModules;
        
        // BatchServiceを初期化（依存性注入）
        const batchService = new BatchService({
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
        
        return batchService;
    } catch (error) {
        logError(error, 'initializeBatchService');
        throw new Error('BatchServiceの初期化に失敗しました');
    }
}

/**
 * イベントリスナーを設定する
 * @param {Object} allModules - 全モジュール
 */
function setupEventListeners(allModules) {
    try {
        const { batchService, urlManager } = allModules;
        
        // 実行ボタンのイベントリスナー設定
        const executeFromUrlTabButton = getElement('executeFromUrlTab', false);
        if (executeFromUrlTabButton && urlManager && batchService) {
            urlManager.setExecuteButtonToExecuteState(batchService.getExecuteButtonHandler());
        }
        
        // ダッシュボードリフレッシュボタン
        const refreshDashboardButton = getElement('refreshDashboard', false);
        if (refreshDashboardButton) {
            refreshDashboardButton.addEventListener('click', async function() {
                await refreshDashboard();
                showToast('ダッシュボードを更新しました', 'info');
            });
        }
        
    } catch (error) {
        logError(error, 'setupEventListeners');
    }
}

/**
 * データを読み込む
 * @param {Object} allModules - 全モジュール
 * @returns {Promise<void>}
 */
async function loadInitialData(allModules) {
    try {
        const { 
            authService, 
            urlManager, 
            profileManager, 
            resultsManager, 
            settingsManager,
            batchService
        } = allModules;
        
        // 各モジュールのデータ読み込み
        await authService.initializeAuth();
        await urlManager.loadUrlList();
        await profileManager.loadProfiles();
        await resultsManager.loadResults();
        await settingsManager.loadAllSettings();
        await refreshDashboard();
        
        // バッチ処理の状態復元
        await batchService.checkAndRestoreSendingState();
        
    } catch (error) {
        logError(error, 'loadInitialData');
        throw new Error('初期データの読み込みに失敗しました');
    }
}

// ====================================
// メイン初期化関数
// ====================================

/**
 * アプリケーションの初期化
 * @returns {Promise<Object>} 初期化されたモジュール群
 */
export async function initializeApplication() {
    try {
        showToast('アプリケーションを初期化中...', 'info');
        
        // 1. 基本サービスの初期化
        const services = await initializeBasicServices();
        
        // 2. UIモジュールの初期化
        const uiModules = await initializeUIModules(services);
        
        // 3. BatchServiceの初期化
        const batchService = await initializeBatchService(services, uiModules);
        
        // 4. 全モジュールをまとめる
        const allModules = {
            ...services,
            ...uiModules,
            batchService
        };
        
        // 5. モジュールインスタンスを保存
        moduleInstances = allModules;
        
        // 6. グローバルアクセス用（デバッグ・互換性）
        if (typeof window !== 'undefined') {
            window.appModules = allModules;
            // 個別モジュールもグローバルに露出（既存コードとの互換性）
            Object.assign(window, allModules);
        }
        
        // 7. イベントリスナーの設定
        setupEventListeners(allModules);
        
        // 8. 初期データの読み込み
        await loadInitialData(allModules);
        
        showToast('アプリケーションの初期化が完了しました', 'success');
        console.log('Application initialized successfully');
        
        return allModules;
        
    } catch (error) {
        logError(error, 'initializeApplication');
        showToast('アプリケーションの初期化に失敗しました', 'error');
        throw error;
    }
}

// ====================================
// ヘルパー関数
// ====================================

/**
 * 初期化済みのモジュールを安全に取得する
 * @param {string} moduleName - モジュール名
 * @param {string} methodName - メソッド名（オプション）
 * @returns {any} モジュールまたはメソッド
 */
export function getModuleSafely(moduleName, methodName = null) {
    try {
        const module = getModuleInstance(moduleName);
        if (!module) {
            console.warn(`Module '${moduleName}' not found or not initialized`);
            return null;
        }
        
        if (methodName) {
            if (typeof module[methodName] !== 'function') {
                console.warn(`Method '${methodName}' not found in module '${moduleName}'`);
                return null;
            }
            return module[methodName].bind(module);
        }
        
        return module;
    } catch (error) {
        logError(error, 'getModuleSafely');
        return null;
    }
}

/**
 * アプリケーションの状態をチェックする
 * @returns {Object} アプリケーション状態
 */
export function getApplicationStatus() {
    const requiredModules = [
        'formService',
        'storageService', 
        'authService',
        'dashboard',
        'profileManager',
        'urlManager',
        'resultsManager',
        'settingsManager',
        'batchService'
    ];
    
    const status = {
        initialized: true,
        modules: {},
        missingModules: []
    };
    
    requiredModules.forEach(moduleName => {
        const module = getModuleInstance(moduleName);
        status.modules[moduleName] = module !== null;
        
        if (!module) {
            status.initialized = false;
            status.missingModules.push(moduleName);
        }
    });
    
    return status;
}