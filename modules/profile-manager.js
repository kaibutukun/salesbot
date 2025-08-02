/**
 * プロファイル管理モジュール
 * ユーザープロファイルのCRUD操作、フォームデータの管理を担当
 */

/**
 * プロファイル管理クラス
 */
export class ProfileManager {
    constructor(showToastFn = null, getElementFn = null, formServiceInstance = null, storageServiceInstance = null) {
        this.showToastFunction = showToastFn;
        this.getElementFunction = getElementFn;
        this.formService = formServiceInstance;
        this.storageService = storageServiceInstance;
        this.elements = this.initializeElements();
        this.setupEventListeners();
    }

    /**
     * DOM要素を初期化
     * @returns {Object} DOM要素の参照オブジェクト
     */
    initializeElements() {
        return {
            profileSelect: this.getElement('profileSelect'),
            addNewProfileButton: this.getElement('addNewProfile'),
            deleteProfileButton: this.getElement('deleteProfile'),
            saveProfileButton: this.getElement('saveProfile')
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
        if (this.elements.addNewProfileButton) {
            this.elements.addNewProfileButton.addEventListener('click', () => this.createNewProfile());
        }
        if (this.elements.deleteProfileButton) {
            this.elements.deleteProfileButton.addEventListener('click', () => this.deleteSelectedProfile());
        }
        if (this.elements.saveProfileButton) {
            this.elements.saveProfileButton.addEventListener('click', () => this.saveCurrentProfile());
        }
        if (this.elements.profileSelect) {
            this.elements.profileSelect.addEventListener('change', () => this.loadSelectedProfile());
        }
    }

    /**
     * プロファイルフィールドのID一覧を取得
     * @returns {Array<string>} フィールドIDの配列
     */
    getProfileFieldIds() {
        return [
            'profileName', 'company', 'department', 'position', 'industry', 'memberCount',
            'url', 'email', 'sei', 'mei', 'seiKana', 'meiKana', 'seiHira', 'meiHira',
            'tel1', 'tel2', 'tel3', 'fax1', 'fax2', 'fax3', 'zip1', 'zip2',
            'address1', 'address2', 'address3', 'address4', 'subject', 'message'
        ];
    }

    /**
     * デフォルトプロファイルオブジェクトを作成
     * @param {string} id - プロファイルID
     * @param {string} title - プロファイルタイトル
     * @returns {Object} デフォルトプロファイルオブジェクト
     */
    createDefaultProfile(id = 'default', title = 'デフォルト') {
        return {
            id: id,
            title: title,
            company: '', department: '', position: '', industry: '', member: '',
            url: '', email: '', sei: '', mei: '', seiKana: '', meiKana: '',
            seiHira: '', meiHira: '', tel: '', fax: '', zip: '',
            address1: '', address2: '', address3: '', address4: '',
            subject: '', message: ''
        };
    }

    /**
     * 要素の値を設定するヘルパー関数
     * @param {string} id - 要素のID
     * @param {string} value - 設定する値
     */
    setElementValue(id, value) {
        if (this.formService) {
            return this.formService.setElementValue(id, value);
        }
        // Fallback to original implementation
        const element = this.getElement(id);
        if (element) {
            element.value = value || '';
        }
    }

    /**
     * 要素の値を取得するヘルパー関数
     * @param {string} id - 要素のID
     * @returns {string} 要素の値
     */
    getElementValue(id) {
        if (this.formService) {
            return this.formService.getElementValue(id);
        }
        // Fallback to original implementation
        const element = this.getElement(id);
        return element ? element.value : '';
    }

    /**
     * プロファイル一覧を読み込む
     */
    async loadProfiles() {
        try {
            if (!this.elements.profileSelect) return;

            const profileData = this.storageService 
                ? await this.storageService.getProfileData()
                : await chrome.storage.local.get(['optionPatterns', 'selectedPattern']);

            if (!profileData.optionPatterns || profileData.optionPatterns.length === 0) {
                // デフォルトプロファイルを作成
                const defaultProfile = this.createDefaultProfile();

                if (this.storageService) {
                    await this.storageService.saveProfileData([defaultProfile], 'default');
                } else {
                    await chrome.storage.local.set({
                        optionPatterns: [defaultProfile],
                        selectedPattern: 'default'
                    });
                }

                if (this.formService) {
                    this.formService.clearSelect('profileSelect');
                    this.formService.addOption('profileSelect', defaultProfile.id, defaultProfile.title, true);
                } else {
                    // Fallback implementation
                    this.elements.profileSelect.innerHTML = '';
                    const option = document.createElement('option');
                    option.value = defaultProfile.id;
                    option.textContent = defaultProfile.title;
                    this.elements.profileSelect.appendChild(option);
                }
                this.loadProfileData(defaultProfile);
            } else {
                if (this.formService) {
                    this.formService.clearSelect('profileSelect');
                    profileData.optionPatterns.forEach(profile => {
                        this.formService.addOption('profileSelect', profile.id, profile.title);
                    });
                } else {
                    // Fallback implementation
                    this.elements.profileSelect.innerHTML = '';
                    profileData.optionPatterns.forEach(profile => {
                        const option = document.createElement('option');
                        option.value = profile.id;
                        option.textContent = profile.title;
                        this.elements.profileSelect.appendChild(option);
                    });
                }

                if (profileData.selectedPattern) {
                    if (this.formService) {
                        this.formService.setSelectedValue('profileSelect', profileData.selectedPattern);
                    } else {
                        this.elements.profileSelect.value = profileData.selectedPattern;
                    }
                    const selectedProfile = profileData.optionPatterns.find(
                        profile => profile.id === profileData.selectedPattern
                    );
                    if (selectedProfile) {
                        this.loadProfileData(selectedProfile);
                    }
                }
            }
        } catch (error) {
            this.showToast('プロフィールの読み込みに失敗しました', 'error');
        }
    }

    /**
     * 選択されたプロフィールを読み込む
     */
    async loadSelectedProfile() {
        try {
            if (!this.elements.profileSelect) return;

            const selectedId = this.elements.profileSelect.value;
            const profileData = await chrome.storage.local.get(['optionPatterns']);

            if (profileData.optionPatterns) {
                const selectedProfile = profileData.optionPatterns.find(
                    profile => profile.id === selectedId
                );
                if (selectedProfile) {
                    this.loadProfileData(selectedProfile);
                    await chrome.storage.local.set({ selectedPattern: selectedId });
                }
            }
        } catch (error) {
            this.showToast('プロフィールの読み込みに失敗しました', 'error');
        }
    }

    /**
     * プロファイルデータをフォームに読み込む
     * @param {Object} profile - プロファイルオブジェクト
     */
    loadProfileData(profile) {
        // 全フィールドを初期化
        const fieldIds = this.getProfileFieldIds();
        fieldIds.forEach(id => this.setElementValue(id, ''));

        // プロファイルデータを設定
        if (profile.title) this.setElementValue('profileName', profile.title);
        if (profile.company) this.setElementValue('company', profile.company);
        if (profile.department) this.setElementValue('department', profile.department);
        if (profile.position) this.setElementValue('position', profile.position);
        if (profile.industry) this.setElementValue('industry', profile.industry);
        if (profile.member) this.setElementValue('memberCount', profile.member);
        if (profile.url) this.setElementValue('url', profile.url);
        if (profile.email) this.setElementValue('email', profile.email);
        if (profile.sei) this.setElementValue('sei', profile.sei);
        if (profile.mei) this.setElementValue('mei', profile.mei);
        if (profile.seiKana) this.setElementValue('seiKana', profile.seiKana);
        if (profile.meiKana) this.setElementValue('meiKana', profile.meiKana);
        if (profile.seiHira) this.setElementValue('seiHira', profile.seiHira);
        if (profile.meiHira) this.setElementValue('meiHira', profile.meiHira);
        if (profile.address1) this.setElementValue('address1', profile.address1);
        if (profile.address2) this.setElementValue('address2', profile.address2);
        if (profile.address3) this.setElementValue('address3', profile.address3);
        if (profile.address4) this.setElementValue('address4', profile.address4);
        if (profile.subject) this.setElementValue('subject', profile.subject);
        if (profile.message) this.setElementValue('message', profile.message);

        // 電話番号の分割
        if (profile.tel) {
            const telParts = profile.tel.match(/(\d{2,4})-?(\d{3,4})-?(\d{4})/);
            if (telParts) {
                this.setElementValue('tel1', telParts[1]);
                this.setElementValue('tel2', telParts[2]);
                this.setElementValue('tel3', telParts[3]);
            }
        }

        // FAX番号の分割
        if (profile.fax) {
            const faxParts = profile.fax.match(/(\d{2,4})-?(\d{3,4})-?(\d{4})/);
            if (faxParts) {
                this.setElementValue('fax1', faxParts[1]);
                this.setElementValue('fax2', faxParts[2]);
                this.setElementValue('fax3', faxParts[3]);
            }
        }

        // 郵便番号の分割
        if (profile.zip) {
            const zipParts = profile.zip.match(/(\d{3})-?(\d{4})/);
            if (zipParts) {
                this.setElementValue('zip1', zipParts[1]);
                this.setElementValue('zip2', zipParts[2]);
            }
        }

        // デフォルトプロフィールの削除ボタンは無効化
        if (this.elements.deleteProfileButton) {
            this.elements.deleteProfileButton.disabled = profile.id === 'default';
        }
    }

    /**
     * 新しいプロフィールを作成する
     */
    async createNewProfile() {
        try {
            const now = new Date();
            const id = `profile_${now.getTime()}`;
            const title = `新規プロフィール ${now.toLocaleString('ja-JP')}`;

            const newProfile = this.createDefaultProfile(id, title);

            const profileData = await chrome.storage.local.get(['optionPatterns']);
            let profiles = profileData.optionPatterns || [];
            profiles.push(newProfile);

            await chrome.storage.local.set({
                optionPatterns: profiles,
                selectedPattern: id
            });

            if (this.elements.profileSelect) {
                if (this.formService) {
                    this.formService.addOption('profileSelect', id, title, true);
                } else {
                    // Fallback implementation
                    const option = document.createElement('option');
                    option.value = id;
                    option.textContent = title;
                    this.elements.profileSelect.appendChild(option);
                    this.elements.profileSelect.value = id;
                }
            }

            this.loadProfileData(newProfile);
            this.showToast('新規プロフィールを作成しました', 'success');
        } catch (error) {
            this.showToast('プロフィールの作成に失敗しました', 'error');
        }
    }

    /**
     * 選択されたプロフィールを削除する
     */
    async deleteSelectedProfile() {
        try {
            if (!this.elements.profileSelect) return;

            const profileId = this.elements.profileSelect.value;
            if (!profileId) {
                this.showToast('プロフィールが選択されていません', 'warning');
                return;
            }

            if (profileId === 'default') {
                this.showToast('デフォルトプロフィールは削除できません', 'warning');
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

            await this.loadProfiles();
            this.showToast('プロフィールを削除しました', 'success');
        } catch (error) {
            this.showToast('プロフィールの削除に失敗しました', 'error');
        }
    }

    /**
     * 現在のプロフィールを保存する
     */
    async saveCurrentProfile() {
        try {
            if (!this.elements.profileSelect) {
                this.showToast('プロフィールが選択されていません', 'warning');
                return;
            }

            const profileId = this.elements.profileSelect.value;
            if (!profileId) {
                this.showToast('プロフィールが選択されていません', 'warning');
                return;
            }

            const profileData = await chrome.storage.local.get(['optionPatterns']);
            let profiles = profileData.optionPatterns || [];
            const index = profiles.findIndex(profile => profile.id === profileId);

            if (index === -1) {
                this.showToast('プロフィールが見つかりません', 'error');
                return;
            }

            // 電話番号の結合
            const tel1 = this.getElementValue('tel1');
            const tel2 = this.getElementValue('tel2');
            const tel3 = this.getElementValue('tel3');
            const tel = (tel1 && tel2 && tel3) ? `${tel1}-${tel2}-${tel3}` : '';

            // FAX番号の結合
            const fax1 = this.getElementValue('fax1');
            const fax2 = this.getElementValue('fax2');
            const fax3 = this.getElementValue('fax3');
            const fax = (fax1 && fax2 && fax3) ? `${fax1}-${fax2}-${fax3}` : '';

            // 郵便番号の結合
            const zip1 = this.getElementValue('zip1');
            const zip2 = this.getElementValue('zip2');
            const zip = (zip1 && zip2) ? `${zip1}-${zip2}` : '';

            const updatedProfile = {
                id: profileId,
                title: this.getElementValue('profileName'),
                company: this.getElementValue('company'),
                department: this.getElementValue('department'),
                position: this.getElementValue('position'),
                industry: this.getElementValue('industry'),
                member: this.getElementValue('memberCount'),
                url: this.getElementValue('url'),
                email: this.getElementValue('email'),
                sei: this.getElementValue('sei'),
                mei: this.getElementValue('mei'),
                seiKana: this.getElementValue('seiKana'),
                meiKana: this.getElementValue('meiKana'),
                seiHira: this.getElementValue('seiHira'),
                meiHira: this.getElementValue('meiHira'),
                tel: tel,
                fax: fax,
                zip: zip,
                address1: this.getElementValue('address1'),
                address2: this.getElementValue('address2'),
                address3: this.getElementValue('address3'),
                address4: this.getElementValue('address4'),
                subject: this.getElementValue('subject'),
                message: this.getElementValue('message')
            };

            profiles[index] = updatedProfile;
            await chrome.storage.local.set({ optionPatterns: profiles });

            // セレクトボックスのテキストを更新
            if (this.elements.profileSelect) {
                const option = this.elements.profileSelect.options[this.elements.profileSelect.selectedIndex];
                if (option) {
                    option.textContent = updatedProfile.title;
                }
            }

            this.showToast('プロフィールを保存しました', 'success');
        } catch (error) {
            this.showToast('プロフィールの保存に失敗しました', 'error');
        }
    }

    /**
     * 現在選択されているプロフィールを取得
     * @returns {Promise<Object|null>} 選択されているプロフィールオブジェクト
     */
    async getCurrentProfile() {
        try {
            if (!this.elements.profileSelect) return null;

            const profileId = this.elements.profileSelect.value;
            if (!profileId) return null;

            const profileData = await chrome.storage.local.get(['optionPatterns']);
            if (profileData.optionPatterns) {
                return profileData.optionPatterns.find(profile => profile.id === profileId) || null;
            }
            return null;
        } catch (error) {
            console.error('Current profile fetch failed:', error);
            return null;
        }
    }
}

/**
 * プロファイルマネージャーインスタンスを作成
 * @param {Function} showToastFn - トースト表示関数
 * @param {Function} getElementFn - 要素取得関数
 * @returns {ProfileManager} プロファイルマネージャーインスタンス
 */
export function createProfileManager(showToastFn, getElementFn) {
    return new ProfileManager(showToastFn, getElementFn);
}