// シャンパンコールDJ 同期サーバー（Cloudflare Workers + R2）
// /api/* 以外は同じフォルダのアプリ本体（index.html など）をそのまま返す。
// 受信（GET）はパスワード不要。送信・削除（PUT / DELETE）は、ヘッダー X-Store-Key が
// Cloudflareに登録したシークレット STORE_KEY と一致すること。

const LIB = 'library.json';
const EMPTY_ETAG = '"empty"';
// Cloudflare can weaken an ETag (W/"…") when it compresses a response, so compare without the W/
const bare = t => (t || '').trim().replace(/^W\//, '');
const MAX_AUDIO = 100 * 1024 * 1024;

const json = (data, init = {}) => new Response(JSON.stringify(data), {
  ...init, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store, no-transform', ...(init.headers || {}) },
});

function authorized(req, env) {
  const got = req.headers.get('x-store-key') || '';
  const want = env.STORE_KEY || '';
  if (!want || got.length !== want.length) return false;
  let diff = 0; for (let i = 0; i < want.length; i++) diff |= got.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    const path = url.pathname.slice(5);

    if (path === 'ping') return json({ ok: true, configured: !!env.STORE_KEY, auth: authorized(req, env) });
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      if (!env.STORE_KEY) return json({ error: 'STORE_KEY が設定されていません' }, { status: 500 });
      if (!authorized(req, env)) return json({ error: 'パスワードが違います' }, { status: 401 });
    }

    // 曲や効果音の一覧（名前・順番など）
    if (path === 'library') {
      if (req.method === 'GET') {
        const head = await env.AUDIO.head(LIB);
        const tag = head ? head.httpEtag : EMPTY_ETAG;
        if (bare(req.headers.get('if-none-match')) === tag) return new Response(null, { status: 304, headers: { etag: tag, 'x-lib-etag': tag } });
        if (!head) return json({ calls: [], tracks: [], sfx: [] }, { headers: { etag: tag, 'x-lib-etag': tag } });
        const obj = await env.AUDIO.get(LIB);
        if (!obj) return json({ calls: [], tracks: [], sfx: [] }, { headers: { etag: EMPTY_ETAG, 'x-lib-etag': EMPTY_ETAG } });
        return new Response(obj.body, { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store, no-transform', etag: obj.httpEtag, 'x-lib-etag': obj.httpEtag } });
      }
      if (req.method === 'PUT') {
        const ifMatch = bare(req.headers.get('if-match'));
        const body = await req.text();
        let data; try { data = JSON.parse(body); } catch (e) { return json({ error: 'JSONが不正です' }, { status: 400 }); }
        if (!data || !Array.isArray(data.calls) || !Array.isArray(data.tracks) || !Array.isArray(data.sfx)) return json({ error: '形式が不正です' }, { status: 400 });
        const head = await env.AUDIO.head(LIB);
        let put;
        if (head) {
          if (ifMatch !== head.httpEtag) return json({ error: '他の端末で更新されました' }, { status: 412 });
          put = await env.AUDIO.put(LIB, body, { onlyIf: { etagMatches: head.etag }, httpMetadata: { contentType: 'application/json' } });
        } else {
          if (ifMatch !== EMPTY_ETAG) return json({ error: '他の端末で更新されました' }, { status: 412 });
          put = await env.AUDIO.put(LIB, body, { httpMetadata: { contentType: 'application/json' } });
        }
        if (!put) return json({ error: '他の端末で更新されました' }, { status: 412 });
        return json({ ok: true }, { headers: { etag: put.httpEtag, 'x-lib-etag': put.httpEtag } });
      }
      return json({ error: 'method' }, { status: 405 });
    }

    // 音源ファイル本体
    const m = path.match(/^audio\/([A-Za-z0-9_-]{4,64})$/);
    if (m) {
      const key = 'audio/' + m[1];
      if (req.method === 'GET') {
        const obj = await env.AUDIO.get(key);
        if (!obj) return json({ error: 'not found' }, { status: 404 });
        const h = new Headers(); obj.writeHttpMetadata(h); h.set('etag', obj.httpEtag); h.set('cache-control', 'private, max-age=31536000, immutable');
        return new Response(obj.body, { headers: h });
      }
      if (req.method === 'PUT') {
        const len = Number(req.headers.get('content-length') || 0);
        if (len > MAX_AUDIO) return json({ error: 'too large' }, { status: 413 });
        await env.AUDIO.put(key, req.body, { httpMetadata: { contentType: req.headers.get('content-type') || 'application/octet-stream' } });
        return json({ ok: true });
      }
      if (req.method === 'DELETE') { await env.AUDIO.delete(key); return json({ ok: true }); }
      return json({ error: 'method' }, { status: 405 });
    }
    return json({ error: 'not found' }, { status: 404 });
  },
};
