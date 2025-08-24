/**
 * ストレージサービス
 * Chrome Storage API (local/sync) の統一的な操作を提供
 * 競合解消版: sendingInProgress関連メソッドを廃止し詳細状態管理システムに統一
 */

/**
 * ストレージタイプの定数
 */
export const STORAGE_TYPE = {
    LOCAL: 'local',
    SYNC: 'sync'
};

/**
 * ストレージサービスクラス
 */
export class StorageService {
    constructor(showToastFn = null) {
        this.showToastFunction = showToastFn;
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
     * ストレージインスタンスを取得
     * @param {string} storageType - ストレージタイプ (STORAGE_TYPE.LOCAL または STORAGE_TYPE.SYNC)
     * @returns {Object} Chrome Storage インスタンス
     */
    getStorageInstance(storageType) {
        switch (storageType) {
            case STORAGE_TYPE.LOCAL:
                return chrome.storage.local;
            case STORAGE_TYPE.SYNC:
                return chrome.storage.sync;
            default:
                throw new Error(`Invalid storage type: ${storageType}`);
        }
    }

    // ====================================
    // 基本操作
    // ====================================

    /**
     * 単一値を取得する
     * @param {string} key - キー
     * @param {string} storageType - ストレージタイプ
     * @param {*} defaultValue - デフォルト値
     * @returns {Promise<*>} 取得した値
     */
    async get(key, storageType = STORAGE_TYPE.LOCAL, defaultValue = null) {
        try {
            const storage = this.getStorageInstance(storageType);
            const result = await storage.get([key]);
            return result[key] !== undefined ? result[key] : defaultValue;
        } catch (error) {
            console.error(`Failed to get ${key} from ${storageType} storage:`, error);
            return defaultValue;
        }
    }

    /**
     * 単一値を設定する
     * @param {string} key - キー
     * @param {*} value - 値
     * @param {string} storageType - ストレージタイプ
     * @returns {Promise<boolean>} 設定成功時はtrue
     */
    async set(key, value, storageType = STORAGE_TYPE.LOCAL) {
        try {
            const storage = this.getStorageInstance(storageType);
            await storage.set({ [key]: value });
            return true;
        } catch (error) {
            console.error(`Failed to set ${key} in ${storageType} storage:`, error);
            return false;
        }
    }

    /**
     * 単一値を削除する
     * @param {string} key - キー
     * @param {string} storageType - ストレージタイプ
     * @returns {Promise<boolean>} 削除成功時はtrue
     */
    async remove(key, storageType = STORAGE_TYPE.LOCAL) {
        try {
            const storage = this.getStorageInstance(storageType);
            await storage.remove(key);
            return true;
        } catch (error) {
            console.error(`Failed to remove ${key} from ${storageType} storage:`, error);
            return false;
        }
    }

    // ====================================
    // 複数キー操作
    // ====================================

    /**
     * 複数の値を一括取得する
     * @param {Array<string>} keys - キー配列
     * @param {string} storageType - ストレージタイプ
     * @param {Object} defaultValues - デフォルト値のマッピング
     * @returns {Promise<Object>} 取得した値のマッピング
     */
    async getMultiple(keys, storageType = STORAGE_TYPE.LOCAL, defaultValues = {}) {
        try {
            const storage = this.getStorageInstance(storageType);
            const result = await storage.get(keys);
            
            // デフォルト値を適用
            const output = {};
            keys.forEach(key => {
                output[key] = result[key] !== undefined ? result[key] : (defaultValues[key] || null);
            });
            
            return output;
        } catch (error) {
            console.error(`Failed to get multiple keys from ${storageType} storage:`, error);
            
            // エラー時はデフォルト値を返す
            const output = {};
            keys.forEach(key => {
                output[key] = defaultValues[key] || null;
            });
            return output;
        }
    }

    /**
     * 複数の値を一括設定する
     * @param {Object} data - キーと値のマッピング
     * @param {string} storageType - ストレージタイプ
     * @returns {Promise<boolean>} 設定成功時はtrue
     */
    async setMultiple(data, storageType = STORAGE_TYPE.LOCAL) {
        try {
            const storage = this.getStorageInstance(storageType);
            await storage.set(data);
            return true;
        } catch (error) {
            console.error(`Failed to set multiple values in ${storageType} storage:`, error);
            return false;
        }
    }

    /**
     * 複数の値を一括削除する
     * @param {Array<string>} keys - キー配列
     * @param {string} storageType - ストレージタイプ
     * @returns {Promise<boolean>} 削除成功時はtrue
     */
    async removeMultiple(keys, storageType = STORAGE_TYPE.LOCAL) {
        try {
            const storage = this.getStorageInstance(storageType);
            await storage.remove(keys);
            return true;
        } catch (error) {
            console.error(`Failed to remove multiple keys from ${storageType} storage:`, error);
            return false;
        }
    }

    // ====================================
    // 高度な操作
    // ====================================

    /**
     * キーが存在するかチェックする
     * @param {string} key - キー
     * @param {string} storageType - ストレージタイプ
     * @returns {Promise<boolean>} キーが存在する場合はtrue
     */
    async has(key, storageType = STORAGE_TYPE.LOCAL) {
        try {
            const storage = this.getStorageInstance(storageType);
            const result = await storage.get([key]);
            return result[key] !== undefined;
        } catch (error) {
            console.error(`Failed to check key ${key} in ${storageType} storage:`, error);
            return false;
        }
    }

    /**
     * ストレージ内の全てのキーを取得する
     * @param {string} storageType - ストレージタイプ
     * @returns {Promise<Array<string>>} キー配列
     */
    async getAllKeys(storageType = STORAGE_TYPE.LOCAL) {
        try {
            const storage = this.getStorageInstance(storageType);
            const result = await storage.get(null); // null を渡すと全データを取得
            return Object.keys(result);
        } catch (error) {
            console.error(`Failed to get all keys from ${storageType} storage:`, error);
            return [];
        }
    }

    /**
     * ストレージ内の全てのデータを取得する
     * @param {string} storageType - ストレージタイプ
     * @returns {Promise<Object>} 全データのマッピング
     */
    async getAll(storageType = STORAGE_TYPE.LOCAL) {
        try {
            const storage = this.getStorageInstance(storageType);
            const result = await storage.get(null);
            return result;
        } catch (error) {
            console.error(`Failed to get all data from ${storageType} storage:`, error);
            return {};
        }
    }

    /**
     * ストレージをクリアする
     * @param {string} storageType - ストレージタイプ
     * @returns {Promise<boolean>} クリア成功時はtrue
     */
    async clear(storageType = STORAGE_TYPE.LOCAL) {
        try {
            const storage = this.getStorageInstance(storageType);
            await storage.clear();
            return true;
        } catch (error) {
            console.error(`Failed to clear ${storageType} storage:`, error);
            return false;
        }
    }

    // ====================================
    // 専用ユーティリティメソッド
    // ====================================

    /**
     * オブジェクトのプロパティを更新する
     * @param {string} key - キー
     * @param {Object} updates - 更新する値のマッピング
     * @param {string} storageType - ストレージタイプ
     * @returns {Promise<boolean>} 更新成功時はtrue
     */
    async updateObject(key, updates, storageType = STORAGE_TYPE.LOCAL) {
        try {
            const currentValue = await this.get(key, storageType, {});
            const updatedValue = { ...currentValue, ...updates };
            return await this.set(key, updatedValue, storageType);
        } catch (error) {
            console.error(`Failed to update object ${key} in ${storageType} storage:`, error);
            return false;
        }
    }

    /**
     * 配列に要素を追加する
     * @param {string} key - キー
     * @param {*} item - 追加する要素
     * @param {string} storageType - ストレージタイプ
     * @returns {Promise<boolean>} 追加成功時はtrue
     */
    async pushToArray(key, item, storageType = STORAGE_TYPE.LOCAL) {
        try {
            const currentArray = await this.get(key, storageType, []);
            const updatedArray = [...currentArray, item];
            return await this.set(key, updatedArray, storageType);
        } catch (error) {
            console.error(`Failed to push to array ${key} in ${storageType} storage:`, error);
            return false;
        }
    }

    /**
     * 配列から要素を削除する
     * @param {string} key - キー
     * @param {Function|*} predicate - 削除条件（関数または値）
     * @param {string} storageType - ストレージタイプ
     * @returns {Promise<boolean>} 削除成功時はtrue
     */
    async removeFromArray(key, predicate, storageType = STORAGE_TYPE.LOCAL) {
        try {
            const currentArray = await this.get(key, storageType, []);
            let updatedArray;
            
            if (typeof predicate === 'function') {
                updatedArray = currentArray.filter(item => !predicate(item));
            } else {
                updatedArray = currentArray.filter(item => item !== predicate);
            }
            
            return await this.set(key, updatedArray, storageType);
        } catch (error) {
            console.error(`Failed to remove from array ${key} in ${storageType} storage:`, error);
            return false;
        }
    }

    /**
     * 数値をインクリメントする
     * @param {string} key - キー
     * @param {number} increment - インクリメント値（デフォルト: 1）
     * @param {string} storageType - ストレージタイプ
     * @returns {Promise<number>} 更新後の値
     */
    async increment(key, increment = 1, storageType = STORAGE_TYPE.LOCAL) {
        try {
            const currentValue = await this.get(key, storageType, 0);
            const newValue = (typeof currentValue === 'number' ? currentValue : 0) + increment;
            await this.set(key, newValue, storageType);
            return newValue;
        } catch (error) {
            console.error(`Failed to increment ${key} in ${storageType} storage:`, error);
            return 0;
        }
    }

    /**
     * 条件付きで値を設定する（既存値がない場合のみ）
     * @param {string} key - キー
     * @param {*} value - 値
     * @param {string} storageType - ストレージタイプ
     * @returns {Promise<boolean>} 設定が実行された場合はtrue
     */
    async setIfNotExists(key, value, storageType = STORAGE_TYPE.LOCAL) {
        try {
            const exists = await this.has(key, storageType);
            if (!exists) {
                return await this.set(key, value, storageType);
            }
            return false; // 既に存在するため設定されなかった
        } catch (error) {
            console.error(`Failed to conditionally set ${key} in ${storageType} storage:`, error);
            return false;
        }
    }

    // ====================================
    // 便利メソッド（よく使用されるパターン）
    // ====================================

    /**
     * プロファイルデータを取得する（ProfileManager用）
     * @returns {Promise<Object>} プロファイルデータ
     */
    async getProfileData() {
        return await this.getMultiple(
            ['optionPatterns', 'selectedPattern'], 
            STORAGE_TYPE.LOCAL,
            { optionPatterns: [], selectedPattern: 'default' }
        );
    }

    /**
     * プロファイルデータを保存する（ProfileManager用）
     * @param {Array} patterns - プロファイルパターン
     * @param {string} selectedPattern - 選択されたパターン
     * @returns {Promise<boolean>} 保存成功時はtrue
     */
    async saveProfileData(patterns, selectedPattern) {
        return await this.setMultiple({
            optionPatterns: patterns,
            selectedPattern: selectedPattern
        }, STORAGE_TYPE.LOCAL);
    }

    /**
     * 設定データを取得する（SettingsManager用）
     * @param {Array<string>} keys - 取得するキー配列
     * @param {string} storageType - ストレージタイプ
     * @returns {Promise<Object>} 設定データ
     */
    async getSettings(keys, storageType = STORAGE_TYPE.SYNC) {
        return await this.getMultiple(keys, storageType);
    }

    /**
     * 設定データを保存する（SettingsManager用）
     * @param {Object} settings - 設定データ
     * @param {string} storageType - ストレージタイプ
     * @returns {Promise<boolean>} 保存成功時はtrue
     */
    async saveSettings(settings, storageType = STORAGE_TYPE.SYNC) {
        return await this.setMultiple(settings, storageType);
    }

    // ====================================
    // 状態管理関連メソッド（統一版）
    // 注意: sendingInProgress関連は廃止され、詳細状態管理システム(SENDING_STATE)に統一
    // ====================================

    /**
     * ライセンス状態を取得する（AuthService用）
     * @returns {Promise<boolean>} ライセンスが有効な場合はtrue
     */
    async getLicenseStatus() {
        return await this.get('validLicense', STORAGE_TYPE.SYNC, false);
    }

    /**
     * ライセンス状態を設定する（AuthService用）
     * @param {boolean} isValid - ライセンス有効性
     * @returns {Promise<boolean>} 設定成功時はtrue
     */
    async setLicenseStatus(isValid) {
        if (isValid) {
            return await this.set('validLicense', true, STORAGE_TYPE.SYNC);
        } else {
            return await this.remove('validLicense', STORAGE_TYPE.SYNC);
        }
    }

    /**
     * デバイスIDを取得する
     * @returns {Promise<string>} デバイスID
     */
    async getDeviceId() {
        return await this.get('deviceId', STORAGE_TYPE.LOCAL, null);
    }

    /**
     * デバイスIDを設定する
     * @param {string} deviceId - デバイスID
     * @returns {Promise<boolean>} 設定成功時はtrue
     */
    async setDeviceId(deviceId) {
        return await this.set('deviceId', deviceId, STORAGE_TYPE.LOCAL);
    }

    // ====================================
    // クリーンアップ
    // ====================================

    /**
     * サービスを破棄する（クリーンアップ）
     */
    destroy() {
        this.showToastFunction = null;
    }
}

/**
 * ストレージサービスインスタンスを作成
 * @param {Function} showToastFn - トースト表示関数
 * @returns {StorageService} ストレージサービスインスタンス
 */
export function createStorageService(showToastFn) {
    return new StorageService(showToastFn);
}