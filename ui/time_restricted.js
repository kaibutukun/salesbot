document.addEventListener('DOMContentLoaded', function() {
    
    // ====================================
    // DOM要素の取得
    // ====================================
    
    const restrictionTimeSpan = document.getElementById('restrictionTime');
    const restrictionDaysSpan = document.getElementById('restrictionDays');
    const currentTimeSpan = document.getElementById('currentTime');
    
    // 曜日名の配列
    const weekdayNames = ['日', '月', '火', '水', '木', '金', '土'];

    // ====================================
    // 現在時刻更新機能
    // ====================================
    
    /**
     * 現在時刻を更新して表示する
     */
    function updateCurrentTime() {
        const now = new Date();
        currentTimeSpan.textContent = now.toLocaleTimeString('ja-JP');
    }

    // ====================================
    // 制限状況チェック機能
    // ====================================
    
    /**
     * 現在の制限状況をチェックする
     * @returns {Promise<Object>} 制限状況オブジェクト
     */
    async function checkCurrentRestriction() {
        try {
            const timeSettingsData = await chrome.storage.sync.get([
                'enableTimeRestriction',
                'restrictionStartTime',
                'restrictionEndTime',
                'restrictionWeekdays'
            ]);

            // 時間制限が無効の場合
            if (!timeSettingsData.enableTimeRestriction) {
                return {
                    timeRestricted: false,
                    dayRestricted: false
                };
            }

            const now = new Date();
            const currentHour = now.getHours();
            const currentMinute = now.getMinutes();
            const currentDay = now.getDay();

            // 曜日制限のチェック
            const restrictedWeekdays = timeSettingsData.restrictionWeekdays || [];
            const dayRestricted = restrictedWeekdays.includes(currentDay);

            // 時間制限のチェック
            const startTime = timeSettingsData.restrictionStartTime || '22:00';
            const endTime = timeSettingsData.restrictionEndTime || '08:00';

            const [startHour, startMinute] = startTime.split(':').map(Number);
            const [endHour, endMinute] = endTime.split(':').map(Number);

            const currentTimeInMinutes = currentHour * 60 + currentMinute;
            const startTimeInMinutes = startHour * 60 + startMinute;
            const endTimeInMinutes = endHour * 60 + endMinute;

            let timeRestricted = false;

            if (startTimeInMinutes < endTimeInMinutes) {
                // 同じ日内の制限（例：09:00-17:00）
                timeRestricted = currentTimeInMinutes >= startTimeInMinutes && 
                               currentTimeInMinutes <= endTimeInMinutes;
            } else {
                // 日をまたぐ制限（例：22:00-08:00）
                timeRestricted = currentTimeInMinutes >= startTimeInMinutes || 
                               currentTimeInMinutes <= endTimeInMinutes;
            }

            return {
                timeRestricted,
                dayRestricted
            };

        } catch (error) {
            return {
                timeRestricted: false,
                dayRestricted: false
            };
        }
    }

    // ====================================
    // 時間設定読み込み・表示機能
    // ====================================
    
    /**
     * 時間設定を読み込んで表示する
     */
    async function loadTimeSettings() {
        try {
            const timeSettingsData = await chrome.storage.sync.get([
                'restrictionStartTime',
                'restrictionEndTime',
                'restrictionWeekdays'
            ]);

            // 時間制限の表示
            const startTime = timeSettingsData.restrictionStartTime || '22:00';
            const endTime = timeSettingsData.restrictionEndTime || '08:00';
            restrictionTimeSpan.textContent = `${startTime} 〜 ${endTime}（毎日）`;

            // 曜日制限の表示
            const weekdays = timeSettingsData.restrictionWeekdays || [];
            if (weekdays.length === 0) {
                restrictionDaysSpan.textContent = '設定なし';
            } else {
                const weekdayText = weekdays.map(day => weekdayNames[day]).join('・');
                restrictionDaysSpan.textContent = `${weekdayText}曜日（終日）`;
            }

            // 現在の制限状況を取得して表示を調整
            const restriction = await checkCurrentRestriction();
            const titleElement = document.querySelector('.done-title');
            const descriptionElement = document.querySelector('.done-description');

            if (restriction.dayRestricted && restriction.timeRestricted) {
                // 曜日制限と時間制限の両方
                titleElement.textContent = '送信制限中（曜日・時間制限）';
                descriptionElement.innerHTML = '現在の曜日は終日送信が制限されており、<br>さらに時間制限の対象時間帯でもあります。';
            } else if (restriction.dayRestricted) {
                // 曜日制限のみ
                titleElement.textContent = '送信制限中（曜日制限）';
                descriptionElement.innerHTML = '現在の曜日は終日送信が制限されています。<br>制限曜日外に再度お試しください。';
            } else if (restriction.timeRestricted) {
                // 時間制限のみ
                titleElement.textContent = '送信制限中（時間制限）';
                descriptionElement.innerHTML = '現在の時間帯は送信が制限されています。<br>制限時間外に再度お試しください。';
            }

        } catch (error) {
            restrictionTimeSpan.textContent = '読み込みエラー';
            restrictionDaysSpan.textContent = '読み込みエラー';
        }
    }

    // ====================================
    // 初期化処理
    // ====================================
    
    // 時間設定を読み込み
    loadTimeSettings();
    
    // 現在時刻を更新
    updateCurrentTime();
    
    // 1秒間隔で現在時刻を更新
    setInterval(updateCurrentTime, 1000);

    // ====================================
    // イベントリスナーの設定
    // ====================================
    
    /**
     * トップに戻るボタンのイベントリスナー
     */
    document.getElementById('backToMain').addEventListener('click', function() {
        chrome.tabs.update({ url: 'main.html' });
    });

    /**
     * 設定を変更するボタンのイベントリスナー
     */
    document.getElementById('changeSettings').addEventListener('click', function() {
        chrome.tabs.update({ url: 'main.html?tab=settings' });
    });

});