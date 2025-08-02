/**
 * Supabase設定統一モジュール
 * Chrome拡張機能全体で使用するSupabase設定を管理
 */

// Supabase接続設定
export const SUPABASE_CONFIG = {
    url: 'https://mqibubhzyvlprhekdjvf.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1xaWJ1Ymh6eXZscHJoZWtkanZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc5MTcyMDgsImV4cCI6MjA2MzQ5MzIwOH0.RsiLZLsbL2A8dbs2e7lmYMl0gzFuvSkq70pdABr2a_I'
};

/**
 * Supabaseクライアントを作成する
 * @returns {object} Supabaseクライアントインスタンス
 */
export function createSupabaseClient() {
    // supabaseオブジェクトが利用可能か確認
    if (typeof supabase === 'undefined') {
        throw new Error('Supabase library is not loaded. Make sure to include supabase.js before using this module.');
    }
    
    return supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
}

/**
 * 設定の妥当性をチェックする
 * @returns {boolean} 設定が妥当な場合true
 */
export function validateConfig() {
    return !!(SUPABASE_CONFIG.url && SUPABASE_CONFIG.anonKey);
}