/* Supabase の設定（単語リングと同じプロジェクト）
   key は「publishable（公開用）」のキー。ブラウザに配る前提の値なので、公開しても問題ない
   （守りは Supabase 側のルール＝RLS と関数で行う。supabase-setup.sql を参照） */
window.SUPABASE_CONFIG = {
  url: "https://lokbaszrekbnxpbviaja.supabase.co",
  key: "sb_publishable_q9sWLTOaeSm2Fm-y-LgcLA_PTAmoN5x",
};
