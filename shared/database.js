/**
 * ExDBクラス - IndexedDBを使用したTodo管理データベース
 * 自動お問い合わせ送信ツールのデータ永続化を担当
 * 
 * Chrome拡張機能全体で統一使用するためのESモジュール対応版
 */
export class ExDB {
    constructor() {
        this.dbName = "TodoDatabase"; // background.jsと統一
        this.dbVersion = 1;
        this.storeName = "todos";
    }

    /**
     * データベースを開く
     * @returns {Promise<IDBDatabase>} データベースインスタンス
     */
    async openDB() {
        return new Promise((resolve, reject) => {
            let request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = event => {
                console.error("DBオープンエラー: " + event.target.error);
                reject("DBオープンエラー: " + event.target.error);
            };

            request.onupgradeneeded = event => {
                let database = event.target.result;
                console.log('Database upgrade needed, creating object store');
                
                let objectStore = database.createObjectStore(this.storeName, {
                    keyPath: "id",
                    autoIncrement: true
                });
                objectStore.createIndex("created", "created", { unique: false });
                console.log('Created todos object store with indexes');
            };

            request.onsuccess = event => {
                console.log('Database opened successfully:', this.dbName);
                resolve(event.target.result);
            };
        });
    }

    /**
     * 新しいTodoを追加する
     * @param {string} title - Todoのタイトル
     * @param {Array} description - Todoの詳細情報（URLリストなど）
     * @returns {Promise<number>} 追加されたTodoのID
     */
    async addTodo(title, description) {
        let database = await this.openDB();
        
        return new Promise((resolve, reject) => {
            let transaction = database.transaction([this.storeName], "readwrite");
            let objectStore = transaction.objectStore(this.storeName);
            
            let todoData = {
                title: title,
                description: description,
                created: new Date(),
                completed: false
            };
            
            let addRequest = objectStore.add(todoData);
            
            addRequest.onsuccess = () => {
                console.log('Todo added successfully with ID:', addRequest.result);
                resolve(addRequest.result);
            };
            
            addRequest.onerror = event => {
                console.error("データの追加に失敗しました: " + event.target.error);
                reject("データの追加に失敗しました: " + event.target.error);
            };
        });
    }

    /**
     * 全てのTodoを取得する
     * @returns {Promise<Array>} Todoオブジェクトの配列
     */
    async getAllTodos() {
        let database = await this.openDB();
        
        return new Promise((resolve, reject) => {
            let transaction = database.transaction([this.storeName], "readonly");
            let objectStore = transaction.objectStore(this.storeName);
            let getAllRequest = objectStore.getAll();
            
            getAllRequest.onsuccess = () => {
                console.log('Got all todos, count:', getAllRequest.result.length);
                resolve(getAllRequest.result);
            };
            
            getAllRequest.onerror = event => {
                console.error("データの取得に失敗しました: " + event.target.error);
                reject("データの取得に失敗しました: " + event.target.error);
            };
        });
    }

    /**
     * 指定されたIDのTodoを取得する
     * @param {number} todoId - TodoのID
     * @returns {Promise<Object|undefined>} Todoオブジェクト
     */
    async getTodoById(todoId) {
        let database = await this.openDB();
        
        return new Promise((resolve, reject) => {
            let transaction = database.transaction([this.storeName], "readonly");
            let objectStore = transaction.objectStore(this.storeName);
            let getRequest = objectStore.get(todoId);
            
            getRequest.onsuccess = () => {
                console.log('Got todo by ID:', todoId, getRequest.result ? 'found' : 'not found');
                resolve(getRequest.result);
            };
            
            getRequest.onerror = event => {
                console.error("データの取得に失敗しました: " + event.target.error);
                reject("データの取得に失敗しました: " + event.target.error);
            };
        });
    }

    /**
     * 最新のTodoを取得する（作成日時順で最後のもの）
     * @returns {Promise<Object|null>} 最新のTodoオブジェクト
     */
    async getLatestTodo() {
        let database = await this.openDB();
        
        return new Promise((resolve, reject) => {
            let transaction = database.transaction([this.storeName], "readonly");
            let objectStore = transaction.objectStore(this.storeName);
            let createdIndex = objectStore.index("created");
            let cursorRequest = createdIndex.openCursor(null, "prev");
            
            cursorRequest.onsuccess = event => {
                let cursor = event.target.result;
                if (cursor) {
                    console.log('Got latest todo:', cursor.value.id);
                    resolve(cursor.value);
                } else {
                    console.log('No todos found in database');
                    resolve(null);
                }
            };
            
            cursorRequest.onerror = event => {
                console.error("データ取得エラー: " + event.target.error);
                reject("データ取得エラー: " + event.target.error);
            };
        });
    }

    /**
     * 指定されたIDのTodoを更新する
     * @param {number} todoId - TodoのID
     * @param {Object} updateData - 更新するデータ
     * @returns {Promise<number>} 更新されたTodoのID
     */
    async updateTodo(todoId, updateData) {
        let database = await this.openDB();
        
        return new Promise((resolve, reject) => {
            let transaction = database.transaction([this.storeName], "readwrite");
            let objectStore = transaction.objectStore(this.storeName);
            let getRequest = objectStore.get(todoId);
            
            getRequest.onsuccess = () => {
                let updatedTodo = { ...getRequest.result, ...updateData };
                let putRequest = objectStore.put(updatedTodo);
                
                putRequest.onsuccess = () => {
                    console.log('Todo updated successfully:', todoId);
                    resolve(putRequest.result);
                };
                
                putRequest.onerror = event => {
                    console.error("更新に失敗しました: " + event.target.error);
                    reject("更新に失敗しました: " + event.target.error);
                };
            };
            
            getRequest.onerror = event => {
                console.error("データの取得に失敗しました: " + event.target.error);
                reject("データの取得に失敗しました: " + event.target.error);
            };
        });
    }

    /**
     * 指定されたIDのTodoを削除する
     * @param {number} todoId - TodoのID
     * @returns {Promise<boolean>} 削除成功時はtrue
     */
    async deleteTodo(todoId) {
        let database = await this.openDB();
        
        return new Promise((resolve, reject) => {
            let transaction = database.transaction([this.storeName], "readwrite");
            let objectStore = transaction.objectStore(this.storeName);
            let deleteRequest = objectStore.delete(todoId);
            
            deleteRequest.onsuccess = () => {
                console.log('Todo deleted successfully:', todoId);
                resolve(true);
            };
            
            deleteRequest.onerror = event => {
                console.error("削除に失敗しました: " + event.target.error);
                reject("削除に失敗しました: " + event.target.error);
            };
        });
    }

    /**
     * 全てのTodoを削除する
     * @returns {Promise<boolean>} 削除成功時はtrue
     */
    async deleteAllTodos() {
        let database = await this.openDB();
        
        return new Promise((resolve, reject) => {
            let transaction = database.transaction([this.storeName], "readwrite");
            let objectStore = transaction.objectStore(this.storeName);
            let clearRequest = objectStore.clear();
            
            clearRequest.onsuccess = () => {
                console.log('All todos deleted successfully');
                resolve(true);
            };
            
            clearRequest.onerror = event => {
                console.error("全データの削除に失敗しました: " + event.target.error);
                reject("全データの削除に失敗しました: " + event.target.error);
            };
        });
    }
}

/**
 * ExDBクラスのシングルトンインスタンスを作成
 * （必要に応じて使用）
 */
export function createDatabase() {
    return new ExDB();
}