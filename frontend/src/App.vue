<script setup lang="ts">
import { ref, onMounted } from 'vue';

const token = ref(localStorage.getItem('admin_token') || '');
const loginPassword = ref('');
const loginError = ref('');

const oldPassword = ref('');
const newPassword = ref('');
const pwdMessage = ref('');
const pwdError = ref('');

const accounts = ref<any[]>([]);
const apikeys = ref<any[]>([]);
const loading = ref(false);
const errorMessage = ref('');
const successMessage = ref('');
const authUrlModal = ref('');
const authModalTitle = ref('');
const authUrlCopied = ref(false);
const apiKeyResult = ref('');
const apiKeyOwner = ref('');
const apiKeyQuota = ref<number | null>(null);
const apiKeyBoundAccountId = ref<string>('');
const showAccountDropdown = ref(false);
const revealedKeyIds = ref<Set<string>>(new Set());
const rebindModal = ref<{ show: boolean; keyId: string; keyOwner: string; currentBoundId: string }>({ show: false, keyId: '', keyOwner: '', currentBoundId: '' });
const rebindNewAccountId = ref<string>('');
const checkingId = ref<string | null>(null);
const reloginLoadingId = ref<string | null>(null);
const importLoginModal = ref<{ show: boolean; accountId: string; accountName: string }>({ show: false, accountId: '', accountName: '' });
const importLoginJson = ref('');
const importLoginLoading = ref(false);

const currentTab = ref('accounts');

const headers = () => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${token.value}`
});

const doLogin = async () => {
  try {
    const res = await fetch('/admin/sys/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: loginPassword.value })
    });
    const data = await res.json();
    if (res.ok && data.token) {
      token.value = data.token;
      localStorage.setItem('admin_token', token.value);
      loginError.value = '';
      loginPassword.value = '';
      initData();
    } else {
      loginError.value = data.error || '登录失败';
    }
  } catch (err: any) {
    loginError.value = err.message;
  }
};

const doLogout = () => {
  token.value = '';
  localStorage.removeItem('admin_token');
};

const copyAuthUrl = async () => {
  try {
    await navigator.clipboard.writeText(authUrlModal.value);
    authUrlCopied.value = true;
    setTimeout(() => { authUrlCopied.value = false; }, 2000);
  } catch {
    // 降级：选中文本
    const el = document.createElement('textarea');
    el.value = authUrlModal.value;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    authUrlCopied.value = true;
    setTimeout(() => { authUrlCopied.value = false; }, 2000);
  }
};

const doUpdatePassword = async () => {
  try {
    const res = await fetch('/admin/sys/password', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ oldPassword: oldPassword.value, newPassword: newPassword.value })
    });
    const data = await res.json();
    if (res.ok) {
      pwdMessage.value = data.message;
      pwdError.value = '';
      oldPassword.value = '';
      newPassword.value = '';
      setTimeout(doLogout, 2000);
    } else {
      pwdError.value = data.error || '修改失败';
      pwdMessage.value = '';
    }
  } catch (err: any) {
    pwdError.value = err.message;
  }
};

const authFetch = async (url: string, options: any = {}) => {
  options.headers = { ...options.headers, ...headers() };
  const res = await fetch(url, options);
  if (res.status === 401 || res.status === 403) {
    doLogout();
    throw new Error("登录已过期，请重新登录");
  }
  return res;
};

const fetchAccounts = async () => {
  try {
    const res = await authFetch('/admin/accounts');
    const data = await res.json();
    console.log('[fetchAccounts]', data);
    accounts.value = Array.isArray(data) ? data : [];
  } catch (error) {
    console.error("Failed to fetch accounts", error);
  }
};

const checkAccount = async (id: string) => {
  checkingId.value = id;
  try {
    const res = await authFetch(`/admin/accounts/${id}/check`, { method: 'POST' });
    const data = await res.json();
    if (res.ok && data.account) {
      const index = accounts.value.findIndex((a: any) => a.id === id);
      if (index !== -1) accounts.value[index] = { ...accounts.value[index], ...data.account };
    }
  } catch (e) {
    console.error(`检测账号 ${id} 状态失败:`, e);
  } finally {
    checkingId.value = null;
  }
};

const setupNewAccount = async () => {
  errorMessage.value = '';
  successMessage.value = '';
  authUrlModal.value = '';
  const name = prompt("请输入新账号的名称 (例如: vip_account_1):");
  if (!name) return;
  loading.value = true;
  try {
    const res = await authFetch('/admin/accounts/login', {
      method: 'POST',
      body: JSON.stringify({ name })
    });
    const data = await res.json();
    if (!res.ok) {
      errorMessage.value = data.error || "发生了未知异常";
    } else {
      if (data.authUrl) {
        authUrlModal.value = data.authUrl;
        authModalTitle.value = `新账号 "${name}" — 请扫码/访问授权链接`;
      } else if (data.loginOutput) {
        const urlMatch = data.loginOutput.match(/(https?:\/\/[^\s]+)/);
        if (urlMatch) {
          authUrlModal.value = urlMatch[1];
          authModalTitle.value = `新账号 "${name}" — 请扫码/访问授权链接`;
        } else {
          errorMessage.value = "未找到授权 URL！完整输出: " + data.loginOutput;
        }
      } else {
        successMessage.value = "账号已部署完成！";
      }
    }
    await fetchAccounts();
  } catch (error: any) {
    errorMessage.value = "前端网络或解析错误: " + String(error.message || error);
  } finally {
    loading.value = false;
  }
};

const reloginAccount = async (id: string, name: string) => {
  reloginLoadingId.value = id;
  authUrlModal.value = '';
  errorMessage.value = '';
  try {
    const res = await authFetch(`/admin/accounts/${id}/relogin`, { method: 'POST' });
    const data = await res.json();
    if (res.ok && data.authUrl) {
      authUrlModal.value = data.authUrl;
      authModalTitle.value = `账号 "${name}" — 请扫码/访问授权链接`;
    } else {
      errorMessage.value = data.error || "重新授权失败";
    }
  } catch (e: any) {
    errorMessage.value = `重新授权失败: ${e.message}`;
  } finally {
    reloginLoadingId.value = null;
  }
};

const openImportLogin = (acc: any) => {
  importLoginJson.value = '';
  importLoginModal.value = { show: true, accountId: acc.id, accountName: acc.name };
};

const doImportLogin = async () => {
  if (!importLoginJson.value.trim()) return alert('请粘贴 JSON 内容');
  importLoginLoading.value = true;
  errorMessage.value = '';
  try {
    const res = await authFetch(`/admin/accounts/${importLoginModal.value.accountId}/import-login`, {
      method: 'POST',
      body: JSON.stringify({ loginJson: importLoginJson.value.trim() })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      successMessage.value = `账号 "${importLoginModal.value.accountName}" 登录态导入成功！`;
      importLoginModal.value.show = false;
      await fetchAccounts();
    } else {
      errorMessage.value = data.error || '导入失败';
    }
  } catch (e: any) {
    errorMessage.value = '导入失败: ' + e.message;
  } finally {
    importLoginLoading.value = false;
  }
};

const fetchApiKeys = async () => {
  try {
    const res = await authFetch('/admin/apikeys');
    apikeys.value = await res.json();
  } catch (error) {
    console.error("Fetch apikeys failed:", error);
  }
};

const generateApiKey = async () => {
  if (!apiKeyOwner.value) return alert('请输入拥有者标识');
  errorMessage.value = '';
  loading.value = true;
  try {
    const res = await authFetch('/admin/apikeys', {
      method: 'POST',
      body: JSON.stringify({ owner: apiKeyOwner.value, quota: apiKeyQuota.value, boundAccountId: apiKeyBoundAccountId.value || null })
    });
    const data = await res.json();
    if (res.ok) {
      apiKeyResult.value = data.key;
      apiKeyOwner.value = '';
      apiKeyQuota.value = null;
      apiKeyBoundAccountId.value = '';
      await fetchApiKeys();
    } else {
      errorMessage.value = data.error || "生成失败";
    }
  } catch (error: any) {
    errorMessage.value = "生成出错: " + error.message;
  } finally {
    loading.value = false;
  }
};

const toggleRevealKey = (id: string) => {
  const s = new Set(revealedKeyIds.value);
  if (s.has(id)) s.delete(id); else s.add(id);
  revealedKeyIds.value = s;
};

const copyKey = (text: string) => {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => alert('已复制到剪贴板！')).catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
};
const fallbackCopy = (text: string) => {
  const el = document.createElement('textarea');
  el.value = text;
  el.style.position = 'fixed';
  el.style.opacity = '0';
  document.body.appendChild(el);
  el.select();
  document.execCommand('copy');
  document.body.removeChild(el);
  alert('已复制到剪贴板！');
};

const toggleApiKey = async (id: string) => {
  try {
    const res = await authFetch(`/admin/apikeys/${id}/toggle`, { method: 'PUT' });
    const data = await res.json();
    if (res.ok) {
      const index = apikeys.value.findIndex((k: any) => k.id === id);
      if (index !== -1) apikeys.value[index] = { ...apikeys.value[index], ...data };
    }
  } catch (e: any) {
    alert('操作失败: ' + e.message);
  }
};

const deleteApiKey = async (id: string, owner: string) => {
  if (!confirm(`确定要删除令牌 "${owner}" 吗？此操作不可撤销。`)) return;
  try {
    const res = await authFetch(`/admin/apikeys/${id}`, { method: 'DELETE' });
    if (res.ok) {
      apikeys.value = apikeys.value.filter((k: any) => k.id !== id);
    } else {
      const data = await res.json();
      alert('删除失败: ' + (data.error || '未知错误'));
    }
  } catch (e: any) {
    alert('删除失败: ' + e.message);
  }
};

const maskKey = (key: string) => {
  if (!key) return '';
  return key.slice(0, 10) + '••••••••••••••••••••' + key.slice(-4);
};

const openRebindModal = (key: any) => {
  rebindModal.value = { show: true, keyId: key.id, keyOwner: key.owner, currentBoundId: key.boundAccount?.id || '' };
  rebindNewAccountId.value = key.boundAccount?.id || '';
};

const rebindApiKey = async () => {
  try {
    const res = await authFetch(`/admin/apikeys/${rebindModal.value.keyId}/rebind`, {
      method: 'PUT',
      body: JSON.stringify({ boundAccountId: rebindNewAccountId.value || null })
    });
    const data = await res.json();
    if (res.ok) {
      const index = apikeys.value.findIndex((k: any) => k.id === rebindModal.value.keyId);
      if (index !== -1) apikeys.value[index] = { ...apikeys.value[index], ...data };
      rebindModal.value.show = false;
    } else {
      alert('改绑失败: ' + (data.error || '未知错误'));
    }
  } catch (e: any) {
    alert('改绑失败: ' + e.message);
  }
};

const initData = () => {
  if (!token.value) return;
  authFetch('/admin/sys/check')
    .then(() => {
      fetchAccounts();
      fetchApiKeys();
    })
    .catch(() => {});
};

onMounted(() => {
  initData();
});
</script>

<template>
  <div v-if="!token" class="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-indigo-950 px-4">
    <div class="max-w-md w-full bg-white/10 backdrop-blur-md rounded-3xl shadow-2xl overflow-hidden border border-white/20 p-8 text-center">
      <h2 class="text-2xl font-extrabold text-white tracking-tight mb-8">即梦调度中枢 (Jimeng Hub)</h2>
      <form @submit.prevent="doLogin" class="space-y-6">
        <input v-model="loginPassword" type="password" required class="w-full bg-black/20 border border-white/10 text-white px-5 py-4 rounded-xl placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="管理员密码" />
        <p v-if="loginError" class="text-red-400 text-xs text-left">{{ loginError }}</p>
        <button type="submit" class="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-indigo-500/30">登录控制台</button>
      </form>
    </div>
  </div>

  <div v-else class="flex min-h-screen bg-[#f8fafc] text-slate-800">
    <aside class="w-64 bg-slate-900 text-white flex flex-col shadow-2xl z-10 p-6 shrink-0">
      <h1 class="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400 mb-8">Dreamina Hub</h1>
      <nav class="flex-1 space-y-2">
        <button @click="currentTab = 'accounts'" :class="currentTab === 'accounts' ? 'bg-indigo-600/20 text-indigo-400' : 'text-slate-300 hover:bg-slate-800'" class="w-full text-left px-5 py-3 rounded-xl font-semibold">内部账号池</button>
        <button @click="currentTab = 'apikeys'" :class="currentTab === 'apikeys' ? 'bg-indigo-600/20 text-indigo-400' : 'text-slate-300 hover:bg-slate-800'" class="w-full text-left px-5 py-3 rounded-xl font-semibold">API 令牌分发</button>
        <button @click="currentTab = 'docs'" :class="currentTab === 'docs' ? 'bg-indigo-600/20 text-indigo-400' : 'text-slate-300 hover:bg-slate-800'" class="w-full text-left px-5 py-3 rounded-xl font-semibold">API 集成文档</button>
        <button @click="currentTab = 'settings'" :class="currentTab === 'settings' ? 'bg-indigo-600/20 text-indigo-400' : 'text-slate-300 hover:bg-slate-800'" class="w-full text-left px-5 py-3 rounded-xl font-semibold mt-4">管理员安全</button>
      </nav>
      <button @click="doLogout" class="w-full bg-slate-800 hover:bg-red-500/20 text-slate-300 hover:text-red-400 py-3 rounded-xl font-bold mt-4">退出系统</button>
    </aside>

    <main class="flex-1 p-10 overflow-y-auto h-screen">

      <!-- Auth URL Modal -->
      <div v-if="authUrlModal" class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
        <div class="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-8 space-y-5">
          <h3 class="font-extrabold text-xl text-slate-800">🔗 授权链接</h3>
          <p class="text-sm text-slate-600 font-medium">{{ authModalTitle }}</p>
          <a :href="authUrlModal" target="_blank" class="block break-all text-indigo-600 text-sm font-mono bg-indigo-50 p-4 rounded-lg border border-indigo-200 hover:bg-indigo-100 transition">{{ authUrlModal }}</a>
          <button @click="copyAuthUrl" class="w-full border border-indigo-300 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 font-bold py-2.5 rounded-xl transition text-sm flex items-center justify-center gap-2">
            <span>{{ authUrlCopied ? '✅ 已复制！' : '📋 复制授权链接' }}</span>
          </button>
          <p class="text-xs text-slate-500">👆 点击上方链接在浏览器中打开，或复制后发给账号持有人。完成授权后点击下方按钮刷新状态。</p>
          <button @click="authUrlModal = ''; fetchAccounts()" class="w-full bg-slate-900 text-white font-bold py-3 rounded-xl">✅ 确认已完成授权</button>
        </div>
      </div>

      <!-- JSON 导入登录弹窗 -->
      <div v-if="importLoginModal.show" class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
        <div class="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-8 space-y-5">
          <h3 class="font-extrabold text-xl text-slate-800">📥 JSON 导入登录态</h3>
          <p class="text-sm text-slate-600">账号：<span class="font-bold">{{ importLoginModal.accountName }}</span></p>
          <ol class="text-xs text-slate-500 space-y-1 list-decimal list-inside">
            <li>先登录即梦：<a href="https://jimeng.jianying.com/ai-tool/login" target="_blank" class="text-indigo-500 underline">https://jimeng.jianying.com/ai-tool/login</a></li>
            <li>然后打开（用 random_secret_key 替换）：<br><span class="font-mono break-all">https://jimeng.jianying.com/dreamina/cli/v1/dreamina_cli_login?aid=513695&random_secret_key=<b>KEY</b>&web_version=7.5.0</span></li>
            <li>复制页面全部 JSON，粘贴到下方</li>
          </ol>
          <textarea v-model="importLoginJson" rows="8" class="w-full border border-slate-300 rounded-xl p-3 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none" placeholder='粘贴完整 JSON...'></textarea>
          <div class="flex gap-3">
            <button @click="importLoginModal.show = false" class="flex-1 border border-slate-300 text-slate-600 font-bold py-3 rounded-xl hover:bg-slate-50">取消</button>
            <button @click="doImportLogin" :disabled="importLoginLoading" class="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl">
              {{ importLoginLoading ? '⏳ 导入中...' : '✅ 确认导入' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Global Error/Success -->
      <div v-if="errorMessage" class="mb-6 bg-red-50 border border-red-200 text-red-700 px-5 py-4 rounded-xl flex justify-between items-center">
        <span class="text-sm font-medium">{{ errorMessage }}</span>
        <button @click="errorMessage = ''" class="text-red-400 hover:text-red-600 font-bold text-lg ml-4">×</button>
      </div>
      <div v-if="successMessage" class="mb-6 bg-emerald-50 border border-emerald-200 text-emerald-700 px-5 py-4 rounded-xl flex justify-between items-center">
        <span class="text-sm font-medium">{{ successMessage }}</span>
        <button @click="successMessage = ''" class="text-emerald-400 hover:text-emerald-600 font-bold text-lg ml-4">×</button>
      </div>

      <!-- ========== TAB: ACCOUNTS ========== -->
      <div v-if="currentTab === 'accounts'" class="space-y-6">
        <div class="flex items-center justify-between">
          <h2 class="text-3xl font-black text-slate-800">内部账号池状态</h2>
          <button @click="setupNewAccount" :disabled="loading" class="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white px-6 py-3 rounded-xl font-bold shadow transition">➕ 部署新账号实例</button>
        </div>
        <div v-if="accounts.length === 0" class="text-center py-20 text-slate-400 bg-white rounded-2xl border border-slate-200">
          <p class="text-5xl mb-4">🤖</p>
          <p class="font-medium">暂无账号。点击右上角「部署新账号实例」开始。</p>
        </div>
        <div v-for="acc in accounts" :key="acc.id" class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div class="p-6 flex flex-col sm:flex-row sm:items-center gap-4">
            <div class="flex-1">
              <div class="flex items-center gap-3 mb-1">
                <span class="inline-block w-3 h-3 rounded-full flex-shrink-0" :class="acc.status === 'IDLE' ? 'bg-green-400' : 'bg-red-400'"></span>
                <p class="font-bold text-lg text-slate-800">{{ acc.name }}</p>
                <span class="text-xs font-bold px-2 py-0.5 rounded-full" :class="acc.status === 'IDLE' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'">{{ acc.status === 'IDLE' ? 'ACTIVE' : acc.status === 'ERROR' ? 'EXPIRED' : acc.status }}</span>
              </div>
              <p class="text-xs text-slate-400 font-mono">ID: {{ acc.id }}</p>
              <div v-if="acc.creditBalance" class="mt-1 text-sm text-slate-500">余额: <span class="font-bold text-emerald-600">{{ acc.creditBalance }}</span> 积分 · 最后检查: {{ acc.lastChecked ? new Date(acc.lastChecked).toLocaleString() : '从未' }}</div>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0">
              <button @click="checkAccount(acc.id)" :disabled="checkingId === acc.id" class="text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 px-4 py-2 rounded-lg transition flex items-center gap-1.5">
                {{ checkingId === acc.id ? '⏳' : '🔍' }} 检测状态
              </button>
              <button @click="reloginAccount(acc.id, acc.name)" :disabled="reloginLoadingId === acc.id" class="text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 px-4 py-2 rounded-lg transition flex items-center gap-1.5">
                {{ reloginLoadingId === acc.id ? '⏳' : '🔗' }} 重新授权
              </button>
              <button @click="openImportLogin(acc)" class="text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-lg transition flex items-center gap-1.5">
                📥 JSON 导入
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- ========== TAB: API KEYS ========== -->
      <div v-if="currentTab === 'apikeys'" class="space-y-6">
        <h2 class="text-3xl font-black text-slate-800">API 令牌分发与管理</h2>
        <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
          <h3 class="font-bold text-slate-700 text-sm uppercase tracking-wider">✚ 签发新令牌</h3>
          <div class="flex flex-wrap gap-3">
            <input v-model="apiKeyOwner" placeholder="拥有者标识 (如 client_01)" class="flex-1 border border-slate-300 px-4 py-2.5 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none min-w-[180px]" />
            <input v-model.number="apiKeyQuota" type="number" placeholder="额度上限 (留空=无限)" class="w-52 border border-slate-300 px-4 py-2.5 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
            <!-- 自定义账号下拉 -->
            <div class="relative">
              <button type="button" @click="showAccountDropdown = !showAccountDropdown" class="flex items-center gap-2 border border-slate-300 bg-white px-4 py-2.5 rounded-lg text-sm hover:border-indigo-400 focus:ring-2 focus:ring-indigo-500 outline-none min-w-[220px] justify-between">
                <span v-if="!apiKeyBoundAccountId" class="text-slate-500">🔀 不绑定（自动分配）</span>
                <template v-else>
                  <template v-for="acc in accounts" :key="acc.id">
                    <span v-if="acc.id === apiKeyBoundAccountId">
                      <span>{{ acc.status === 'IDLE' ? '✅' : acc.status === 'BUSY' ? '⏳' : '❌' }}</span>
                      <span class="font-semibold text-slate-800 ml-1">{{ acc.name }}</span>
                      <span class="text-slate-400 ml-1 text-xs">{{ acc.creditBalance ?? '?' }} 积分</span>
                    </span>
                  </template>
                </template>
                <svg class="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
              </button>
              <div v-if="showAccountDropdown" class="absolute left-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-xl w-72 overflow-hidden">
                <div @click="apiKeyBoundAccountId = ''; showAccountDropdown = false" class="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer border-b border-slate-100">
                  <span class="text-lg">🔀</span>
                  <div>
                    <div class="text-sm font-semibold text-slate-700">不绑定</div>
                    <div class="text-xs text-slate-400">系统自动从账号池分配</div>
                  </div>
                </div>
                <div v-for="acc in accounts" :key="acc.id" @click="apiKeyBoundAccountId = acc.id; showAccountDropdown = false" class="flex items-center gap-3 px-4 py-3 hover:bg-indigo-50 cursor-pointer" :class="apiKeyBoundAccountId === acc.id ? 'bg-indigo-50' : ''">
                  <span class="text-lg">{{ acc.status === 'IDLE' ? '✅' : acc.status === 'BUSY' ? '⏳' : '❌' }}</span>
                  <div>
                    <div class="text-sm font-semibold text-slate-800">{{ acc.name }}</div>
                    <div class="text-xs text-slate-400">{{ acc.creditBalance ?? '?' }} 积分 · {{ acc.status }}</div>
                  </div>
                  <span v-if="apiKeyBoundAccountId === acc.id" class="ml-auto text-indigo-600 font-bold text-sm">✓</span>
                </div>
              </div>
            </div>
            <button @click="generateApiKey" :disabled="loading" class="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white px-6 py-2.5 rounded-lg font-bold text-sm shadow transition">签发令牌</button>
          </div>
          <div v-if="apiKeyResult" class="bg-emerald-50 border border-emerald-200 p-4 rounded-xl">
            <p class="text-xs font-bold text-emerald-700 mb-2">✅ 新令牌已生成 — 请立即复制，此处仅显示一次</p>
            <div class="flex items-center gap-2">
              <code class="flex-1 font-mono text-sm text-emerald-800 break-all select-all">{{ apiKeyResult }}</code>
              <button @click="copyKey(apiKeyResult)" class="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg font-bold flex-shrink-0 transition">📋 复制</button>
            </div>
          </div>
        </div>
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <table class="w-full text-sm">
            <thead class="bg-slate-50 border-b border-slate-200">
              <tr>
                <th class="text-left px-6 py-3 font-bold text-slate-500 text-xs uppercase tracking-wider">拥有者</th>
                <th class="text-left px-6 py-3 font-bold text-slate-500 text-xs uppercase tracking-wider">API Key</th>
                <th class="text-left px-6 py-3 font-bold text-slate-500 text-xs uppercase tracking-wider">绑定账号</th>
                <th class="text-left px-6 py-3 font-bold text-slate-500 text-xs uppercase tracking-wider">用量</th>
                <th class="text-left px-6 py-3 font-bold text-slate-500 text-xs uppercase tracking-wider">状态</th>
                <th class="text-left px-6 py-3 font-bold text-slate-500 text-xs uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr v-if="apikeys.length === 0"><td colspan="6" class="text-center py-12 text-slate-400">暂无令牌，请签发</td></tr>
              <tr v-for="key in apikeys" :key="key.id" class="hover:bg-slate-50 transition">
                <td class="px-6 py-4 font-semibold text-slate-800">{{ key.owner }}</td>
                <td class="px-6 py-4">
                  <div class="flex items-center gap-2">
                    <code class="font-mono text-xs text-slate-600 select-all">{{ revealedKeyIds.has(key.id) ? key.key : maskKey(key.key) }}</code>
                    <button @click="toggleRevealKey(key.id)" class="text-slate-400 hover:text-indigo-600 text-sm px-1 py-0.5 rounded transition" :title="revealedKeyIds.has(key.id) ? '隐藏' : '显示明文'">{{ revealedKeyIds.has(key.id) ? '🙈' : '👁' }}</button>
                    <button @click="copyKey(key.key)" class="text-slate-400 hover:text-indigo-600 text-sm px-1 py-0.5 rounded transition" title="复制">📋</button>
                  </div>
                </td>
                <td class="px-6 py-4">
                  <span v-if="key.boundAccount" class="text-xs font-semibold text-indigo-700 bg-indigo-50 px-2 py-1 rounded-full">🔒 {{ key.boundAccount.name }}</span>
                  <span v-else class="text-xs text-slate-400">🔀 自动分配</span>
                </td>
                <td class="px-6 py-4 text-slate-500 text-xs">{{ key.used || 0 }} / {{ key.quota || '∞' }}</td>
                <td class="px-6 py-4"><span class="text-xs font-bold px-2 py-1 rounded-full" :class="key.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'">{{ key.isActive ? '启用' : '停用' }}</span></td>
                <td class="px-6 py-4">
                  <div class="flex items-center gap-2">
                    <button @click="toggleApiKey(key.id)" class="text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition">{{ key.isActive ? '停用' : '启用' }}</button>
                    <button @click="openRebindModal(key)" class="text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition">改绑</button>
                    <button @click="deleteApiKey(key.id, key.owner)" class="text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition">删除</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ========== REBIND MODAL ========== -->
      <div v-if="rebindModal.show" class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 px-4">
        <div class="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6 space-y-5">
          <div class="flex items-center justify-between">
            <h3 class="font-black text-slate-800 text-lg">🔁 修改绑定账号</h3>
            <button @click="rebindModal.show = false" class="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
          </div>
          <p class="text-sm text-slate-500">令牌拥有者：<span class="font-bold text-slate-700">{{ rebindModal.keyOwner }}</span></p>
          <div>
            <label class="block text-sm font-bold text-slate-700 mb-2">选择新的绑定账号</label>
            <select v-model="rebindNewAccountId" class="w-full border border-slate-300 px-4 py-2.5 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white">
              <option value="">🔀 不绑定（自动分配公共池）</option>
              <option v-for="acc in accounts" :key="acc.id" :value="acc.id">{{ acc.status === 'IDLE' ? '✅' : acc.status === 'BUSY' ? '⏳' : '❌' }} {{ acc.name }}（{{ acc.creditBalance ?? '?' }} 积分）</option>
            </select>
          </div>
          <div class="flex gap-3 justify-end pt-2">
            <button @click="rebindModal.show = false" class="px-5 py-2.5 rounded-lg text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition">取消</button>
            <button @click="rebindApiKey" class="px-5 py-2.5 rounded-lg text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition shadow">确认改绑</button>
          </div>
        </div>
      </div>

      <!-- ========== TAB: DOCS ========== -->
      <div v-if="currentTab === 'docs'" class="space-y-8">
        <div>
          <h2 class="text-3xl font-black text-slate-800">即梦 (Dreamina) API 集成文档</h2>
          <p class="text-slate-500 mt-1">企业级封装 • 兼容 OpenAI 格式 • 原生多模态</p>
        </div>
        <div class="bg-amber-50 border border-amber-200 rounded-2xl p-6">
          <h3 class="font-extrabold text-amber-900 text-lg mb-3">🔑 如何获取 API Key</h3>
          <ol class="text-sm text-amber-800 space-y-2 list-decimal pl-5">
            <li>登录本控制台，切换到左侧「API 令牌分发」页面</li>
            <li>填写拥有者标识（如 <code class="bg-amber-100 px-1 rounded font-mono">client_01</code>）和可选额度上限，点击「签发令牌」</li>
            <li>令牌签发后会 <strong>明文显示一次</strong>，请立即点击「📋 复制」保存</li>
            <li>此后令牌脱敏展示，不可再查看原文。若丢失请删除后重新签发</li>
          </ol>
        </div>
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
          <h3 class="font-extrabold text-slate-800 text-lg">🌐 接入基础规范</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div><p class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Base URL</p><code class="bg-slate-900 text-green-400 px-4 py-2 rounded-lg block font-mono text-xs">http://&lt;server-ip&gt;:3000/v1</code></div>
            <div><p class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">认证方式 (必填 Header)</p><code class="bg-slate-900 text-green-400 px-4 py-2 rounded-lg block font-mono text-xs">Authorization: Bearer sk-jm-xxxxxxxxxx</code></div>
            <div><p class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">请求 Content-Type</p><code class="bg-slate-900 text-yellow-400 px-4 py-2 rounded-lg block font-mono text-xs">multipart/form-data</code><p class="text-xs text-slate-400 mt-1">所有生成接口均使用 form-data，支持文件上传</p></div>
            <div><p class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">任务状态轮询</p><code class="bg-slate-900 text-green-400 px-4 py-2 rounded-lg block font-mono text-xs">GET /v1/tasks/:id</code><p class="text-xs text-slate-400 mt-1">轮询直到 status 变为 success 或 failed</p></div>
          </div>
        </div>
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-5">
          <h3 class="font-extrabold text-slate-800 text-lg flex items-center gap-2">⚡ 异步任务响应机制 <span class="text-xs font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">必读</span></h3>
          <p class="text-sm text-slate-600">两个生成接口均为<strong>异步非阻塞</strong>：POST 提交后立即返回任务 ID，后台 CLI 持续执行，客户端需持续轮询 <code class="bg-slate-100 px-1 rounded font-mono">GET /v1/tasks/:id</code> 直到获得最终 URL。</p>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div class="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
              <p class="text-xs font-black text-indigo-700 uppercase tracking-wider mb-2">① POST 提交 → 立即返回</p>
              <pre class="text-[11px] font-mono text-indigo-800 leading-relaxed overflow-x-auto">{
  "id": "clxxxxxxxxxxx",
  "status": "processing",
  "submit_id": "abc123"
}</pre>
              <p class="text-[11px] text-slate-500 mt-2">id 即轮询用的任务 ID，submit_id 为 CLI 内部流水号</p>
            </div>
            <div class="bg-amber-50 border border-amber-100 rounded-xl p-4">
              <p class="text-xs font-black text-amber-700 uppercase tracking-wider mb-2">② GET /v1/tasks/:id 轮询中</p>
              <pre class="text-[11px] font-mono text-amber-800 leading-relaxed overflow-x-auto">{
  "id": "clxxxxxxxxxxx",
  "status": "processing"
}</pre>
              <p class="text-[11px] text-slate-500 mt-2">每 3–5 秒轮询一次，最长等待约 5 分钟</p>
            </div>
            <div class="space-y-3">
              <div class="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                <p class="text-xs font-black text-emerald-700 uppercase tracking-wider mb-1">③a 成功 (success)</p>
                <pre class="text-[11px] font-mono text-emerald-800 leading-relaxed overflow-x-auto">{
  "id": "clxxx",
  "status": "success",
  "data": [
    { "url": "https://cdn.xxx/out.jpg" }
  ]
}</pre>
              </div>
              <div class="bg-red-50 border border-red-100 rounded-xl p-3">
                <p class="text-xs font-black text-red-700 uppercase tracking-wider mb-1">③b 失败 (failed)</p>
                <pre class="text-[11px] font-mono text-red-800 leading-relaxed overflow-x-auto">{
  "id": "clxxx",
  "status": "failed",
  "error": "错误原因说明"
}</pre>
              </div>
            </div>
          </div>
          <div class="bg-slate-900 rounded-xl overflow-hidden">
            <div class="bg-slate-800 px-4 py-2 flex items-center gap-2">
              <span class="text-xs font-mono text-slate-400">cURL 完整链路示例 (提交 → 轮询 → 取 URL)</span>
            </div>
            <pre class="p-4 text-xs font-mono text-slate-300 overflow-x-auto leading-relaxed"># Step 1: 提交生成任务
RESP=$(curl -s -X POST http://&lt;server&gt;:3000/v1/images/generations \
  -H "Authorization: Bearer sk-jm-xxx" \
  -F "model=5.0" -F "prompt=赛博朋克机械猫" -F "ratio=16:9")
TASK_ID=$(echo $RESP | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

# Step 2: 轮询直到 status = success
while true; do
  POLL=$(curl -s http://&lt;server&gt;:3000/v1/tasks/$TASK_ID \
    -H "Authorization: Bearer sk-jm-xxx")
  STATUS=$(echo $POLL | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
  if [ "$STATUS" = "success" ]; then
    echo $POLL | python3 -c "import sys,json; print(json.load(sys.stdin)['data'][0]['url'])"
    break
  elif [ "$STATUS" = "failed" ]; then
    echo "FAILED"; break
  fi
  sleep 4
done</pre>
          </div>
        </div>
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <h3 class="font-extrabold text-slate-800 text-lg mb-4">📸 POST /v1/images/generations — 各模型参数约束</h3>
          <div class="overflow-x-auto">
            <table class="w-full text-xs border-collapse">
              <thead><tr class="bg-indigo-50">
                <th class="text-left px-4 py-3 font-bold text-indigo-700 border border-indigo-100">model</th>
                <th class="text-left px-4 py-3 font-bold text-indigo-700 border border-indigo-100">resolution_type</th>
                <th class="text-left px-4 py-3 font-bold text-indigo-700 border border-indigo-100">ratio</th>
                <th class="text-left px-4 py-3 font-bold text-indigo-700 border border-indigo-100">图生图 (images 字段)</th>
                <th class="text-left px-4 py-3 font-bold text-indigo-700 border border-indigo-100">备注</th>
              </tr></thead>
              <tbody>
                <tr class="hover:bg-slate-50"><td class="px-4 py-3 font-mono font-bold border border-slate-100">5.0</td><td class="px-4 py-3 border border-slate-100">4k / 2k</td><td class="px-4 py-3 border border-slate-100">全部比例</td><td class="px-4 py-3 border border-slate-100 text-green-700 font-bold">✅ 最多 10 张</td><td class="px-4 py-3 border border-slate-100 text-indigo-600 font-semibold">旗舰推荐</td></tr>
                <tr class="hover:bg-slate-50 bg-slate-50"><td class="px-4 py-3 font-mono font-bold border border-slate-100">4.6</td><td class="px-4 py-3 border border-slate-100">4k / 2k</td><td class="px-4 py-3 border border-slate-100">全部比例</td><td class="px-4 py-3 border border-slate-100 text-green-700 font-bold">✅ 最多 10 张</td><td class="px-4 py-3 border border-slate-100 text-slate-500">高质量</td></tr>
                <tr class="hover:bg-slate-50"><td class="px-4 py-3 font-mono font-bold border border-slate-100">4.5</td><td class="px-4 py-3 border border-slate-100">4k / 2k</td><td class="px-4 py-3 border border-slate-100">全部比例</td><td class="px-4 py-3 border border-slate-100 text-green-700 font-bold">✅ 最多 10 张</td><td class="px-4 py-3 border border-slate-100 text-slate-500"></td></tr>
                <tr class="hover:bg-slate-50 bg-slate-50"><td class="px-4 py-3 font-mono font-bold border border-slate-100">4.1</td><td class="px-4 py-3 border border-slate-100">4k / 2k</td><td class="px-4 py-3 border border-slate-100">全部比例</td><td class="px-4 py-3 border border-slate-100 text-green-700 font-bold">✅ 最多 10 张</td><td class="px-4 py-3 border border-slate-100 text-slate-500"></td></tr>
                <tr class="hover:bg-slate-50"><td class="px-4 py-3 font-mono font-bold border border-slate-100">4.0</td><td class="px-4 py-3 border border-slate-100">4k / 2k</td><td class="px-4 py-3 border border-slate-100">全部比例</td><td class="px-4 py-3 border border-slate-100 text-green-700 font-bold">✅ 最多 10 张</td><td class="px-4 py-3 border border-slate-100 text-slate-500"></td></tr>
                <tr class="hover:bg-slate-50 bg-orange-50"><td class="px-4 py-3 font-mono font-bold border border-slate-100">3.1</td><td class="px-4 py-3 border border-slate-100 text-orange-600">2k / 1k</td><td class="px-4 py-3 border border-slate-100">全部比例</td><td class="px-4 py-3 border border-slate-100 text-red-600 font-bold">❌ 不支持</td><td class="px-4 py-3 border border-slate-100 text-orange-600">降级分辨率</td></tr>
                <tr class="hover:bg-slate-50 bg-orange-50"><td class="px-4 py-3 font-mono font-bold border border-slate-100">3.0</td><td class="px-4 py-3 border border-slate-100 text-orange-600">2k / 1k</td><td class="px-4 py-3 border border-slate-100">全部比例</td><td class="px-4 py-3 border border-slate-100 text-red-600 font-bold">❌ 不支持</td><td class="px-4 py-3 border border-slate-100 text-orange-600">旧版基础</td></tr>
              </tbody>
            </table>
          </div>
          <pre class="mt-4 bg-slate-900 text-indigo-300 p-4 rounded-xl font-mono text-xs overflow-x-auto">curl -X POST http://&lt;server&gt;:3000/v1/images/generations \
  -H "Authorization: Bearer sk-jm-xxx" \
  -F "model=5.0" -F "prompt=一只超写实的机械猫咪" -F "ratio=16:9" -F "resolution_type=4k"
# 图生图: 追加 -F "images=@/path/to/ref.jpg" (最多10张，限4.0及以上模型)</pre>
        </div>
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <h3 class="font-extrabold text-slate-800 text-lg mb-4">🎬 POST /v1/videos/generations — 各模型参数约束</h3>
          <div class="overflow-x-auto">
            <table class="w-full text-xs border-collapse">
              <thead><tr class="bg-blue-50">
                <th class="text-left px-4 py-3 font-bold text-blue-700 border border-blue-100">model</th>
                <th class="text-left px-4 py-3 font-bold text-blue-700 border border-blue-100">时长范围 (s)</th>
                <th class="text-left px-4 py-3 font-bold text-blue-700 border border-blue-100">最高分辨率</th>
                <th class="text-left px-4 py-3 font-bold text-blue-700 border border-blue-100">文生视频</th>
                <th class="text-left px-4 py-3 font-bold text-blue-700 border border-blue-100">图生视频</th>
                <th class="text-left px-4 py-3 font-bold text-blue-700 border border-blue-100">多模态/音频</th>
                <th class="text-left px-4 py-3 font-bold text-blue-700 border border-blue-100">备注</th>
              </tr></thead>
              <tbody>
                <tr class="bg-green-50"><td class="px-4 py-3 font-mono font-bold border border-slate-100">seedance2.0_vip</td><td class="px-4 py-3 border border-slate-100">4 – 15</td><td class="px-4 py-3 border border-slate-100">720p</td><td class="px-4 py-3 border border-slate-100 text-green-700">✅</td><td class="px-4 py-3 border border-slate-100 text-green-700">✅</td><td class="px-4 py-3 border border-slate-100 text-green-700 font-bold">✅ 全支持</td><td class="px-4 py-3 border border-slate-100 text-green-700 font-semibold">VIP 超极速</td></tr>
                <tr class="bg-green-50"><td class="px-4 py-3 font-mono font-bold border border-slate-100">seedance2.0fast_vip</td><td class="px-4 py-3 border border-slate-100">4 – 15</td><td class="px-4 py-3 border border-slate-100">720p</td><td class="px-4 py-3 border border-slate-100 text-green-700">✅</td><td class="px-4 py-3 border border-slate-100 text-green-700">✅</td><td class="px-4 py-3 border border-slate-100 text-green-700 font-bold">✅ 全支持</td><td class="px-4 py-3 border border-slate-100 text-green-700 font-semibold">VIP 极速版</td></tr>
                <tr><td class="px-4 py-3 font-mono font-bold border border-slate-100">seedance2.0</td><td class="px-4 py-3 border border-slate-100">4 – 15</td><td class="px-4 py-3 border border-slate-100">720p</td><td class="px-4 py-3 border border-slate-100 text-green-700">✅</td><td class="px-4 py-3 border border-slate-100 text-green-700">✅</td><td class="px-4 py-3 border border-slate-100 text-green-700 font-bold">✅ 全支持</td><td class="px-4 py-3 border border-slate-100 text-slate-500">标准推荐</td></tr>
                <tr class="bg-slate-50"><td class="px-4 py-3 font-mono font-bold border border-slate-100">seedance2.0fast</td><td class="px-4 py-3 border border-slate-100">4 – 15</td><td class="px-4 py-3 border border-slate-100">720p</td><td class="px-4 py-3 border border-slate-100 text-green-700">✅</td><td class="px-4 py-3 border border-slate-100 text-green-700">✅</td><td class="px-4 py-3 border border-slate-100 text-green-700 font-bold">✅ 全支持</td><td class="px-4 py-3 border border-slate-100 text-slate-500">快速出图</td></tr>
                <tr class="bg-blue-50"><td class="px-4 py-3 font-mono font-bold border border-slate-100">3.5pro</td><td class="px-4 py-3 border border-slate-100">4 – 12</td><td class="px-4 py-3 border border-slate-100 font-bold text-blue-700">1080p</td><td class="px-4 py-3 border border-slate-100 text-green-700">✅</td><td class="px-4 py-3 border border-slate-100 text-green-700">✅</td><td class="px-4 py-3 border border-slate-100 text-red-500">❌</td><td class="px-4 py-3 border border-slate-100 text-blue-600">高清，无多模态</td></tr>
                <tr><td class="px-4 py-3 font-mono font-bold border border-slate-100">3.0pro</td><td class="px-4 py-3 border border-slate-100">3 – 10</td><td class="px-4 py-3 border border-slate-100 font-bold text-blue-700">1080p</td><td class="px-4 py-3 border border-slate-100 text-green-700">✅</td><td class="px-4 py-3 border border-slate-100 text-green-700">✅</td><td class="px-4 py-3 border border-slate-100 text-red-500">❌</td><td class="px-4 py-3 border border-slate-100 text-slate-500"></td></tr>
                <tr class="bg-slate-50"><td class="px-4 py-3 font-mono font-bold border border-slate-100">3.0fast</td><td class="px-4 py-3 border border-slate-100">3 – 10</td><td class="px-4 py-3 border border-slate-100">720p</td><td class="px-4 py-3 border border-slate-100 text-green-700">✅</td><td class="px-4 py-3 border border-slate-100 text-green-700">✅</td><td class="px-4 py-3 border border-slate-100 text-red-500">❌</td><td class="px-4 py-3 border border-slate-100 text-slate-500">快速版</td></tr>
                <tr class="bg-orange-50"><td class="px-4 py-3 font-mono font-bold border border-slate-100">3.0</td><td class="px-4 py-3 border border-slate-100">3 – 10</td><td class="px-4 py-3 border border-slate-100">720p</td><td class="px-4 py-3 border border-slate-100 text-green-700">✅</td><td class="px-4 py-3 border border-slate-100 text-green-700">✅</td><td class="px-4 py-3 border border-slate-100 text-red-500">❌</td><td class="px-4 py-3 border border-slate-100 text-orange-500">旧基础版</td></tr>
              </tbody>
            </table>
          </div>
          <pre class="mt-4 bg-slate-900 text-indigo-300 p-4 rounded-xl font-mono text-xs overflow-x-auto"># 文生视频
curl -X POST http://&lt;server&gt;:3000/v1/videos/generations \
  -H "Authorization: Bearer sk-jm-xxx" \
  -F "model=seedance2.0" -F "prompt=赛博朋克都市夜景" -F "duration=5" -F "ratio=16:9"

# 图生视频 (单图定帧)
curl -X POST http://&lt;server&gt;:3000/v1/videos/generations \
  -H "Authorization: Bearer sk-jm-xxx" \
  -F "model=seedance2.0" -F "prompt=让角色缓缓转身" -F "image=@face.jpg" -F "duration=5"

# 多模态 (多图+音频，自动锁定 seedance2.0 系)
curl -X POST http://&lt;server&gt;:3000/v1/videos/generations \
  -H "Authorization: Bearer sk-jm-xxx" \
  -F "model=seedance2.0_vip" -F "prompt=人物嘴型对口型说话" \
  -F "image=@face1.jpg" -F "image=@face2.jpg" -F "audio=@voice.mp3" -F "duration=8"</pre>
        </div>
      </div>

      <!-- ========== TAB: SETTINGS ========== -->
      <div v-if="currentTab === 'settings'" class="max-w-xl space-y-6">
        <h2 class="text-3xl font-black text-slate-800">系统核心安全设置</h2>
        <form @submit.prevent="doUpdatePassword" class="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 space-y-6">
          <input v-model="oldPassword" type="password" required placeholder="当前密码" class="w-full border px-4 py-3 rounded-lg" />
          <input v-model="newPassword" type="password" required placeholder="新密码" class="w-full border px-4 py-3 rounded-lg" />
          <button type="submit" class="bg-slate-900 text-white font-bold px-6 py-3 rounded-xl w-full">修改凭证</button>
          <p v-if="pwdError" class="text-red-500 text-sm mt-4">{{ pwdError }}</p>
          <p v-if="pwdMessage" class="text-emerald-500 text-sm mt-4">{{ pwdMessage }}</p>
        </form>
      </div>

    </main>
  </div>
</template>
<style>
.custom-scrollbar::-webkit-scrollbar { width: 8px; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
</style>