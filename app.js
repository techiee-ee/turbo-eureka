// =============================================
// IG STUDIO — app.js (Enhanced v2)
// =============================================

const API_BASE = 'https://graph.instagram.com';
let USER_ID = '', TOKEN = '';
let charts = {};
let allPosts = [];
let filteredPosts = [];
let postsOffset = 0;
const POSTS_PER_PAGE = 16;
let currentTypeFilter = 'ALL';

// =============================================
// INIT
// =============================================
window.addEventListener('DOMContentLoaded', () => {
  USER_ID = localStorage.getItem('ig_user_id') || '';
  TOKEN   = localStorage.getItem('ig_token') || '';
  if (USER_ID && TOKEN) { showDashboard(); loadAllData(); }
  else document.getElementById('setup-screen').classList.remove('hidden');
});

function saveCredentials() {
  const uid = document.getElementById('input-user-id').value.trim();
  const tok = document.getElementById('input-token').value.trim();
  if (!uid || !tok) { showToast('⚠ Please fill in both fields.'); return; }
  localStorage.setItem('ig_user_id', uid);
  localStorage.setItem('ig_token', tok);
  USER_ID = uid; TOKEN = tok;
  showDashboard(); loadAllData();
}

function logout() {
  localStorage.removeItem('ig_user_id');
  localStorage.removeItem('ig_token');
  location.reload();
}

function showDashboard() {
  document.getElementById('setup-screen').classList.add('hidden');
  document.getElementById('dashboard').classList.remove('hidden');
}

// =============================================
// NAVIGATION
// =============================================
function showSection(name) {
  document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const el = document.getElementById(`section-${name}`);
  if (el) el.classList.remove('hidden');
  document.querySelectorAll('.nav-item').forEach(n => {
    if (n.getAttribute('onclick')?.includes(`'${name}'`)) n.classList.add('active');
  });
  const titles = {
    overview: 'Overview', posts: 'Posts', compare: 'Compare Posts',
    engagement: 'Engagement', hashtags: 'Hashtag Tracker', captions: 'Caption Analysis',
    audience: 'Audience', reach: 'Reach & Views', besttime: 'Best Time to Post', export: 'Export Data'
  };
  document.getElementById('section-title').textContent = titles[name] || name;
  // Close mobile sidebar
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.add('hidden');
}

function toggleSidebar() {
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('sidebar-overlay');
  sb.classList.toggle('open');
  ov.classList.toggle('hidden');
}

// =============================================
// API HELPER
// =============================================
async function igFetch(path, params = {}) {
  params.access_token = TOKEN;
  const qs  = new URLSearchParams(params).toString();
  const res = await fetch(`${API_BASE}/${path}?${qs}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data;
}

// =============================================
// LOAD ALL
// =============================================
async function loadAllData() {
  setLoading(true);
  try {
    setLoadingStep('Loading profile...');
    await loadProfile();
    setLoadingStep('Fetching insights...');
    await loadInsights();
    setLoadingStep('Loading posts...');
    await loadPosts();
    setLoadingStep('Fetching audience data...');
    await loadAudience();
    document.getElementById('last-refresh').textContent = new Date().toLocaleTimeString();
    setLoading(false);
    computeHealthScore();
    renderEngagementSection();
    renderBestTimeSection();
    renderExportSection();
  } catch (err) {
    setLoading(false, err.message);
  }
}

function setLoadingStep(msg) {
  const el = document.getElementById('loading-step');
  if (el) el.textContent = msg;
}

function setLoading(on, errMsg) {
  const loadEl = document.getElementById('loading-state');
  const errEl  = document.getElementById('error-state');
  const wrap   = document.getElementById('sections-wrapper');
  if (on) {
    loadEl.classList.remove('hidden');
    errEl.classList.add('hidden');
    wrap.classList.add('hidden');
  } else {
    loadEl.classList.add('hidden');
    if (errMsg) {
      errEl.classList.remove('hidden');
      document.getElementById('error-message').textContent = `⚠ ${errMsg}`;
      wrap.classList.add('hidden');
    } else {
      errEl.classList.add('hidden');
      wrap.classList.remove('hidden');
      document.getElementById('section-overview').classList.remove('hidden');
    }
  }
}

// =============================================
// PROFILE
// =============================================
async function loadProfile() {
  const d = await igFetch(`${USER_ID}`, {
    fields: 'username,name,followers_count,follows_count,media_count'
  });
  const name = d.name || d.username;
  document.getElementById('sidebar-name').textContent   = name;
  document.getElementById('sidebar-handle').textContent = `@${d.username}`;
  document.getElementById('sidebar-avatar').textContent = (name[0] || '?').toUpperCase();
  document.getElementById('stat-following').textContent = fmt(d.follows_count || 0);
  document.getElementById('stat-posts').textContent     = fmt(d.media_count || 0);
  const fc = d.followers_count || 0;
  document.getElementById('stat-followers').textContent = fmt(fc);
  trackFollowers(fc);
  window._followers = fc;
}

function trackFollowers(count) {
  const history = JSON.parse(localStorage.getItem('ig_follower_history') || '[]');
  const today   = new Date().toISOString().split('T')[0];
  if (!history.find(h => h.date === today)) {
    history.push({ date: today, count });
    if (history.length > 90) history.shift();
    localStorage.setItem('ig_follower_history', JSON.stringify(history));
  }
  const el = document.getElementById('delta-followers');
  if (history.length >= 2) {
    const delta = count - history[history.length - 2].count;
    el.textContent = delta > 0 ? `▲ +${delta} since yesterday` : delta < 0 ? `▼ ${delta} since yesterday` : '— No change';
    el.className = `stat-delta ${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}`;
  } else {
    el.textContent = 'Check back tomorrow for growth data';
  }
  if (history.length >= 8) {
    const now   = history[history.length - 1].count;
    const week  = history[history.length - 8].count;
    const rate  = week > 0 ? (((now - week) / week) * 100).toFixed(2) : 0;
    const rEl   = document.getElementById('stat-growth-rate');
    rEl.textContent = `${rate > 0 ? '+' : ''}${rate}%`;
    rEl.style.color  = rate > 0 ? '#6ee7b7' : rate < 0 ? '#f87171' : 'inherit';
    window._growthRate = parseFloat(rate);
  } else {
    document.getElementById('stat-growth-rate').textContent = 'Building...';
    document.getElementById('delta-growth-label').textContent = 'Need 8+ days';
    window._growthRate = 0;
  }
  renderFollowerChart(history);
}

// =============================================
// INSIGHTS
// =============================================
async function loadInsights() {
  const data = await igFetch(`${USER_ID}/insights`, {
    metric: 'profile_views,reach,website_clicks,accounts_engaged,total_interactions,views',
    period: 'days_28'
  });
  const vals = {};
  (data.data || []).forEach(m => {
    vals[m.name] = m.values?.reduce((s, v) => s + (v.value || 0), 0) || m.total_value?.value || 0;
  });
  document.getElementById('stat-profile-views').textContent = fmt(vals.profile_views || 0);
  document.getElementById('stat-reach').textContent         = fmt(vals.reach || 0);
  document.getElementById('stat-impressions').textContent   = fmt(vals.views || vals.total_interactions || 0);
  document.getElementById('reach-accounts').textContent     = fmt(vals.reach || 0);
  document.getElementById('reach-impressions').textContent  = fmt(vals.views || 0);
  document.getElementById('reach-website').textContent      = fmt(vals.website_clicks || 0);
  document.getElementById('reach-email').textContent        = fmt(vals.accounts_engaged || 0);
  window._reach28 = vals.reach || 0;
  window._views28 = vals.views || 0;
  renderReachChart(vals.reach || 0, vals.views || 0);
  await loadDailyInsights();
}

async function loadDailyInsights() {
  try {
    const data = await igFetch(`${USER_ID}/insights`, { metric: 'views', period: 'day' });
    const raw  = data.data?.[0]?.values || [];
    renderDailyImpressionsChart(
      raw.map(v => { const d = new Date(v.end_time); return `${d.getMonth()+1}/${d.getDate()}`; }),
      raw.map(v => v.value || 0)
    );
  } catch(e) {}
}

// =============================================
// POSTS
// =============================================
async function loadPosts() {
  const data = await igFetch(`${USER_ID}/media`, {
    fields: 'id,caption,media_type,media_url,thumbnail_url,timestamp,like_count,comments_count,permalink',
    limit: 50
  });
  allPosts = data.data || [];
  filteredPosts = [...allPosts];
  renderPostsGrid();
  populateCompareSelects();
  renderHashtagSection();
  renderCaptionAnalysis();
  renderTopPostsRow();
}

function renderTopPostsRow() {
  const sorted = [...allPosts].sort((a, b) => (b.like_count||0) - (a.like_count||0)).slice(0, 4);
  const el = document.getElementById('top-posts-row');
  if (!el || !sorted.length) return;
  el.innerHTML = sorted.map(p => {
    const thumb = p.media_url || p.thumbnail_url;
    return `<div class="post-card glass border border-white/8" onclick="openModal('${p.id}')">
      ${thumb ? `<img class="post-thumb rounded-t-2xl" src="${thumb}" loading="lazy" alt="Post"/>` : `<div class="post-thumb-placeholder rounded-t-2xl">🖼</div>`}
      <div class="p-3">
        <div class="flex items-center gap-3 text-xs">
          <span class="text-neutral-400">❤ ${fmt(p.like_count||0)}</span>
          <span class="text-neutral-500">💬 ${fmt(p.comments_count||0)}</span>
        </div>
      </div>
    </div>`;
  }).join('');
}

function renderPostsGrid(posts) {
  const grid = document.getElementById('posts-grid');
  if (!grid) return;
  const list = posts || filteredPosts;
  if (!list.length) { grid.innerHTML = '<p class="text-sm text-neutral-600 col-span-4">No posts match.</p>'; return; }
  const show = list.slice(0, postsOffset + POSTS_PER_PAGE);
  grid.innerHTML = show.map(p => postCardHTML(p)).join('');
  const btn = document.getElementById('load-more-btn');
  if (btn) btn.classList.toggle('hidden', show.length >= list.length);
}

function loadMorePosts() {
  postsOffset += POSTS_PER_PAGE;
  renderPostsGrid();
}

function filterPosts() {
  const q = document.getElementById('post-search').value.toLowerCase();
  filteredPosts = allPosts.filter(p => {
    const matchType = currentTypeFilter === 'ALL' || p.media_type === currentTypeFilter;
    const matchQ = !q || (p.caption || '').toLowerCase().includes(q);
    return matchType && matchQ;
  });
  applySort();
  postsOffset = 0;
  renderPostsGrid();
}

function filterType(type, btn) {
  currentTypeFilter = type;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  filterPosts();
}

function sortPosts(val) {
  const sort = val || document.getElementById('sort-select')?.value || 'date';
  if (sort === 'likes')    filteredPosts.sort((a, b) => (b.like_count||0) - (a.like_count||0));
  if (sort === 'comments') filteredPosts.sort((a, b) => (b.comments_count||0) - (a.comments_count||0));
  if (sort === 'date')     filteredPosts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  postsOffset = 0;
  renderPostsGrid();
}

function applySort() {
  const sort = document.getElementById('sort-select')?.value || 'date';
  sortPosts(sort);
}

function postCardHTML(p) {
  const thumb     = p.media_url || p.thumbnail_url;
  const typeLabel = { IMAGE: 'IMG', VIDEO: 'VID', CAROUSEL_ALBUM: 'CAR' }[p.media_type] || '—';
  const date      = new Date(p.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const er = allPosts.length && window._followers
    ? (((p.like_count||0)+(p.comments_count||0))/window._followers*100).toFixed(2)
    : null;
  return `
    <div class="post-card glass border border-white/8" onclick="openModal('${p.id}')">
      ${thumb ? `<img class="post-thumb rounded-t-2xl" src="${thumb}" loading="lazy" alt="Post"/>` : `<div class="post-thumb-placeholder rounded-t-2xl text-2xl">🖼</div>`}
      <div class="p-3 space-y-1.5">
        <div class="flex items-center justify-between">
          <span class="text-[10px] font-bold uppercase tracking-widest text-neutral-600">${typeLabel}</span>
          <span class="text-[10px] text-neutral-600">${date}</span>
        </div>
        <div class="flex items-center gap-3 text-xs">
          <span class="text-neutral-300">❤ <strong class="text-white">${fmt(p.like_count||0)}</strong></span>
          <span class="text-neutral-500">💬 ${fmt(p.comments_count||0)}</span>
          ${er ? `<span class="text-neutral-600 ml-auto">${er}%</span>` : ''}
        </div>
      </div>
    </div>`;
}

// =============================================
// POST MODAL
// =============================================
function openModal(postId) {
  const p = allPosts.find(x => x.id === postId);
  if (!p) return;
  const thumb = p.media_url || p.thumbnail_url;
  const date  = new Date(p.timestamp).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const tags  = (p.caption || '').match(/#\w+/g) || [];
  const er    = window._followers
    ? (((p.like_count||0)+(p.comments_count||0))/window._followers*100).toFixed(2)
    : '—';

  document.getElementById('modal-content').innerHTML = `
    <div>
      ${thumb ? `<img src="${thumb}" alt="Post" class="w-full rounded-t-3xl object-cover" style="max-height:320px"/>` : ''}
      <div class="p-6 space-y-4">
        <div class="flex items-start justify-between gap-4">
          <span class="text-xs text-neutral-500 border border-white/8 rounded-full px-2 py-0.5">${p.media_type?.replace('_',' ')}</span>
          <button onclick="closeModal()" class="text-neutral-600 hover:text-white text-xl transition-colors">✕</button>
        </div>
        <div class="grid grid-cols-4 gap-3">
          ${statMini('Likes', fmt(p.like_count||0))}
          ${statMini('Comments', fmt(p.comments_count||0))}
          ${statMini('Eng. Rate', er+'%')}
          ${statMini('Posted', date)}
        </div>
        ${p.caption ? `<div class="bg-white/3 rounded-xl p-4 text-sm text-neutral-300 leading-relaxed">${escHtml(p.caption)}</div>` : ''}
        ${tags.length ? `<div class="flex flex-wrap gap-1.5">${tags.map(t => `<span class="tag-pill">${escHtml(t)}</span>`).join('')}</div>` : ''}
        <div class="flex gap-3">
          <a href="${p.permalink}" target="_blank" rel="noopener" class="btn-primary text-sm flex-1 text-center">View on Instagram ↗</a>
        </div>
      </div>
    </div>`;
  document.getElementById('post-modal').classList.remove('hidden');
}

function statMini(label, value) {
  return `<div class="glass border border-white/8 rounded-xl p-3 text-center">
    <div class="text-[10px] uppercase tracking-widest text-neutral-600 mb-1">${label}</div>
    <div class="font-display font-bold text-white text-sm">${value}</div>
  </div>`;
}

function closeModal(e) {
  if (!e || e.target === document.getElementById('post-modal') || e.target.tagName === 'BUTTON') {
    document.getElementById('post-modal').classList.add('hidden');
  }
}

// =============================================
// COMPARE POSTS
// =============================================
function populateCompareSelects() {
  const opts = allPosts.map(p => {
    const label = p.caption ? p.caption.substring(0, 45) + '…' : `Post ${p.id.slice(-6)}`;
    return `<option value="${p.id}">${escHtml(label)}</option>`;
  }).join('');
  ['compare-a', 'compare-b'].forEach(id => {
    document.getElementById(id).innerHTML = '<option value="">— Select a post —</option>' + opts;
  });
}

function runCompare() {
  const idA = document.getElementById('compare-a').value;
  const idB = document.getElementById('compare-b').value;
  if (!idA || !idB || idA === idB) { showToast('⚠ Pick two different posts.'); return; }
  const pA = allPosts.find(p => p.id === idA);
  const pB = allPosts.find(p => p.id === idB);
  if (!pA || !pB) return;
  document.getElementById('compare-result').classList.remove('hidden');
  renderCompareCard('ccard-a', pA, pB, 'A');
  renderCompareCard('ccard-b', pB, pA, 'B');
  renderCompareChart(pA, pB);
  const lw = (pA.like_count||0) > (pB.like_count||0) ? 'A' : 'B';
  const cw = (pA.comments_count||0) > (pB.comments_count||0) ? 'A' : 'B';
  const overall = lw === 'A' && cw === 'A' ? 'Post A' : lw === 'B' && cw === 'B' ? 'Post B' : 'Tie';
  document.getElementById('compare-winner').innerHTML = overall === 'Tie'
    ? `🤝 It's a tie — both posts performed similarly.`
    : `🏆 ${overall} wins — higher likes and comments!`;
}

function renderCompareCard(elId, post, other, label) {
  const thumb = post.media_url || post.thumbnail_url;
  const lWon  = (post.like_count||0) >= (other.like_count||0);
  const cWon  = (post.comments_count||0) >= (other.comments_count||0);
  const date  = new Date(post.timestamp).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
  const er    = window._followers ? (((post.like_count||0)+(post.comments_count||0))/window._followers*100).toFixed(2) : '—';
  document.getElementById(elId).innerHTML = `
    <div class="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-3">Post ${label}</div>
    ${thumb ? `<img src="${thumb}" alt="Post" class="w-full rounded-xl mb-4" style="aspect-ratio:1;object-fit:cover"/>` : `<div style="aspect-ratio:1;" class="glass rounded-xl mb-4 flex items-center justify-center text-3xl">🖼</div>`}
    <p class="text-xs text-neutral-500 mb-4">${escHtml((post.caption||'No caption').substring(0,90))}…</p>
    ${cRow('❤ Likes', fmt(post.like_count||0), lWon)}
    ${cRow('💬 Comments', fmt(post.comments_count||0), cWon)}
    ${cRow('📊 Eng. Rate', er+'%', false)}
    ${cRow('📅 Date', date, false)}
    ${cRow('📌 Type', (post.media_type||'—').replace('_',' '), false)}`;
}

function cRow(label, val, winner) {
  return `<div class="flex items-center justify-between py-2 border-b border-white/4 text-sm">
    <span class="text-neutral-500">${label}</span>
    <span class="font-semibold ${winner ? 'text-emerald-400' : 'text-white'}">${val}${winner ? ' ✓' : ''}</span>
  </div>`;
}

function renderCompareChart(pA, pB) {
  destroyChart('compare');
  const ctx = document.getElementById('chart-compare').getContext('2d');
  charts.compare = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Likes', 'Comments'],
      datasets: [
        { label: 'Post A', data: [pA.like_count||0, pA.comments_count||0], backgroundColor: 'rgba(255,255,255,0.6)', borderColor: 'rgba(255,255,255,0.8)', borderWidth: 1, borderRadius: 6 },
        { label: 'Post B', data: [pB.like_count||0, pB.comments_count||0], backgroundColor: 'rgba(255,255,255,0.15)', borderColor: 'rgba(255,255,255,0.3)', borderWidth: 1, borderRadius: 6 }
      ]
    },
    options: { ...chartDefaults(), responsive: true }
  });
}

// =============================================
// ENGAGEMENT SECTION (NEW)
// =============================================
function renderEngagementSection() {
  if (!allPosts.length) return;
  const posts = allPosts.filter(p => typeof p.like_count === 'number');
  const totalLikes    = posts.reduce((s, p) => s + (p.like_count||0), 0);
  const totalComments = posts.reduce((s, p) => s + (p.comments_count||0), 0);
  const avgLikes      = Math.round(totalLikes / posts.length);
  const avgComments   = Math.round(totalComments / posts.length);
  const bestLikes     = Math.max(...posts.map(p => p.like_count||0));
  const followers     = window._followers || 1;
  const engRate       = ((avgLikes + avgComments) / followers * 100).toFixed(2);
  const erClass       = engRate >= 3 ? 'er-great' : engRate >= 1 ? 'er-good' : 'er-low';

  document.getElementById('eng-avg-likes').textContent    = fmt(avgLikes);
  document.getElementById('eng-avg-comments').textContent = fmt(avgComments);
  document.getElementById('eng-rate').textContent         = engRate + '%';
  document.getElementById('eng-rate').className           = `stat-value font-display ${erClass}`;
  document.getElementById('eng-rate-label').textContent   = engRate >= 3 ? '✓ Great!' : engRate >= 1 ? 'Average' : 'Below avg';
  document.getElementById('eng-best-likes').textContent   = fmt(bestLikes);

  // Recent 20 posts for charts
  const recent = [...posts].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 20);
  const labels = recent.map(p => new Date(p.timestamp).toLocaleDateString('en-US', { month:'short', day:'numeric' })).reverse();
  const likesD = recent.map(p => p.like_count||0).reverse();
  const commD  = recent.map(p => p.comments_count||0).reverse();

  destroyChart('eng-likes');
  charts['eng-likes'] = new Chart(document.getElementById('chart-eng-likes').getContext('2d'), {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Likes', data: likesD, backgroundColor: 'rgba(255,255,255,0.25)', borderColor: 'rgba(255,255,255,0.5)', borderWidth: 1, borderRadius: 4 }] },
    options: { ...chartDefaults(), responsive: true }
  });

  destroyChart('eng-comments');
  charts['eng-comments'] = new Chart(document.getElementById('chart-eng-comments').getContext('2d'), {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Comments', data: commD, backgroundColor: 'rgba(255,255,255,0.12)', borderColor: 'rgba(255,255,255,0.3)', borderWidth: 1, borderRadius: 4 }] },
    options: { ...chartDefaults(), responsive: true }
  });

  // Scatter: likes vs comments
  destroyChart('eng-scatter');
  charts['eng-scatter'] = new Chart(document.getElementById('chart-eng-scatter').getContext('2d'), {
    type: 'scatter',
    data: { datasets: [{ label: 'Posts', data: posts.map(p => ({ x: p.like_count||0, y: p.comments_count||0 })), backgroundColor: 'rgba(255,255,255,0.3)', pointRadius: 5 }] },
    options: { ...chartDefaults(), responsive: true, scales: { x: { ...chartDefaults().scales.x, title: { display: true, text: 'Likes', color: '#444' } }, y: { ...chartDefaults().scales.y, title: { display: true, text: 'Comments', color: '#444' } } } }
  });

  // Media type breakdown
  const typeGroups = {};
  posts.forEach(p => {
    const t = p.media_type || 'UNKNOWN';
    if (!typeGroups[t]) typeGroups[t] = { likes: 0, comments: 0, count: 0 };
    typeGroups[t].likes    += p.like_count||0;
    typeGroups[t].comments += p.comments_count||0;
    typeGroups[t].count    += 1;
  });
  const typeLabels = { IMAGE: '🖼 Image', VIDEO: '🎬 Video', CAROUSEL_ALBUM: '📁 Carousel' };
  const typeEl = document.getElementById('media-type-breakdown');
  const maxAvg = Math.max(...Object.values(typeGroups).map(g => g.count ? (g.likes+g.comments)/g.count : 0));
  typeEl.innerHTML = Object.entries(typeGroups).map(([type, g]) => {
    const avg = g.count ? Math.round((g.likes+g.comments)/g.count) : 0;
    const pct = maxAvg > 0 ? Math.round((avg/maxAvg)*100) : 0;
    return `<div>
      <div class="flex justify-between text-sm mb-1.5">
        <span class="text-neutral-300">${typeLabels[type]||type} <span class="text-neutral-600 text-xs">${g.count} posts</span></span>
        <span class="font-semibold text-white">${fmt(avg)} avg eng.</span>
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
    </div>`;
  }).join('');
}

// =============================================
// HEALTH SCORE (NEW)
// =============================================
function computeHealthScore() {
  const posts     = allPosts.filter(p => typeof p.like_count === 'number');
  const followers = window._followers || 1;
  const avgLikes  = posts.length ? posts.reduce((s, p) => s+(p.like_count||0), 0) / posts.length : 0;
  const avgComm   = posts.length ? posts.reduce((s, p) => s+(p.comments_count||0), 0) / posts.length : 0;
  const engRate   = ((avgLikes + avgComm) / followers) * 100;
  const reachRate = ((window._reach28 || 0) / followers) * 100;
  const growth    = Math.abs(window._growthRate || 0);

  // Normalize to 0-100
  const engScore    = Math.min(100, engRate * 10);   // 10% ER = 100
  const reachScore  = Math.min(100, reachRate * 2);  // 50% reach = 100
  const growthScore = Math.min(100, growth * 10);    // 10% growth = 100

  const overall = Math.round((engScore + reachScore + growthScore) / 3);

  document.getElementById('health-score').textContent = overall + '/100';
  document.getElementById('health-eng').textContent   = engRate.toFixed(1) + '%';
  document.getElementById('health-reach').textContent = reachRate.toFixed(1) + '%';
  document.getElementById('health-growth').textContent = (window._growthRate||0).toFixed(2) + '%';
  document.getElementById('pb-eng').style.width     = engScore + '%';
  document.getElementById('pb-reach').style.width   = reachScore + '%';
  document.getElementById('pb-growth').style.width  = growthScore + '%';
}

// =============================================
// HASHTAG TRACKER
// =============================================
function renderHashtagSection() {
  const tagCounts = {};
  const postData  = [];
  allPosts.forEach(p => {
    const tags = (p.caption || '').match(/#\w+/g) || [];
    postData.push({ caption: p.caption, tags, likes: p.like_count||0 });
    tags.forEach(t => { tagCounts[t.toLowerCase()] = (tagCounts[t.toLowerCase()]||0)+1; });
  });
  const sorted = Object.entries(tagCounts).sort((a, b) => b[1]-a[1]);

  destroyChart('hashtags');
  if (sorted.length) {
    const top = sorted.slice(0, 15);
    charts.hashtags = new Chart(document.getElementById('chart-hashtags').getContext('2d'), {
      type: 'bar',
      data: {
        labels: top.map(([t]) => t),
        datasets: [{ label: 'Times Used', data: top.map(([,c]) => c), backgroundColor: 'rgba(255,255,255,0.15)', borderColor: 'rgba(255,255,255,0.35)', borderWidth: 1, borderRadius: 5 }]
      },
      options: { ...chartDefaults(), indexAxis: 'y', responsive: true }
    });
  }

  // Per-post
  const listEl = document.getElementById('hashtag-post-list');
  listEl.innerHTML = postData.slice(0, 12).map(pt => {
    const preview = (pt.caption||'No caption').substring(0, 45) + '…';
    const tagStr  = pt.tags.length ? pt.tags.join(' ') : 'No hashtags';
    return `<div class="py-2.5 border-b border-white/4">
      <div class="text-xs text-neutral-400 mb-1">${escHtml(preview)}</div>
      <div class="text-xs text-neutral-600">${escHtml(tagStr)}</div>
    </div>`;
  }).join('');

  // Cloud
  const max = sorted[0]?.[1]||1;
  document.getElementById('hashtag-cloud').innerHTML = sorted.map(([tag, count]) => {
    const big = count >= max*0.5 ? 'big' : '';
    return `<span class="tag-pill ${big}">${escHtml(tag)} <strong>${count}</strong></span>`;
  }).join('');

  // Hashtag count vs likes correlation
  destroyChart('hashtag-corr');
  const scatterData = allPosts.map(p => ({
    x: ((p.caption||'').match(/#\w+/g)||[]).length,
    y: p.like_count||0
  }));
  charts['hashtag-corr'] = new Chart(document.getElementById('chart-hashtag-corr').getContext('2d'), {
    type: 'scatter',
    data: { datasets: [{ label: 'Posts', data: scatterData, backgroundColor: 'rgba(255,255,255,0.25)', pointRadius: 5 }] },
    options: { ...chartDefaults(), responsive: true, scales: {
      x: { ...chartDefaults().scales.x, title: { display: true, text: '# of Hashtags', color: '#444' } },
      y: { ...chartDefaults().scales.y, title: { display: true, text: 'Likes', color: '#444' } }
    }}
  });
}

// =============================================
// CAPTION ANALYSIS
// =============================================
function renderCaptionAnalysis() {
  const posts    = allPosts.filter(p => typeof p.like_count === 'number');
  const withCap  = posts.filter(p => p.caption && p.caption.length > 0);
  const noCap    = posts.length - withCap.length;
  const lengths  = withCap.map(p => p.caption.length);
  const avgLen   = lengths.length ? Math.round(lengths.reduce((a, b) => a+b, 0)/lengths.length) : 0;
  const maxLen   = lengths.length ? Math.max(...lengths) : 0;
  const bestPost = [...withCap].sort((a, b) => (b.like_count||0)-(a.like_count||0))[0];
  const bestLen  = bestPost ? bestPost.caption.length : 0;

  document.getElementById('cap-avg-len').textContent  = avgLen;
  document.getElementById('cap-best-len').textContent = bestLen;
  document.getElementById('cap-longest').textContent  = maxLen;
  document.getElementById('cap-nocap').textContent    = noCap;

  destroyChart('cap-scatter');
  charts['cap-scatter'] = new Chart(document.getElementById('chart-caption-scatter').getContext('2d'), {
    type: 'scatter',
    data: { datasets: [{ label: 'Posts', data: withCap.map(p => ({ x: p.caption.length, y: p.like_count||0 })), backgroundColor: 'rgba(255,255,255,0.25)', pointRadius: 5 }] },
    options: { ...chartDefaults(), responsive: true, scales: {
      x: { ...chartDefaults().scales.x, title: { display: true, text: 'Caption Length', color: '#444' } },
      y: { ...chartDefaults().scales.y, title: { display: true, text: 'Likes', color: '#444' } }
    }}
  });

  const buckets = { 'Short (0–50)':[], 'Medium (51–150)':[], 'Long (151–300)':[], 'Very Long (300+)':[] };
  withCap.forEach(p => {
    const l = p.caption.length;
    if      (l <= 50)  buckets['Short (0–50)'].push(p.like_count||0);
    else if (l <= 150) buckets['Medium (51–150)'].push(p.like_count||0);
    else if (l <= 300) buckets['Long (151–300)'].push(p.like_count||0);
    else               buckets['Very Long (300+)'].push(p.like_count||0);
  });
  const bKeys = Object.keys(buckets);
  const bAvgs = bKeys.map(k => { const a = buckets[k]; return a.length ? Math.round(a.reduce((x,y)=>x+y,0)/a.length) : 0; });

  destroyChart('cap-buckets');
  charts['cap-buckets'] = new Chart(document.getElementById('chart-caption-buckets').getContext('2d'), {
    type: 'bar',
    data: { labels: bKeys, datasets: [{ label: 'Avg Likes', data: bAvgs, backgroundColor: 'rgba(255,255,255,0.15)', borderColor: 'rgba(255,255,255,0.35)', borderWidth: 1, borderRadius: 6 }] },
    options: { ...chartDefaults(), responsive: true }
  });

  // Emoji analysis
  const emojiRegex = /[\u{1F300}-\u{1FAFF}|\u{2600}-\u{26FF}|\u{2700}-\u{27BF}]/gu;
  const withEmoji  = posts.filter(p => p.caption && emojiRegex.test(p.caption));
  const noEmoji    = posts.filter(p => !p.caption || !emojiRegex.test(p.caption||''));
  const avgEmoLikes = withEmoji.length ? Math.round(withEmoji.reduce((s,p)=>s+(p.like_count||0),0)/withEmoji.length) : 0;
  const avgNoEmoLikes = noEmoji.length ? Math.round(noEmoji.reduce((s,p)=>s+(p.like_count||0),0)/noEmoji.length) : 0;
  const emojiEl = document.getElementById('emoji-analysis');
  emojiEl.innerHTML = `
    <div class="grid grid-cols-2 gap-4">
      <div class="glass border border-white/8 rounded-xl p-4">
        <div class="text-xs text-neutral-500 mb-1">Posts with Emojis</div>
        <div class="font-display text-xl font-bold text-white">${withEmoji.length}</div>
        <div class="text-xs text-neutral-600 mt-1">Avg ❤ ${fmt(avgEmoLikes)}</div>
      </div>
      <div class="glass border border-white/8 rounded-xl p-4">
        <div class="text-xs text-neutral-500 mb-1">Posts without Emojis</div>
        <div class="font-display text-xl font-bold text-white">${noEmoji.length}</div>
        <div class="text-xs text-neutral-600 mt-1">Avg ❤ ${fmt(avgNoEmoLikes)}</div>
      </div>
    </div>
    <p class="text-xs text-neutral-600">${avgEmoLikes > avgNoEmoLikes ? '✓ Posts with emojis tend to perform better for you.' : 'Posts without emojis tend to perform better for you.'}</p>`;
}

// =============================================
// AUDIENCE
// =============================================
async function loadAudience() {
  try {
    const gd = await igFetch(`${USER_ID}/insights`, { metric: 'follower_demographics', period: 'lifetime', breakdown: 'gender' });
    const gr  = gd.data?.[0]?.total_value?.breakdowns?.[0]?.results || [];
    if (gr.length) renderGenderChart(gr.map(r=>r.dimension_values?.[0]||'Unknown'), gr.map(r=>r.value));
    const ad  = await igFetch(`${USER_ID}/insights`, { metric: 'follower_demographics', period: 'lifetime', breakdown: 'age' });
    const ar  = ad.data?.[0]?.total_value?.breakdowns?.[0]?.results || [];
    if (ar.length) renderAgeChart(ar.map(r=>r.dimension_values?.[0]||'Unknown'), ar.map(r=>r.value));
    await loadOnlineHours();
    const cd  = await igFetch(`${USER_ID}/insights`, { metric: 'follower_demographics', period: 'lifetime', breakdown: 'country' });
    renderListItems('audience-countries', (cd.data?.[0]?.total_value?.breakdowns?.[0]?.results||[]).slice(0,8));
    const cid = await igFetch(`${USER_ID}/insights`, { metric: 'follower_demographics', period: 'lifetime', breakdown: 'city' });
    renderListItems('audience-cities', (cid.data?.[0]?.total_value?.breakdowns?.[0]?.results||[]).slice(0,8));
  } catch (e) {
    document.getElementById('audience-countries').innerHTML = `<p class="text-sm text-neutral-600">Audience data unavailable: ${e.message}</p>`;
  }
}

async function loadOnlineHours() {
  try {
    const data   = await igFetch(`${USER_ID}/insights`, { metric: 'online_followers', period: 'lifetime' });
    const hourData = data.data?.[0]?.values || [];
    const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const matrix   = {};
    hourData.slice(-7).forEach(entry => {
      const day = dayNames[new Date(entry.end_time).getDay()];
      matrix[day] = entry.value || {};
    });
    renderHeatmap(matrix, dayNames, 'heatmap-container');
    renderHeatmap(matrix, dayNames, 'best-time-heatmap');
    window._onlineMatrix = matrix;
    renderBestDayChart(matrix, dayNames);
  } catch(e) {
    ['heatmap-container','best-time-heatmap'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = `<p class="text-sm text-neutral-600">Online hours not available for this account.</p>`;
    });
  }
}

function renderHeatmap(matrix, dayNames, containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const hours   = Array.from({ length: 24 }, (_, i) => i);
  const allVals = Object.values(matrix).flatMap(d => Object.values(d).map(Number));
  const maxVal  = allVals.length ? Math.max(...allVals) : 1;
  let html = '<table class="heatmap-table"><thead><tr><th style="width:36px"></th>';
  hours.forEach(h => { html += `<th>${h}:00</th>`; });
  html += '</tr></thead><tbody>';
  dayNames.forEach(day => {
    html += `<tr><th style="padding-right:8px;color:#444;font-weight:500;font-size:11px;text-align:right">${day}</th>`;
    hours.forEach(h => {
      const val = parseInt(matrix[day]?.[h]||0);
      const pct = maxVal > 0 ? val/maxVal : 0;
      const a   = 0.05 + pct * 0.9;
      const g   = Math.round(255 * pct);
      const bg  = `rgba(255,${g},255,${a})`;
      html += `<td class="heatmap-cell" style="background:${bg}" title="${day} ${h}:00 — ${val} online">${val>0?val:''}</td>`;
    });
    html += '</tr>';
  });
  html += '</tbody></table>';
  html += '<p class="chart-note mt-3">◼ Brighter = more followers online. Post during peak windows.</p>';
  el.innerHTML = html;
}

function renderBestDayChart(matrix, dayNames) {
  const dayTotals = dayNames.map(day => Object.values(matrix[day]||{}).reduce((s,v)=>s+parseInt(v||0),0));
  destroyChart('best-day');
  charts['best-day'] = new Chart(document.getElementById('chart-best-day').getContext('2d'), {
    type: 'bar',
    data: { labels: dayNames, datasets: [{ label: 'Avg Online Followers', data: dayTotals, backgroundColor: 'rgba(255,255,255,0.15)', borderColor: 'rgba(255,255,255,0.4)', borderWidth: 1, borderRadius: 6 }] },
    options: { ...chartDefaults(), responsive: true }
  });
}

function renderListItems(elId, results) {
  const el = document.getElementById(elId);
  if (!results.length) { el.innerHTML = '<p class="text-sm text-neutral-600">No data available</p>'; return; }
  const max = Math.max(...results.map(r=>r.value));
  el.innerHTML = results.map(r => {
    const label = Array.isArray(r.dimension_values) ? r.dimension_values.join(', ') : r.dimension_values;
    const pct = Math.round((r.value/max)*100);
    return `<div class="list-item">
      <span class="list-item-label">${escHtml(label||'—')}</span>
      <div class="list-item-bar-wrap"><div class="list-item-bar" style="width:${pct}%"></div></div>
      <span class="list-item-value">${fmt(r.value)}</span>
    </div>`;
  }).join('');
}

// =============================================
// BEST TIME SECTION (NEW)
// =============================================
function renderBestTimeSection() {
  // Posting frequency by day
  const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const dayCounts = Array(7).fill(0);
  allPosts.forEach(p => { dayCounts[new Date(p.timestamp).getDay()]++; });

  destroyChart('post-day');
  charts['post-day'] = new Chart(document.getElementById('chart-post-day').getContext('2d'), {
    type: 'bar',
    data: { labels: dayNames, datasets: [{ label: 'Posts Published', data: dayCounts, backgroundColor: 'rgba(255,255,255,0.12)', borderColor: 'rgba(255,255,255,0.3)', borderWidth: 1, borderRadius: 5 }] },
    options: { ...chartDefaults(), responsive: true }
  });

  // Recommendations
  const matrix  = window._onlineMatrix || {};
  const hourTotals = Array(24).fill(0);
  dayNames.forEach(day => {
    Object.entries(matrix[day]||{}).forEach(([h, v]) => { hourTotals[parseInt(h)] += parseInt(v||0); });
  });
  const topHours = hourTotals.map((v,i)=>({h:i,v})).sort((a,b)=>b.v-a.v).slice(0,3);
  const recsEl = document.getElementById('time-recs');
  if (recsEl && topHours[0]?.v > 0) {
    recsEl.innerHTML = topHours.map((t, i) => `
      <div class="glass border border-white/8 rounded-2xl p-4 text-center">
        <div class="text-xs text-neutral-600 uppercase tracking-widest mb-1">${i===0?'Best':'Alt'} Time #${i+1}</div>
        <div class="font-display text-2xl font-bold text-white">${t.h}:00</div>
        <div class="text-xs text-neutral-600 mt-1">${fmt(t.v)} avg online</div>
      </div>`).join('');
  }
}

// =============================================
// EXPORT SECTION (NEW)
// =============================================
function renderExportSection() {
  const history = JSON.parse(localStorage.getItem('ig_follower_history')||'[]');
  const el = document.getElementById('follower-history-table');
  if (!el || !history.length) { if(el) el.innerHTML = '<p class="text-sm text-neutral-600">No history yet. Visit daily to build a log.</p>'; return; }
  el.innerHTML = `<table class="w-full text-sm">
    <thead><tr class="border-b border-white/8">
      <th class="text-left py-2 text-xs uppercase tracking-wider text-neutral-600">Date</th>
      <th class="text-right py-2 text-xs uppercase tracking-wider text-neutral-600">Followers</th>
      <th class="text-right py-2 text-xs uppercase tracking-wider text-neutral-600">Change</th>
    </tr></thead>
    <tbody>${[...history].reverse().map((h, i, arr) => {
      const prev = arr[i+1];
      const delta = prev ? h.count - prev.count : null;
      const dc = delta === null ? '' : delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-red-400' : 'text-neutral-600';
      return `<tr class="border-b border-white/4">
        <td class="py-2 text-neutral-400">${h.date}</td>
        <td class="py-2 text-right text-white font-semibold">${fmt(h.count)}</td>
        <td class="py-2 text-right ${dc}">${delta !== null ? (delta>0?'+':'')+delta : '—'}</td>
      </tr>`;
    }).join('')}</tbody>
  </table>`;
}

function exportJSON() {
  const data = {
    exported_at: new Date().toISOString(),
    posts: allPosts,
    follower_history: JSON.parse(localStorage.getItem('ig_follower_history')||'[]'),
    metrics: {
      followers: window._followers,
      growth_rate_wow: window._growthRate,
      reach_28d: window._reach28,
      views_28d: window._views28
    }
  };
  downloadFile('ig-studio-export.json', JSON.stringify(data, null, 2), 'application/json');
  showToast('✓ JSON downloaded');
}

function exportCSV() {
  const headers = ['ID','Caption','Media Type','Likes','Comments','Permalink','Date'];
  const rows = allPosts.map(p => [
    p.id,
    `"${(p.caption||'').replace(/"/g,'""')}"`,
    p.media_type,
    p.like_count||0,
    p.comments_count||0,
    p.permalink,
    p.timestamp
  ]);
  const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
  downloadFile('ig-studio-posts.csv', csv, 'text/csv');
  showToast('✓ CSV downloaded');
}

function downloadFile(name, content, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

// =============================================
// CHARTS
// =============================================
function chartDefaults() {
  return {
    plugins: { legend: { labels: { color: '#555', font: { family: 'Inter', size: 11 } } } },
    scales: {
      x: { ticks: { color: '#444', font: { family: 'Inter', size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
      y: { ticks: { color: '#444', font: { family: 'Inter', size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } }
    }
  };
}

function destroyChart(key) {
  if (charts[key]) { charts[key].destroy(); delete charts[key]; }
}

function renderFollowerChart(history) {
  destroyChart('followers');
  const ctx = document.getElementById('chart-followers').getContext('2d');
  charts.followers = new Chart(ctx, {
    type: 'line',
    data: {
      labels: history.map(h => h.date.slice(5)),
      datasets: [{ label: 'Followers', data: history.map(h => h.count), borderColor: 'rgba(255,255,255,0.5)', backgroundColor: 'rgba(255,255,255,0.04)', fill: true, tension: 0.4, pointBackgroundColor: '#fff', pointRadius: 3, pointHoverRadius: 5 }]
    },
    options: { ...chartDefaults(), responsive: true }
  });
}

function renderReachChart(reach, views) {
  destroyChart('reach');
  const ctx = document.getElementById('chart-reach').getContext('2d');
  charts.reach = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Reach', 'Views'],
      datasets: [{ label: '28-day', data: [reach, views], backgroundColor: ['rgba(255,255,255,0.3)','rgba(255,255,255,0.12)'], borderColor: ['rgba(255,255,255,0.6)','rgba(255,255,255,0.3)'], borderWidth: 1, borderRadius: 8 }]
    },
    options: { ...chartDefaults(), responsive: true }
  });
}

function renderGenderChart(labels, values) {
  destroyChart('gender');
  charts.gender = new Chart(document.getElementById('chart-gender').getContext('2d'), {
    type: 'doughnut',
    data: { labels, datasets: [{ data: values, backgroundColor: ['rgba(255,255,255,0.7)','rgba(255,255,255,0.25)','rgba(255,255,255,0.1)'], borderWidth: 0 }] },
    options: { responsive: true, plugins: { legend: { labels: { color: '#666', font: { family: 'Inter', size: 11 } } } } }
  });
}

function renderAgeChart(labels, values) {
  destroyChart('age');
  charts.age = new Chart(document.getElementById('chart-age').getContext('2d'), {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Followers', data: values, backgroundColor: 'rgba(255,255,255,0.15)', borderColor: 'rgba(255,255,255,0.4)', borderWidth: 1, borderRadius: 5 }] },
    options: { ...chartDefaults(), responsive: true }
  });
}

function renderDailyImpressionsChart(labels, values) {
  destroyChart('impr-daily');
  charts['impr-daily'] = new Chart(document.getElementById('chart-impressions-daily').getContext('2d'), {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Daily Views', data: values, backgroundColor: 'rgba(255,255,255,0.12)', borderColor: 'rgba(255,255,255,0.3)', borderWidth: 1, borderRadius: 4 }] },
    options: { ...chartDefaults(), responsive: true }
  });
}

// =============================================
// TOAST
// =============================================
function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity 0.3s'; setTimeout(() => t.remove(), 300); }, 2500);
}

// =============================================
// UTILS
// =============================================
function fmt(n) {
  if (n >= 1_000_000) return (n/1_000_000).toFixed(1)+'M';
  if (n >= 1_000)     return (n/1_000).toFixed(1)+'K';
  return Number(n).toLocaleString();
}

function escHtml(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
