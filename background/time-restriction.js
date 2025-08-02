/**
 * 時間制限モジュール
 * Service Worker環境での時間制限チェック機能を管理
 * 
 * このモジュールは設定された時間帯での実行制限をチェックします
 */

// ====================================
// 時間制限制御関数
// ====================================

/**
 * 時間制限がかかっているかチェックする
 * @returns {Promise<boolean>} 制限中の場合true
 */
async function isTimeRestricted() {
    try {
        const timeSettingsData = await chrome.storage.sync.get([
            'enableTimeRestriction',
            'restrictionStartTime',
            'restrictionEndTime',
            'restrictionWeekdays'
        ]);

        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        const currentDay = now.getDay();

        // 曜日制限のチェック
        const restrictedWeekdays = timeSettingsData.restrictionWeekdays || [];
        if (restrictedWeekdays.includes(currentDay)) {
            return true;
        }

        // 時間制限が無効の場合
        if (!timeSettingsData.enableTimeRestriction) {
            return false;
        }

        // 時間制限の設定取得
        const startTime = timeSettingsData.restrictionStartTime || '22:00';
        const endTime = timeSettingsData.restrictionEndTime || '08:00';

        const [startHour, startMinute] = startTime.split(':').map(Number);
        const [endHour, endMinute] = endTime.split(':').map(Number);

        const currentTimeInMinutes = currentHour * 60 + currentMinute;
        const startTimeInMinutes = startHour * 60 + startMinute;
        const endTimeInMinutes = endHour * 60 + endMinute;

        if (startTimeInMinutes < endTimeInMinutes) {
            // 同じ日内の制限（例：09:00-17:00）
            return currentTimeInMinutes >= startTimeInMinutes && currentTimeInMinutes <= endTimeInMinutes;
        } else {
            // 日をまたぐ制限（例：22:00-08:00）
            return currentTimeInMinutes >= startTimeInMinutes || currentTimeInMinutes <= endTimeInMinutes;
        }
    } catch (error) {
        console.warn('Time restriction check failed:', error);
        return false;
    }
}

/**
 * 現在の時間制限設定を取得する
 * @returns {Promise<Object>} 時間制限設定オブジェクト
 */
async function getTimeRestrictionSettings() {
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
            restrictedWeekdays: timeSettingsData.restrictionWeekdays || []
        };
    } catch (error) {
        console.warn('Failed to get time restriction settings:', error);
        return {
            enabled: false,
            startTime: '22:00',
            endTime: '08:00',
            restrictedWeekdays: []
        };
    }
}

/**
 * 現在時刻の詳細情報を取得する
 * @returns {Object} 現在時刻の詳細
 */
function getCurrentTimeInfo() {
    const now = new Date();
    return {
        hour: now.getHours(),
        minute: now.getMinutes(),
        day: now.getDay(),  // 0=日曜日, 1=月曜日, ...
        date: now.toISOString(),
        timeString: now.toLocaleTimeString('ja-JP'),
        dateString: now.toLocaleDateString('ja-JP')
    };
}

/**
 * 時間制限の詳細ステータスを取得する
 * @returns {Promise<Object>} 詳細ステータス
 */
async function getDetailedRestrictionStatus() {
    const settings = await getTimeRestrictionSettings();
    const timeInfo = getCurrentTimeInfo();
    const isRestricted = await isTimeRestricted();

    return {
        isRestricted,
        settings,
        currentTime: timeInfo,
        reasons: {
            weekdayRestricted: settings.restrictedWeekdays.includes(timeInfo.day),
            timeRestricted: settings.enabled && isRestricted && !settings.restrictedWeekdays.includes(timeInfo.day)
        }
    };
}

// ====================================
// Service Worker向けエクスポート
// ====================================

// Service Worker環境ではグローバルスコープに関数を配置
if (typeof globalThis !== 'undefined') {
    globalThis.TimeRestriction = {
        isTimeRestricted,
        getTimeRestrictionSettings,
        getCurrentTimeInfo,
        getDetailedRestrictionStatus
    };
}