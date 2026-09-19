// ─── API Client（零依赖：同源，不再跨端口）───
// 零依赖：一个进程同时服务静态页与 API，不再需要单独的 :3000 端口
const API_ROOT = ''; // 同源，相对路径即可
const API_BASE = '/api';

// 登录 session 通过 HttpOnly cookie 携带，同源自动携带
const FETCH_OPT = { credentials: 'same-origin' };

// Convert a relative API url (/api/media?file=...) to absolute (同源直接返回)
function apiUrl(p) {
  if (!p) return p;
  if (p.startsWith('http')) return p;
  return p; // 同源，相对路径直接用
}

async function apiGet(path) {
  try {
    const res = await fetch(API_BASE + path, FETCH_OPT);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.warn('API get failed:', e.message);
    throw e;
  }
}

async function apiPost(path, body) {
  try {
    const res = await fetch(API_BASE + path, Object.assign({}, FETCH_OPT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.warn('API post failed:', e.message);
    throw e;
  }
}

async function apiUpload(formData, targetDir) {
  try {
    // 登录后带 targetDir 上传到真实目录
    const url = API_BASE + '/upload' + (targetDir ? '?targetDir=' + encodeURIComponent(targetDir) : '');
    const res = await fetch(url, Object.assign({}, FETCH_OPT, { method: 'POST', body: formData }));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.warn('API upload failed:', e.message);
    throw e;
  }
}

// 登录相关
async function apiAuthStatus() {
  try {
    // 端点归框架通用件 routes-auth：GET /api/status → { ok, needsSetup, needsAuth, port }
    // needsSetup=true 表示尚未设密码（此时写操作也开放）
    const res = await fetch(API_BASE + '/status', FETCH_OPT);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const d = await res.json();
    return {
      authed: !d.needsAuth,
      passwordSet: !!d.needsAuth,
      needsSetup: !!d.needsSetup,
    };
  } catch (e) {
    console.warn('auth status failed:', e.message);
    return { authed: false, passwordSet: false, needsSetup: false };
  }
}
async function apiLogin(password) {
  const res = await fetch(API_BASE + '/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ password }),
  });
  return { ok: res.ok, status: res.status, data: res.status === 200 ? await res.json() : null };
}

// 删除收藏
async function apiDelete(path, body) {
  try {
    const res = await fetch(API_BASE + path, Object.assign({}, FETCH_OPT, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    }));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.warn('API delete failed:', e.message);
    throw e;
  }
}
async function apiLogout() {
  try { await fetch(API_BASE + '/logout', { method: 'POST', credentials: 'include' }); } catch (_) {}
}

// Check if API is available
async function isAPIAvailable() {
  try {
    await fetch(API_BASE + '/gallery', FETCH_OPT);
    return true;
  } catch {
    return false;
  }
}

// Expose globally
window.API = { apiGet, apiPost, apiDelete, apiUpload, isAPIAvailable, apiUrl, apiAuthStatus, apiLogin, apiLogout };
window.API_ROOT = '';  // 同源，无前缀
window.API_BASE = '/api';
window.API_AVAILABLE = false;
