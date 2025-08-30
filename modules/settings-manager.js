/**
 * 設定管理モジュール
 * 一般設定、除外ドメイン設定、時間制限設定の管理を担当
 */

/**
 * デフォルト除外ドメイン設定
 */
export const DEFAULT_EXCLUDE_DOMAINS = [
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

/**
 * 設定管理クラス
 */
export class SettingsManager {
    constructor(showToastFn = null, getElementFn = null) {
        this.showToastFunction = showToastFn;
        this.getElementFunction = getElementFn;
        this.elements = this.initializeElements();
        this.setupEventListeners();
    }

    /**
     * DOM要素を初期化
     * @returns {Object} DOM要素の参照オブジェクト
     */
    initializeElements() {
        return {
            // 一般設定
            preventDuplicateSend: this.getElement('preventDuplicateSend'),
            saveGeneralSettingsButton: this.getElement('saveGeneralSettings'),

            // 除外ドメイン設定
            excludeDomainsTextarea: this.getElement('excludeDomains'),
            saveExcludeDomainsButton: this.getElement('saveExcludeDomains'),
            resetExcludeDomainsButton: this.getElement('resetExcludeDomains'),

            // 時間制限設定
            enableTimeRestriction: this.getElement('enableTimeRestriction'),
            timeRestrictionSettings: this.getElement('timeRestrictionSettings'),
            restrictionStartTime: this.getElement('restrictionStartTime'),
            restrictionEndTime: this.getElement('restrictionEndTime'),
            weekdayCheckboxes: document.querySelectorAll('.weekday-checkbox'),
            saveTimeSettingsButton: this.getElement('saveTimeSettings'),
            saveWeekdaySettingsButton: this.getElement('saveWeekdaySettings')
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
     * イベントリスナーを設定
     */
    setupEventListeners() {
        // 一般設定
        if (this.elements.saveGeneralSettingsButton) {
            this.elements.saveGeneralSettingsButton.addEventListener('click', () => this.saveGeneralSettings());
        }

        // 除外ドメイン設定
        if (this.elements.saveExcludeDomainsButton) {
            this.elements.saveExcludeDomainsButton.addEventListener('click', () => this.saveExcludeDomains());
        }
        if (this.elements.resetExcludeDomainsButton) {
            this.elements.resetExcludeDomainsButton.addEventListener('click', () => this.resetExcludeDomains());
        }

        // 時間制限設定
        if (this.elements.enableTimeRestriction) {
            this.elements.enableTimeRestriction.addEventListener('change', () => this.toggleTimeRestrictionDisplay());
        }
        if (this.elements.saveTimeSettingsButton) {
            this.elements.saveTimeSettingsButton.addEventListener('click', () => this.saveTimeSettings());
        }
        if (this.elements.saveWeekdaySettingsButton) {
            this.elements.saveWeekdaySettingsButton.addEventListener('click', () => this.saveWeekdaySettings());
        }
    }

    /**
     * 時間制限設定の表示切り替え
     */
    toggleTimeRestrictionDisplay() {
        if (this.elements.timeRestrictionSettings && this.elements.enableTimeRestriction) {
            this.elements.timeRestrictionSettings.style.display = 
                this.elements.enableTimeRestriction.checked ? 'block' : 'none';
        }
    }

    /**
     * 一般設定を読み込む（デフォルト値をtrueに変更）
     */
    async loadSettings() {
        try {
            const settingsData = await chrome.storage.sync.get(['DoNotDuplicateSend']);
            if (this.elements.preventDuplicateSend) {
                this.elements.preventDuplicateSend.checked = settingsData.DoNotDuplicateSend !== undefined 
                    ? settingsData.DoNotDuplicateSend 
                    : true; // デフォルト値をtrueに変更
            }
        } catch (error) {
            this.showToast('設定の読み込みに失敗しました', 'error');
        }
    }

    /**
     * 時間制限設定を読み込む
     */
    async loadTimeSettings() {
        try {
            const timeSettingsData = await chrome.storage.sync.get([
                'enableTimeRestriction',
                'restrictionStartTime',
                'restrictionEndTime',
                'restrictionWeekdays'
            ]);

            if (this.elements.enableTimeRestriction) {
                this.elements.enableTimeRestriction.checked = timeSettingsData.enableTimeRestriction || false;
            }

            this.toggleTimeRestrictionDisplay();

            if (this.elements.restrictionStartTime) {
                this.elements.restrictionStartTime.value = timeSettingsData.restrictionStartTime || '22:00';
            }

            if (this.elements.restrictionEndTime) {
                this.elements.restrictionEndTime.value = timeSettingsData.restrictionEndTime || '08:00';
            }

            const weekdays = timeSettingsData.restrictionWeekdays || [0, 6];
            this.elements.weekdayCheckboxes.forEach((checkbox, index) => {
                if (checkbox) {
                    checkbox.checked = weekdays.includes(index);
                }
            });
        } catch (error) {
            this.showToast('時間設定の読み込みに失敗しました', 'error');
        }
    }

    /**
     * 除外ドメインを読み込む
     */
    async loadExcludeDomains() {
        try {
            if (!this.elements.excludeDomainsTextarea) return;

            const excludeData = await chrome.storage.local.get(['excludeDomain']);
            if (excludeData.excludeDomain) {
                this.elements.excludeDomainsTextarea.value = excludeData.excludeDomain.join('\n');
            } else {
                this.elements.excludeDomainsTextarea.value = DEFAULT_EXCLUDE_DOMAINS.join('\n');
                await chrome.storage.local.set({ excludeDomain: DEFAULT_EXCLUDE_DOMAINS });
            }
        } catch (error) {
            this.showToast('除外ドメインの読み込みに失敗しました', 'error');
        }
    }

    /**
     * 一般設定を保存する
     */
    async saveGeneralSettings() {
        try {
            const settings = {};
            if (this.elements.preventDuplicateSend) {
                settings.DoNotDuplicateSend = this.elements.preventDuplicateSend.checked;
            }

            await chrome.storage.sync.set(settings);
            this.showToast('設定を保存しました', 'success');
        } catch (error) {
            this.showToast('設定の保存に失敗しました', 'error');
        }
    }

    /**
     * 時間制限設定を保存する
     */
    async saveTimeSettings() {
        try {
            const settings = {};

            if (this.elements.enableTimeRestriction) {
                settings.enableTimeRestriction = this.elements.enableTimeRestriction.checked;
            }
            if (this.elements.restrictionStartTime) {
                settings.restrictionStartTime = this.elements.restrictionStartTime.value;
            }
            if (this.elements.restrictionEndTime) {
                settings.restrictionEndTime = this.elements.restrictionEndTime.value;
            }

            await chrome.storage.sync.set(settings);
            this.showToast('時間制限設定を保存しました', 'success');
        } catch (error) {
            this.showToast('時間制限設定の保存に失敗しました', 'error');
        }
    }

    /**
     * 曜日制限設定を保存する
     */
    async saveWeekdaySettings() {
        try {
            const selectedWeekdays = [];
            this.elements.weekdayCheckboxes.forEach((checkbox, index) => {
                if (checkbox && checkbox.checked) {
                    selectedWeekdays.push(index);
                }
            });

            await chrome.storage.sync.set({ restrictionWeekdays: selectedWeekdays });
            this.showToast('曜日制限設定を保存しました', 'success');
        } catch (error) {
            this.showToast('曜日制限設定の保存に失敗しました', 'error');
        }
    }

    /**
     * 除外ドメインを保存する
     */
    async saveExcludeDomains() {
        try {
            if (!this.elements.excludeDomainsTextarea) return;

            const domains = this.elements.excludeDomainsTextarea.value.trim().split('\n').filter(domain => domain.trim() !== '');
            await chrome.storage.local.set({ excludeDomain: domains });
            this.showToast('除外ドメインを保存しました', 'success');
        } catch (error) {
            this.showToast('除外ドメインの保存に失敗しました', 'error');
        }
    }

    /**
     * 除外ドメインをデフォルト設定にリセットする
     */
    async resetExcludeDomains() {
        try {
            if (!this.elements.excludeDomainsTextarea) return;

            if (!confirm('除外ドメインをデフォルト設定に戻しますか？')) {
                return;
            }

            this.elements.excludeDomainsTextarea.value = DEFAULT_EXCLUDE_DOMAINS.join('\n');
            await chrome.storage.local.set({ excludeDomain: DEFAULT_EXCLUDE_DOMAINS });
            this.showToast('除外ドメインをデフォルト設定に戻しました', 'success');
        } catch (error) {
            this.showToast('除外ドメインのリセットに失敗しました', 'error');
        }
    }

    /**
     * 全ての設定を読み込む
     */
    async loadAllSettings() {
        await Promise.all([
            this.loadSettings(),
            this.loadTimeSettings(),
            this.loadExcludeDomains()
        ]);
    }

    /**
     * 除外ドメインリストを取得する
     * @returns {Promise<Array<string>>} 除外ドメインの配列
     */
    async getExcludeDomains() {
        try {
            const excludeData = await chrome.storage.local.get(['excludeDomain']);
            return excludeData.excludeDomain || DEFAULT_EXCLUDE_DOMAINS;
        } catch (error) {
            console.error('Failed to get exclude domains:', error);
            return DEFAULT_EXCLUDE_DOMAINS;
        }
    }

    /**
     * 重複送信防止設定を取得する（デフォルト値をtrueに変更）
     * @returns {Promise<boolean>} 重複送信防止が有効かどうか
     */
    async getPreventDuplicateSend() {
        try {
            const settingsData = await chrome.storage.sync.get(['DoNotDuplicateSend']);
            return settingsData.DoNotDuplicateSend !== undefined 
                ? settingsData.DoNotDuplicateSend 
                : true; // デフォルト値をtrueに変更
        } catch (error) {
            console.error('Failed to get prevent duplicate send setting:', error);
            return true; // エラー時もtrueを返す
        }
    }

    /**
     * 時間制限設定を取得する
     * @returns {Promise<Object>} 時間制限設定オブジェクト
     */
    async getTimeRestrictionSettings() {
        try {
            const timeSettingsData = await chrome.storage.sync.get([
                'enableTimeRestriction',
                'restrictionStartTime',
                'restrictionEndTime',
                'restrictionWeekdays'
            ]);

            return {
                enabled: timeSettingsData.enableTimeRestriction || false,
                startTime: timeSettingsData.restrictionStartTime || '22:00',
                endTime: timeSettingsData.restrictionEndTime || '08:00',
                weekdays: timeSettingsData.restrictionWeekdays || [0, 6]
            };
        } catch (error) {
            console.error('Failed to get time restriction settings:', error);
            return {
                enabled: false,
                startTime: '22:00',
                endTime: '08:00',
                weekdays: [0, 6]
            };
        }
    }
}

/**
 * 設定マネージャーインスタンスを作成
 * @param {Function} showToastFn - トースト表示関数
 * @param {Function} getElementFn - 要素取得関数
 * @returns {SettingsManager} 設定マネージャーインスタンス
 */
export function createSettingsManager(showToastFn, getElementFn) {
    return new SettingsManager(showToastFn, getElementFn);
}