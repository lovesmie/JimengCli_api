const fs = require('fs');

const vueContent = `<script setup lang="ts">
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
const authUrl = ref(''); 
const apiKeyResult = ref(''); 
const apiKeyOwner = ref(''); 
const apiKeyQuota = ref<number | null>(null);

const currentTab = ref('accounts');

const headers = () => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer \${token.value}\`
});

const doLogin = async () => {
  try {
    const res = await fetch('http://localhost:3000/admin/sys/login', {
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

const doUpdatePassword = async () => {
  try {
    const res = await fetch('http://localhost:3000/admin/sys/password', {
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
    const res = await authFetch('http://localhost:3000/admin/accounts');
    accounts.value = await res.json();
    
    accounts.value.forEach(async (acc) => {
      try {
        const checkRes = await authFetch(`http://localhost:3000/admin/accounts/\${acc.id}/check\`, { method: 'POST' });
        const checkData = await checkRes.json();
        if (checkRes.ok && checkData.account) {
          const index = accounts.value.findIndex(a => a.id === acc.id);
          if (index !== -1) {
            accounts.value[index] = { ...accounts.value[index], ...checkData.account };
          }
        }
      } catch (e) {
        console.error(`自动检测账号 \${acc.id} 状态失败:\`, e);
      }
    });

  } catch (error) {
    console.error("Failed to fetch accounts", error);
  }
};

const setupNewAccount = async () => {
  errorMessage.value = ''; 
  successMessage.value = ''; 
  authUrl.value = '';
  const name = prompt("请输入新账号的名称 (例如: vip_account_1):");
  if (!name) return;
  loading.value = true;
  try {
    const res = await authFetch('http://localhost:3000/admin/accounts/login', {
      method: 'POST',
      body: JSON.stringify({ name })
    });
    const data = await res.json();
    if (!res.ok) {
      errorMessage.value = data.error || "发生了未知异常";
    } else {
      successMessage.value = "账号环境隔离目录建好！检测到授权请求，马上登录下发验证码链接：";
      if (data.loginOutput) {
        const urlMatch = data.loginOutput.match(/(https:\/\/[^\s]+)/);
        if (urlMatch) {
          authUrl.value = urlMatch[1];
        } else {
          errorMessage.value = "未找到授权 URL！完整输出: " + data.loginOutput;
        }
      }
    }
    await fetchAccounts();
  } catch (error: any) {
    errorMessage.value = "前端网络或解析错误: " + String(error.message || error);
  } finally {
    loading.value = false;
  }
};

const fetchApiKeys = async () => {
  try {
    const res = await authFetch('http://localhost:3000/admin/apikeys');
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
    const res = await authFetch('http://localhost:3000/admin/apikeys', {
      method: 'POST',
      body: JSON.stringify({ owner: apiKeyOwner.value, quota: apiKeyQuota.value })
    });
    const data = await res.json();
    if (res.ok) {
      apiKeyResult.value = data.key;
      apiKeyOwner.value = '';
      apiKeyQuota.value = null;
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

const initData = () => {
  if (!token.value) return;
  authFetch('http://localhost:3000/admin/sys/check')
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
    <div class="max-w-md w-full bg-white/10 backdrop-blur-md rounded-3xl shadow-2xl overflow-hidden border border-white/20">
      <div class="p-8">
        <div class="text-center mb-10">
          <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-indigo-500/20 mb-4 shadow-inner">
            <span class="text-3xl text-indigo-300">⚛️</span>
          </div>
          <h2 class="text-2xl font-extrabold text-white tracking-tight">即梦调度中枢 (Jimeng Hub)</h2>
          <p class="text-indigo-200 mt-2 text-sm">请输入管理员凭证以接入中央控制系统</p>
        </div>
        
        <form @submit.prevent="doLogin" class="space-y-6">
          <div>
            <div class="relative">
              <input v-model="loginPassword" type="password" required 
                class="w-full bg-black/20 border border-white/10 text-white px-5 py-4 rounded-xl placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" 
                placeholder="管理员密码" />
            </div>
            <p v-if="loginError" class="text-red-400 text-xs mt-2 font-medium">{{ loginError }}</p>
          </div>
          <button type="submit" 
            class="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 px-4 rounded-xl transition duration-200 shadow-lg shadow-indigo-500/30 transform hover:-translate-y-1">
            登录进入控制台
          </button>
        </form>
      </div>
    </div>
  </div>

  <div v-else class="flex min-h-screen bg-[#f8fafc] text-slate-800 font-sans">
    <aside class="w-72 bg-slate-900 text-white flex flex-col shadow-2xl relative z-10">
      <div class="p-6 border-b border-slate-800/50 bg-slate-900/50">
        <h1 class="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400 flex items-center gap-3 tracking-tight">
          <span>⚛️</span> Dreamina Hub
        </h1>
        <p class="text-xs text-slate-400 mt-2 font-medium uppercase tracking-widest">Enterprise API Gateway</p>
      </div>

      <nav class="flex-1 px-4 py-6 space-y-2">
        <div class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 ml-2">核心管理 (Core Management)</div>
        <button @click="currentTab = 'accounts'" :class="currentTab === 'accounts' ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30' : 'text-slate-300 hover:bg-slate-800 hover:text-white border border-transparent'" class="w-full text-left px-5 py-3 rounded-xl font-semibold transition-all flex items-center justify-between group">
          <span class="flex items-center gap-3"><span class="text-lg">🤖</span> 内部账号池状态</span>
          <span v-if="currentTab === 'accounts'" class="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8)]"></span>
        </button>
        <button @click="currentTab = 'apikeys'" :class="currentTab === 'apikeys' ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30' : 'text-slate-300 hover:bg-slate-800 hover:text-white border border-transparent'" class="w-full text-left px-5 py-3 rounded-xl font-semibold transition-all flex items-center justify-between">
          <span class="flex items-center gap-3"><span class="text-lg">🔑</span> API 令牌分发</span>
          <span v-if="currentTab === 'apikeys'" class="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8)]"></span>
        </button>
        <button @click="currentTab = 'docs'" :class="currentTab === 'docs' ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30' : 'text-slate-300 hover:bg-slate-800 hover:text-white border border-transparent'" class="w-full text-left px-5 py-3 rounded-xl font-semibold transition-all flex items-center justify-between">
          <span class="flex items-center gap-3"><span class="text-lg">📚</span> 即梦全能 API 集成文档</span>
          <span v-if="currentTab === 'docs'" class="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8)]"></span>
        </button>

        <div class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 ml-2 mt-8 pt-6 border-t border-slate-800">系统设置 (System Settings)</div>
        <button @click="currentTab = 'settings'" :class="currentTab === 'settings' ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30' : 'text-slate-300 hover:bg-slate-800 hover:text-white border border-transparent'" class="w-full text-left px-5 py-3 rounded-xl font-semibold transition-all flex items-center justify-between">
          <span class="flex items-center gap-3"><span class="text-lg">⚙️</span> 管理员安全</span>
          <span v-if="currentTab === 'settings'" class="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8)]"></span>
        </button>
      </nav>

      <div class="p-6 border-t border-slate-800/50">
        <button @click="doLogout" class="w-full bg-slate-800 hover:bg-red-500/20 text-slate-300 hover:text-red-400 border border-slate-700 hover:border-red-500/50 py-3 rounded-xl font-bold transition-all text-sm flex items-center justify-center gap-2">
          <span>🚪</span> 退出中枢控制系统
        </button>
      </div>
    </aside>

    <main class="flex-1 p-10 overflow-y-auto h-screen custom-scrollbar">
      
      <!-- Docs Tab -->
      <div v-if="currentTab === 'docs'" class="max-w-5xl mx-auto">
        <div class="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-200/60 p-10 prose prose-slate max-w-none">
          <div class="flex items-center gap-4 mb-8 pb-6 border-b border-slate-100">
            <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-200">
              <span class="text-3xl text-white">📚</span>
            </div>
            <div>
              <h2 class="text-3xl font-black text-slate-800 m-0">即梦 (Dreamina) 完整 API 集成文档</h2>
              <p class="text-slate-500 m-0 mt-2 font-medium">企业级封装 • 兼容主流 OpenAI / 拓展双模态传输引擎</p>
            </div>
          </div>
          
          <div class="bg-amber-50/50 border-l-4 border-amber-400 p-5 my-8 rounded-r-xl shadow-sm">
            <h4 class="text-amber-800 m-0 font-bold flex items-center gap-2"><span class="text-xl">⚠️</span> 强烈推荐的上传核心规范 (Multipart/Form-Data)</h4>
            <p class="text-base text-amber-700 mt-2 mb-0 leading-relaxed">基于 CLI 机制的高负荷传输下，凡涉及图片生图、图片生视频、或者需要附带多图/音频等复杂的多模态任务（如 SD 垫图/控制网等附加通道）时，强烈建议<strong>坚决不使用 JSON Base64 编码载体</strong>！把海量的媒体数据转成 Base64 文本会导致 NodeJS 层严重的内存 V8 溢出危机和几十倍的网络传输损耗。请所有涉及文件的调用，一律直接抛弃 JSON 主体，强制使用 <code>multipart/form-data</code> 表单流式上传。我们的接收端已原生具备全流式缓冲区多字段接收能力。</p>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-6 my-8">
            <div class="bg-slate-50 p-6 rounded-2xl border border-slate-100">
              <h3 class="text-sm font-black uppercase text-slate-500 tracking-wider m-0 mb-4">🌐 生产级 Base URL</h3>
              <code class="block text-indigo-600 bg-indigo-50/50 p-3 rounded-lg border border-indigo-100 font-mono font-bold text-lg">http://{您的服务器IP}:3000/v1</code>
            </div>
            <div class="bg-slate-50 p-6 rounded-2xl border border-slate-100">
              <h3 class="text-sm font-black uppercase text-slate-500 tracking-wider m-0 mb-4">🔐 Authentication (认证方案)</h3>
              <p class="m-0 mb-2 text-slate-600">使用全局分发的令牌，存放于请求头 Header 中：</p>
              <code class="block text-slate-700 bg-white p-3 rounded-lg border border-slate-200 font-mono font-bold">Authorization: Bearer sk-jm-xxx...</code>
            </div>
          </div>

          <div class="relative mt-12 pt-8 border-t-2 border-dashed border-slate-200">
            <div class="absolute -top-[18px] left-8 bg-slate-900 text-white px-4 py-1.5 rounded-full text-xs font-bold shadow-lg uppercase tracking-wider">ENDPOINT #1</div>
            <h3 class="text-2xl font-black text-slate-800 flex items-center gap-3">
              <span class="text-indigo-500">🎨</span> 图像推演工厂 (Image Generations)
            </h3>
            <p class="text-lg text-slate-600 font-medium">支持端点: <code class="bg-slate-100 px-3 py-1 rounded text-slate-800 font-bold font-mono">POST /v1/images/generations</code></p>
            <p class="text-slate-600">此端点支持 <code>application/json</code> (纯文本生图) 或 <code>multipart/form-data</code> (带附件/图生图/控制图) 两种请求模式。若传递图生图或控制网等图源约束，请并行追加多个名为 <code>images</code> 的文件实体流。</p>

            <div class="bg-slate-900 rounded-2xl overflow-hidden mt-6 shadow-xl">
              <div class="bg-slate-800 px-4 py-2 flex items-center gap-2 border-b border-slate-700/50">
                <span class="w-3 h-3 rounded-full bg-red-500/80"></span>
                <span class="w-3 h-3 rounded-full bg-yellow-500/80"></span>
                <span class="w-3 h-3 rounded-full bg-green-500/80"></span>
                <span class="ml-2 text-xs font-mono text-slate-400">JSON Payload (文生图)</span>
              </div>
              <pre class="bg-transparent m-0 p-6 text-sm"><code class="language-json text-indigo-300">{
  <span class="text-sky-300">"model"</span>: <span class="text-emerald-300">"5.0"</span>,           <span class="text-slate-500">// 模型引擎矩阵: "3.0", "3.1", "4.0", "4.1", "4.5", "4.6", "5.0" (推荐即梦顶级推演模型)</span>
  <span class="text-sky-300">"prompt"</span>: <span class="text-emerald-300">"一只超写实的机械猫，赛博朋克风格"</span>,
  <span class="text-sky-300">"size"</span>: <span class="text-emerald-300">"1024x1024"</span>,      <span class="text-slate-500">// 物理尺寸会严格映射到即梦内部 ratio，形如 "16:9", "1:1", "3:4" 等泛化格式亦均受支持</span>
  <span class="text-sky-300">"n"</span>: <span class="text-purple-300">1</span>
}</code></pre>
            </div>

            <div class="bg-slate-900 rounded-2xl overflow-hidden mt-6 shadow-xl">
              <div class="bg-slate-800 px-4 py-2 flex items-center gap-2 border-b border-slate-700/50">
                <span class="text-xs font-mono text-slate-400">cURL 纯流式上传图生图调用</span>
              </div>
              <pre class="bg-transparent m-0 p-6 text-sm"><code class="language-bash text-slate-300"><span class="text-indigo-400">curl</span> -X POST http://您的服务器IP:3000/v1/images/generations \
  -H <span class="text-emerald-300">"Authorization: Bearer sk-jm-xxx"</span> \
  -F <span class="text-amber-300">"model=5.0"</span> \
  -F <span class="text-amber-300">"prompt=让这只猫变成机械风格"</span> \
  -F <span class="text-amber-300">"ratio=16:9"</span> \
  -F <span class="text-emerald-300">"images=@/path/to/cat.jpg"</span> \
  -F <span class="text-emerald-300">"images=@/path/to/depth_map.png"</span>
  <span class="text-slate-500"># （引擎自动封包 MultiPart。最多并发支撑单次 10+ 附件投喂作为复合限制帧源！）</span></code></pre>
            </div>
          </div>

          <div class="relative mt-12 pt-8 border-t-2 border-dashed border-slate-200">
            <div class="absolute -top-[18px] left-8 bg-slate-900 text-white px-4 py-1.5 rounded-full text-xs font-bold shadow-lg uppercase tracking-wider">ENDPOINT #2</div>
            <h3 class="text-2xl font-black text-slate-800 flex items-center gap-3">
              <span class="text-blue-500">🎥</span> 视频深度序列推演 (Video Generations)
            </h3>
            <p class="text-lg text-slate-600 font-medium">支持端点: <code class="bg-slate-100 px-3 py-1 rounded text-slate-800 font-bold font-mono">POST /v1/videos/generations</code></p>
            <p class="text-slate-600">解锁即梦最具统治力的 <strong>Seedance 大模型</strong> 序列化能力！无论您需要首部画面约束 (Image2Video)，还是精准音轨对位同步匹配播音，请在同一 HTTP 请求内部，并发把所有文件数据封装作表单传达至服务器核心。</p>

            <div class="bg-slate-900 rounded-2xl overflow-hidden mt-6 shadow-xl">
              <div class="bg-slate-800 px-4 py-2 flex items-center gap-2 border-b border-slate-700/50">
                <span class="ml-2 text-xs font-mono text-slate-400">JSON Payload (文本生视频)</span>
              </div>
              <pre class="bg-transparent m-0 p-6 text-sm"><code class="language-json text-indigo-300">{
  <span class="text-sky-300">"model"</span>: <span class="text-emerald-300">"seedance2.0_vip"</span>, <span class="text-slate-500">// 视频主控引擎矩阵支持：seedance2.0, seedance2.0fast, seedance2.0_vip, seedance2.0fast_vip, 3.5pro, 3.0_pro...</span>
  <span class="text-sky-300">"prompt"</span>: <span class="text-emerald-300">"电影级镜头，一辆跑车在赛博朋克城市的雨夜疾驰"</span>,
  <span class="text-sky-300">"duration"</span>: <span class="text-purple-300">5</span>,              <span class="text-slate-500">// CLI 限定物理推演时长：支持任意自选界限处于 4 (极限短) 到 15 (深度渲染上限) (单位：秒)</span>
  <span class="text-sky-300">"ratio"</span>: <span class="text-emerald-300">"16:9"</span>             <span class="text-slate-500">// 构图布局比矩阵支持: 1:1, 3:4, 16:9, 4:3, 9:16, 21:9</span>
}</code></pre>
            </div>

            <div class="bg-slate-900 rounded-2xl overflow-hidden mt-6 shadow-xl">
              <div class="bg-slate-800 px-4 py-2 flex items-center gap-2 border-b border-slate-700/50">
                <span class="text-xs font-mono text-slate-400">cURL 极其强势的多模态合并请求引擎 (图生视频+音轨同步)</span>
              </div>
              <pre class="bg-transparent m-0 p-6 text-sm"><code class="language-bash text-slate-300"><span class="text-indigo-400">curl</span> -X POST http://您的服务器IP:3000/v1/videos/generations \
  -H <span class="text-emerald-300">"Authorization: Bearer sk-jm-xxx"</span> \
  -F <span class="text-amber-300">"model=seedance2.0"</span> \
  -F <span class="text-amber-300">"prompt=人物根据传入发音进行同步对口型说出那句话"</span> \
  -F <span class="text-amber-300">"duration=5"</span> \
  -F <span class="text-emerald-300">"image=@/path/to/human_face.jpg"</span> \
  -F <span class="text-emerald-300">"audio=@/path/to/voice_record.mp3"</span>
  <span class="text-slate-500"># （系统自动进行流切片识别：带有 image 且具备 audio 时立刻启用对齐音波的极值大模型分支接口路线）</span></code></pre>
            </div>
          </div>
          
          <div class="mt-12 p-6 bg-gradient-to-r from-indigo-50/50 to-purple-50/50 border border-indigo-100 rounded-2xl shadow-sm">
            <div class="flex gap-4">
              <span class="text-4xl">💡</span>
              <div>
                <h4 class="text-lg font-bold text-indigo-900 mb-2">客户端全景测试建议 / 浏览器即开即用控制台</h4>
                <p class="text-indigo-700 leading-relaxed mb-4">
                  我们在项目物理根目录为您准备了一份名为 <code>test_client.html</code> 的无头轻量级超强可视化控制机。
                  <br/>您无需任何启动器，直接鼠标双击以 Chrome / Edge 等浏览器打开，填入在平台分发的 API Key 即可进行所有视觉/参数关联度边界测试。该测试机已经完全集成了最优的极简 <code>FormData</code> 二进制传输实现范式供各位底层开发成员右键“查看源码”参考。
                </p>
                <a href="/test_client.html" target="_blank" class="inline-flex items-center gap-2 bg-indigo-600 text-white px-6 py-2.5 rounded-lg font-bold shadow-md shadow-indigo-600/30 hover:bg-indigo-700 transition transform hover:-translate-y-0.5">
                  全景打通！开启独立测试沙箱 <span class="text-xs">↗</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Settings Tab -->
      <div v-if="currentTab === 'settings'" class="max-w-3xl mx-auto">
        <div class="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-200/60 overflow-hidden">
          <div class="p-8 border-b border-slate-100 bg-slate-50/50">
            <h2 class="text-2xl font-black text-slate-800 flex items-center gap-3"><span class="text-slate-400">⚙️</span> 系统核心安全设置</h2>
            <p class="text-slate-500 mt-2 font-medium">配置超级管理员凭证、防护基础安全矩阵。</p>
          </div>
          
          <div class="p-8">
            <form @submit.prevent="doUpdatePassword" class="space-y-6 max-w-sm">
              <div>
                <label class="block text-sm font-bold text-slate-700 mb-2">当前管理员密码</label>
                <input v-model="oldPassword" type="password" required class="w-full bg-slate-50 border border-slate-200 text-slate-800 px-4 py-3 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition" />
              </div>
              <div>
                <label class="block text-sm font-bold text-slate-700 mb-2">重置出新密码</label>
                <input v-model="newPassword" type="password" required class="w-full bg-slate-50 border border-slate-200 text-slate-800 px-4 py-3 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition" />
              </div>
              
              <div v-if="pwdError" class="p-4 bg-red-50 text-red-700 rounded-xl border border-red-100 font-medium text-sm flex items-center gap-2">
                <span class="text-red-500">❌</span> {{ pwdError }}
              </div>
              <div v-if="pwdMessage" class="p-4 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-100 font-medium text-sm flex items-center gap-2">
                <span class="text-emerald-500">✅</span> {{ pwdMessage }}
              </div>

              <button type="submit" class="bg-slate-900 hover:bg-slate-800 text-white font-bold px-6 py-3 rounded-xl transition shadow-lg shadow-slate-900/20 active:scale-95">
                执行凭证修改操作
              </button>
            </form>
          </div>
        </div>
      </div>

      <!-- Accounts Tab -->
      <div v-if="currentTab === 'accounts'" class="max-w-6xl mx-auto">
        <div class="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-200/60 p-8">
          <div class="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
            <div>
              <h2 class="text-3xl font-black text-slate-800 flex items-center gap-3"><span class="text-indigo-500">🤖</span>内部挂载矩阵状态</h2>
              <p class="text-slate-500 mt-2 font-medium">查看并维护由 Jimeng CLI 同步接驳进来的官方物理账号执行流管线。</p>
            </div>
            <button @click="setupNewAccount" :disabled="loading" class="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-bold transition shadow-lg shadow-indigo-600/30 disabled:opacity-50 flex items-center gap-2 transform hover:-translate-y-0.5 active:scale-95">
              <span v-if="loading" class="animate-spin text-lg">⏳</span>
              <span v-else class="text-lg">➕</span>
              {{ loading ? '请求下发授权...' : '接驳全新挂载账号' }}
            </button>
          </div>

          <!-- UI 对话框与反馈矩阵 -->
          <div v-if="errorMessage" class="mb-8 p-5 rounded-2xl bg-red-50 border border-red-100 shadow-inner">
            <h3 class="text-red-800 font-black mb-2 flex items-center gap-2"><span class="text-xl">❌</span> 截获物理级异常抛出：</h3>
            <p class="text-red-700 font-mono text-sm leading-relaxed whitespace-pre-wrap select-all bg-white/50 p-4 rounded-xl">{{ errorMessage }}</p>
          </div>

          <div v-if="successMessage" class="mb-8 p-6 rounded-2xl bg-emerald-50 border border-emerald-100 shadow-inner">
            <h3 class="text-emerald-800 font-black mb-4 flex items-center gap-2"><span class="text-xl">✅</span> {{ successMessage }}</h3>
            <div v-if="authUrl" class="p-4 bg-white border border-emerald-200 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
              <span class="text-emerald-700 font-mono text-sm break-all font-bold select-all bg-emerald-50 p-3 rounded-lg flex-1 border border-emerald-100/50">{{ authUrl }}</span>
              <a :href="authUrl" target="_blank" class="whitespace-nowrap bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-emerald-500/30 hover:bg-emerald-700 transition flex items-center gap-2 transform hover:-translate-y-0.5">
                <span class="text-xl">🚀</span> 点击起飞前往扫码接驳
              </a>
            </div>
          </div>

          <!-- 主体表格 -->
          <div class="overflow-hidden rounded-2xl border border-slate-200">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="bg-slate-50 text-slate-500 font-black uppercase text-xs tracking-wider border-b border-slate-200">
                  <th class="p-5">账号逻辑 ID</th>
                  <th class="p-5">环境流隔离层属目录</th>
                  <th class="p-5">运行状态机</th>
                  <th class="p-5">剩余能量余位</th>
                  <th class="p-5">物理接入初次握手时间</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                <tr v-for="acc in accounts" :key="acc.id" class="hover:bg-slate-50/50 transition">
                  <td class="p-5 font-bold text-slate-800">{{ acc.name }}</td>
                  <td class="p-5 font-mono text-xs text-slate-500 truncate max-w-[200px]" :title="acc.homeDir">{{ acc.homeDir }}</td>
                  <td class="p-5">
                    <span class="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider" 
                          :class="{
                            'bg-emerald-100 text-emerald-700': acc.status === 'IDLE',
                            'bg-amber-100 text-amber-700': acc.status === 'BUSY',
                            'bg-red-100 text-red-700': acc.status === 'ERROR' || acc.status === 'OFFLINE'
                          }">
                      {{ acc.status }}
                    </span>
                  </td>
                  <td class="p-5">
                    <span class="font-mono font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-lg">🔋 {{ acc.creditBalance }} pts</span>
                  </td>
                  <td class="p-5 text-slate-500 text-sm font-medium">{{ new Date(acc.createdAt).toLocaleString() }}</td>
                </tr>
                <tr v-if="accounts.length === 0">
                  <td colspan="5" class="p-16 text-center text-slate-400">
                    <div class="text-5xl mb-4">📭</div>
                    <div class="text-lg font-bold">尚无物理账号接驳。请挂载新账号填充矩阵！</div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- API Keys Tab -->
      <div v-if="currentTab === 'apikeys'" class="max-w-6xl mx-auto">
        <div class="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-200/60 p-8">
          <div class="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
            <div>
              <h2 class="text-3xl font-black text-slate-800 flex items-center gap-3"><span class="text-indigo-500">🔑</span>对外授权令牌分中心</h2>
              <p class="text-slate-500 mt-2 font-medium">铸造全方位网关 Token 以交接外部系统调动。</p>
            </div>
            <div class="flex gap-3 bg-slate-50 p-2 rounded-2xl border border-slate-200 shadow-inner">
              <input v-model="apiKeyOwner" placeholder="标识分配实体 (E.g. iOS_Team)" class="bg-white border border-slate-200 px-4 py-3 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500 w-56" />
              <input v-model.number="apiKeyQuota" type="number" placeholder="信用额度(可选)" class="bg-white border border-slate-200 px-4 py-3 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500 w-40" />
              <button @click="generateApiKey" :disabled="loading" class="bg-slate-900 hover:bg-slate-800 text-white font-bold px-6 py-3 rounded-xl transition shadow-lg shadow-slate-900/20 active:scale-95 disabled:opacity-50">
                ⚡ 凭空铸造
              </button>
            </div>
          </div>

          <div v-if="apiKeyResult" class="mb-8 p-6 rounded-2xl bg-emerald-50 border border-emerald-100 shadow-inner flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 class="text-emerald-800 font-black mb-1 flex items-center gap-2"><span class="text-xl">✅</span> 新 API 令牌已成功铸成！</h3>
              <p class="text-emerald-600 text-sm font-medium">请当场复制交付客户！系统不再进行明文明码显现存根保护。</p>
            </div>
            <code class="text-emerald-900 font-mono text-lg font-bold select-all bg-white px-5 py-3 rounded-xl border border-emerald-200 shadow-sm">{{ apiKeyResult }}</code>
          </div>

          <div class="overflow-hidden rounded-2xl border border-slate-200">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="bg-slate-50 text-slate-500 font-black uppercase text-xs tracking-wider border-b border-slate-200">
                  <th class="p-5">主网通行证脱敏密文</th>
                  <th class="p-5">发行交付方</th>
                  <th class="p-5">已汲取执行数</th>
                  <th class="p-5">总配给配额</th>
                  <th class="p-5">封锁状态</th>
                  <th class="p-5">创建元年</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                <tr v-for="key in apikeys" :key="key.id" class="hover:bg-slate-50/50 transition">
                  <td class="p-5 font-mono text-sm font-bold text-slate-700">{{ key.key.substring(0, 10) }}•••••••••••</td>
                  <td class="p-5 font-bold text-slate-800">{{ key.owner }}</td>
                  <td class="p-5 font-mono font-bold text-indigo-600">{{ key.used }} 次</td>
                  <td class="p-5 font-mono">{{ key.quota || '∞ 无尽模式' }}</td>
                  <td class="p-5">
                    <span class="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider" 
                          :class="key.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'">
                      {{ key.isActive ? '✅ 畅行中' : '🚫 已吊销' }}
                    </span>
                  </td>
                  <td class="p-5 text-slate-500 text-sm font-medium">{{ new Date(key.createdAt).toLocaleString() }}</td>
                </tr>
                <tr v-if="apikeys.length === 0">
                  <td colspan="6" class="p-16 text-center text-slate-400">
                    <div class="text-5xl mb-4">🎟️</div>
                    <div class="text-lg font-bold">通道大门空空如也，仍无密钥。</div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

    </main>
  </div>
</template>

<style>
/* Custom Scrollbar for inner components if needed */
.custom-scrollbar::-webkit-scrollbar { width: 8px; height: 8px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
.custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
</style>
`

fs.writeFileSync('frontend/src/App.vue', vueContent);
console.log('Admin modernized successfully!');
