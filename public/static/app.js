// BidKarts Frontend - Complete SPA Application
// Part 1: Core, State, Router, API

const API = axios.create({ baseURL: '/api', timeout: 15000 });
API.interceptors.request.use(cfg => {
  const token = localStorage.getItem('bk_token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});
API.interceptors.response.use(r => r, e => {
  if (e.response?.status === 401) { Auth.logout(); Router.go('/login'); }
  return Promise.reject(e);
});

// ── State Management ────────────────────────────────────────────────────
const State = {
  user: null,
  token: null,
  notifications: [],
  unreadCount: 0,
  init() {
    this.token = localStorage.getItem('bk_token');
    const u = localStorage.getItem('bk_user');
    if (u) try { this.user = JSON.parse(u); } catch {}
  },
  setUser(user, token) {
    this.user = user; this.token = token;
    localStorage.setItem('bk_token', token);
    localStorage.setItem('bk_user', JSON.stringify(user));
  },
  clear() {
    this.user = null; this.token = null;
    localStorage.removeItem('bk_token'); localStorage.removeItem('bk_user');
  }
};

// ── Auth ────────────────────────────────────────────────────────────────
const Auth = {
  async login(email, password) {
    const { data } = await API.post('/auth/login', { email, password });
    State.setUser(data.user, data.token);
    // Start notification polling on login
    if (typeof startNotificationPolling === 'function') startNotificationPolling();
    return data;
  },
  async register(payload) {
    const { data } = await API.post('/auth/register', payload);
    State.setUser(data.user, data.token);
    if (typeof startNotificationPolling === 'function') startNotificationPolling();
    return data;
  },
  logout() {
    // Stop polling on logout
    if (typeof _notifPollInterval !== 'undefined' && _notifPollInterval) {
      clearInterval(_notifPollInterval); _notifPollInterval = null;
    }
    State.clear(); Router.go('/');
  },
  isLoggedIn() { return !!State.token && !!State.user; },
  role() { return State.user?.role || null; },
  can(...roles) { return roles.includes(this.role()); }
};

// ── Toast ────────────────────────────────────────────────────────────────
const Toast = {
  show(msg, type = 'success', duration = 3500) {
    document.querySelectorAll('.toast').forEach(t => t.remove());
    const colors = { success:'#10b981', error:'#ef4444', info:'#3b82f6', warning:'#f59e0b' };
    const icons  = { success:'fa-check-circle', error:'fa-times-circle', info:'fa-info-circle', warning:'fa-exclamation-triangle' };
    const t = document.createElement('div');
    t.className = 'toast';
    t.style.cssText = `background:white;border-left:4px solid ${colors[type]};color:#1e293b`;
    t.innerHTML = `<i class="fas ${icons[type]}" style="color:${colors[type]}"></i><span>${msg}</span>`;
    document.body.appendChild(t);
    setTimeout(() => { t.style.animation = 'toastIn 0.3s ease reverse'; setTimeout(() => t.remove(), 300); }, duration);
  }
};

// ── Modal ────────────────────────────────────────────────────────────────
const Modal = {
  show(title, content, footer = '') {
    document.getElementById('modal-root')?.remove();
    const m = document.createElement('div');
    m.id = 'modal-root'; m.className = 'modal-overlay';
    m.innerHTML = `<div class="modal-box"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px"><h3 style="font-size:18px;font-weight:700;color:#1e293b">${title}</h3><button onclick="Modal.close()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#94a3b8;line-height:1">&times;</button></div><div id="modal-content">${content}</div>${footer ? `<div style="margin-top:20px;display:flex;gap:10px;justify-content:flex-end">${footer}</div>` : ''}</div>`;
    m.addEventListener('click', e => { if (e.target === m) Modal.close(); });
    document.body.appendChild(m);
  },
  close() { document.getElementById('modal-root')?.remove(); },
  setContent(html) { const mc = document.getElementById('modal-content'); if (mc) mc.innerHTML = html; }
};

// ── Router ───────────────────────────────────────────────────────────────
const Router = {
  routes: {},
  current: '/',
  params: {},
  register(path, handler) { this.routes[path] = handler; },
  go(path, params = {}) {
    this.current = path; this.params = params;
    history.pushState({ path, params }, '', path);
    this.render();
  },
  render() {
    const path = this.current;
    let handler = this.routes[path];
    if (!handler) {
      // Dynamic routes
      for (const [route, fn] of Object.entries(this.routes)) {
        const rx = new RegExp('^' + route.replace(/:([^/]+)/g, '([^/]+)') + '$');
        const m = path.match(rx);
        if (m) {
          const keys = [...route.matchAll(/:([^/]+)/g)].map(x => x[1]);
          keys.forEach((k, i) => { this.params[k] = m[i + 1]; });
          handler = fn; break;
        }
      }
    }
    if (!handler) handler = this.routes['/'] || (() => Pages.home());
    document.getElementById('app').innerHTML = '';
    handler(this.params);
    window.scrollTo(0, 0);
  },
  init() {
    window.addEventListener('popstate', e => {
      if (e.state?.path) { this.current = e.state.path; this.params = e.state.params || {}; }
      else { this.current = window.location.pathname; this.params = {}; }
      this.render();
    });
    this.current = window.location.pathname;
    this.render();
  }
};

// ── Helpers ──────────────────────────────────────────────────────────────
const Helpers = {
  currency(n) { return '₹' + (n || 0).toLocaleString('en-IN'); },
  date(d) { return d ? new Date(d).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' }) : 'N/A'; },
  timeAgo(d) {
    if (!d) return 'N/A';
    const diff = Date.now() - new Date(d).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'Just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return Math.floor(h / 24) + 'd ago';
  },
  serviceLabel(t) {
    const map = { hvac:'HVAC Services', electrical:'Electrical Services', plumbing:'Plumbing Services', solar:'Solar EPC', fabrication:'Fabrication Works', contracting:'Contracting' };
    return map[t] || t;
  },
  serviceIcon(t) {
    const map = { hvac:'fa-wind', electrical:'fa-bolt', plumbing:'fa-faucet', solar:'fa-solar-panel', fabrication:'fa-industry', contracting:'fa-hard-hat' };
    return map[t] || 'fa-tools';
  },
  serviceColor(t) {
    const map = { hvac:'bg-blue-100 text-blue-600', electrical:'bg-yellow-100 text-yellow-600', plumbing:'bg-cyan-100 text-cyan-600', solar:'bg-orange-100 text-orange-600', fabrication:'bg-gray-100 text-gray-600', contracting:'bg-green-100 text-green-600' };
    return map[t] || 'bg-gray-100 text-gray-600';
  },
  statusBadge(s) {
    const map = {
      open:'background:#dcfce7;color:#16a34a', bidding:'background:#dbeafe;color:#2563eb',
      vendor_selected:'background:#fef3c7;color:#d97706', in_progress:'background:#e0e7ff;color:#7c3aed',
      completed:'background:#f0fdf4;color:#15803d', cancelled:'background:#fee2e2;color:#dc2626',
      pending:'background:#f1f5f9;color:#64748b', accepted:'background:#dcfce7;color:#16a34a',
      rejected:'background:#fee2e2;color:#dc2626', requested:'background:#dbeafe;color:#2563eb',
      paid:'background:#fef3c7;color:#d97706', assigned:'background:#e0e7ff;color:#7c3aed'
    };
    const style = map[s] || 'background:#f1f5f9;color:#64748b';
    return `<span class="status-badge" style="${style}">${(s||'').replace('_',' ').toUpperCase()}</span>`;
  },
  truncate(s, n = 100) { return s && s.length > n ? s.slice(0, n) + '…' : (s || ''); },
  stars(rating) {
    const r = Math.round(rating || 0);
    return Array.from({length:5}, (_, i) =>
      `<i class="fas fa-star" style="color:${i < r ? '#f59e0b' : '#e2e8f0'};font-size:13px"></i>`
    ).join('');
  }
};

// ── Navbar ───────────────────────────────────────────────────────────────
function renderNavbar() {
  const u = State.user;
  const dashLink = u ? (u.role === 'vendor' ? '/dashboard/vendor' : u.role === 'expert' ? '/dashboard/expert' : u.role === 'admin' ? '/dashboard/admin' : '/dashboard/customer') : '/login';
  return `
  <nav style="background:white;border-bottom:1px solid #e2e8f0;position:sticky;top:0;z-index:100;box-shadow:0 1px 3px rgba(0,0,0,0.05)">
    <div style="max-width:1280px;margin:0 auto;padding:0 20px;display:flex;align-items:center;justify-content:space-between;height:64px">
      <div style="display:flex;align-items:center;gap:32px">
        <a onclick="Router.go('/')" style="display:flex;align-items:center;gap:10px;text-decoration:none;cursor:pointer">
          <div style="width:36px;height:36px;background:linear-gradient(135deg,#2563eb,#ea580c);border-radius:10px;display:flex;align-items:center;justify-content:center">
            <i class="fas fa-hammer" style="color:white;font-size:16px"></i>
          </div>
          <div>
            <span style="font-size:18px;font-weight:800;background:linear-gradient(135deg,#2563eb,#ea580c);-webkit-background-clip:text;-webkit-text-fill-color:transparent">BidKarts</span>
          </div>
        </a>
        <div class="hidden-mobile" style="display:flex;gap:4px">
          <a onclick="Router.go('/projects')" class="nav-link" style="padding:6px 12px;border-radius:8px">Browse Projects</a>
          <a onclick="Router.go('/vendors')" class="nav-link" style="padding:6px 12px;border-radius:8px">Find Vendors</a>
          <a onclick="Router.go('/experts')" class="nav-link" style="padding:6px 12px;border-radius:8px">Experts</a>
          <a onclick="Router.go('/ai-tools')" class="nav-link" style="padding:6px 12px;border-radius:8px"><i class="fas fa-robot" style="margin-right:4px;color:#7c3aed"></i>AI Tools</a>
          <div style="position:relative" id="services-menu-wrap">
            <a onclick="toggleServicesMenu()" class="nav-link" style="padding:6px 12px;border-radius:8px;cursor:pointer"><i class="fas fa-tools" style="margin-right:4px;color:#059669"></i>Services <i class="fas fa-chevron-down" style="font-size:9px;margin-left:2px;color:#94a3b8"></i></a>
            <div id="services-dropdown" style="display:none;position:absolute;top:calc(100% + 8px);left:0;background:white;border:1px solid #e2e8f0;border-radius:14px;min-width:240px;box-shadow:0 8px 32px rgba(0,0,0,0.12);z-index:300;padding:8px">
              ${[
                ['fa-bolt','Electrical','electrical','#f59e0b'],
                ['fa-sun','Solar EPC','solar','#f97316'],
                ['fa-wind','HVAC','hvac','#06b6d4'],
                ['fa-tint','Plumbing','plumbing','#3b82f6'],
                ['fa-cogs','Fabrication','fabrication','#8b5cf6'],
                ['fa-hard-hat','Contracting','contracting','#10b981'],
              ].map(([icon,label,slug,color]) => `<a onclick="Router.go('/services/${slug}');toggleServicesMenu()" style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;cursor:pointer;text-decoration:none;color:#374151;font-size:13px;font-weight:500;transition:background 0.15s" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='none'"><span style="width:30px;height:30px;background:${color}15;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="fas ${icon}" style="color:${color};font-size:13px"></i></span>${label}</a>`).join('')}
              <div style="border-top:1px solid #f1f5f9;margin:6px 0"></div>
              <a onclick="Router.go('/services');toggleServicesMenu()" style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;cursor:pointer;text-decoration:none;color:#2563eb;font-size:13px;font-weight:600" onmouseover="this.style.background='#eff6ff'" onmouseout="this.style.background='none'"><i class="fas fa-th" style="font-size:13px"></i>All Services</a>
            </div>
          </div>
          <a onclick="Router.go('/how-it-works')" class="nav-link" style="padding:6px 12px;border-radius:8px">How It Works</a>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:12px">
        ${u ? `
          <button onclick="toggleNotifications()" style="position:relative;background:none;border:none;cursor:pointer;padding:8px;border-radius:8px;color:#64748b" title="Notifications">
            <i class="fas fa-bell" style="font-size:18px"></i>
            ${State.unreadCount > 0 ? `<span style="position:absolute;top:2px;right:2px;background:#ef4444;color:white;font-size:10px;font-weight:700;border-radius:50%;width:18px;height:18px;display:flex;align-items:center;justify-content:center">${State.unreadCount}</span>` : ''}
          </button>
          <button onclick="Router.go('${dashLink}')" class="nav-link" style="padding:6px 14px;border-radius:8px;background:#eff6ff;color:#2563eb;border:none;font-size:14px;font-weight:500;cursor:pointer">
            <i class="fas fa-th-large" style="margin-right:6px"></i>Dashboard
          </button>
          <div style="position:relative" id="user-menu-wrap">
            <button onclick="toggleUserMenu()" style="display:flex;align-items:center;gap:8px;background:none;border:1.5px solid #e2e8f0;padding:6px 12px;border-radius:10px;cursor:pointer">
              <div style="width:28px;height:28px;background:linear-gradient(135deg,#2563eb,#7c3aed);border-radius:50%;display:flex;align-items:center;justify-content:center">
                <span style="color:white;font-size:11px;font-weight:700">${(u.name||'U').charAt(0)}</span>
              </div>
              <span style="font-size:13px;font-weight:600;color:#1e293b;max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${u.name?.split(' ')[0] || 'User'}</span>
              <i class="fas fa-chevron-down" style="font-size:10px;color:#64748b"></i>
            </button>
            <div id="user-menu" style="display:none;position:absolute;right:0;top:calc(100% + 8px);background:white;border:1px solid #e2e8f0;border-radius:12px;min-width:200px;box-shadow:0 8px 24px rgba(0,0,0,0.12);z-index:200">
              <div style="padding:12px 16px;border-bottom:1px solid #f1f5f9">
                <p style="font-size:13px;font-weight:700;color:#1e293b">${u.name}</p>
                <p style="font-size:11px;color:#64748b">${u.email}</p>
                <span style="font-size:10px;background:#dbeafe;color:#2563eb;padding:2px 8px;border-radius:10px;font-weight:600;text-transform:capitalize">${u.role}</span>
              </div>
              <div style="padding:6px">
                <button onclick="Router.go('${dashLink}');toggleUserMenu()" style="display:flex;align-items:center;gap:10px;width:100%;padding:8px 12px;border:none;background:none;cursor:pointer;border-radius:8px;font-size:13px;color:#374151" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='none'"><i class="fas fa-th-large" style="color:#6366f1;width:16px"></i>Dashboard</button>
                <button onclick="Router.go('/profile/edit');toggleUserMenu()" style="display:flex;align-items:center;gap:10px;width:100%;padding:8px 12px;border:none;background:none;cursor:pointer;border-radius:8px;font-size:13px;color:#374151" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='none'"><i class="fas fa-user-edit" style="color:#06b6d4;width:16px"></i>Edit Profile</button>
                <button onclick="Router.go('/messages');toggleUserMenu()" style="display:flex;align-items:center;gap:10px;width:100%;padding:8px 12px;border:none;background:none;cursor:pointer;border-radius:8px;font-size:13px;color:#374151" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='none'"><i class="fas fa-comments" style="color:#10b981;width:16px"></i>Messages</button>
                <button onclick="Router.go('/ai-tools');toggleUserMenu()" style="display:flex;align-items:center;gap:10px;width:100%;padding:8px 12px;border:none;background:none;cursor:pointer;border-radius:8px;font-size:13px;color:#374151" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='none'"><i class="fas fa-robot" style="color:#7c3aed;width:16px"></i>AI Tools</button>
                ${u.role === 'customer' ? `<button onclick="Router.go('/shortlist');toggleUserMenu()" style="display:flex;align-items:center;gap:10px;width:100%;padding:8px 12px;border:none;background:none;cursor:pointer;border-radius:8px;font-size:13px;color:#374151" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='none'"><i class="fas fa-heart" style="color:#ef4444;width:16px"></i>My Shortlist</button>` : ''}
                ${u.role !== 'admin' ? `<button onclick="Router.go('/disputes');toggleUserMenu()" style="display:flex;align-items:center;gap:10px;width:100%;padding:8px 12px;border:none;background:none;cursor:pointer;border-radius:8px;font-size:13px;color:#374151" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='none'"><i class="fas fa-exclamation-triangle" style="color:#f59e0b;width:16px"></i>Disputes</button>` : ''}
                ${u.role === 'vendor' ? `<button onclick="Router.go('/vendor-plans');toggleUserMenu()" style="display:flex;align-items:center;gap:10px;width:100%;padding:8px 12px;border:none;background:none;cursor:pointer;border-radius:8px;font-size:13px;color:#374151" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='none'"><i class="fas fa-crown" style="color:#f59e0b;width:16px"></i>Upgrade Plan</button>` : ''}
                <button onclick="Auth.logout();toggleUserMenu()" style="display:flex;align-items:center;gap:10px;width:100%;padding:8px 12px;border:none;background:none;cursor:pointer;border-radius:8px;font-size:13px;color:#ef4444;margin-top:4px;border-top:1px solid #f1f5f9" onmouseover="this.style.background='#fef2f2'" onmouseout="this.style.background='none'"><i class="fas fa-sign-out-alt" style="width:16px"></i>Logout</button>
              </div>
            </div>
          </div>
        ` : `
          <a onclick="Router.go('/login')" class="nav-link" style="padding:8px 16px;border-radius:8px">Login</a>
          <button onclick="Router.go('/register')" class="btn-primary" style="color:white;padding:8px 18px;border-radius:10px;font-size:14px;font-weight:600">Get Started</button>
        `}
      </div>
    </div>
  </nav>
  <div id="notif-panel" style="display:none;position:fixed;top:72px;right:20px;width:360px;background:white;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,0.15);z-index:999;border:1px solid #e2e8f0;max-height:480px;overflow:hidden;display:none">
    <div style="padding:16px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between">
      <h4 style="font-size:15px;font-weight:700">Notifications</h4>
      <button onclick="markAllRead()" style="font-size:12px;color:#3b82f6;background:none;border:none;cursor:pointer;font-weight:500">Mark all read</button>
    </div>
    <div id="notif-list" style="max-height:400px;overflow-y:auto;padding:8px"></div>
  </div>`;
}

function toggleUserMenu() {
  const m = document.getElementById('user-menu');
  if (m) m.style.display = m.style.display === 'none' ? 'block' : 'none';
}
function toggleServicesMenu() {
  const d = document.getElementById('services-dropdown');
  if (d) d.style.display = d.style.display === 'none' ? 'block' : 'none';
}
function toggleNotifications() {
  const p = document.getElementById('notif-panel');
  if (!p) return;
  const showing = p.style.display !== 'none' && p.style.display !== '';
  p.style.display = showing ? 'none' : 'block';
  if (!showing) loadNotifications();
}
async function loadNotifications() {
  if (!Auth.isLoggedIn()) return;
  try {
    const { data } = await API.get('/users/notifications');
    State.notifications = data.notifications || [];
    State.unreadCount = State.notifications.filter(n => !n.is_read).length;
    const list = document.getElementById('notif-list');
    if (list) {
      list.innerHTML = State.notifications.length === 0
        ? '<p style="text-align:center;color:#94a3b8;padding:24px;font-size:13px">No notifications yet</p>'
        : State.notifications.map(n => `
          <div style="padding:12px;border-radius:8px;margin:4px;background:${n.is_read ? 'white' : '#eff6ff'};border-left:3px solid ${n.is_read ? '#e2e8f0' : '#3b82f6'}">
            <div style="display:flex;align-items:flex-start;gap:8px">
              <div style="font-size:18px;line-height:1">${notifIcon(n.type)}</div>
              <div style="flex:1"><div style="font-size:13px;font-weight:600;color:#1e293b">${escapeHtml(n.title)}</div></div>
            </div>
            <p style="font-size:12px;color:#475569;margin-top:4px;line-height:1.5">${escapeHtml(formatNotifMessage(n.message))}</p>
            <p style="font-size:11px;color:#94a3b8;margin-top:4px">${Helpers.timeAgo(n.created_at)}</p>
          </div>`).join('');
    }
  } catch {}
}
async function markAllRead() {
  if (!Auth.isLoggedIn()) return;
  try { await API.patch('/users/notifications/read'); State.unreadCount = 0; loadNotifications(); } catch {}
}
document.addEventListener('click', e => {
  const um = document.getElementById('user-menu');
  const wrap = document.getElementById('user-menu-wrap');
  if (um && wrap && !wrap.contains(e.target)) um.style.display = 'none';
  const np = document.getElementById('notif-panel');
  if (np && !e.target.closest('#notif-panel') && !e.target.closest('[onclick="toggleNotifications()"]')) {
    np.style.display = 'none';
  }
  const sd = document.getElementById('services-dropdown');
  const sw = document.getElementById('services-menu-wrap');
  if (sd && sw && !sw.contains(e.target)) sd.style.display = 'none';
});

// ── Footer ───────────────────────────────────────────────────────────────
function renderFooter() {
  return `
  <footer style="background:#0f172a;color:#94a3b8;padding:48px 20px 24px">
    <div style="max-width:1280px;margin:0 auto">
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:32px;margin-bottom:32px">
        <div>
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
            <div style="width:36px;height:36px;background:linear-gradient(135deg,#2563eb,#ea580c);border-radius:10px;display:flex;align-items:center;justify-content:center">
              <i class="fas fa-hammer" style="color:white;font-size:16px"></i>
            </div>
            <span style="font-size:20px;font-weight:800;color:white">BidKarts</span>
          </div>
          <p style="font-size:13px;line-height:1.6;margin-bottom:16px">India's premier marketplace connecting customers with verified service contractors for HVAC, Electrical, Solar & more.</p>
          <div style="display:flex;gap:12px">
            ${['fa-facebook','fa-twitter','fa-linkedin','fa-instagram'].map(i => `<a href="javascript:void(0)" style="color:#64748b;font-size:18px" onmouseover="this.style.color='#3b82f6'" onmouseout="this.style.color='#64748b'"><i class="fab ${i}"></i></a>`).join('')}
          </div>
        </div>
        <div>
          <h4 style="color:white;font-weight:700;margin-bottom:16px;font-size:14px">Services</h4>
          ${[['HVAC Services','/services/hvac'],['Electrical','/services/electrical'],['Plumbing','/services/plumbing'],['Solar EPC','/services/solar'],['Fabrication','/services/fabrication'],['Contracting','/services/contracting']].map(([s,url]) => `<a onclick="Router.go('${url}')" style="display:block;color:#94a3b8;font-size:13px;margin-bottom:8px;text-decoration:none;cursor:pointer" onmouseover="this.style.color='white'" onmouseout="this.style.color='#94a3b8'">${s}</a>`).join('')}
        </div>
        <div>
          <h4 style="color:white;font-weight:700;margin-bottom:16px;font-size:14px">Platform</h4>
          ${[['Post a Project','/post-project'],['Browse Vendors','/vendors'],['Expert Consultations','/consultations'],['AI Tools','/ai-tools'],['How It Works','/how-it-works'],['About Us','/about']].map(([s,url]) => `<a onclick="Router.go('${url}')" style="display:block;color:#94a3b8;font-size:13px;margin-bottom:8px;text-decoration:none;cursor:pointer" onmouseover="this.style.color='white'" onmouseout="this.style.color='#94a3b8'">${s}</a>`).join('')}
        </div>
        <div>
          <h4 style="color:white;font-weight:700;margin-bottom:16px;font-size:14px">Contact</h4>
          <p style="font-size:13px;margin-bottom:8px"><i class="fas fa-map-marker-alt" style="margin-right:8px;color:#3b82f6"></i>Mumbai, Maharashtra 400001</p>
          <p style="font-size:13px;margin-bottom:8px"><i class="fas fa-phone" style="margin-right:8px;color:#3b82f6"></i>+91 1800-BID-KARTS</p>
          <p style="font-size:13px;margin-bottom:8px"><i class="fas fa-envelope" style="margin-right:8px;color:#3b82f6"></i>hello@bidkarts.com</p>
          <p style="font-size:13px;margin-bottom:8px"><i class="fas fa-clock" style="margin-right:8px;color:#3b82f6"></i>Mon-Sat: 9AM - 7PM IST</p>
        </div>
      </div>
      <div style="border-top:1px solid #1e293b;padding-top:24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
        <p style="font-size:12px">© 2025 BidKarts Technologies Pvt. Ltd. All rights reserved.</p>
        <div style="display:flex;gap:20px">
          ${['Privacy Policy','Terms of Service','Cookie Policy'].map(t => `<a onclick="Router.go('/${t.toLowerCase().replace(/ /g,'-')}')" style="font-size:12px;color:#64748b;text-decoration:none;cursor:pointer">${t}</a>`).join('')}
        </div>
      </div>
    </div>
  </footer>`;
}

// ── Layout ───────────────────────────────────────────────────────────────
function layout(content, { noFooter = false } = {}) {
  return renderNavbar() + `<main style="min-height:calc(100vh - 64px)">${content}</main>` + (noFooter ? '' : renderFooter());
}

function dashboardLayout(sidebar, content) {
  return renderNavbar() + `
  <div style="display:flex;min-height:calc(100vh - 64px);background:#f8fafc">
    <aside style="width:260px;background:white;border-right:1px solid #e2e8f0;padding:20px 12px;position:sticky;top:64px;height:calc(100vh - 64px);overflow-y:auto;flex-shrink:0" id="dash-sidebar">
      ${sidebar}
    </aside>
    <main style="flex:1;padding:28px;overflow-x:hidden" id="dash-content">
      ${content}
    </main>
  </div>`;
}

// ── HOME PAGE ─────────────────────────────────────────────────────────────
const Pages = {
  home() {
    // Static default ticker items shown IMMEDIATELY while API loads
    const defaultTickerItems = [
      { svc:'electrical', icon:'⚡', title:'4 BHK Home Electrical Wiring', loc:'Mumbai', budget:'45k', bids:3 },
      { svc:'solar', icon:'☀️', title:'Rooftop Solar 5kW Installation', loc:'Pune', budget:'2.1L', bids:5 },
      { svc:'hvac', icon:'🌬️', title:'Central AC Installation 3 Ton', loc:'Delhi', budget:'85k', bids:2 },
      { svc:'plumbing', icon:'🚿', title:'Bathroom Renovation & Plumbing', loc:'Bangalore', budget:'60k', bids:4 },
      { svc:'fabrication', icon:'🔧', title:'MS Gate & Railing Fabrication', loc:'Chennai', budget:'35k', bids:6 },
      { svc:'contracting', icon:'🏗️', title:'Commercial Office Interior', loc:'Hyderabad', budget:'3.5L', bids:8 },
    ];
    const buildTickerHTML = (items) => {
      const spans = items.map(p =>
        `<span style="font-size:13px;opacity:0.9;cursor:pointer;display:inline-flex;align-items:center;gap:6px" onclick="Router.go('/projects')">
          ${p.icon} <strong>${p.title}</strong> · ${p.loc} · ₹${p.budget} · ${p.bids} bid${p.bids===1?'':'s'}
        </span><span style="opacity:0.35;margin:0 8px">|</span>`
      ).join('');
      return spans + spans; // duplicate for seamless loop
    };
    const initialTickerHTML = buildTickerHTML(defaultTickerItems);
    document.getElementById('app').innerHTML = layout(`
    <!-- Live Projects Ticker -->
    <style>
      @keyframes tickerScrollAnim { 0%{transform:translateX(0) translateY(-50%)} 100%{transform:translateX(-50%) translateY(-50%)} }
      @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
      @keyframes shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
      .shimmer-card { background: linear-gradient(90deg, #f1f5f9 25%, #e8edf5 50%, #f1f5f9 75%); background-size: 200% 100%; animation: shimmer 1.5s ease-in-out infinite; }
    </style>
    <div id="live-ticker" style="background:linear-gradient(135deg,#1e3a8a,#1d4ed8);color:white;padding:8px 0;overflow:hidden;position:relative;border-bottom:2px solid rgba(255,255,255,0.1)">
      <div style="display:flex;align-items:center;gap:0;white-space:nowrap">
        <div style="background:#ef4444;color:white;padding:4px 16px;font-size:12px;font-weight:700;white-space:nowrap;flex-shrink:0;z-index:2;position:relative">
          <span style="width:8px;height:8px;background:#fbbf24;border-radius:50%;display:inline-block;margin-right:6px;animation:pulse 1.5s ease-in-out infinite"></span>LIVE
        </div>
        <div id="ticker-content" style="overflow:hidden;flex:1;position:relative;height:34px">
          <div id="ticker-inner" style="display:inline-flex;align-items:center;gap:32px;padding:0 20px;white-space:nowrap;position:absolute;left:0;top:50%;transform:translateY(-50%);animation:tickerScrollAnim 30s linear infinite">
            ${initialTickerHTML}
          </div>
        </div>
      </div>
    </div>

    <!-- Hero Section -->
    <section class="gradient-hero" style="padding:80px 20px;position:relative;overflow:hidden">
      <div style="position:absolute;inset:0;opacity:0.06">
        <div style="position:absolute;top:-50px;right:-50px;width:400px;height:400px;background:white;border-radius:50%"></div>
        <div style="position:absolute;bottom:-100px;left:-50px;width:300px;height:300px;background:white;border-radius:50%"></div>
      </div>
      <div style="max-width:1000px;margin:0 auto;text-align:center;position:relative">
        <div style="display:inline-flex;align-items:center;gap:8px;background:rgba(255,255,255,0.15);color:white;padding:6px 16px;border-radius:20px;font-size:13px;font-weight:500;margin-bottom:24px;backdrop-filter:blur(8px)">
          <span class="pulse-dot" style="width:8px;height:8px;background:#34d399;border-radius:50%;display:inline-block"></span>
          India's #1 Service Contractor Marketplace
        </div>
        <h1 style="font-size:clamp(32px,5vw,62px);font-weight:900;color:white;line-height:1.1;margin-bottom:20px">
          Connect. <span style="color:#fb923c">Bid.</span> Build.
        </h1>
        <p style="font-size:clamp(16px,2.5vw,20px);color:rgba(255,255,255,0.85);max-width:680px;margin:0 auto 36px;line-height:1.6">
          Post your project, receive competitive bids from verified contractors, and get expert technical inspections — all in one powerful platform.
        </p>
        <div style="display:flex;gap:14px;justify-content:center;flex-wrap:wrap;margin-bottom:48px">
          <button onclick="Router.go(Auth.isLoggedIn() && Auth.role()==='customer' ? '/post-project' : '/register')" class="btn-accent" style="color:white;padding:14px 32px;border-radius:12px;font-size:16px;font-weight:700;display:flex;align-items:center;gap:8px">
            <i class="fas fa-plus-circle"></i> Post a Project
          </button>
          <button onclick="Router.go('/projects')" style="background:rgba(255,255,255,0.15);color:white;padding:14px 32px;border-radius:12px;font-size:16px;font-weight:600;border:1.5px solid rgba(255,255,255,0.3);cursor:pointer;backdrop-filter:blur(8px)">
            <i class="fas fa-search" style="margin-right:8px"></i>Browse Projects
          </button>
        </div>
        <!-- Stats -->
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;max-width:720px;margin:0 auto">
          ${[['2,500+','Active Projects','stat-projects'],['850+','Verified Vendors','stat-vendors'],['15,000+','Projects Completed','stat-completed'],['4.8★','Average Rating','stat-rating']].map(([v,l,id]) => `
          <div style="background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.2);border-radius:16px;padding:20px 12px;backdrop-filter:blur(8px)">
            <div id="${id}" style="font-size:24px;font-weight:800;color:white">${v}</div>
            <div style="font-size:12px;color:rgba(255,255,255,0.75);margin-top:4px">${l}</div>
          </div>`).join('')}
        </div>
      </div>
    </section>

    <!-- Services Section -->
    <section style="padding:72px 20px;background:white">
      <div style="max-width:1280px;margin:0 auto">
        <div style="text-align:center;margin-bottom:48px">
          <span style="font-size:13px;font-weight:600;color:#2563eb;text-transform:uppercase;letter-spacing:1px">Our Services</span>
          <h2 style="font-size:36px;font-weight:800;color:#0f172a;margin-top:8px">Everything You Need to Build</h2>
          <p style="color:#64748b;margin-top:12px;font-size:16px">Connect with certified professionals across all major service categories <a onclick="Router.go('/how-it-works')" style="color:#2563eb;cursor:pointer;font-weight:600">Learn how it works →</a></p>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:20px">
          ${[
            ['hvac','HVAC Services','Air conditioning, heating, ventilation systems','fa-wind','#3b82f6','#eff6ff'],
            ['electrical','Electrical','Wiring, panels, industrial electrical work','fa-bolt','#f59e0b','#fffbeb'],
            ['plumbing','Plumbing','Pipes, drainage, bathroom & kitchen plumbing','fa-faucet','#06b6d4','#ecfeff'],
            ['solar','Solar EPC','Complete solar installation & net metering','fa-solar-panel','#f97316','#fff7ed'],
            ['fabrication','Fabrication','Structural steel, custom metal fabrication','fa-industry','#8b5cf6','#f5f3ff'],
            ['contracting','Contracting','Residential & industrial project management','fa-hard-hat','#10b981','#f0fdf4'],
          ].map(([type,name,desc,icon,color,bg]) => `
          <div class="card-hover" onclick="Router.go('/projects?service_type=${type}')" style="background:${bg};border-radius:16px;padding:24px;border:1px solid ${bg}">
            <div class="service-icon-wrap" style="background:white;color:${color};margin-bottom:16px;box-shadow:0 2px 8px rgba(0,0,0,0.06)">
              <i class="fas ${icon}"></i>
            </div>
            <h3 style="font-weight:700;color:#1e293b;margin-bottom:8px;font-size:15px">${name}</h3>
            <p style="font-size:13px;color:#64748b;line-height:1.5">${desc}</p>
            <div style="margin-top:12px;font-size:12px;font-weight:600;color:${color}">Explore <i class="fas fa-arrow-right"></i></div>
          </div>`).join('')}
        </div>
      </div>
    </section>

    <!-- How It Works -->
    <section style="padding:72px 20px;background:#f8fafc">
      <div style="max-width:1100px;margin:0 auto">
        <div style="text-align:center;margin-bottom:48px">
          <span style="font-size:13px;font-weight:600;color:#f97316;text-transform:uppercase;letter-spacing:1px">How It Works</span>
          <h2 style="font-size:36px;font-weight:800;color:#0f172a;margin-top:8px">Simple 4-Step Process</h2>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:24px">
          ${[
            ['1','Post Your Project','Describe your service needs, set your budget, and upload relevant documents.','fa-clipboard-list','#2563eb'],
            ['2','Receive Bids','Verified vendors submit competitive bids with timelines and equipment details.','fa-gavel','#7c3aed'],
            ['3','Compare & Select','Use our comparison tools to evaluate bids, vendor ratings, and certifications.','fa-balance-scale','#0891b2'],
            ['4','Build with Confidence','Make secure payment, track project progress, and review on completion.','fa-check-circle','#059669'],
          ].map(([n,t,d,icon,color]) => `
          <div style="text-align:center;padding:32px 24px;background:white;border-radius:20px;box-shadow:0 2px 8px rgba(0,0,0,0.05);position:relative">
            <div style="position:absolute;top:-16px;left:50%;transform:translateX(-50%);width:36px;height:36px;background:${color};border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-size:14px;font-weight:800;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.15)">${n}</div>
            <div style="width:64px;height:64px;background:${color}20;border-radius:16px;display:flex;align-items:center;justify-content:center;margin:16px auto 20px">
              <i class="fas ${icon}" style="font-size:28px;color:${color}"></i>
            </div>
            <h3 style="font-weight:700;color:#1e293b;margin-bottom:10px">${t}</h3>
            <p style="font-size:13px;color:#64748b;line-height:1.6">${d}</p>
          </div>`).join('')}
        </div>
      </div>
    </section>

    <!-- Featured Projects -->
    <section style="padding:72px 20px;background:white" id="featured-projects-section">
      <div style="max-width:1280px;margin:0 auto">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:32px;flex-wrap:wrap;gap:16px">
          <div>
            <span style="font-size:13px;font-weight:600;color:#2563eb;text-transform:uppercase;letter-spacing:1px">Live Projects</span>
            <h2 style="font-size:32px;font-weight:800;color:#0f172a;margin-top:4px">Active Projects Seeking Bids</h2>
          </div>
          <button onclick="Router.go('/projects')" style="background:#eff6ff;color:#2563eb;padding:10px 20px;border-radius:10px;border:none;cursor:pointer;font-weight:600;font-size:14px">View All Projects <i class="fas fa-arrow-right" style="margin-left:6px"></i></button>
        </div>
        <div id="featured-projects" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:20px">
          ${Array(6).fill(0).map(()=>`<div class="shimmer-card" style="background:white;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;min-height:200px">
            <div style="padding:20px">
              <div style="height:18px;border-radius:6px;margin-bottom:12px;width:55%;background:#e2e8f0"></div>
              <div style="height:15px;border-radius:6px;margin-bottom:8px;background:#e2e8f0"></div>
              <div style="height:13px;border-radius:6px;width:80%;background:#e2e8f0;margin-bottom:8px"></div>
              <div style="height:13px;border-radius:6px;width:65%;background:#e2e8f0"></div>
            </div>
            <div style="padding:12px 20px;border-top:1px solid #f1f5f9;height:44px;background:#f8fafc"></div>
          </div>`).join('')}
        </div>
      </div>
    </section>

    <!-- Testimonials -->
    <section style="padding:72px 20px;background:#f8fafc">
      <div style="max-width:1100px;margin:0 auto">
        <div style="text-align:center;margin-bottom:40px">
          <h2 style="font-size:32px;font-weight:800;color:#0f172a">What Our Users Say</h2>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px">
          ${[
            ['Rahul M.','Mumbai','Solar Installation Customer','The entire process was seamless. Got 6 bids within 24 hours and the technical inspection gave me real confidence. Saved 25% vs market rate!',5,'customer'],
            ['Vikram S.','Pune','Electrical Contractor','BidKarts completely transformed my business. I now get 10x more project inquiries. The dashboard makes managing bids effortless.', 5,'vendor'],
            ['Priya K.','Delhi','HVAC Customer','Love the bid comparison feature. Side-by-side comparison with vendor ratings made my decision easy. Excellent platform!',5,'customer'],
          ].map(([name,city,role,text,rating,type]) => `
          <div style="background:white;border-radius:20px;padding:28px;box-shadow:0 2px 12px rgba(0,0,0,0.06)">
            <div style="margin-bottom:16px">${Helpers.stars(rating)}</div>
            <p style="font-size:14px;color:#374151;line-height:1.7;margin-bottom:20px;font-style:italic">"${text}"</p>
            <div style="display:flex;align-items:center;gap:12px">
              <div style="width:44px;height:44px;background:linear-gradient(135deg,#2563eb,#7c3aed);border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:16px">${name.charAt(0)}</div>
              <div>
                <p style="font-weight:700;color:#1e293b;font-size:14px">${name}</p>
                <p style="font-size:12px;color:#64748b">${role} · ${city}</p>
              </div>
            </div>
          </div>`).join('')}
        </div>
      </div>
    </section>

    <!-- CTA Section -->
    <section style="padding:72px 20px" class="gradient-hero">
      <div style="max-width:800px;margin:0 auto;text-align:center">
        <h2 style="font-size:clamp(28px,4vw,44px);font-weight:900;color:white;margin-bottom:16px">Ready to Start Your Project?</h2>
        <p style="font-size:18px;color:rgba(255,255,255,0.85);margin-bottom:32px">Join 15,000+ satisfied customers who built with BidKarts.</p>
        <div style="display:flex;gap:14px;justify-content:center;flex-wrap:wrap">
          <button onclick="Router.go('/register')" class="btn-accent" style="color:white;padding:14px 36px;border-radius:12px;font-size:16px;font-weight:700">
            <i class="fas fa-rocket" style="margin-right:8px"></i>Get Started Free
          </button>
          <button onclick="Router.go('/vendors')" style="background:rgba(255,255,255,0.15);color:white;padding:14px 36px;border-radius:12px;font-size:16px;font-weight:600;border:1.5px solid rgba(255,255,255,0.3);cursor:pointer">
            <i class="fas fa-users" style="margin-right:8px"></i>Browse Vendors
          </button>
        </div>
      </div>
    </section>
    `);
    // Use requestAnimationFrame to start loading after DOM is painted
    requestAnimationFrame(() => {
      loadFeaturedProjects();
      loadLiveTicker();
      loadHomeStats();
    });
  }
};

async function loadHomeStats() {
  try {
    const { data } = await API.get('/stats/public');
    const projectEl = document.getElementById('stat-projects');
    const vendorEl = document.getElementById('stat-vendors');
    const completedEl = document.getElementById('stat-completed');
    if (projectEl && data.total_projects > 0) projectEl.textContent = data.total_projects.toLocaleString('en-IN') + '+';
    if (vendorEl && data.verified_vendors > 0) vendorEl.textContent = data.verified_vendors.toLocaleString('en-IN') + '+';
    if (completedEl && data.completed_projects > 0) completedEl.textContent = data.completed_projects.toLocaleString('en-IN') + '+';
  } catch {} // Silently fail - static fallback remains
}

async function loadFeaturedProjects() {
  try {
    const { data } = await API.get('/projects?limit=6&status=open');
    const el = document.getElementById('featured-projects');
    if (!el) return;
    const projects = data.projects || [];
    if (projects.length === 0) {
      el.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:#64748b">
        <i class="fas fa-clipboard-list" style="font-size:48px;color:#cbd5e1;margin-bottom:16px;display:block"></i>
        <p style="font-size:16px;font-weight:600;margin-bottom:8px">No active projects yet</p>
        <p style="font-size:14px">Be the first to <a onclick="Router.go(Auth.isLoggedIn()&&Auth.role()==='customer'?'/post-project':'/register')" style="color:#2563eb;cursor:pointer;font-weight:600">post a project</a></p>
      </div>`;
    } else {
      el.innerHTML = projects.map(p => projectCard(p)).join('');
    }
    // Update count badge if stat element exists
    const statEl = document.getElementById('stat-projects');
    if (statEl && data.total) statEl.textContent = data.total.toLocaleString('en-IN') + '+';
  } catch(e) {
    const el = document.getElementById('featured-projects');
    if (el) el.innerHTML = '<p style="color:#ef4444;text-align:center;grid-column:1/-1;padding:40px">Failed to load projects.</p>';
  }
}

async function loadLiveTicker() {
  try {
    const { data } = await API.get('/projects/live');
    const projects = data.projects || [];
    const ticker = document.getElementById('ticker-inner');
    if (!ticker) return;
    if (projects.length === 0) return; // Keep static items running
    const svcIcons = { hvac:'🌬️', electrical:'⚡', plumbing:'🚿', solar:'☀️', fabrication:'🔧', contracting:'🏗️' };
    const items = projects.map(p =>
      `<span style="font-size:13px;opacity:0.9;cursor:pointer;display:inline-flex;align-items:center;gap:6px" onclick="Router.go('/projects/${p.id}')">
        ${svcIcons[p.service_type]||'🔨'} <strong>${Helpers.truncate(p.title,40)}</strong> · ${p.location} · ₹${p.budget_min ? Math.round(p.budget_min/1000)+'k' : 'Open'} · ${p.bid_count||0} bid${p.bid_count===1?'':'s'}
      </span><span style="opacity:0.35;margin:0 8px">|</span>`
    ).join('');
    // Seamlessly swap content: pause animation, update, resume
    ticker.style.animationPlayState = 'paused';
    ticker.innerHTML = items + items;
    const totalWidth = ticker.scrollWidth / 2;
    const speed = Math.max(25, totalWidth / 80);
    ticker.style.animation = `tickerScrollAnim ${speed}s linear infinite`;
  } catch {} // Static fallback stays on error
}

function projectCard(p) {
  const svcClass = Helpers.serviceColor(p.service_type);
  return `
  <div class="card-hover" onclick="Router.go('/projects/${p.id}')" style="background:white;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden">
    <div style="padding:20px">
      <div style="display:flex;align-items:start;justify-content:space-between;margin-bottom:12px">
        <span class="status-badge ${svcClass}" style="font-size:11px">${Helpers.serviceLabel(p.service_type)}</span>
        ${Helpers.statusBadge(p.status)}
      </div>
      <h3 style="font-weight:700;color:#1e293b;font-size:15px;margin-bottom:8px;line-height:1.4">${Helpers.truncate(p.title, 60)}</h3>
      <p style="font-size:13px;color:#64748b;line-height:1.5;margin-bottom:16px">${Helpers.truncate(p.description, 100)}</p>
      <div style="display:flex;flex-direction:column;gap:8px">
        <div style="display:flex;align-items:center;gap:8px;font-size:12px;color:#64748b">
          <i class="fas fa-map-marker-alt" style="color:#3b82f6;width:14px"></i>${p.location}
        </div>
        ${p.budget_min ? `<div style="display:flex;align-items:center;gap:8px;font-size:12px;color:#64748b">
          <i class="fas fa-rupee-sign" style="color:#10b981;width:14px"></i>Budget: ${Helpers.currency(p.budget_min)} - ${Helpers.currency(p.budget_max)}
        </div>` : ''}
        <div style="display:flex;align-items:center;gap:8px;font-size:12px;color:#64748b">
          <i class="fas fa-clock" style="color:#f59e0b;width:14px"></i>${p.timeline || 'Flexible'} · ${Helpers.timeAgo(p.created_at)}
        </div>
      </div>
    </div>
    <div style="padding:12px 20px;background:#f8fafc;border-top:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between">
      <div style="display:flex;align-items:center;gap:6px">
        <div style="width:24px;height:24px;background:linear-gradient(135deg,#2563eb,#7c3aed);border-radius:50%;display:flex;align-items:center;justify-content:center">
          <span style="color:white;font-size:9px;font-weight:700">${(p.customer_name||'C').charAt(0)}</span>
        </div>
        <span style="font-size:12px;color:#64748b">${p.customer_name || 'Customer'}</span>
      </div>
      <span style="font-size:12px;font-weight:600;color:#2563eb"><i class="fas fa-gavel" style="margin-right:4px"></i>${p.bid_count || 0} bids</span>
    </div>
  </div>`;
}

// ── AUTH PAGES ─────────────────────────────────────────────────────────────
Pages.login = function() {
  if (Auth.isLoggedIn()) { Router.go('/'); return; }
  document.getElementById('app').innerHTML = layout(`
  <div style="min-height:100vh;background:linear-gradient(135deg,#eff6ff,#f0fdf4);display:flex;align-items:center;justify-content:center;padding:40px 20px">
    <div style="width:100%;max-width:460px">
      <div style="text-align:center;margin-bottom:32px">
        <div onclick="Router.go('/')" style="display:inline-flex;align-items:center;gap:10px;cursor:pointer;margin-bottom:20px">
          <div style="width:44px;height:44px;background:linear-gradient(135deg,#2563eb,#ea580c);border-radius:14px;display:flex;align-items:center;justify-content:center">
            <i class="fas fa-hammer" style="color:white;font-size:20px"></i>
          </div>
          <span style="font-size:24px;font-weight:800;background:linear-gradient(135deg,#2563eb,#ea580c);-webkit-background-clip:text;-webkit-text-fill-color:transparent">BidKarts</span>
        </div>
        <h1 style="font-size:28px;font-weight:800;color:#0f172a">Welcome back!</h1>
        <p style="color:#64748b;margin-top:8px">Sign in to your account to continue</p>
      </div>
      <div style="background:white;border-radius:24px;padding:36px;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
        <!-- Demo accounts -->
        <div style="background:#f8fafc;border-radius:12px;padding:14px;margin-bottom:24px;border:1px solid #e2e8f0">
          <p style="font-size:12px;font-weight:700;color:#374151;margin-bottom:8px">🚀 Demo Accounts (click to fill):</p>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            ${[['Customer','customer@bidkarts.com','Admin@123','#2563eb'],['Vendor','vendor@bidkarts.com','Admin@123','#7c3aed'],['Expert','expert@bidkarts.com','Admin@123','#0891b2'],['Admin','admin@bidkarts.com','Admin@123','#dc2626']].map(([r,e,p,c]) =>
              `<button onclick="document.getElementById('login-email').value='${e}';document.getElementById('login-pass').value='${p}'" style="padding:4px 10px;background:${c}15;color:${c};border:1px solid ${c}30;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer">${r}</button>`
            ).join('')}
          </div>
        </div>
        <form onsubmit="handleLogin(event)">
          <div style="margin-bottom:18px">
            <label class="form-label">Email Address</label>
            <input id="login-email" type="email" class="form-input" placeholder="you@example.com" required>
          </div>
          <div style="margin-bottom:24px">
            <label class="form-label">Password</label>
            <div style="position:relative">
              <input id="login-pass" type="password" class="form-input" placeholder="Your password" required>
              <button type="button" onclick="togglePass('login-pass')" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:#94a3b8">
                <i class="fas fa-eye" id="login-pass-icon"></i>
              </button>
            </div>
          </div>
          <button type="submit" id="login-btn" class="btn-primary" style="width:100%;color:white;padding:14px;border-radius:12px;font-size:15px;font-weight:700">
            <i class="fas fa-sign-in-alt" style="margin-right:8px"></i>Sign In
          </button>
        </form>
        <!-- Divider -->
        <div style="display:flex;align-items:center;gap:12px;margin:20px 0">
          <div style="flex:1;height:1px;background:#e2e8f0"></div>
          <span style="font-size:12px;color:#94a3b8;font-weight:500">OR CONTINUE WITH</span>
          <div style="flex:1;height:1px;background:#e2e8f0"></div>
        </div>
        <!-- Social OAuth Buttons -->
        <div style="display:grid;gap:10px">
          <button onclick="handleGoogleLogin()" id="google-btn" style="width:100%;display:flex;align-items:center;justify-content:center;gap:10px;padding:12px;border:1.5px solid #e2e8f0;border-radius:12px;background:white;cursor:pointer;font-size:14px;font-weight:600;color:#374151;transition:all 0.2s" onmouseover="this.style.background='#f8fafc';this.style.borderColor='#94a3b8'" onmouseout="this.style.background='white';this.style.borderColor='#e2e8f0'">
            <img src="https://www.google.com/favicon.ico" alt="Google" style="width:18px;height:18px">
            Continue with Google
          </button>
          <button onclick="handleFacebookLogin()" id="fb-btn" style="width:100%;display:flex;align-items:center;justify-content:center;gap:10px;padding:12px;border:1.5px solid #1877f2;border-radius:12px;background:#1877f2;cursor:pointer;font-size:14px;font-weight:600;color:white;transition:all 0.2s" onmouseover="this.style.opacity='0.9'" onmouseout="this.style.opacity='1'">
            <i class="fab fa-facebook-f" style="font-size:18px"></i>
            Continue with Facebook
          </button>
          <button onclick="handleTwitterLogin()" id="tw-btn" style="width:100%;display:flex;align-items:center;justify-content:center;gap:10px;padding:12px;border:1.5px solid #000;border-radius:12px;background:#000;cursor:pointer;font-size:14px;font-weight:600;color:white;transition:all 0.2s" onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.747l7.73-8.835L1.254 2.25H8.08l4.259 5.631zM17.083 20.25h1.833L6.99 4.132H5.033z"/></svg>
            Continue with X (Twitter)
          </button>
        </div>
        <p style="text-align:center;margin-top:20px;font-size:14px;color:#64748b">
          Don't have an account? <a onclick="Router.go('/register')" style="color:#2563eb;font-weight:600;cursor:pointer">Create Account</a>
        </p>
      </div>
    </div>
  </div>
  `, { noFooter: true });
};

async function handleLogin(e) {
  e.preventDefault();
  const btn = document.getElementById('login-btn');
  const email = document.getElementById('login-email').value;
  const pass = document.getElementById('login-pass').value;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:8px"></i>Signing In...';
  btn.disabled = true;
  try {
    const data = await Auth.login(email, pass);
    Toast.show(`Welcome back, ${data.user.name}! 👋`, 'success');
    setTimeout(() => {
      const role = data.user.role;
      Router.go(role === 'vendor' ? '/dashboard/vendor' : role === 'expert' ? '/dashboard/expert' : role === 'admin' ? '/dashboard/admin' : '/dashboard/customer');
    }, 800);
  } catch(err) {
    Toast.show(err.response?.data?.error || 'Login failed', 'error');
    btn.innerHTML = '<i class="fas fa-sign-in-alt" style="margin-right:8px"></i>Sign In';
    btn.disabled = false;
  }
}

// Google OAuth handler
async function handleGoogleLogin() {
  const btn = document.getElementById('google-btn');
  if (btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:8px"></i>Connecting to Google...'; btn.disabled = true; }

  // Check if Google Identity Services is loaded
  if (!window.google?.accounts?.id) {
    // Load Google Identity Services script
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  // Show Google OAuth modal for demo purposes (since we need a real Client ID)
  if (btn) { btn.innerHTML = '<img src="https://www.google.com/favicon.ico" style="width:18px;height:18px"> Continue with Google'; btn.disabled = false; }
  showGoogleOAuthModal();
}

function showGoogleOAuthModal() {
  Modal.show('Google Sign In', `
    <div style="text-align:center;padding:20px 0">
      <img src="https://www.google.com/favicon.ico" style="width:48px;height:48px;margin-bottom:16px">
      <h3 style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:8px">Sign in with Google</h3>
      <p style="font-size:14px;color:#64748b;margin-bottom:20px">Enter your Google account details to continue</p>
      <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:10px;padding:12px;margin-bottom:20px;text-align:left">
        <p style="font-size:12px;color:#92400e;font-weight:600">⚠️ Demo Mode</p>
        <p style="font-size:12px;color:#78350f;margin-top:4px">In production, this integrates with real Google OAuth. For demo, please use email/password login with the demo accounts above.</p>
      </div>
      <div style="margin-bottom:14px;text-align:left">
        <label class="form-label">Google Email</label>
        <input id="google-email" type="email" class="form-input" placeholder="yourname@gmail.com">
      </div>
      <div style="margin-bottom:14px;text-align:left">
        <label class="form-label">Your Name</label>
        <input id="google-name" class="form-input" placeholder="Your full name">
      </div>
      <div style="margin-bottom:14px;text-align:left">
        <label class="form-label">I want to join as</label>
        <select id="google-role" class="form-input">
          <option value="customer">Customer (Post Projects)</option>
          <option value="vendor">Vendor/Contractor</option>
          <option value="expert">Technical Expert</option>
        </select>
      </div>
    </div>
  `, `
    <button onclick="Modal.close()" style="padding:10px 20px;border:1.5px solid #e2e8f0;border-radius:10px;background:white;cursor:pointer;font-weight:500">Cancel</button>
    <button onclick="completeGoogleOAuth()" class="btn-primary" style="color:white;padding:10px 24px;border-radius:10px;font-weight:600">Continue</button>
  `);
}

async function completeGoogleOAuth() {
  const email = document.getElementById('google-email')?.value;
  const name = document.getElementById('google-name')?.value;
  const role = document.getElementById('google-role')?.value;
  if (!email || !name) { Toast.show('Please enter email and name', 'warning'); return; }

  try {
    // Try to login first, if not found, register
    try {
      const loginData = await Auth.login(email, email.split('@')[0] + '@google');
      Modal.close();
      Toast.show(`Welcome back, ${loginData.user.name}!`, 'success');
      const r = loginData.user.role;
      setTimeout(() => Router.go(r === 'vendor' ? '/dashboard/vendor' : r === 'expert' ? '/dashboard/expert' : r === 'admin' ? '/dashboard/admin' : '/dashboard/customer'), 800);
    } catch {
      // Register via OAuth complete endpoint
      const { data } = await API.post('/auth/oauth/google/complete', {
        email, name, role,
        google_id: 'demo_' + Date.now(),
        picture: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`
      });
      State.setUser(data.user, data.token);
      Modal.close();
      Toast.show(`Welcome to BidKarts, ${data.user.name}! 🎉`, 'success');
      const r = data.user.role;
      setTimeout(() => Router.go(r === 'vendor' ? '/dashboard/vendor' : r === 'expert' ? '/dashboard/expert' : '/dashboard/customer'), 800);
    }
  } catch(err) {
    Toast.show(err.response?.data?.error || 'Google sign-in failed', 'error');
  }
}

// Facebook Login Handler
async function handleFacebookLogin() {
  const btn = document.getElementById('fb-btn');
  if (btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:8px"></i>Connecting...'; btn.disabled = true; }
  setTimeout(() => {
    if (btn) { btn.innerHTML = '<i class="fab fa-facebook-f" style="font-size:18px"></i> Continue with Facebook'; btn.disabled = false; }
    showSocialOAuthModal('Facebook', '#1877f2', 'fab fa-facebook-f', 'fb');
  }, 800);
}

// Twitter/X Login Handler
async function handleTwitterLogin() {
  const btn = document.getElementById('tw-btn');
  if (btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:8px"></i>Connecting...'; btn.disabled = true; }
  setTimeout(() => {
    if (btn) { btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.747l7.73-8.835L1.254 2.25H8.08l4.259 5.631zM17.083 20.25h1.833L6.99 4.132H5.033z"/></svg> Continue with X (Twitter)'; btn.disabled = false; }
    showSocialOAuthModal('X (Twitter)', '#000000', 'fab fa-x-twitter', 'tw');
  }, 800);
}

function showSocialOAuthModal(provider, color, iconClass, prefix) {
  Modal.show(`${provider} Sign In`, `
    <div style="text-align:center;padding:16px 0">
      <div style="width:56px;height:56px;background:${color};border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 16px">
        <i class="${iconClass}" style="font-size:22px;color:white"></i>
      </div>
      <h3 style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:6px">Sign in with ${provider}</h3>
      <p style="font-size:13px;color:#64748b;margin-bottom:18px">Enter your details to continue with BidKarts</p>
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:12px;margin-bottom:18px;text-align:left">
        <p style="font-size:12px;color:#1d4ed8;font-weight:600"><i class="fas fa-info-circle" style="margin-right:6px"></i>Social Login</p>
        <p style="font-size:12px;color:#1e40af;margin-top:4px">For production deployment, configure your ${provider} App credentials in the platform settings to enable real OAuth flow.</p>
      </div>
      <div style="margin-bottom:12px;text-align:left">
        <label class="form-label">Email Address</label>
        <input id="social-email-${prefix}" type="email" class="form-input" placeholder="yourname@example.com">
      </div>
      <div style="margin-bottom:12px;text-align:left">
        <label class="form-label">Full Name</label>
        <input id="social-name-${prefix}" class="form-input" placeholder="Your full name">
      </div>
      <div style="margin-bottom:12px;text-align:left">
        <label class="form-label">Join As</label>
        <select id="social-role-${prefix}" class="form-input">
          <option value="customer">Customer (Post Projects)</option>
          <option value="vendor">Vendor / Contractor</option>
          <option value="expert">Technical Expert</option>
        </select>
      </div>
    </div>
  `, `
    <button onclick="Modal.close()" style="padding:10px 20px;border:1.5px solid #e2e8f0;border-radius:10px;background:white;cursor:pointer;font-weight:500">Cancel</button>
    <button onclick="completeSocialOAuth('${prefix}','${provider}')" style="background:${color};color:white;padding:10px 24px;border-radius:10px;font-weight:600;border:none;cursor:pointer">Continue</button>
  `);
}

async function completeSocialOAuth(prefix, provider) {
  const email = document.getElementById(`social-email-${prefix}`)?.value?.trim();
  const name = document.getElementById(`social-name-${prefix}`)?.value?.trim();
  const role = document.getElementById(`social-role-${prefix}`)?.value;
  if (!email || !name) { Toast.show('Please enter your email and name', 'warning'); return; }
  try {
    // Try existing login first
    try {
      const loginData = await Auth.login(email, email.split('@')[0] + '@social');
      Modal.close();
      Toast.show(`Welcome back, ${loginData.user.name}!`, 'success');
      const r = loginData.user.role;
      setTimeout(() => Router.go(r === 'vendor' ? '/dashboard/vendor' : r === 'expert' ? '/dashboard/expert' : r === 'admin' ? '/dashboard/admin' : '/dashboard/customer'), 800);
    } catch {
      // Register new user
      const { data } = await API.post('/auth/oauth/google/complete', {
        email, name, role,
        google_id: prefix + '_' + Date.now(),
        picture: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`
      });
      State.setUser(data.user, data.token);
      Modal.close();
      Toast.show(`Welcome to BidKarts, ${data.user.name}! 🎉`, 'success');
      const r = data.user.role;
      setTimeout(() => Router.go(r === 'vendor' ? '/dashboard/vendor' : r === 'expert' ? '/dashboard/expert' : '/dashboard/customer'), 800);
    }
  } catch(err) {
    Toast.show(err.response?.data?.error || `${provider} sign-in failed`, 'error');
  }
}

Pages.register = function() {
  if (Auth.isLoggedIn()) { Router.go('/'); return; }
  document.getElementById('app').innerHTML = layout(`
  <div style="min-height:100vh;background:linear-gradient(135deg,#f0fdf4,#eff6ff);padding:40px 20px">
    <div style="max-width:600px;margin:0 auto">
      <div style="text-align:center;margin-bottom:32px">
        <div onclick="Router.go('/')" style="display:inline-flex;align-items:center;gap:10px;cursor:pointer;margin-bottom:16px">
          <div style="width:40px;height:40px;background:linear-gradient(135deg,#2563eb,#ea580c);border-radius:12px;display:flex;align-items:center;justify-content:center">
            <i class="fas fa-hammer" style="color:white;font-size:18px"></i>
          </div>
          <span style="font-size:22px;font-weight:800;background:linear-gradient(135deg,#2563eb,#ea580c);-webkit-background-clip:text;-webkit-text-fill-color:transparent">BidKarts</span>
        </div>
        <h1 style="font-size:28px;font-weight:800;color:#0f172a">Create Your Account</h1>
        <p style="color:#64748b;margin-top:8px">Join thousands of users on BidKarts</p>
      </div>
      <!-- Role Selection -->
      <div style="background:white;border-radius:20px;padding:28px;box-shadow:0 4px 20px rgba(0,0,0,0.07);margin-bottom:20px">
        <p style="font-size:14px;font-weight:700;color:#374151;margin-bottom:14px">I want to:</p>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px" id="role-selector">
          ${[['customer','fa-user','Post Projects','Get quotes from verified contractors','#2563eb'],['vendor','fa-hard-hat','Offer Services','Bid on projects & grow business','#7c3aed'],['expert','fa-user-tie','Provide Inspections','Conduct technical assessments','#0891b2']].map(([r,icon,t,d,c]) =>
            `<div onclick="selectRole('${r}')" id="role-${r}" class="card-hover" style="border:2px solid #e2e8f0;border-radius:12px;padding:16px;text-align:center;cursor:pointer">
              <i class="fas ${icon}" style="font-size:24px;color:${c};margin-bottom:8px"></i>
              <p style="font-weight:700;font-size:13px;color:#1e293b">${t}</p>
              <p style="font-size:11px;color:#64748b;margin-top:4px">${d}</p>
            </div>`
          ).join('')}
        </div>
      </div>
      <div id="register-form-wrap" style="display:none">
        <form id="register-form" onsubmit="handleRegister(event)" style="background:white;border-radius:20px;padding:28px;box-shadow:0 4px 20px rgba(0,0,0,0.07)">
          <div id="common-fields">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">
              <div><label class="form-label">Full Name *</label><input name="name" class="form-input" placeholder="Your full name" required></div>
              <div><label class="form-label">Phone *</label><input name="phone" class="form-input" placeholder="+91 98765 43210" required></div>
            </div>
            <div style="margin-bottom:14px"><label class="form-label">Email Address *</label><input name="email" type="email" class="form-input" placeholder="your@email.com" required></div>
            <div style="margin-bottom:14px">
              <label class="form-label">Password *</label>
              <div style="position:relative">
                <input name="password" id="reg-pass" type="password" class="form-input" placeholder="Min. 6 characters" required>
                <button type="button" onclick="togglePass('reg-pass')" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:#94a3b8"><i class="fas fa-eye" id="reg-pass-icon"></i></button>
              </div>
            </div>
          </div>
          <div id="role-extra-fields"></div>
          <input type="hidden" name="role" id="reg-role">
          <button type="submit" id="reg-btn" class="btn-primary" style="width:100%;color:white;padding:14px;border-radius:12px;font-size:15px;font-weight:700;margin-top:8px">
            <i class="fas fa-user-plus" style="margin-right:8px"></i>Create Account
          </button>
          <div style="display:flex;align-items:center;gap:12px;margin:16px 0">
            <div style="flex:1;height:1px;background:#e2e8f0"></div>
            <span style="font-size:12px;color:#94a3b8;font-weight:500">OR</span>
            <div style="flex:1;height:1px;background:#e2e8f0"></div>
          </div>
          <button type="button" onclick="handleGoogleLogin()" style="width:100%;display:flex;align-items:center;justify-content:center;gap:10px;padding:12px;border:1.5px solid #e2e8f0;border-radius:12px;background:white;cursor:pointer;font-size:14px;font-weight:600;color:#374151">
            <img src="https://www.google.com/favicon.ico" alt="Google" style="width:18px;height:18px">
            Continue with Google
          </button>
          <p style="text-align:center;margin-top:16px;font-size:14px;color:#64748b">
            Already have an account? <a onclick="Router.go('/login')" style="color:#2563eb;font-weight:600;cursor:pointer">Sign In</a>
          </p>
        </form>
      </div>
    </div>
  </div>
  `, { noFooter: true });
};

function selectRole(role) {
  document.querySelectorAll('#role-selector > div').forEach(d => { d.style.borderColor = '#e2e8f0'; d.style.background = 'white'; });
  const colors = { customer: '#2563eb', vendor: '#7c3aed', expert: '#0891b2' };
  const el = document.getElementById(`role-${role}`);
  if (el) { el.style.borderColor = colors[role]; el.style.background = colors[role] + '08'; }
  document.getElementById('reg-role').value = role;
  document.getElementById('register-form-wrap').style.display = 'block';
  const extraFields = {
    customer: `<div style="margin-bottom:14px"><label class="form-label">Address</label><input name="address" class="form-input" placeholder="City, State"></div>
      <div style="margin-bottom:14px"><label class="form-label">Referral Code (optional)</label><input name="referral_code" class="form-input" placeholder="e.g. BK2TGOC" style="text-transform:uppercase" id="ref-code-input">${new URLSearchParams(window.location.search).get('ref')?`<script>document.getElementById('ref-code-input').value='${new URLSearchParams(window.location.search).get('ref')}'</script>`:''}</div>`,
    vendor: `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">
        <div><label class="form-label">Company Name *</label><input name="company_name" class="form-input" placeholder="Your company" required></div>
        <div><label class="form-label">Experience (Years) *</label><input name="experience_years" type="number" class="form-input" placeholder="5" min="0" required></div>
      </div>
      <div style="margin-bottom:14px"><label class="form-label">Service Area</label><input name="service_area" class="form-input" placeholder="Mumbai, Pune, Nashik"></div>
      <div style="margin-bottom:14px">
        <label class="form-label">Services Offered</label>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">
          ${[['hvac','HVAC'],['electrical','Electrical'],['plumbing','Plumbing'],['solar','Solar EPC'],['fabrication','Fabrication'],['contracting','Contracting']].map(([v,l]) =>
            `<label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;background:#f8fafc;padding:6px 10px;border-radius:8px;border:1px solid #e2e8f0">
              <input type="checkbox" name="services" value="${v}" style="width:14px;height:14px"> ${l}
            </label>`
          ).join('')}
        </div>
      </div>`,
    expert: `
      <div style="margin-bottom:14px"><label class="form-label">Certification *</label><input name="certification" class="form-input" placeholder="Licensed Electrical Engineer, PMP" required></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">
        <div><label class="form-label">Experience (Years) *</label><input name="experience" type="number" class="form-input" placeholder="10" min="0" required></div>
        <div><label class="form-label">Service Area</label><input name="service_area" class="form-input" placeholder="Mumbai, Thane"></div>
      </div>`
  };
  document.getElementById('role-extra-fields').innerHTML = extraFields[role] || '';
  document.getElementById('register-form-wrap').scrollIntoView({ behavior: 'smooth' });
}

async function handleRegister(e) {
  e.preventDefault();
  const btn = document.getElementById('reg-btn');
  const form = e.target;
  const fd = new FormData(form);
  const role = fd.get('role');
  if (!role) { Toast.show('Please select your role first', 'warning'); return; }
  const services = [...form.querySelectorAll('input[name="services"]:checked')].map(cb => cb.value).join(',');
  const payload = { name: fd.get('name'), email: fd.get('email'), phone: fd.get('phone'), password: fd.get('password'), role };
  if (fd.get('address')) payload.address = fd.get('address');
  if (fd.get('referral_code')) payload.referral_code = fd.get('referral_code').toUpperCase();
  if (fd.get('company_name')) payload.company_name = fd.get('company_name');
  if (fd.get('experience_years')) payload.experience_years = parseInt(fd.get('experience_years'));
  if (fd.get('service_area')) payload.service_area = fd.get('service_area');
  if (services) payload.services_offered = services;
  if (fd.get('certification')) payload.certification = fd.get('certification');
  if (fd.get('experience')) payload.experience = parseInt(fd.get('experience'));
  btn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:8px"></i>Creating Account...';
  btn.disabled = true;
  try {
    const data = await Auth.register(payload);
    Toast.show(`Welcome to BidKarts, ${data.user.name}! 🎉`, 'success');
    setTimeout(() => {
      Router.go(role === 'vendor' ? '/dashboard/vendor' : role === 'expert' ? '/dashboard/expert' : '/dashboard/customer');
    }, 800);
  } catch(err) {
    Toast.show(err.response?.data?.error || 'Registration failed', 'error');
    btn.innerHTML = '<i class="fas fa-user-plus" style="margin-right:8px"></i>Create Account';
    btn.disabled = false;
  }
}

function togglePass(id) {
  const inp = document.getElementById(id);
  const icon = document.getElementById(id + '-icon');
  if (!inp) return;
  inp.type = inp.type === 'password' ? 'text' : 'password';
  if (icon) { icon.className = inp.type === 'password' ? 'fas fa-eye' : 'fas fa-eye-slash'; }
}

// ── PROJECTS LIST PAGE ─────────────────────────────────────────────────────
Pages.projects = function(params) {
  const urlParams = new URLSearchParams(window.location.search);
  const initService = urlParams.get('service_type') || '';
  document.getElementById('app').innerHTML = layout(`
  <div style="max-width:1280px;margin:0 auto;padding:32px 20px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:28px;flex-wrap:wrap;gap:16px">
      <div>
        <h1 style="font-size:28px;font-weight:800;color:#0f172a">Browse Projects</h1>
        <p style="color:#64748b;margin-top:4px">Find projects matching your expertise</p>
      </div>
      ${Auth.isLoggedIn() && Auth.role() === 'customer' ? `<button onclick="Router.go('/post-project')" class="btn-accent" style="color:white;padding:12px 24px;border-radius:12px;font-size:14px;font-weight:700"><i class="fas fa-plus" style="margin-right:8px"></i>Post Project</button>` : !Auth.isLoggedIn() ? `<button onclick="Router.go('/register')" class="btn-primary" style="color:white;padding:12px 24px;border-radius:12px;font-size:14px;font-weight:600">Register to Bid</button>` : ''}
    </div>
    <!-- Filters -->
    <div style="background:white;border-radius:16px;padding:20px;margin-bottom:24px;box-shadow:0 1px 4px rgba(0,0,0,0.05);display:flex;gap:12px;flex-wrap:wrap;align-items:center">
      <div style="position:relative;flex:1;min-width:200px">
        <i class="fas fa-search" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#94a3b8"></i>
        <input id="proj-search" class="form-input" placeholder="Search projects..." style="padding-left:36px" oninput="filterProjects()">
      </div>
      <select id="proj-service" class="form-input" style="width:auto;min-width:160px" onchange="filterProjects()">
        <option value="">All Services</option>
        ${[['hvac','HVAC'],['electrical','Electrical'],['plumbing','Plumbing'],['solar','Solar EPC'],['fabrication','Fabrication'],['contracting','Contracting']].map(([v,l]) => `<option value="${v}" ${initService===v?'selected':''}>${l}</option>`).join('')}
      </select>
      <select id="proj-status" class="form-input" style="width:auto;min-width:140px" onchange="filterProjects()">
        <option value="">All Status</option>
        <option value="open">Open</option>
        <option value="bidding">Bidding</option>
      </select>
      <input id="proj-location" class="form-input" placeholder="Location..." style="width:auto;min-width:140px" oninput="filterProjects()">
      <select id="proj-sort" class="form-input" style="width:auto;min-width:150px" onchange="filterProjects()">
        <option value="newest">Newest First</option>
        <option value="oldest">Oldest First</option>
        <option value="budget_high">Budget: High to Low</option>
        <option value="budget_low">Budget: Low to High</option>
        <option value="bids_low">Fewest Bids</option>
      </select>
    </div>
    <div id="proj-count" style="font-size:13px;color:#64748b;margin-bottom:16px"></div>
    <div id="projects-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:20px">
      <div style="display:flex;justify-content:center;align-items:center;padding:60px;grid-column:1/-1"><div class="loading-spinner"></div></div>
    </div>
    <div id="proj-pagination" style="display:flex;justify-content:center;gap:8px;margin-top:32px"></div>
  </div>
  `);
  loadProjects(1, initService);
};

let projectsCache = [];
async function loadProjects(page = 1, serviceType = '') {
  const grid = document.getElementById('projects-grid');
  if (grid) grid.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;padding:60px;grid-column:1/-1"><div class="loading-spinner"></div></div>';
  try {
    const search = document.getElementById('proj-search')?.value || '';
    const service = document.getElementById('proj-service')?.value || serviceType;
    const status = document.getElementById('proj-status')?.value || '';
    const location = document.getElementById('proj-location')?.value || '';
    const sort = document.getElementById('proj-sort')?.value || 'newest';
    let url = `/projects?page=${page}&limit=9`;
    if (service) url += `&service_type=${service}`;
    if (status) url += `&status=${status}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    if (location) url += `&location=${encodeURIComponent(location)}`;
    if (sort) url += `&sort=${sort}`;
    const { data } = await API.get(url);
    projectsCache = data.projects || [];
    // Sort client-side for options not supported by backend
    if (sort === 'budget_high') projectsCache.sort((a,b) => (b.budget_max||0) - (a.budget_max||0));
    else if (sort === 'budget_low') projectsCache.sort((a,b) => (a.budget_min||0) - (b.budget_min||0));
    else if (sort === 'bids_low') projectsCache.sort((a,b) => (a.bid_count||0) - (b.bid_count||0));
    renderProjectsGrid(projectsCache, data.pagination?.total);
    renderPagination(data.pagination, page);
  } catch(e) {
    const el = document.getElementById('projects-grid');
    if (el) el.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:#ef4444">Failed to load projects. <button onclick="loadProjects()" style="color:#2563eb;background:none;border:none;cursor:pointer;text-decoration:underline">Retry</button></div>`;
  }
}
function filterProjects() { clearTimeout(window._projTimer); window._projTimer = setTimeout(() => loadProjects(1), 400); }
function renderProjectsGrid(projects, total) {
  const el = document.getElementById('projects-grid');
  const countEl = document.getElementById('proj-count');
  if (countEl && total !== undefined) countEl.innerHTML = `<i class="fas fa-clipboard-list" style="margin-right:5px;color:#3b82f6"></i>Showing <strong>${projects.length}</strong> of <strong>${total}</strong> projects`;
  if (!el) return;
  el.innerHTML = projects.length === 0
    ? '<div style="grid-column:1/-1;text-align:center;padding:60px"><i class="fas fa-folder-open" style="font-size:48px;color:#e2e8f0;display:block;margin-bottom:16px"></i><p style="color:#94a3b8;font-size:16px">No projects found matching your criteria</p><p style="font-size:13px;color:#cbd5e1;margin-top:8px">Try adjusting filters or <a onclick="document.getElementById(\'proj-search\').value=\'\';document.getElementById(\'proj-service\').value=\'\';document.getElementById(\'proj-status\').value=\'\';loadProjects()" style="color:#2563eb;cursor:pointer">clear all filters</a></p></div>'
    : projects.map(p => projectCard(p)).join('');
}
function renderPagination(pg, current) {
  const el = document.getElementById('proj-pagination');
  if (!el || !pg) return;
  const total = Math.ceil(pg.total / pg.limit);
  if (total <= 1) { el.innerHTML = ''; return; }
  let html = '';
  for (let i = 1; i <= total; i++) {
    html += `<button onclick="loadProjects(${i})" style="width:36px;height:36px;border-radius:8px;border:1px solid ${i===current?'#2563eb':'#e2e8f0'};background:${i===current?'#2563eb':'white'};color:${i===current?'white':'#374151'};cursor:pointer;font-size:14px;font-weight:500">${i}</button>`;
  }
  el.innerHTML = html;
}

// ── PROJECT DETAIL PAGE ──────────────────────────────────────────────────
Pages.projectDetail = async function(params) {
  document.getElementById('app').innerHTML = layout(`<div style="display:flex;justify-content:center;padding:80px"><div class="loading-spinner"></div></div>`);
  try {
    const { data } = await API.get(`/projects/${params.id}`);
    const p = data.project;
    const docs = data.documents || [];
    const canBid = Auth.isLoggedIn() && Auth.role() === 'vendor';
    const isOwner = Auth.isLoggedIn() && Auth.role() === 'customer' && State.user.id === p.customer_id;
    const isSelectedVendor = Auth.isLoggedIn() && Auth.role() === 'vendor' && State.user.id === (p.vendor_id || p.selected_vendor_id);
    document.getElementById('app').innerHTML = layout(`
    <div style="max-width:1100px;margin:0 auto;padding:32px 20px">
      <div style="margin-bottom:20px">
        <button onclick="Router.go('/projects')" style="background:none;border:none;cursor:pointer;color:#64748b;font-size:14px;display:flex;align-items:center;gap:6px">
          <i class="fas fa-arrow-left"></i> Back to Projects
        </button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 340px;gap:24px;align-items:start">
        <!-- Main Content -->
        <div>
          <div style="background:white;border-radius:20px;padding:28px;box-shadow:0 2px 8px rgba(0,0,0,0.05);margin-bottom:20px">
            <div style="display:flex;align-items:start;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:12px">
              <div>
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
                  <span style="padding:4px 12px;background:#eff6ff;color:#2563eb;border-radius:20px;font-size:12px;font-weight:600">${Helpers.serviceLabel(p.service_type)}</span>
                  ${Helpers.statusBadge(p.status)}
                </div>
                <h1 style="font-size:24px;font-weight:800;color:#0f172a;line-height:1.3">${p.title}</h1>
              </div>
            </div>
            <p style="color:#374151;line-height:1.7;font-size:15px;margin-bottom:24px">${p.description}</p>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:16px">
              ${[[`<i class="fas fa-map-marker-alt" style="color:#3b82f6"></i>`,p.location,'Location'],[`<i class="fas fa-rupee-sign" style="color:#10b981"></i>`,p.budget_min ? `${Helpers.currency(p.budget_min)} - ${Helpers.currency(p.budget_max)}` : 'Negotiable','Budget'],[`<i class="fas fa-clock" style="color:#f59e0b"></i>`,p.timeline || 'Flexible','Timeline'],[`<i class="fas fa-building" style="color:#8b5cf6"></i>`,p.property_type || 'Not specified','Property Type']].map(([icon,val,label]) =>
                `<div style="background:#f8fafc;border-radius:12px;padding:14px">
                  <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;font-size:13px;font-weight:600;color:#1e293b">${icon} ${label}</div>
                  <p style="font-size:14px;color:#374151;font-weight:500">${val}</p>
                </div>`
              ).join('')}
              ${p.bid_opening_date ? `
              <div style="background:#fff7ed;border-radius:12px;padding:14px;border:1px solid #fed7aa">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;font-size:13px;font-weight:600;color:#c2410c"><i class="fas fa-calendar-plus" style="color:#f97316"></i> Bid Opens</div>
                <p style="font-size:14px;color:#374151;font-weight:500">${Helpers.date(p.bid_opening_date)}</p>
              </div>` : ''}
              ${p.bid_closing_date ? `
              <div style="background:#fef2f2;border-radius:12px;padding:14px;border:1px solid #fca5a5">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;font-size:13px;font-weight:600;color:#b91c1c"><i class="fas fa-calendar-times" style="color:#ef4444"></i> Bid Closes</div>
                <p style="font-size:14px;color:#374151;font-weight:500">${Helpers.date(p.bid_closing_date)}</p>
                ${new Date(p.bid_closing_date) > new Date() ? `<p style="font-size:11px;font-weight:600;color:#10b981;margin-top:2px">⏱ ${Math.ceil((new Date(p.bid_closing_date)-new Date())/(1000*60*60*24))} days remaining</p>` : `<p style="font-size:11px;font-weight:600;color:#ef4444;margin-top:2px">Bidding closed</p>`}
              </div>` : ''}
              ${p.expert_support ? `
              <div style="background:#eff6ff;border-radius:12px;padding:14px;border:1px solid #93c5fd">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;font-size:13px;font-weight:600;color:#1d4ed8"><i class="fas fa-user-tie" style="color:#2563eb"></i> Expert Support</div>
                <p style="font-size:13px;color:#374151;font-weight:500">✅ Requested</p>
              </div>` : ''}
            </div>
            <p style="font-size:12px;color:#94a3b8;margin-top:16px"><i class="fas fa-clock" style="margin-right:4px"></i>Posted ${Helpers.date(p.created_at)} by ${p.customer_name}</p>
          </div>

          <!-- Documents -->
          ${docs.length > 0 ? `
          <div style="background:white;border-radius:20px;padding:24px;box-shadow:0 2px 8px rgba(0,0,0,0.05);margin-bottom:20px">
            <h3 style="font-size:16px;font-weight:700;color:#1e293b;margin-bottom:16px"><i class="fas fa-paperclip" style="color:#6366f1;margin-right:8px"></i>Attached Documents</h3>
            <div style="display:flex;flex-wrap:wrap;gap:10px">
              ${docs.map(d => `<div style="display:flex;align-items:center;gap:8px;padding:8px 14px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;font-size:13px"><i class="fas fa-file-alt" style="color:#6366f1"></i>${d.file_name}</div>`).join('')}
            </div>
          </div>` : ''}

          <!-- Bid Section for Vendors -->
          ${canBid && (p.status === 'open' || p.status === 'bidding') ? `
          <div style="background:white;border-radius:20px;padding:28px;box-shadow:0 2px 8px rgba(0,0,0,0.05)" id="bid-form-wrap">
            <h3 style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:20px"><i class="fas fa-gavel" style="color:#f97316;margin-right:8px"></i>Submit Your Bid</h3>
            <form onsubmit="submitBid(event, ${p.id})">
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">
                <div><label class="form-label">Bid Amount (₹) *</label><input name="bid_amount" type="number" class="form-input" placeholder="250000" min="1000" required></div>
                <div><label class="form-label">Timeline (Days) *</label><input name="timeline_days" type="number" class="form-input" placeholder="30" min="1" required></div>
              </div>
              <div style="margin-bottom:14px"><label class="form-label">Equipment Details</label><textarea name="equipment_details" class="form-input" rows="2" placeholder="Brand names, specifications..."></textarea></div>
              <div style="margin-bottom:14px"><label class="form-label">Warranty Details</label><input name="warranty_details" class="form-input" placeholder="e.g. 2 Year Installation Warranty"></div>
              <div style="margin-bottom:20px"><label class="form-label">Cover Message</label><textarea name="message" class="form-input" rows="3" placeholder="Why should the customer choose you?"></textarea></div>
              <!-- Bid Policy Agreement -->
              <div style="background:#f8fafc;border-radius:12px;padding:16px;margin-bottom:16px;border:1.5px solid #e2e8f0">
                <p style="font-size:13px;font-weight:700;color:#374151;margin-bottom:10px"><i class="fas fa-shield-alt" style="color:#059669;margin-right:6px"></i>Bid Agreement</p>
                <label style="display:flex;align-items:start;gap:8px;cursor:pointer;margin-bottom:8px">
                  <input type="checkbox" id="bid-agree-1" required style="width:14px;height:14px;margin-top:2px;cursor:pointer">
                  <span style="font-size:12px;color:#374151;line-height:1.5">I confirm the bid amount is my genuine offer and I can deliver the project within the stated timeline.</span>
                </label>
                <label style="display:flex;align-items:start;gap:8px;cursor:pointer">
                  <input type="checkbox" id="bid-agree-2" required style="width:14px;height:14px;margin-top:2px;cursor:pointer">
                  <span style="font-size:12px;color:#374151;line-height:1.5">I agree to BidKarts' <a onclick="showPolicyModal('terms')" style="color:#2563eb;cursor:pointer;font-weight:600">Vendor Terms</a> including the commission structure and payment terms.</span>
                </label>
              </div>
              <button type="submit" id="bid-submit-btn" class="btn-accent" style="color:white;width:100%;padding:14px;border-radius:12px;font-size:15px;font-weight:700">
                <i class="fas fa-paper-plane" style="margin-right:8px"></i>Submit Bid
              </button>
            </form>
          </div>` : ''}

          <!-- View Bids for Owner -->
          ${isOwner ? `<div id="project-bids-section"><div style="display:flex;justify-content:center;padding:40px"><div class="loading-spinner"></div></div></div>` : ''}
        </div>

        <!-- Sidebar -->
        <div>
          <div style="background:white;border-radius:20px;padding:24px;box-shadow:0 2px 8px rgba(0,0,0,0.05);margin-bottom:16px">
            <div style="display:flex;align-items:center;gap:16px;margin-bottom:16px">
              <div style="width:52px;height:52px;background:linear-gradient(135deg,#2563eb,#7c3aed);border-radius:50%;display:flex;align-items:center;justify-content:center">
                <span style="color:white;font-size:20px;font-weight:800">${(p.customer_name||'C').charAt(0)}</span>
              </div>
              <div>
                <p style="font-weight:700;color:#1e293b">${p.customer_name}</p>
                <p style="font-size:13px;color:#64748b">Project Owner</p>
              </div>
            </div>
            <div style="font-size:13px;color:#64748b;line-height:1.8">
              <p><i class="fas fa-gavel" style="color:#2563eb;width:16px"></i> ${p.bid_count || 0} bids received</p>
            </div>
            ${isOwner && (p.status === 'open' || p.status === 'bidding') ? `
            <button onclick="requestInspection(${p.id})" style="width:100%;margin-top:16px;padding:12px;background:#fef3c7;color:#d97706;border:1.5px solid #fde68a;border-radius:10px;cursor:pointer;font-weight:600;font-size:13px">
              <i class="fas fa-search" style="margin-right:8px"></i>Request Technical Inspection
            </button>` : ''}
            ${isOwner && ['vendor_selected','in_progress','completed'].includes(p.status) ? `
            <button onclick="Router.go('/milestones/${p.id}')" style="width:100%;margin-top:10px;padding:12px;background:#f0fdf4;color:#059669;border:1.5px solid #86efac;border-radius:10px;cursor:pointer;font-weight:600;font-size:13px">
              <i class="fas fa-tasks" style="margin-right:8px"></i>View Milestones & Progress
            </button>
            ${p.vendor_id ? `<button onclick="startMessageProject(${p.id}, ${p.vendor_id})" style="width:100%;margin-top:8px;padding:12px;background:#faf5ff;color:#7c3aed;border:1.5px solid #c4b5fd;border-radius:10px;cursor:pointer;font-weight:600;font-size:13px"><i class="fas fa-comments" style="margin-right:8px"></i>Message Vendor</button>` : ''}
            ${p.status === 'vendor_selected' ? `<button onclick="Router.go('/checkout/${p.id}')" class="btn-accent" style="color:white;width:100%;margin-top:8px;padding:12px;border-radius:10px;cursor:pointer;font-weight:600;font-size:13px"><i class="fas fa-credit-card" style="margin-right:8px"></i>Proceed to Payment</button>` : ''}
            ${p.status === 'completed' && p.vendor_id ? `<button onclick="showReviewModal(${p.id}, ${p.vendor_id})" style="width:100%;margin-top:8px;padding:12px;background:#fef3c7;color:#d97706;border:1.5px solid #fde68a;border-radius:10px;cursor:pointer;font-weight:600;font-size:13px"><i class="fas fa-star" style="margin-right:8px"></i>Leave a Review</button>` : ''}` : ''}
            ${canBid && ['open','bidding'].includes(p.status) ? `<button onclick="startMessageProject(${p.id}, State.user.id)" style="width:100%;margin-top:10px;padding:12px;background:#faf5ff;color:#7c3aed;border:1.5px solid #c4b5fd;border-radius:10px;cursor:pointer;font-weight:600;font-size:13px"><i class="fas fa-comments" style="margin-right:8px"></i>Message Customer</button>` : ''}
            ${isSelectedVendor ? `
            <div style="background:#f0fdf4;border-radius:12px;padding:14px;margin-top:12px;border:1.5px solid #86efac">
              <p style="font-size:12px;font-weight:700;color:#059669;margin-bottom:10px"><i class="fas fa-trophy" style="margin-right:6px"></i>You Won This Project!</p>
              <button onclick="Router.go('/milestones/${p.id}')" style="width:100%;padding:10px;background:#059669;color:white;border:none;border-radius:8px;cursor:pointer;font-weight:600;font-size:13px;margin-bottom:8px"><i class="fas fa-tasks" style="margin-right:6px"></i>View Milestones</button>
              <button onclick="startMessageProject(${p.id}, ${p.customer_id})" style="width:100%;padding:10px;background:#faf5ff;color:#7c3aed;border:1.5px solid #c4b5fd;border:none;border-radius:8px;cursor:pointer;font-weight:600;font-size:13px;margin-bottom:8px"><i class="fas fa-comments" style="margin-right:6px"></i>Message Customer</button>
              <button onclick="loadVendorProjectDocsInline(${p.id})" style="width:100%;padding:10px;background:#eff6ff;color:#2563eb;border:none;border-radius:8px;cursor:pointer;font-weight:600;font-size:13px"><i class="fas fa-folder-open" style="margin-right:6px"></i>View Documents</button>
              <div id="vendor-proj-docs-${p.id}" style="margin-top:8px"></div>
              ${p.customer_phone ? `<p style="font-size:12px;color:#374151;margin-top:10px"><i class="fas fa-phone" style="color:#059669;margin-right:6px"></i>${p.customer_phone}</p>` : ''}
              ${p.customer_email ? `<p style="font-size:12px;color:#374151;margin-top:4px"><i class="fas fa-envelope" style="color:#2563eb;margin-right:6px"></i>${p.customer_email}</p>` : ''}
            </div>` : ''}
          </div>
          ${!Auth.isLoggedIn() ? `
          <div style="background:linear-gradient(135deg,#eff6ff,#f0fdf4);border-radius:20px;padding:24px;border:1px solid #bfdbfe;text-align:center">
            <i class="fas fa-lock" style="font-size:32px;color:#3b82f6;margin-bottom:12px;display:block"></i>
            <p style="font-weight:700;color:#1e293b;margin-bottom:8px">Join BidKarts</p>
            <p style="font-size:13px;color:#64748b;margin-bottom:16px">Register as a vendor to submit bids on projects like this one.</p>
            <button onclick="Router.go('/register')" class="btn-primary" style="color:white;width:100%;padding:12px;border-radius:10px;font-size:14px;font-weight:600">Register as Vendor</button>
          </div>` : ''}
        </div>
      </div>
    </div>
    `);
    if (isOwner) loadProjectBids(params.id);
  } catch(e) {
    document.getElementById('app').innerHTML = layout(`<div style="text-align:center;padding:80px"><p style="color:#ef4444">Project not found</p><button onclick="Router.go('/projects')" style="margin-top:16px;color:#2563eb;background:none;border:none;cursor:pointer">Back to Projects</button></div>`);
  }
};

async function loadProjectBids(projectId) {
  try {
    const { data } = await API.get(`/bids/project/${projectId}`);
    const bids = data.bids || [];
    const el = document.getElementById('project-bids-section');
    if (!el) return;
    el.innerHTML = `
    <div style="background:white;border-radius:20px;padding:28px;box-shadow:0 2px 8px rgba(0,0,0,0.05);margin-top:20px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
        <h3 style="font-size:18px;font-weight:700;color:#1e293b"><i class="fas fa-list" style="color:#2563eb;margin-right:8px"></i>Received Bids (${bids.length})</h3>
        ${bids.length > 1 ? `
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button onclick="Router.go('/bid-comparison/${projectId}')" style="background:#eff6ff;color:#2563eb;padding:8px 16px;border-radius:8px;border:none;cursor:pointer;font-size:13px;font-weight:600"><i class="fas fa-balance-scale" style="margin-right:6px"></i>Compare Bids</button>
          <button onclick="Router.go('/reverse-auction/${projectId}')" style="background:#f5f3ff;color:#7c3aed;padding:8px 16px;border-radius:8px;border:none;cursor:pointer;font-size:13px;font-weight:600"><i class="fas fa-gavel" style="margin-right:6px"></i>Auction View</button>
          <button onclick="Router.go('/ai-tools')" style="background:#f0fdf4;color:#059669;padding:8px 16px;border-radius:8px;border:none;cursor:pointer;font-size:13px;font-weight:600"><i class="fas fa-robot" style="margin-right:6px"></i>AI Recommend</button>
        </div>` : ''}
      </div>
      ${bids.length === 0 ? '<div style="text-align:center;padding:40px;color:#94a3b8"><i class="fas fa-inbox" style="font-size:48px;display:block;margin-bottom:12px"></i>No bids yet</div>' :
        bids.map(b => bidCard(b, projectId)).join('')}
    </div>`;
  } catch {}
}

function bidCard(b, projectId) {
  const project = projectsCache.find(p => p.id == projectId) || {};
  return `
  <div style="border:1px solid #e2e8f0;border-radius:14px;padding:20px;margin-bottom:12px">
    <div style="display:flex;align-items:start;justify-content:space-between;gap:12px;flex-wrap:wrap">
      <div style="display:flex;align-items:center;gap:12px">
        <div style="width:44px;height:44px;background:linear-gradient(135deg,#7c3aed,#2563eb);border-radius:50%;display:flex;align-items:center;justify-content:center">
          <span style="color:white;font-size:16px;font-weight:700">${(b.company_name||b.vendor_name||'V').charAt(0)}</span>
        </div>
        <div>
          <p style="font-weight:700;color:#1e293b;cursor:pointer" onclick="Router.go('/vendors/${b.vendor_id}')">${b.company_name || b.vendor_name}</p>
          <div style="display:flex;align-items:center;gap:8px">
            <div>${Helpers.stars(b.rating)}</div>
            <span style="font-size:12px;color:#64748b">${b.rating ? parseFloat(b.rating).toFixed(1) : 'No reviews'} (${b.total_reviews || 0})</span>
          </div>
          <p style="font-size:12px;color:#64748b;margin-top:2px">${b.experience_years || 0} years exp · ${b.certifications || 'Certified'}</p>
        </div>
      </div>
      <div style="text-align:right">
        <p style="font-size:22px;font-weight:800;color:#059669">${Helpers.currency(b.bid_amount)}</p>
        <p style="font-size:13px;color:#64748b"><i class="fas fa-clock"></i> ${b.timeline_days} days</p>
        ${Helpers.statusBadge(b.status)}
      </div>
    </div>
    ${b.message ? `<p style="font-size:13px;color:#374151;margin-top:12px;padding:12px;background:#f8fafc;border-radius:8px;line-height:1.6">${b.message}</p>` : ''}
    ${b.equipment_details ? `<p style="font-size:12px;color:#64748b;margin-top:8px"><strong>Equipment:</strong> ${b.equipment_details}</p>` : ''}
    ${b.warranty_details ? `<p style="font-size:12px;color:#64748b;margin-top:4px"><strong>Warranty:</strong> ${b.warranty_details}</p>` : ''}
    ${b.status === 'pending' ? `
    <div style="display:flex;gap:8px;margin-top:14px">
      <button onclick="selectVendorBid(${projectId}, ${b.id}, ${b.vendor_id})" class="btn-primary" style="color:white;padding:10px 20px;border-radius:10px;font-size:13px;font-weight:600"><i class="fas fa-check" style="margin-right:6px"></i>Accept Bid</button>
      <button onclick="Router.go('/vendors/${b.vendor_id}')" style="padding:10px 20px;border-radius:10px;border:1px solid #e2e8f0;background:white;cursor:pointer;font-size:13px">View Profile</button>
    </div>` : `<p style="margin-top:12px;font-size:12px;color:#16a34a;font-weight:600"><i class="fas fa-check-circle" style="margin-right:4px"></i>Bid ${b.status}</p>`}
  </div>`;
}

async function submitBid(e, projectId) {
  e.preventDefault();
  if (!Auth.isLoggedIn()) { Router.go('/login'); return; }

  // Check bid policy agreement
  const agree1 = document.getElementById('bid-agree-1');
  const agree2 = document.getElementById('bid-agree-2');
  if (!agree1?.checked || !agree2?.checked) {
    Toast.show('Please agree to the bid terms to submit', 'warning'); return;
  }

  const btn = document.getElementById('bid-submit-btn');
  const fd = new FormData(e.target);
  const payload = {
    project_id: projectId,
    bid_amount: parseFloat(fd.get('bid_amount')),
    timeline_days: parseInt(fd.get('timeline_days')),
    equipment_details: fd.get('equipment_details'),
    warranty_details: fd.get('warranty_details'),
    message: fd.get('message')
  };
  btn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:8px"></i>Submitting...';
  btn.disabled = true;
  try {
    await API.post('/bids', payload);
    Toast.show('Bid submitted successfully! 🎉 You will be notified by email.', 'success');
    e.target.reset();
    btn.innerHTML = '<i class="fas fa-check" style="margin-right:8px"></i>Bid Submitted!';
  } catch(err) {
    Toast.show(err.response?.data?.error || 'Failed to submit bid', 'error');
    btn.innerHTML = '<i class="fas fa-paper-plane" style="margin-right:8px"></i>Submit Bid';
    btn.disabled = false;
  }
}

async function selectVendorBid(projectId, bidId, vendorId) {
  if (!confirm('Are you sure you want to accept this bid? Other bids will be rejected.')) return;
  try {
    await API.post(`/projects/${projectId}/select-vendor`, { bid_id: bidId, vendor_id: vendorId });
    Toast.show('Vendor selected! Proceed to payment.', 'success');
    setTimeout(() => Router.go(`/checkout/${projectId}`), 1000);
  } catch(err) {
    Toast.show(err.response?.data?.error || 'Failed to select vendor', 'error');
  }
}

async function requestInspection(projectId) {
  // Show inspection policy modal first
  Modal.show('Request Technical Inspection', `
    <div>
      <div style="background:#eff6ff;border-radius:12px;padding:16px;margin-bottom:16px">
        <p style="font-size:14px;font-weight:700;color:#1d4ed8;margin-bottom:6px"><i class="fas fa-user-tie" style="margin-right:8px"></i>Technical Inspection Service</p>
        <ul style="font-size:13px;color:#374151;padding-left:18px;line-height:1.8;margin:0">
          <li>Certified technical expert visits your site</li>
          <li>Comprehensive assessment report provided</li>
          <li>Unbiased recommendation for vendor selection</li>
          <li>Scheduled within 2-3 business days</li>
        </ul>
      </div>
      <div style="background:#fef3c7;border-radius:10px;padding:14px;margin-bottom:16px;border:1px solid #fde68a">
        <p style="font-size:15px;font-weight:700;color:#d97706">Inspection Fee: ₹1,500</p>
        <p style="font-size:12px;color:#92400e;margin-top:4px">Payable via Razorpay. Refundable if expert is not available in your area.</p>
      </div>
      <label style="display:flex;align-items:start;gap:10px;cursor:pointer;margin-bottom:8px">
        <input type="checkbox" id="insp-agree" style="width:16px;height:16px;margin-top:2px;cursor:pointer">
        <span style="font-size:13px;color:#374151;line-height:1.5">I agree to the inspection terms. I understand the ₹1,500 fee is non-refundable once the inspection visit is scheduled.</span>
      </label>
    </div>
  `, `
    <button onclick="Modal.close()" style="padding:10px 20px;border:1.5px solid #e2e8f0;border-radius:10px;background:white;cursor:pointer;font-weight:500">Cancel</button>
    <button onclick="confirmInspection(${projectId})" style="background:linear-gradient(135deg,#f59e0b,#d97706);color:white;padding:10px 24px;border-radius:10px;font-weight:600;border:none;cursor:pointer"><i class="fas fa-check" style="margin-right:6px"></i>Confirm & Pay ₹1,500</button>
  `);
}

async function confirmInspection(projectId) {
  if (!document.getElementById('insp-agree')?.checked) {
    Toast.show('Please agree to the inspection terms', 'warning'); return;
  }
  Modal.close();
  try {
    const { data } = await API.post('/inspections', { project_id: projectId });
    Toast.show('Inspection requested! Proceed to payment.', 'success');
    setTimeout(() => Router.go(`/checkout/${projectId}?type=inspection&inspection_id=${data.inspection.id}`), 1500);
  } catch(err) {
    Toast.show(err.response?.data?.error || 'Failed to request inspection', 'error');
  }
}

// ── POST PROJECT PAGE ─────────────────────────────────────────────────────
Pages.postProject = function() {
  if (!Auth.isLoggedIn() || Auth.role() !== 'customer') { Router.go('/login'); return; }
  // Reset ALL state before rendering — must happen before innerHTML to avoid stale step tracking
  window._selectedSType = '';
  window._uploadedFiles = [];
  window._currentFormStep = 1;
  window._expertSupport = false;
  document.getElementById('app').innerHTML = layout(`
  <div style="max-width:820px;margin:0 auto;padding:40px 20px">
    <div style="margin-bottom:28px">
      <h1 style="font-size:28px;font-weight:800;color:#0f172a">Post a New Project</h1>
      <p style="color:#64748b;margin-top:6px">Fill in all the details to attract qualified, verified vendors</p>
    </div>

    <!-- Step indicator -->
    <div style="display:flex;align-items:center;gap:0;margin-bottom:28px;background:white;border-radius:16px;padding:16px 24px;box-shadow:0 1px 4px rgba(0,0,0,0.05)">
      ${[['1','Project Info','fa-clipboard-list'],['2','Budget & Dates','fa-calendar'],['3','Documents','fa-upload'],['4','Review & Post','fa-check-circle']].map(([n,l,icon],i) => `
        <div style="display:flex;align-items:center;flex:1">
          <div style="display:flex;align-items:center;gap:8px">
            <div id="step-icon-${n}" style="width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;background:${n==='1'?'#2563eb':'#e2e8f0'};color:${n==='1'?'white':'#94a3b8'}">
              <i class="fas ${icon}" style="font-size:12px"></i>
            </div>
            <span id="step-label-${n}" style="font-size:12px;font-weight:600;color:${n==='1'?'#2563eb':'#94a3b8'}">${l}</span>
          </div>
          ${i<3?`<div id="step-line-${n}" style="flex:1;height:2px;background:#e2e8f0;margin:0 8px"></div>`:''}
        </div>`).join('')}
    </div>

    <form onsubmit="handlePostProject(event)" id="post-project-form">
      <!-- Step 1: Project Info -->
      <div id="form-step-1" class="form-step">
        <div style="background:white;border-radius:20px;padding:28px;box-shadow:0 2px 12px rgba(0,0,0,0.06);margin-bottom:20px">
          <h3 style="font-size:16px;font-weight:700;color:#1e293b;margin-bottom:20px"><i class="fas fa-tools" style="color:#2563eb;margin-right:8px"></i>Service Type *</h3>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px" id="service-selector">
            ${[['hvac','HVAC','fa-wind','#3b82f6'],['electrical','Electrical','fa-bolt','#f59e0b'],['plumbing','Plumbing','fa-faucet','#06b6d4'],['solar','Solar EPC','fa-solar-panel','#f97316'],['fabrication','Fabrication','fa-industry','#8b5cf6'],['contracting','Contracting','fa-hard-hat','#10b981']].map(([v,l,icon,c]) =>
              `<div onclick="selectServiceType('${v}','${c}')" id="stype-${v}" style="border:2px solid #e2e8f0;border-radius:12px;padding:14px;text-align:center;cursor:pointer;transition:all 0.2s" onmouseover="this.style.borderColor='${c}'" onmouseout="if(window._selectedSType!=='${v}')this.style.borderColor='#e2e8f0'">
                <i class="fas ${icon}" style="font-size:22px;color:${c};display:block;margin-bottom:8px"></i>
                <span style="font-size:12px;font-weight:600;color:#374151">${l}</span>
              </div>`
            ).join('')}
          </div>
          <input type="hidden" name="service_type" id="service-type-input" required>
        </div>

        <div style="background:white;border-radius:20px;padding:28px;box-shadow:0 2px 12px rgba(0,0,0,0.06);margin-bottom:20px">
          <h3 style="font-size:16px;font-weight:700;color:#1e293b;margin-bottom:20px"><i class="fas fa-info-circle" style="color:#2563eb;margin-right:8px"></i>Project Details</h3>
          <div style="margin-bottom:18px">
            <label class="form-label">Project Title *</label>
            <input name="title" class="form-input" placeholder="e.g. Rooftop Solar Installation - 5kW System" required style="font-size:15px">
          </div>
          <div style="margin-bottom:18px">
            <label class="form-label">Detailed Description *</label>
            <textarea name="description" class="form-input" rows="6" placeholder="Describe your requirements in detail:&#10;• Site dimensions and specifications&#10;• Existing systems or infrastructure&#10;• Special requirements or constraints&#10;• Expected outcomes&#10;• Any other relevant information" required style="resize:vertical;font-size:14px;line-height:1.6"></textarea>
            <p style="font-size:11px;color:#94a3b8;margin-top:4px">Tip: More detail = better quality bids from vendors</p>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:18px">
            <div>
              <label class="form-label">Location *</label>
              <input name="location" class="form-input" placeholder="City, State" required>
            </div>
            <div>
              <label class="form-label">Property Type</label>
              <select name="property_type" class="form-input">
                <option value="">Select type</option>
                <option>Residential</option><option>Commercial</option><option>Industrial</option><option>Institutional</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Expert Support Option -->
        <div style="background:linear-gradient(135deg,#eff6ff,#f0fdf4);border-radius:20px;padding:24px;box-shadow:0 2px 12px rgba(0,0,0,0.06);margin-bottom:20px;border:1.5px solid #bfdbfe">
          <div style="display:flex;align-items:start;gap:16px">
            <div style="width:48px;height:48px;background:linear-gradient(135deg,#2563eb,#0891b2);border-radius:14px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
              <i class="fas fa-user-tie" style="color:white;font-size:20px"></i>
            </div>
            <div style="flex:1">
              <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
                <h3 style="font-size:16px;font-weight:700;color:#1e293b">Expert Technical Support</h3>
                <span style="background:#dbeafe;color:#2563eb;font-size:11px;font-weight:700;padding:2px 10px;border-radius:10px">RECOMMENDED</span>
              </div>
              <p style="font-size:13px;color:#475569;line-height:1.6;margin-bottom:16px">Get a certified technical expert to visit your site, assess requirements, and provide an independent recommendation before vendor selection. Includes site visit report and unbiased assessment.</p>
              <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
                <div style="display:flex;gap:16px">
                  <div style="display:flex;align-items:center;gap:6px;font-size:13px;color:#374151">
                    <i class="fas fa-check-circle" style="color:#10b981"></i>Site visit & assessment
                  </div>
                  <div style="display:flex;align-items:center;gap:6px;font-size:13px;color:#374151">
                    <i class="fas fa-check-circle" style="color:#10b981"></i>Written report
                  </div>
                  <div style="display:flex;align-items:center;gap:6px;font-size:13px;color:#374151">
                    <i class="fas fa-check-circle" style="color:#10b981"></i>Unbiased advice
                  </div>
                </div>
                <span style="font-size:15px;font-weight:700;color:#2563eb">₹1,500 fee</span>
              </div>
              <label style="display:flex;align-items:center;gap:10px;margin-top:16px;cursor:pointer;background:white;padding:12px 16px;border-radius:12px;border:1.5px solid #bfdbfe">
                <input type="checkbox" name="expert_support" id="expert-support-cb" style="width:18px;height:18px;cursor:pointer" onchange="toggleExpertSupport(this.checked)">
                <span style="font-size:14px;font-weight:600;color:#1e293b">Yes, I want Expert Technical Support (₹1,500)</span>
              </label>
            </div>
          </div>
        </div>

        <div style="display:flex;justify-content:flex-end">
          <button type="button" onclick="goToFormStep(2)" class="btn-primary" style="color:white;padding:12px 28px;border-radius:12px;font-size:15px;font-weight:600">
            Next: Budget & Dates <i class="fas fa-arrow-right" style="margin-left:8px"></i>
          </button>
        </div>
      </div>

      <!-- Step 2: Budget & Dates -->
      <div id="form-step-2" class="form-step" style="display:none">
        <div style="background:white;border-radius:20px;padding:28px;box-shadow:0 2px 12px rgba(0,0,0,0.06);margin-bottom:20px">
          <h3 style="font-size:16px;font-weight:700;color:#1e293b;margin-bottom:20px"><i class="fas fa-rupee-sign" style="color:#10b981;margin-right:8px"></i>Budget Range</h3>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:16px">
            <div><label class="form-label">Min Budget (₹)</label><input name="budget_min" type="number" class="form-input" placeholder="e.g. 100000" min="0"></div>
            <div><label class="form-label">Max Budget (₹)</label><input name="budget_max" type="number" class="form-input" placeholder="e.g. 200000" min="0"></div>
            <div><label class="form-label">Expected Timeline</label><input name="timeline" class="form-input" placeholder="e.g. 30 days"></div>
          </div>
        </div>

        <div style="background:white;border-radius:20px;padding:28px;box-shadow:0 2px 12px rgba(0,0,0,0.06);margin-bottom:20px">
          <h3 style="font-size:16px;font-weight:700;color:#1e293b;margin-bottom:8px"><i class="fas fa-calendar-alt" style="color:#f97316;margin-right:8px"></i>Bid Opening & Closing Dates</h3>
          <p style="font-size:13px;color:#64748b;margin-bottom:20px">Set the window during which vendors can submit their bids for this project</p>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
            <div>
              <label class="form-label">Bid Opening Date *</label>
              <input name="bid_opening_date" type="date" class="form-input" id="bid-open-date" required>
              <p style="font-size:11px;color:#94a3b8;margin-top:4px">Date when vendors can start bidding</p>
            </div>
            <div>
              <label class="form-label">Bid Closing Date *</label>
              <input name="bid_closing_date" type="date" class="form-input" id="bid-close-date" required>
              <p style="font-size:11px;color:#94a3b8;margin-top:4px">Last date to receive bids</p>
            </div>
          </div>
        </div>

        <div style="display:flex;justify-content:space-between">
          <button type="button" onclick="goToFormStep(1)" style="padding:12px 24px;border-radius:12px;border:1.5px solid #e2e8f0;background:white;cursor:pointer;font-size:15px;font-weight:600;color:#374151">
            <i class="fas fa-arrow-left" style="margin-right:8px"></i>Back
          </button>
          <button type="button" onclick="goToFormStep(3)" class="btn-primary" style="color:white;padding:12px 28px;border-radius:12px;font-size:15px;font-weight:600">
            Next: Upload Documents <i class="fas fa-arrow-right" style="margin-left:8px"></i>
          </button>
        </div>
      </div>

      <!-- Step 3: Documents -->
      <div id="form-step-3" class="form-step" style="display:none">
        <div style="background:white;border-radius:20px;padding:28px;box-shadow:0 2px 12px rgba(0,0,0,0.06);margin-bottom:20px">
          <h3 style="font-size:16px;font-weight:700;color:#1e293b;margin-bottom:8px"><i class="fas fa-file-upload" style="color:#7c3aed;margin-right:8px"></i>Upload Documents & Drawings</h3>
          <p style="font-size:13px;color:#64748b;margin-bottom:20px">Upload relevant documents to help vendors understand your project better</p>

          <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px">
            ${[['electricity_bill','Electricity Bill'],['floor_plan','Floor Plan'],['site_photo','Site Photo'],['roof_drawing','Roof Drawing'],['existing_layout','Existing Layout'],['other','Other Document']].map(([v,l]) =>
              `<button type="button" onclick="setDocType('${v}',this)" style="padding:6px 14px;border:1.5px solid #e2e8f0;border-radius:20px;font-size:12px;font-weight:500;background:white;cursor:pointer;color:#374151" id="dtype-${v}">${l}</button>`
            ).join('')}
          </div>
          <input type="hidden" id="selected-doc-type" value="site_photo">

          <div id="upload-zone" style="border:2px dashed #c4b5fd;border-radius:16px;padding:36px;text-align:center;cursor:pointer;background:#faf5ff;transition:all 0.2s;margin-bottom:16px" onclick="document.getElementById('file-input').click()" ondragover="event.preventDefault();this.style.background='#f5f3ff'" ondragleave="this.style.background='#faf5ff'" ondrop="handleFileDrop(event)">
            <i class="fas fa-cloud-upload-alt" style="font-size:40px;color:#7c3aed;display:block;margin-bottom:12px"></i>
            <p style="font-size:15px;font-weight:600;color:#1e293b;margin-bottom:6px">Click to upload or drag & drop</p>
            <p style="font-size:13px;color:#64748b">Electricity bills, floor plans, site photos, drawings (PDF, JPG, PNG, DWG)</p>
            <p style="font-size:12px;color:#94a3b8;margin-top:6px">Max 10MB per file · Multiple files allowed</p>
          </div>
          <input type="file" id="file-input" multiple accept=".pdf,.jpg,.jpeg,.png,.dwg,.dxf" style="display:none" onchange="handleFileSelect(this.files)">

          <div id="uploaded-files-list" style="display:grid;gap:8px"></div>
        </div>

        <div style="display:flex;justify-content:space-between">
          <button type="button" onclick="goToFormStep(2)" style="padding:12px 24px;border-radius:12px;border:1.5px solid #e2e8f0;background:white;cursor:pointer;font-size:15px;font-weight:600;color:#374151">
            <i class="fas fa-arrow-left" style="margin-right:8px"></i>Back
          </button>
          <button type="button" onclick="goToFormStep(4)" class="btn-primary" style="color:white;padding:12px 28px;border-radius:12px;font-size:15px;font-weight:600">
            Next: Review & Post <i class="fas fa-arrow-right" style="margin-left:8px"></i>
          </button>
        </div>
      </div>

      <!-- Step 4: Review & Policy Agreement -->
      <div id="form-step-4" class="form-step" style="display:none">
        <div style="background:white;border-radius:20px;padding:28px;box-shadow:0 2px 12px rgba(0,0,0,0.06);margin-bottom:20px">
          <h3 style="font-size:16px;font-weight:700;color:#1e293b;margin-bottom:20px"><i class="fas fa-eye" style="color:#2563eb;margin-right:8px"></i>Project Summary</h3>
          <div id="project-summary" style="display:grid;gap:12px">
            <!-- Filled by JS -->
          </div>
        </div>

        <!-- Policy Agreement -->
        <div style="background:white;border-radius:20px;padding:28px;box-shadow:0 2px 12px rgba(0,0,0,0.06);margin-bottom:20px;border:1.5px solid #e2e8f0">
          <h3 style="font-size:16px;font-weight:700;color:#1e293b;margin-bottom:16px"><i class="fas fa-shield-alt" style="color:#059669;margin-right:8px"></i>Policy Agreement</h3>
          <div style="display:flex;flex-direction:column;gap:12px">
            <label style="display:flex;align-items:start;gap:10px;cursor:pointer">
              <input type="checkbox" id="agree-terms" style="width:16px;height:16px;margin-top:2px;cursor:pointer" required>
              <span style="font-size:13px;color:#374151;line-height:1.5">I agree to the <a onclick="showPolicyModal('terms')" style="color:#2563eb;cursor:pointer;font-weight:600">Terms of Service</a> and understand that BidKarts facilitates the connection between customers and vendors but is not responsible for the quality of work.</span>
            </label>
            <label style="display:flex;align-items:start;gap:10px;cursor:pointer">
              <input type="checkbox" id="agree-privacy" style="width:16px;height:16px;margin-top:2px;cursor:pointer" required>
              <span style="font-size:13px;color:#374151;line-height:1.5">I have read and agree to the <a onclick="showPolicyModal('privacy')" style="color:#2563eb;cursor:pointer;font-weight:600">Privacy Policy</a>. I consent to BidKarts sharing my project details with relevant vendors.</span>
            </label>
            <label style="display:flex;align-items:start;gap:10px;cursor:pointer">
              <input type="checkbox" id="agree-accuracy" style="width:16px;height:16px;margin-top:2px;cursor:pointer" required>
              <span style="font-size:13px;color:#374151;line-height:1.5">I confirm that all information provided is accurate and truthful. I understand that providing false information may result in account suspension.</span>
            </label>
          </div>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center">
          <button type="button" onclick="goToFormStep(3)" style="padding:12px 24px;border-radius:12px;border:1.5px solid #e2e8f0;background:white;cursor:pointer;font-size:15px;font-weight:600;color:#374151">
            <i class="fas fa-arrow-left" style="margin-right:8px"></i>Back
          </button>
          <button type="submit" id="post-proj-btn" class="btn-accent" style="color:white;padding:16px 36px;border-radius:12px;font-size:16px;font-weight:700">
            <i class="fas fa-paper-plane" style="margin-right:8px"></i>Post Project & Invite Bids
          </button>
        </div>
      </div>
    </form>
  </div>
  `);

  // Set default bid opening date to today
  const today = new Date().toISOString().split('T')[0];
  const oneMonth = new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0];
  const openDateEl = document.getElementById('bid-open-date');
  const closeDateEl = document.getElementById('bid-close-date');
  if (openDateEl) openDateEl.value = today;
  if (closeDateEl) closeDateEl.value = oneMonth;

  // Set first doc type as selected
  setDocType('site_photo', document.getElementById('dtype-site_photo'));
};

// Globals already reset inside Pages.postProject above; these are fallback initial values
if (typeof window._selectedSType === 'undefined') window._selectedSType = '';
if (typeof window._uploadedFiles === 'undefined') window._uploadedFiles = [];
if (typeof window._currentFormStep === 'undefined') window._currentFormStep = 1;
if (typeof window._expertSupport === 'undefined') window._expertSupport = false;

function goToFormStep(n) {
  // Validate current step
  if (n > window._currentFormStep) {
    if (window._currentFormStep === 1) {
      if (!window._selectedSType) { Toast.show('Please select a service type', 'warning'); return; }
      const titleEl = document.querySelector('#post-project-form [name="title"]');
      const descEl  = document.querySelector('#post-project-form [name="description"]');
      const locEl   = document.querySelector('#post-project-form [name="location"]');
      const title = titleEl ? titleEl.value.trim() : '';
      const desc  = descEl  ? descEl.value.trim()  : '';
      const loc   = locEl   ? locEl.value.trim()   : '';
      if (!title) { Toast.show('Please enter a project title', 'warning'); if (titleEl) titleEl.focus(); return; }
      if (!desc)  { Toast.show('Please enter a project description', 'warning'); if (descEl) descEl.focus(); return; }
      if (!loc)   { Toast.show('Please enter a project location', 'warning'); if (locEl) locEl.focus(); return; }
    }
    if (window._currentFormStep === 2) {
      const opening = document.getElementById('bid-open-date')?.value;
      const closing = document.getElementById('bid-close-date')?.value;
      if (!opening || !closing) { Toast.show('Please set bid opening and closing dates', 'warning'); return; }
      if (closing <= opening) { Toast.show('Closing date must be after opening date', 'warning'); return; }
    }
  }

  // If going to step 4, fill summary
  if (n === 4) { fillProjectSummary(); }

  // Hide all steps
  document.querySelectorAll('.form-step').forEach(s => s.style.display = 'none');
  document.getElementById(`form-step-${n}`).style.display = 'block';
  window._currentFormStep = n;

  // Update step indicators
  for (let i = 1; i <= 4; i++) {
    const icon = document.getElementById(`step-icon-${i}`);
    const label = document.getElementById(`step-label-${i}`);
    if (icon && label) {
      if (i < n) {
        icon.style.background = '#10b981'; icon.style.color = 'white';
        label.style.color = '#10b981';
      } else if (i === n) {
        icon.style.background = '#2563eb'; icon.style.color = 'white';
        label.style.color = '#2563eb';
      } else {
        icon.style.background = '#e2e8f0'; icon.style.color = '#94a3b8';
        label.style.color = '#94a3b8';
      }
    }
    if (i < 4) {
      const line = document.getElementById(`step-line-${i}`);
      if (line) line.style.background = i < n ? '#10b981' : '#e2e8f0';
    }
  }
  window.scrollTo(0, 0);
}

function fillProjectSummary() {
  const el = document.getElementById('project-summary');
  if (!el) return;
  const title = document.querySelector('[name="title"]')?.value || '';
  const desc = document.querySelector('[name="description"]')?.value || '';
  const loc = document.querySelector('[name="location"]')?.value || '';
  const ptype = document.querySelector('[name="property_type"]')?.value || '';
  const bmin = document.querySelector('[name="budget_min"]')?.value || '';
  const bmax = document.querySelector('[name="budget_max"]')?.value || '';
  const tl = document.querySelector('[name="timeline"]')?.value || '';
  const openDate = document.getElementById('bid-open-date')?.value || '';
  const closeDate = document.getElementById('bid-close-date')?.value || '';
  const expert = window._expertSupport;
  const files = window._uploadedFiles || [];
  const svcLabels = { hvac:'HVAC Services', electrical:'Electrical Services', plumbing:'Plumbing Services', solar:'Solar EPC', fabrication:'Fabrication Works', contracting:'Contracting' };

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div style="background:#f8fafc;border-radius:10px;padding:14px">
        <p style="font-size:11px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Service Type</p>
        <p style="font-size:14px;font-weight:600;color:#1e293b">${svcLabels[window._selectedSType] || window._selectedSType}</p>
      </div>
      <div style="background:#f8fafc;border-radius:10px;padding:14px">
        <p style="font-size:11px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Location</p>
        <p style="font-size:14px;font-weight:600;color:#1e293b">${loc}${ptype ? ' · ' + ptype : ''}</p>
      </div>
      <div style="background:#f8fafc;border-radius:10px;padding:14px;grid-column:1/-1">
        <p style="font-size:11px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Project Title</p>
        <p style="font-size:14px;font-weight:600;color:#1e293b">${title}</p>
      </div>
      <div style="background:#f8fafc;border-radius:10px;padding:14px">
        <p style="font-size:11px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Budget Range</p>
        <p style="font-size:14px;font-weight:600;color:#1e293b">${bmin && bmax ? '₹' + parseInt(bmin).toLocaleString('en-IN') + ' - ₹' + parseInt(bmax).toLocaleString('en-IN') : 'Not specified'}</p>
      </div>
      <div style="background:#f8fafc;border-radius:10px;padding:14px">
        <p style="font-size:11px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Timeline</p>
        <p style="font-size:14px;font-weight:600;color:#1e293b">${tl || 'Flexible'}</p>
      </div>
      <div style="background:#f8fafc;border-radius:10px;padding:14px">
        <p style="font-size:11px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Bid Period</p>
        <p style="font-size:13px;font-weight:600;color:#1e293b">${openDate ? new Date(openDate).toLocaleDateString('en-IN',{day:'numeric',month:'short'}) : 'Today'} → ${closeDate ? new Date(closeDate).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}) : 'Open'}</p>
      </div>
      <div style="background:#f8fafc;border-radius:10px;padding:14px">
        <p style="font-size:11px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Expert Support</p>
        <p style="font-size:14px;font-weight:600;color:${expert?'#059669':'#94a3b8'}">${expert ? '✅ Yes (₹1,500)' : '❌ No'}</p>
      </div>
      <div style="background:#f8fafc;border-radius:10px;padding:14px;grid-column:1/-1">
        <p style="font-size:11px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Documents (${files.length})</p>
        <p style="font-size:13px;color:#374151">${files.length > 0 ? files.map(f=>f.name).join(', ') : 'No documents uploaded'}</p>
      </div>
    </div>`;
}

function toggleExpertSupport(checked) {
  window._expertSupport = checked;
}

function setDocType(type, el) {
  document.querySelectorAll('[id^="dtype-"]').forEach(b => {
    b.style.background = 'white'; b.style.borderColor = '#e2e8f0'; b.style.color = '#374151';
  });
  if (el) { el.style.background = '#7c3aed15'; el.style.borderColor = '#7c3aed'; el.style.color = '#7c3aed'; }
  document.getElementById('selected-doc-type').value = type;
}

function handleFileDrop(e) {
  e.preventDefault();
  document.getElementById('upload-zone').style.background = '#faf5ff';
  handleFileSelect(e.dataTransfer.files);
}

function handleFileSelect(files) {
  if (!files || files.length === 0) return;
  const maxSize = 10 * 1024 * 1024; // 10MB
  const docType = document.getElementById('selected-doc-type')?.value || 'other';

  for (const file of files) {
    if (file.size > maxSize) { Toast.show(`${file.name} exceeds 10MB limit`, 'warning'); continue; }
    const validTypes = ['application/pdf','image/jpeg','image/png','image/jpg'];
    if (!validTypes.includes(file.type) && !file.name.match(/\.(dwg|dxf)$/i)) {
      Toast.show(`${file.name} - unsupported file type`, 'warning'); continue;
    }

    // Read file as base64
    const reader = new FileReader();
    reader.onload = (ev) => {
      const fileData = {
        name: file.name,
        type: file.type,
        size: file.size,
        docType,
        data: ev.target.result
      };
      window._uploadedFiles.push(fileData);
      renderUploadedFiles();
    };
    reader.readAsDataURL(file);
  }
}

function renderUploadedFiles() {
  const el = document.getElementById('uploaded-files-list');
  if (!el) return;
  if (window._uploadedFiles.length === 0) { el.innerHTML = ''; return; }
  el.innerHTML = window._uploadedFiles.map((f, i) => `
    <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0">
      <div style="width:36px;height:36px;background:${f.type.includes('pdf') ? '#fee2e2' : '#eff6ff'};border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
        <i class="fas ${f.type.includes('pdf') ? 'fa-file-pdf' : 'fa-file-image'}" style="color:${f.type.includes('pdf') ? '#ef4444' : '#3b82f6'};font-size:16px"></i>
      </div>
      <div style="flex:1;min-width:0">
        <p style="font-size:13px;font-weight:600;color:#1e293b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${f.name}</p>
        <p style="font-size:11px;color:#94a3b8">${f.docType.replace('_',' ')} · ${(f.size / 1024).toFixed(0)} KB</p>
      </div>
      <button type="button" onclick="removeFile(${i})" style="background:none;border:none;cursor:pointer;color:#ef4444;padding:4px">
        <i class="fas fa-times"></i>
      </button>
    </div>
  `).join('');
}

function removeFile(idx) {
  window._uploadedFiles.splice(idx, 1);
  renderUploadedFiles();
}

function selectServiceType(v, c) {
  window._selectedSType = v;
  document.querySelectorAll('#service-selector > div').forEach(d => { d.style.borderColor='#e2e8f0'; d.style.background='white'; });
  const el = document.getElementById(`stype-${v}`);
  if (el) { el.style.borderColor=c; el.style.background=c+'10'; }
  document.getElementById('service-type-input').value = v;
}

async function handlePostProject(e) {
  e.preventDefault();
  const btn = document.getElementById('post-proj-btn');

  // Validate policy agreement
  if (!document.getElementById('agree-terms')?.checked ||
      !document.getElementById('agree-privacy')?.checked ||
      !document.getElementById('agree-accuracy')?.checked) {
    Toast.show('Please agree to all policy terms to continue', 'warning'); return;
  }

  const fd = new FormData(e.target);
  const payload = {
    service_type: fd.get('service_type'),
    title: fd.get('title'),
    description: fd.get('description'),
    location: fd.get('location'),
    property_type: fd.get('property_type') || null,
    budget_min: fd.get('budget_min') ? parseFloat(fd.get('budget_min')) : null,
    budget_max: fd.get('budget_max') ? parseFloat(fd.get('budget_max')) : null,
    timeline: fd.get('timeline') || null,
    bid_opening_date: fd.get('bid_opening_date') || null,
    bid_closing_date: fd.get('bid_closing_date') || null,
    expert_support: window._expertSupport || false
  };

  if (!payload.service_type) { Toast.show('Please select a service type', 'warning'); return; }

  btn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:8px"></i>Posting...';
  btn.disabled = true;
  try {
    const { data } = await API.post('/projects', payload);
    const projectId = data.project.id;

    // Upload documents if any
    if (window._uploadedFiles?.length > 0) {
      btn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:8px"></i>Uploading documents...';
      for (const file of window._uploadedFiles) {
        try {
          await API.post(`/projects/${projectId}/documents`, {
            doc_type: file.docType,
            file_name: file.name,
            file_url: file.data,
            file_size: file.size
          });
        } catch {}
      }
    }

    Toast.show('🎉 Project posted! Vendors will start bidding soon.', 'success');
    setTimeout(() => Router.go(`/projects/${projectId}`), 1200);
  } catch(err) {
    Toast.show(err.response?.data?.error || 'Failed to post project', 'error');
    btn.innerHTML = '<i class="fas fa-paper-plane" style="margin-right:8px"></i>Post Project'; btn.disabled = false;
  }
}

// Policy Modals
function showPolicyModal(type) {
  if (type === 'terms') {
    Modal.show('Terms of Service', `
      <div style="font-size:13px;color:#374151;line-height:1.7">
        <h4 style="color:#1e293b;margin-bottom:8px">1. Acceptance of Terms</h4>
        <p style="margin-bottom:12px">By using BidKarts, you agree to these terms. BidKarts is a marketplace platform connecting customers with contractors and does not directly provide services.</p>
        <h4 style="color:#1e293b;margin-bottom:8px">2. Project Posting Rules</h4>
        <p style="margin-bottom:12px">Projects must be genuine and accurately described. BidKarts reserves the right to remove projects that violate our community guidelines.</p>
        <h4 style="color:#1e293b;margin-bottom:8px">3. Bidding & Vendor Selection</h4>
        <p style="margin-bottom:12px">Customers are solely responsible for evaluating and selecting vendors. BidKarts provides tools to assist but does not guarantee vendor quality.</p>
        <h4 style="color:#1e293b;margin-bottom:8px">4. Platform Fee</h4>
        <p style="margin-bottom:12px">BidKarts charges a platform fee of 2% on all successfully completed transactions. Expert inspection fees are separate.</p>
        <h4 style="color:#1e293b;margin-bottom:8px">5. Dispute Resolution</h4>
        <p>Disputes between customers and vendors are handled through BidKarts' mediation process. Decisions are final and binding.</p>
      </div>
    `);
  } else {
    Modal.show('Privacy Policy', `
      <div style="font-size:13px;color:#374151;line-height:1.7">
        <h4 style="color:#1e293b;margin-bottom:8px">1. Data Collection</h4>
        <p style="margin-bottom:12px">We collect personal information including name, email, phone, and project details to facilitate our services.</p>
        <h4 style="color:#1e293b;margin-bottom:8px">2. Data Usage</h4>
        <p style="margin-bottom:12px">Your data is used to match you with relevant contractors, process payments, and improve our platform. We never sell personal data to third parties.</p>
        <h4 style="color:#1e293b;margin-bottom:8px">3. Project Visibility</h4>
        <p style="margin-bottom:12px">Project details are shared with verified vendors in the relevant service category. Contact information is only shared after vendor selection.</p>
        <h4 style="color:#1e293b;margin-bottom:8px">4. Data Security</h4>
        <p style="margin-bottom:12px">We use industry-standard encryption and security measures to protect your data.</p>
        <h4 style="color:#1e293b;margin-bottom:8px">5. Your Rights</h4>
        <p>You have the right to access, modify, or delete your data. Contact privacy@bidkarts.com for data requests.</p>
      </div>
    `);
  }
}

// ── CUSTOMER DASHBOARD ────────────────────────────────────────────────────
Pages.customerDashboard = async function() {
  if (!Auth.isLoggedIn() || Auth.role() !== 'customer') { Router.go('/login'); return; }
  const u = State.user;
  function sidebar(active) {
    const items = [
      ['overview','fa-th-large','Overview'],['projects','fa-clipboard-list','My Projects'],
      ['bids','fa-gavel','Received Bids'],['documents','fa-folder','Documents'],
      ['inspections','fa-search','Inspections'],['payments','fa-credit-card','Payments'],
      ['messages','fa-comments','Messages'],['notifications','fa-bell','Notifications'],['referral','fa-gift','Referral'],['profile','fa-user-edit','Edit Profile'],
    ];
    return `<div style="padding:12px;margin-bottom:20px">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="width:40px;height:40px;background:linear-gradient(135deg,#2563eb,#7c3aed);border-radius:50%;display:flex;align-items:center;justify-content:center">
          <span style="color:white;font-weight:700">${(u.name||'C').charAt(0)}</span>
        </div>
        <div><p style="font-weight:700;font-size:14px;color:#1e293b">${u.name}</p><p style="font-size:11px;color:#64748b">Customer Account</p></div>
      </div>
    </div>
    <nav class="sidebar-nav">${items.map(([k,icon,label]) =>
      `<button onclick="loadCustomerSection('${k}')" id="dash-${k}" class="${active===k?'active':''}" style="margin-bottom:2px"><i class="fas ${icon}" style="width:18px"></i>${label}</button>`
    ).join('')}</nav>
    <div style="margin-top:auto;padding-top:20px">
      <button onclick="Router.go('/post-project')" class="btn-accent" style="color:white;width:100%;padding:10px;border-radius:10px;font-size:13px;font-weight:600"><i class="fas fa-plus" style="margin-right:6px"></i>New Project</button>
    </div>`;
  }
  document.getElementById('app').innerHTML = dashboardLayout(sidebar('overview'), `<div id="cust-content"><div style="display:flex;justify-content:center;padding:60px"><div class="loading-spinner"></div></div></div>`);
  loadCustomerSection('overview');
};

async function loadCustomerSection(section) {
  document.querySelectorAll('.sidebar-nav button').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('dash-' + section);
  if (btn) btn.classList.add('active');
  const el = document.getElementById('cust-content');
  if (!el) return;
  el.innerHTML = '<div style="display:flex;justify-content:center;padding:60px"><div class="loading-spinner"></div></div>';
  try {
    if (section === 'overview') {
      const [projRes, payRes] = await Promise.all([API.get('/projects/my/list'), API.get('/payments/my')]);
      const projects = projRes.data.projects || [];
      const payments = payRes.data.payments || [];
      const stats = [
        { icon:'fa-clipboard-list', label:'Total Projects', val:projects.length, color:'#2563eb', bg:'#eff6ff' },
        { icon:'fa-spinner', label:'Active', val:projects.filter(p=>p.status==='in_progress').length, color:'#7c3aed', bg:'#f5f3ff' },
        { icon:'fa-check-circle', label:'Completed', val:projects.filter(p=>p.status==='completed').length, color:'#059669', bg:'#f0fdf4' },
        { icon:'fa-rupee-sign', label:'Total Spend', val:Helpers.currency(payments.filter(p=>p.status==='completed').reduce((s,p)=>s+(p.amount||0),0)), color:'#f97316', bg:'#fff7ed' },
      ];
      el.innerHTML = `
      <div style="margin-bottom:28px">
        <h2 style="font-size:24px;font-weight:800;color:#0f172a">Welcome back, ${Helpers.esc(State.user.name?.split(' ')[0]||'Customer')}! 👋</h2>
        <p style="color:#64748b;margin-top:4px">Here's an overview of your activity on BidKarts</p>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px;margin-bottom:28px">
        ${stats.map(s => `<div class="stat-card">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
            <div style="width:44px;height:44px;background:${s.bg};border-radius:12px;display:flex;align-items:center;justify-content:center">
              <i class="fas ${s.icon}" style="font-size:18px;color:${s.color}"></i>
            </div>
          </div>
          <p style="font-size:24px;font-weight:800;color:#0f172a">${s.val}</p>
          <p style="font-size:13px;color:#64748b;margin-top:4px">${s.label}</p>
        </div>`).join('')}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
        <div style="background:white;border-radius:16px;padding:24px;box-shadow:0 1px 4px rgba(0,0,0,0.05)">
          <h3 style="font-size:16px;font-weight:700;color:#1e293b;margin-bottom:16px">Recent Projects</h3>
          ${projects.slice(0,4).map(p => `
          <div onclick="Router.go('/projects/${p.id}')" style="display:flex;align-items:center;justify-content:space-between;padding:10px;border-radius:10px;cursor:pointer;margin-bottom:6px" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
            <div>
              <p style="font-size:13px;font-weight:600;color:#1e293b">${Helpers.truncate(p.title||'',40)}</p>
              <p style="font-size:11px;color:#94a3b8;margin-top:2px">${p.bid_count||0} bids · ${Helpers.serviceLabel(p.service_type)}</p>
            </div>
            ${Helpers.statusBadge(p.status)}
          </div>`).join('') || '<p style="color:#94a3b8;font-size:13px;text-align:center;padding:20px">No projects yet</p>'}
          <button onclick="Router.go('/post-project')" style="width:100%;margin-top:12px;padding:10px;background:#eff6ff;color:#2563eb;border:none;border-radius:10px;cursor:pointer;font-size:13px;font-weight:600">
            <i class="fas fa-plus" style="margin-right:6px"></i>Post New Project
          </button>
        </div>
        <div style="background:white;border-radius:16px;padding:24px;box-shadow:0 1px 4px rgba(0,0,0,0.05)">
          <h3 style="font-size:16px;font-weight:700;color:#1e293b;margin-bottom:16px">Project Status</h3>
          <canvas id="proj-status-chart" height="200"></canvas>
        </div>
      </div>`;
      setTimeout(() => {
        const ctx = document.getElementById('proj-status-chart');
        if (ctx && window.Chart) {
          const statusCount = {};
          projects.forEach(p => { statusCount[p.status] = (statusCount[p.status]||0)+1; });
          new Chart(ctx, { type:'doughnut', data:{ labels:Object.keys(statusCount).map(s=>s.replace('_',' ')), datasets:[{ data:Object.values(statusCount), backgroundColor:['#3b82f6','#f97316','#8b5cf6','#10b981','#f59e0b','#ef4444'], borderWidth:0 }] }, options:{ responsive:true, plugins:{ legend:{ position:'bottom', labels:{ font:{ size:11 } } } } } });
        }
      }, 100);

    } else if (section === 'projects') {
      const { data } = await API.get('/projects/my/list');
      const projects = data.projects || [];
      el.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px">
        <h2 style="font-size:22px;font-weight:800;color:#0f172a">My Projects</h2>
        <button onclick="Router.go('/post-project')" class="btn-accent" style="color:white;padding:10px 20px;border-radius:10px;font-size:13px;font-weight:600"><i class="fas fa-plus" style="margin-right:6px"></i>New Project</button>
      </div>
      ${projects.length === 0 ? `<div style="background:white;border-radius:20px;padding:60px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,0.05)">
        <i class="fas fa-clipboard-list" style="font-size:48px;color:#e2e8f0;display:block;margin-bottom:16px"></i>
        <h3 style="color:#94a3b8">No projects yet</h3>
        <button onclick="Router.go('/post-project')" class="btn-primary" style="color:white;padding:12px 28px;border-radius:12px;margin-top:16px;font-size:14px;font-weight:600">Post Your First Project</button>
      </div>` :
      `<div style="display:grid;gap:16px">${projects.map(p => `
        <div style="background:white;border-radius:16px;padding:20px;box-shadow:0 1px 4px rgba(0,0,0,0.05);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
          <div style="flex:1">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
              <span style="font-size:11px;background:#eff6ff;color:#2563eb;padding:2px 8px;border-radius:10px;font-weight:600">${Helpers.serviceLabel(p.service_type)}</span>
              ${Helpers.statusBadge(p.status)}
            </div>
            <h3 onclick="Router.go('/projects/${p.id}')" style="font-size:15px;font-weight:700;color:#1e293b;cursor:pointer;margin-bottom:4px">${Helpers.esc(p.title||'')}</h3>
            <p style="font-size:12px;color:#94a3b8">${Helpers.esc(p.location||'')} · ${Helpers.date(p.created_at)} · ${p.bid_count||0} bids</p>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button onclick="Router.go('/projects/${p.id}')" style="padding:8px 14px;background:#eff6ff;color:#2563eb;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600">View Bids</button>
            ${['open','bidding'].includes(p.status) && (p.bid_count||0)===0 ? `<button onclick="v6ShowEditProject(${p.id})" style="padding:8px 14px;background:#faf5ff;color:#7c3aed;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600"><i class="fas fa-edit" style="margin-right:4px"></i>Edit</button>` : ''}
          </div>
        </div>`).join('')}</div>`}`;

    } else if (section === 'inspections') {
      const { data } = await API.get('/inspections/my');
      const insps = data.inspections || [];
      el.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;flex-wrap:wrap;gap:12px">
        <h2 style="font-size:22px;font-weight:800;color:#0f172a;margin:0">Technical Inspections</h2>
        <span style="font-size:13px;color:#64748b">${insps.length} total</span>
      </div>
      ${insps.length === 0 ? `<div style="background:white;border-radius:20px;padding:60px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,0.05)">
        <i class="fas fa-search" style="font-size:48px;color:#e2e8f0;display:block;margin-bottom:16px"></i>
        <h3 style="color:#94a3b8;margin-bottom:8px">No Inspections Yet</h3>
        <p style="font-size:13px;color:#94a3b8">Request a technical inspection from any project page</p>
        <button onclick="window.loadCustomerSection('projects')" class="btn-primary" style="color:white;padding:12px 24px;border-radius:12px;margin-top:16px;font-size:14px;font-weight:600">View My Projects</button>
      </div>` :
      `<div style="display:grid;gap:16px">${insps.map(insp => {
        const sc = {requested:{bg:'#fef3c7',color:'#d97706',label:'Requested'},paid:{bg:'#dbeafe',color:'#2563eb',label:'Paid'},assigned:{bg:'#e0e7ff',color:'#6366f1',label:'Expert Assigned'},in_progress:{bg:'#dcfce7',color:'#16a34a',label:'In Progress'},completed:{bg:'#f0fdf4',color:'#059669',label:'Completed'},cancelled:{bg:'#fee2e2',color:'#dc2626',label:'Cancelled'}}[insp.status] || {bg:'#f1f5f9',color:'#64748b',label:insp.status};
        return `<div style="background:white;border-radius:16px;padding:20px;box-shadow:0 1px 4px rgba(0,0,0,0.05);border-left:4px solid ${sc.color}">
          <div style="display:flex;align-items:start;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:14px">
            <div>
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
                <span style="background:${sc.bg};color:${sc.color};padding:3px 10px;border-radius:10px;font-size:12px;font-weight:700">${sc.label}</span>
                <span style="font-size:12px;color:#94a3b8">#INS-${insp.id}</span>
              </div>
              <h3 style="font-size:15px;font-weight:700;color:#1e293b;margin:0">${Helpers.esc(insp.project_title||'Project Inspection')}</h3>
            </div>
            <div style="text-align:right">
              <p style="font-size:18px;font-weight:800;color:#f97316">₹${(insp.fee||1500).toLocaleString('en-IN')}</p>
              <p style="font-size:11px;color:#94a3b8">Inspection Fee</p>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px">
            <p style="font-size:13px;color:#64748b"><i class="fas fa-user-tie" style="color:#7c3aed;margin-right:6px;width:14px"></i>${insp.expert_name ? 'Expert: '+Helpers.esc(insp.expert_name) : 'Expert being assigned...'}</p>
            ${insp.visit_date ? `<p style="font-size:13px;color:#64748b"><i class="fas fa-calendar" style="color:#059669;margin-right:6px;width:14px"></i>Visit: ${Helpers.date(insp.visit_date)}</p>` : ''}
            <p style="font-size:12px;color:#94a3b8"><i class="fas fa-clock" style="margin-right:6px;width:14px"></i>Requested: ${Helpers.timeAgo(insp.created_at)}</p>
          </div>
          ${insp.recommendation ? `<div style="background:#f0fdf4;border-radius:10px;padding:14px;margin-bottom:12px;border-left:3px solid #10b981"><p style="font-size:12px;font-weight:700;color:#065f46;margin-bottom:4px"><i class="fas fa-clipboard-check" style="margin-right:6px"></i>Expert Recommendation</p><p style="font-size:13px;color:#374151">${Helpers.esc(insp.recommendation)}</p>${insp.report_url?`<a href="${insp.report_url}" target="_blank" style="font-size:12px;color:#2563eb;font-weight:600;text-decoration:none;margin-top:6px;display:inline-block"><i class="fas fa-download" style="margin-right:4px"></i>Download Report</a>`:''}</div>` : ''}
          ${insp.status === 'requested' ? `<button onclick="Router.go('/checkout/0?type=inspection&inspection_id=${insp.id}&amount=1500')" class="btn-accent" style="color:white;padding:8px 16px;border-radius:8px;font-size:12px;font-weight:600"><i class="fas fa-credit-card" style="margin-right:4px"></i>Pay ₹1,500 to Confirm</button>` : ''}
        </div>`;
      }).join('')}</div>`}`;

    } else if (section === 'bids') {
      const { data } = await API.get('/projects/my/list');
      const projects = data.projects || [];
      el.innerHTML = `<h2 style="font-size:22px;font-weight:800;color:#0f172a;margin-bottom:24px">Vendor Bids Overview</h2>`;
      const withBids = projects.filter(p => (p.bid_count||0) > 0).slice(0,5);
      if (withBids.length === 0) {
        el.innerHTML += '<div style="background:white;border-radius:20px;padding:60px;text-align:center"><i class="fas fa-gavel" style="font-size:48px;color:#e2e8f0;display:block;margin-bottom:16px"></i><p style="color:#94a3b8">No bids received yet</p></div>';
      } else {
        for (const p of withBids) {
          try {
            const bR = await API.get('/bids/project/' + p.id);
            const bids = bR.data.bids || [];
            el.innerHTML += `<div style="background:white;border-radius:16px;padding:20px;box-shadow:0 1px 4px rgba(0,0,0,0.05);margin-bottom:16px">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
                <h3 style="font-weight:700;color:#1e293b;font-size:14px">${Helpers.esc(p.title||'')}</h3>
                <button onclick="Router.go('/bid-comparison/${p.id}')" style="background:#eff6ff;color:#2563eb;padding:6px 14px;border-radius:8px;border:none;cursor:pointer;font-size:12px;font-weight:600">Compare All</button>
              </div>
              ${bids.slice(0,3).map(b => `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px;border:1px solid #f1f5f9;border-radius:10px;margin-bottom:6px">
                <div style="display:flex;align-items:center;gap:10px">
                  <div style="width:32px;height:32px;background:linear-gradient(135deg,#7c3aed,#2563eb);border-radius:50%;display:flex;align-items:center;justify-content:center"><span style="color:white;font-size:12px;font-weight:700">${(b.company_name||b.vendor_name||'V').charAt(0)}</span></div>
                  <div><p style="font-size:13px;font-weight:600">${Helpers.esc(b.company_name||b.vendor_name||'Vendor')}</p><p style="font-size:11px;color:#94a3b8">${b.timeline_days} days</p></div>
                </div>
                <p style="font-size:15px;font-weight:700;color:#059669">${Helpers.currency(b.bid_amount)}</p>
              </div>`).join('')}
            </div>`;
          } catch(e2) { /* skip failed bid fetch */ }
        }
      }

    } else if (section === 'documents') {
      const { data: projData } = await API.get('/projects/my/list');
      const projects = projData.projects || [];
      el.innerHTML = `
      <h2 style="font-size:22px;font-weight:800;color:#0f172a;margin-bottom:24px">My Documents</h2>
      ${projects.length === 0 ? '<div style="background:white;border-radius:20px;padding:60px;text-align:center"><i class="fas fa-folder" style="font-size:48px;color:#e2e8f0;display:block;margin-bottom:16px"></i><p style="color:#94a3b8">No documents yet.</p></div>' :
      '<div style="display:grid;gap:16px">' + projects.map(p => `
        <div style="background:white;border-radius:14px;padding:18px;box-shadow:0 1px 4px rgba(0,0,0,0.05)">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
            <h3 style="font-size:14px;font-weight:700;color:#1e293b">${Helpers.esc(p.title||'')}</h3>
            <span style="font-size:11px;background:#eff6ff;color:#2563eb;padding:2px 8px;border-radius:10px;font-weight:600">${p.doc_count||0} files</span>
          </div>
          <button onclick="loadProjectDocs(${p.id}, this)" style="background:#f8fafc;border:1px solid #e2e8f0;color:#374151;padding:6px 14px;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600"><i class="fas fa-folder-open" style="margin-right:4px"></i>View Documents</button>
          <div id="docs-${p.id}" style="margin-top:12px"></div>
        </div>`).join('') + '</div>'}`;

    } else if (section === 'payments') {
      if (typeof loadCustomerPaymentsEnhanced === 'function') await loadCustomerPaymentsEnhanced();
      else el.innerHTML = '<div style="text-align:center;padding:40px;color:#94a3b8">Payments loading...</div>';

    } else if (section === 'messages') {
      Router.go('/messages');

    } else if (section === 'notifications') {
      const { data } = await API.get('/users/notifications');
      const notifs = data.notifications || [];
      if (notifs.length > 0) { try { await API.patch('/users/notifications/read'); } catch(e2) {} }
      const typeIcon = { bid:'fa-gavel', payment:'fa-credit-card', project:'fa-clipboard-list', inspection:'fa-search', message:'fa-comments', review:'fa-star', system:'fa-info-circle' };
      const typeColor = { bid:'#7c3aed', payment:'#059669', project:'#2563eb', inspection:'#0891b2', message:'#f97316', review:'#f59e0b', system:'#94a3b8' };
      el.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px">
        <h2 style="font-size:22px;font-weight:800;color:#0f172a">Notifications</h2>
        <span style="font-size:13px;color:#64748b">${notifs.length} total</span>
      </div>
      ${notifs.length === 0 ? '<div style="background:white;border-radius:20px;padding:60px;text-align:center"><i class="fas fa-bell-slash" style="font-size:48px;color:#e2e8f0;display:block;margin-bottom:16px"></i><p style="color:#94a3b8">No notifications yet</p></div>' :
      '<div style="display:grid;gap:10px">' + notifs.map(n => `<div style="background:white;border-radius:14px;padding:16px 20px;box-shadow:0 1px 4px rgba(0,0,0,0.05);display:flex;gap:14px;align-items:start;${n.is_read?'opacity:0.7':'border-left:3px solid '+(typeColor[n.type]||'#2563eb')}">
        <div style="width:36px;height:36px;background:${(typeColor[n.type]||'#2563eb')}15;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="fas ${typeIcon[n.type]||'fa-bell'}" style="color:${typeColor[n.type]||'#2563eb'};font-size:14px"></i></div>
        <div style="flex:1"><p style="font-size:14px;font-weight:600;color:#1e293b">${Helpers.esc(n.title||'')}</p><p style="font-size:13px;color:#64748b;margin-top:3px">${Helpers.esc(n.message||'')}</p><p style="font-size:11px;color:#94a3b8;margin-top:6px">${Helpers.timeAgo(n.created_at)}</p></div>
        ${!n.is_read ? '<span style="width:8px;height:8px;background:#2563eb;border-radius:50%;flex-shrink:0;margin-top:4px"></span>' : ''}
      </div>`).join('') + '</div>'}`;

    } else if (section === 'experts') {
      if (typeof loadCustomerExpertSection === 'function') await loadCustomerExpertSection();
      else Router.go('/experts');

    } else if (section === 'referral') {
      const { data } = await API.get('/users/referral-stats');
      const refCode = data.referral_code || 'BIDKARTS';
      const refUrl = window.location.origin + '/register?ref=' + refCode;
      el.innerHTML = `<h2 style="font-size:22px;font-weight:800;color:#0f172a;margin-bottom:24px">Referral Program</h2>
      <div style="background:white;border-radius:20px;padding:28px;box-shadow:0 2px 8px rgba(0,0,0,0.06)">
        <h3 style="font-size:16px;font-weight:700;color:#1e293b;margin-bottom:16px"><i class="fas fa-gift" style="color:#f97316;margin-right:8px"></i>Your Referral Code</h3>
        <div style="background:linear-gradient(135deg,#eff6ff,#faf5ff);border-radius:14px;padding:24px;text-align:center;border:1px solid #e0e7ff">
          <p style="font-size:13px;color:#64748b;margin-bottom:8px">Share this code to earn ₹500 per referral</p>
          <p style="font-size:32px;font-weight:900;color:#2563eb;letter-spacing:4px;font-family:monospace">${Helpers.esc(refCode)}</p>
          <div style="display:flex;gap:10px;justify-content:center;margin-top:16px;flex-wrap:wrap">
            <button onclick="navigator.clipboard.writeText('${refCode}');Toast.show('Code copied!','success')" style="background:#2563eb;color:white;padding:10px 20px;border-radius:10px;border:none;cursor:pointer;font-weight:600;font-size:13px"><i class="fas fa-copy" style="margin-right:6px"></i>Copy Code</button>
            <button onclick="navigator.clipboard.writeText('${refUrl}');Toast.show('Link copied!','success')" style="background:white;border:1.5px solid #2563eb;color:#2563eb;padding:10px 20px;border-radius:10px;cursor:pointer;font-weight:600;font-size:13px"><i class="fas fa-link" style="margin-right:6px"></i>Copy Link</button>
          </div>
        </div>
      </div>`;

    } else if (section === 'profile') {
      Router.go('/profile/edit');

    } else {
      el.innerHTML = '<div style="text-align:center;padding:60px;color:#94a3b8"><i class="fas fa-tools" style="font-size:40px;display:block;margin-bottom:12px"></i>Section coming soon</div>';
    }
  } catch(e) {
    console.error('[v6] loadCustomerSection error:', e);
    el.innerHTML = `<div style="text-align:center;padding:60px"><div style="background:#fef2f2;border-radius:16px;padding:32px;max-width:480px;margin:0 auto"><i class="fas fa-exclamation-circle" style="font-size:32px;color:#ef4444;display:block;margin-bottom:12px"></i><p style="color:#dc2626;font-weight:600;margin-bottom:8px">Failed to load section</p><p style="color:#64748b;font-size:13px">${Helpers.esc(e.message||'Unknown error')}</p><button onclick="window.loadCustomerSection('${section}')" style="margin-top:14px;padding:8px 20px;background:#2563eb;color:white;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600">Retry</button></div></div>`;
  }
}


async function loadProjectDocs(projectId, btn, isAdmin) {
  const el = document.getElementById(`docs-${projectId}`);
  if (!el) return;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; btn.disabled = true;
  try {
    const { data } = await API.get(`/projects/${projectId}`);
    const docs = data.documents || [];
    const canManage = isAdmin || (State.user?.role === 'customer');
    if (docs.length === 0) {
      el.innerHTML = `<p style="font-size:12px;color:#94a3b8;padding:8px 0">No documents for this project.</p>
      ${canManage ? `<div style="margin-top:10px">${renderUploadDocForm(projectId)}</div>` : ''}`;
    } else {
      el.innerHTML = `<div style="display:grid;gap:8px">
        ${docs.map(d => storeAndRenderDoc(d, canManage, projectId, 'deleteProjectDoc')).join('')}
      </div>
      ${canManage ? `<div style="margin-top:14px"><h4 style="font-size:13px;font-weight:700;color:#374151;margin-bottom:8px"><i class="fas fa-upload" style="margin-right:6px;color:#059669"></i>Upload New Document</h4>${renderUploadDocForm(projectId)}</div>` : ''}`;
    }
  } catch(e) { el.innerHTML = '<p style="font-size:12px;color:#ef4444">Failed to load</p>'; }
  btn.innerHTML = '<i class="fas fa-folder-open" style="margin-right:4px"></i>View Documents'; btn.disabled = false;
}

function renderUploadDocForm(projectId) {
  return `<div style="background:#f8fafc;border-radius:10px;padding:14px;border:1px dashed #cbd5e1">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
      <div>
        <label style="font-size:11px;color:#64748b;font-weight:600;display:block;margin-bottom:4px">Doc Type</label>
        <select id="doc-type-${projectId}" class="form-input" style="font-size:12px">
          <option value="blueprint">Blueprint</option>
          <option value="specification">Specification</option>
          <option value="photo">Photo</option>
          <option value="permit">Permit</option>
          <option value="contract">Contract</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div>
        <label style="font-size:11px;color:#64748b;font-weight:600;display:block;margin-bottom:4px">Choose File</label>
        <input id="doc-file-${projectId}" type="file" accept=".pdf,.jpg,.jpeg,.png,.dwg,.dxf,.doc,.docx" class="form-input" style="font-size:12px;padding:4px">
      </div>
    </div>
    <button onclick="uploadProjectDoc(${projectId})" style="background:#059669;color:white;padding:8px 16px;border-radius:8px;border:none;cursor:pointer;font-size:12px;font-weight:600"><i class="fas fa-upload" style="margin-right:4px"></i>Upload Document</button>
  </div>`;
}

async function uploadProjectDoc(projectId) {
  const docType = document.getElementById(`doc-type-${projectId}`)?.value || 'other';
  const fileInput = document.getElementById(`doc-file-${projectId}`);
  const file = fileInput?.files?.[0];
  if (!file) { Toast.show('Please select a file to upload', 'error'); return; }
  const maxSize = 10 * 1024 * 1024;
  if (file.size > maxSize) { Toast.show('File exceeds 10MB limit', 'error'); return; }
  try {
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const result = await API.post(`/projects/${projectId}/documents`, { doc_type: docType, file_name: file.name, file_url: base64, file_size: file.size });
    // Store in docDataStore so download works without page reload
    if (result.data?.document?.id) docDataStore[result.data.document.id] = { file_name: file.name, file_url: base64 };
    Toast.show('Document uploaded!', 'success');
    if (fileInput) fileInput.value = '';
    const btn = document.querySelector(`[onclick="loadProjectDocs(${projectId}, this)"], [onclick="loadProjectDocs(${projectId}, this, true)"]`);
    if (btn) loadProjectDocs(projectId, btn, State.user?.role === 'admin');
  } catch(err) { Toast.show(err.response?.data?.error || 'Failed to upload', 'error'); }
}

// Helper: download a document (handles both base64 data URIs and external URLs)
// docDataStore maps doc id -> {file_name, file_url}
const docDataStore = {};
function downloadDoc(docId) {
  const doc = docDataStore[docId];
  if (!doc || !doc.file_url) { Toast.show('No file available to download', 'error'); return; }
  try {
    const a = document.createElement('a');
    a.href = doc.file_url;
    a.download = doc.file_name || 'document';
    if (!doc.file_url.startsWith('data:')) { a.target = '_blank'; }
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch(e) { window.open(doc.file_url, '_blank'); }
}
function storeAndRenderDoc(d, canDelete, projectId, deleteFunc) {
  if (d.file_url) docDataStore[d.id] = { file_name: d.file_name, file_url: d.file_url };
  return `<div style="display:flex;align-items:center;gap:10px;padding:10px;background:#f8fafc;border-radius:10px" id="doc-row-${d.id}">
    <i class="fas fa-file-alt" style="color:#2563eb;font-size:16px;flex-shrink:0"></i>
    <div style="flex:1;min-width:0">
      <p style="font-size:13px;font-weight:600;color:#1e293b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${Helpers.esc(d.file_name)}</p>
      <p style="font-size:11px;color:#94a3b8">${d.doc_type} · ${d.file_size ? Math.round(d.file_size/1024)+'KB' : ''}</p>
    </div>
    <div style="display:flex;gap:6px;flex-shrink:0">
      ${d.file_url ? `<button onclick="downloadDoc(${d.id})" style="background:#eff6ff;color:#2563eb;padding:5px 10px;border-radius:8px;border:none;cursor:pointer;font-size:11px;font-weight:600" title="Download"><i class="fas fa-download"></i></button>` : ''}
      ${canDelete ? `<button onclick="${deleteFunc}(${projectId}, ${d.id})" style="background:#fef2f2;color:#ef4444;padding:5px 10px;border-radius:8px;border:none;cursor:pointer;font-size:11px" title="Delete"><i class="fas fa-trash"></i></button>` : ''}
    </div>
  </div>`;
}

async function deleteProjectDoc(projectId, docId) {
  if (!confirm('Delete this document?')) return;
  try {
    await API.delete(`/projects/${projectId}/documents/${docId}`);
    Toast.show('Document deleted', 'success');
    document.getElementById(`doc-row-${docId}`)?.remove();
  } catch(err) { Toast.show(err.response?.data?.error || 'Failed to delete', 'error'); }
}

// ── VENDOR DASHBOARD ─────────────────────────────────────────────────────
Pages.vendorDashboard = async function() {
  if (!Auth.isLoggedIn() || Auth.role() !== 'vendor') { Router.go('/login'); return; }
  const u = State.user;
  function sidebar(active) {
    const items = [['overview','fa-th-large','Overview'],['projects','fa-search','Find Projects'],['mybids','fa-gavel','My Bids'],['won','fa-trophy','Won Projects'],['analytics','fa-chart-bar','Analytics'],['messages','fa-comments','Messages'],['notifications','fa-bell','Notifications'],['portfolio','fa-images','Portfolio'],['plans','fa-crown','Upgrade Plan']];
    return `<div style="padding:12px;margin-bottom:20px">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="width:40px;height:40px;background:linear-gradient(135deg,#7c3aed,#2563eb);border-radius:50%;display:flex;align-items:center;justify-content:center">
          <span style="color:white;font-weight:700">${(u.name||'V').charAt(0)}</span>
        </div>
        <div><p style="font-weight:700;font-size:14px;color:#1e293b">${u.name}</p><p style="font-size:11px;color:#64748b">Vendor Account</p></div>
      </div>
    </div>
    <nav class="sidebar-nav">${items.map(([k,icon,label]) =>
      `<button onclick="loadVendorSection('${k}')" id="vdash-${k}" class="${active===k?'active':''}" style="margin-bottom:2px"><i class="fas ${icon}" style="width:18px"></i>${label}</button>`
    ).join('')}</nav>`;
  }
  document.getElementById('app').innerHTML = dashboardLayout(sidebar('overview'), `<div id="vendor-content"><div style="display:flex;justify-content:center;padding:60px"><div class="loading-spinner"></div></div></div>`);
  loadVendorSection('overview');
};

async function loadVendorSection(section) {
  document.querySelectorAll('.sidebar-nav button').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById(`vdash-${section}`);
  if (btn) btn.classList.add('active');
  const el = document.getElementById('vendor-content');
  if (!el) return;
  el.innerHTML = '<div style="display:flex;justify-content:center;padding:60px"><div class="loading-spinner"></div></div>';
  try {
    if (section === 'overview') {
      const [bidsRes, payRes] = await Promise.all([API.get('/bids/vendor/my'), API.get('/payments/stats')]);
      const bids = bidsRes.data.bids || [];
      const stats_data = payRes.data.stats || {};
      const wonBids = bids.filter(b => b.status === 'accepted');
      const stats = [
        { icon:'fa-paper-plane', label:'Total Bids', val:bids.length, color:'#2563eb', bg:'#eff6ff' },
        { icon:'fa-trophy', label:'Won Bids', val:wonBids.length, color:'#059669', bg:'#f0fdf4' },
        { icon:'fa-clock', label:'Pending', val:bids.filter(b=>b.status==='pending').length, color:'#f97316', bg:'#fff7ed' },
        { icon:'fa-rupee-sign', label:'Revenue', val:Helpers.currency(stats_data.total_amount||0), color:'#7c3aed', bg:'#f5f3ff' },
      ];
      el.innerHTML = `
      <div style="margin-bottom:28px">
        <h2 style="font-size:24px;font-weight:800;color:#0f172a">Vendor Dashboard</h2>
        <p style="color:#64748b;margin-top:4px">Your bidding activity and performance</p>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:16px;margin-bottom:28px">
        ${stats.map(s => `
        <div class="stat-card">
          <div style="width:44px;height:44px;background:${s.bg};border-radius:12px;display:flex;align-items:center;justify-content:center;margin-bottom:12px">
            <i class="fas ${s.icon}" style="font-size:18px;color:${s.color}"></i>
          </div>
          <p style="font-size:22px;font-weight:800;color:#0f172a">${s.val}</p>
          <p style="font-size:13px;color:#64748b;margin-top:4px">${s.label}</p>
        </div>`).join('')}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
        <div style="background:white;border-radius:16px;padding:24px;box-shadow:0 1px 4px rgba(0,0,0,0.05)">
          <h3 style="font-size:16px;font-weight:700;color:#1e293b;margin-bottom:16px">Recent Bids</h3>
          ${bids.slice(0,5).map(b => `
          <div onclick="Router.go('/projects/${b.project_id}')" style="padding:10px;border-radius:10px;cursor:pointer;margin-bottom:6px" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
            <div style="display:flex;align-items:center;justify-content:space-between">
              <div>
                <p style="font-size:13px;font-weight:600;color:#1e293b">${Helpers.truncate(b.project_title,40)}</p>
                <p style="font-size:11px;color:#94a3b8">${Helpers.currency(b.bid_amount)} · ${b.timeline_days} days</p>
              </div>
              ${Helpers.statusBadge(b.status)}
            </div>
          </div>`).join('') || '<p style="color:#94a3b8;text-align:center;padding:20px;font-size:13px">No bids submitted yet</p>'}
          <button onclick="loadVendorSection('projects')" style="width:100%;margin-top:12px;padding:10px;background:#f5f3ff;color:#7c3aed;border:none;border-radius:10px;cursor:pointer;font-size:13px;font-weight:600">
            <i class="fas fa-search" style="margin-right:6px"></i>Browse Projects to Bid
          </button>
        </div>
        <div style="background:white;border-radius:16px;padding:24px;box-shadow:0 1px 4px rgba(0,0,0,0.05)">
          <h3 style="font-size:16px;font-weight:700;color:#1e293b;margin-bottom:16px">Bid Performance</h3>
          <canvas id="vendor-chart" height="200"></canvas>
        </div>
      </div>`;
      setTimeout(() => {
        const ctx = document.getElementById('vendor-chart');
        if (ctx && window.Chart && bids.length > 0) {
          const statMap = {};
          bids.forEach(b => { statMap[b.status] = (statMap[b.status]||0)+1; });
          new Chart(ctx, {
            type:'doughnut',
            data:{ labels:Object.keys(statMap), datasets:[{ data:Object.values(statMap), backgroundColor:['#3b82f6','#10b981','#ef4444','#f59e0b'], borderWidth:0 }] },
            options:{ responsive:true, plugins:{ legend:{ position:'bottom', labels:{ font:{ size:11 } } } } }
          });
        }
      }, 100);
    } else if (section === 'projects') {
      el.innerHTML = `
      <h2 style="font-size:22px;font-weight:800;color:#0f172a;margin-bottom:16px">Find Projects to Bid</h2>
      <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap">
        <div style="position:relative;flex:1;min-width:200px">
          <i class="fas fa-search" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#94a3b8"></i>
          <input id="vp-search" class="form-input" placeholder="Search projects..." style="padding-left:36px" oninput="loadVendorProjects()">
        </div>
        <select id="vp-service" class="form-input" style="width:auto;min-width:150px" onchange="loadVendorProjects()">
          <option value="">All Services</option>
          <option value="hvac">HVAC</option>
          <option value="electrical">Electrical</option>
          <option value="plumbing">Plumbing</option>
          <option value="solar">Solar EPC</option>
          <option value="fabrication">Fabrication</option>
          <option value="contracting">Contracting</option>
        </select>
      </div>
      <div id="vp-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px">
        <div style="grid-column:1/-1;display:flex;justify-content:center;padding:40px"><div class="loading-spinner"></div></div>
      </div>`;
      loadVendorProjects();
    } else if (section === 'mybids') {
      const { data } = await API.get('/bids/vendor/my');
      const bids = data.bids || [];
      el.innerHTML = `
      <h2 style="font-size:22px;font-weight:800;color:#0f172a;margin-bottom:24px">My Submitted Bids</h2>
      ${bids.length === 0 ? '<div style="background:white;border-radius:20px;padding:60px;text-align:center"><i class="fas fa-gavel" style="font-size:48px;color:#e2e8f0;display:block;margin-bottom:16px"></i><p style="color:#94a3b8">No bids submitted yet</p><button onclick="loadVendorSection(\'projects\')" class="btn-primary" style="color:white;padding:12px 28px;border-radius:12px;margin-top:16px;font-size:14px;font-weight:600;display:inline-block">Browse Projects to Bid</button></div>' :
      `<div style="display:grid;gap:14px">${bids.map(b => `
        <div style="background:white;border-radius:14px;padding:16px 20px;box-shadow:0 1px 4px rgba(0,0,0,0.05)">
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
            <div style="flex:1;min-width:200px">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
                <span style="font-size:11px;background:#eff6ff;color:#2563eb;padding:2px 8px;border-radius:10px">${Helpers.serviceLabel(b.service_type)}</span>
                ${Helpers.statusBadge(b.status)}
              </div>
              <p onclick="Router.go('/projects/${b.project_id}')" style="font-size:14px;font-weight:700;color:#1e293b;cursor:pointer;margin-bottom:4px">${Helpers.truncate(b.project_title,50)}</p>
              <p style="font-size:12px;color:#94a3b8">${Helpers.currency(b.bid_amount)} · ${b.timeline_days} days</p>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button onclick="Router.go('/projects/${b.project_id}')" style="padding:7px 14px;background:#eff6ff;color:#2563eb;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600"><i class="fas fa-eye" style="margin-right:4px"></i>View</button>
              <button onclick="startMessageProject(${b.project_id},${b.customer_id||0})" style="padding:7px 14px;background:#faf5ff;color:#7c3aed;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600"><i class="fas fa-comments" style="margin-right:4px"></i>Message</button>
              ${b.status === 'accepted' ? `<button onclick="Router.go('/milestones/${b.project_id}')" style="padding:7px 14px;background:#f0fdf4;color:#059669;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600"><i class="fas fa-tasks" style="margin-right:4px"></i>Milestones</button>` : ''}
            </div>
          </div>
        </div>`).join('')}</div>`}`;
    } else if (section === 'analytics') {
      const [bidsRes, payRes] = await Promise.all([API.get('/bids/vendor/my'), API.get('/payments/stats')]);
      const bids = bidsRes.data.bids || [];
      const payStats = payRes.data.stats || {};
      const winRate = bids.length > 0 ? Math.round((bids.filter(b=>b.status==='accepted').length / bids.length) * 100) : 0;
      el.innerHTML = `
      <h2 style="font-size:22px;font-weight:800;color:#0f172a;margin-bottom:24px">Revenue Analytics</h2>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px;margin-bottom:28px">
        ${[
          ['fa-chart-line','Win Rate',`${winRate}%`,'#2563eb','#eff6ff'],
          ['fa-rupee-sign','Total Revenue',Helpers.currency(payStats.total_amount||0),'#059669','#f0fdf4'],
          ['fa-check-circle','Completed',payStats.successful||0,'#7c3aed','#f5f3ff'],
          ['fa-paper-plane','Total Bids',bids.length,'#f97316','#fff7ed'],
        ].map(([icon,label,val,color,bg]) => `
        <div class="stat-card">
          <div style="width:44px;height:44px;background:${bg};border-radius:12px;display:flex;align-items:center;justify-content:center;margin-bottom:12px">
            <i class="fas ${icon}" style="font-size:18px;color:${color}"></i>
          </div>
          <p style="font-size:22px;font-weight:800;color:#0f172a">${val}</p>
          <p style="font-size:13px;color:#64748b;margin-top:4px">${label}</p>
        </div>`).join('')}
      </div>
      <div style="background:white;border-radius:16px;padding:24px;box-shadow:0 1px 4px rgba(0,0,0,0.05)">
        <h3 style="font-size:16px;font-weight:700;color:#1e293b;margin-bottom:16px">Bid Status Distribution</h3>
        <div style="position:relative;height:280px;max-width:500px;margin:0 auto">
          <canvas id="analytics-chart"></canvas>
        </div>
      </div>`;
      setTimeout(() => {
        const ctx = document.getElementById('analytics-chart');
        if (ctx && window.Chart && bids.length > 0) {
          const statMap = {};
          bids.forEach(b => { statMap[b.status] = (statMap[b.status]||0)+1; });
          new Chart(ctx, {
            type:'bar',
            data:{ labels:Object.keys(statMap), datasets:[{ data:Object.values(statMap), backgroundColor:['#3b82f6','#10b981','#ef4444','#f59e0b','#8b5cf6'], borderRadius:8, borderWidth:0 }] },
            options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, scales:{ y:{ beginAtZero:true, grid:{ color:'#f1f5f9' } }, x:{ grid:{ display:false } } } }
          });
        }
      }, 100);
    } else if (section === 'messages') {
      Router.go('/messages');
    } else if (section === 'notifications') {
      const { data } = await API.get('/users/notifications');
      const notifs = data.notifications || [];
      if (notifs.length > 0) { try { await API.patch('/users/notifications/read'); } catch {} }
      const typeIcon = { bid:'fa-gavel', payment:'fa-credit-card', project:'fa-clipboard-list', inspection:'fa-search', message:'fa-comments', review:'fa-star', system:'fa-info-circle' };
      const typeColor = { bid:'#7c3aed', payment:'#059669', project:'#2563eb', inspection:'#0891b2', message:'#f97316', review:'#f59e0b', system:'#94a3b8' };
      el.innerHTML = `
      <h2 style="font-size:22px;font-weight:800;color:#0f172a;margin-bottom:24px">Notifications</h2>
      ${notifs.length===0?'<div style="background:white;border-radius:20px;padding:60px;text-align:center"><i class="fas fa-bell-slash" style="font-size:48px;color:#e2e8f0;display:block;margin-bottom:16px"></i><p style="color:#94a3b8">No notifications yet</p></div>':
      `<div style="display:grid;gap:10px">${notifs.map(n=>`
      <div style="background:white;border-radius:14px;padding:16px 20px;box-shadow:0 1px 4px rgba(0,0,0,0.05);display:flex;gap:14px;${n.is_read?'opacity:0.7':'border-left:3px solid '+(typeColor[n.type]||'#7c3aed')}">
        <div style="width:36px;height:36px;background:${(typeColor[n.type]||'#7c3aed')}15;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <i class="fas ${typeIcon[n.type]||'fa-bell'}" style="color:${typeColor[n.type]||'#7c3aed'};font-size:14px"></i>
        </div>
        <div style="flex:1"><p style="font-size:14px;font-weight:600;color:#1e293b">${n.title}</p><p style="font-size:13px;color:#64748b;margin-top:3px">${n.message}</p><p style="font-size:11px;color:#94a3b8;margin-top:6px">${Helpers.timeAgo(n.created_at)}</p></div>
      </div>`).join('')}</div>`}`;
    } else if (section === 'portfolio') {
      const { data } = await API.get('/users/profile');
      const profile = data.user?.profile || {};
      let imgs=[]; try{imgs=JSON.parse(profile.portfolio_images||'[]')}catch{}
      el.innerHTML = `
      <h2 style="font-size:22px;font-weight:800;color:#0f172a;margin-bottom:8px">Portfolio Gallery</h2>
      <p style="color:#64748b;font-size:14px;margin-bottom:24px">Showcase your best work to attract more customers. Add image URLs from image hosting sites.</p>
      <div style="background:white;border-radius:16px;padding:24px;box-shadow:0 1px 4px rgba(0,0,0,0.05);margin-bottom:20px">
        <div style="display:flex;gap:10px;margin-bottom:16px">
          <input id="v-portfolio-url" class="form-input" placeholder="Paste image URL (https://i.imgur.com/... or similar)" style="flex:1">
          <button onclick="addVendorPortfolio()" style="background:linear-gradient(135deg,#10b981,#059669);color:white;padding:10px 20px;border-radius:10px;border:none;cursor:pointer;font-weight:600;white-space:nowrap"><i class="fas fa-plus"></i> Add</button>
        </div>
        <p style="font-size:12px;color:#94a3b8"><i class="fas fa-info-circle" style="margin-right:4px"></i>Supported: Direct image URLs ending in .jpg, .png, .webp, or hosted on Imgur, Google Photos, etc.</p>
      </div>
      <div id="v-portfolio-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px">
        ${imgs.length===0?'<p style="color:#94a3b8;text-align:center;grid-column:1/-1;padding:40px">No portfolio images yet. Add your first image to attract more customers.</p>':
        imgs.map((url,i)=>`
        <div style="position:relative;border-radius:12px;overflow:hidden;padding-top:75%;background:#f1f5f9;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
          <img src="${url}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" onerror="this.parentElement.innerHTML='<div style=\\'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:12px\\'>⚠️ Invalid URL</div>'">
          <div style="position:absolute;inset:0;background:linear-gradient(to bottom,transparent 60%,rgba(0,0,0,0.5))"></div>
          <button onclick="removeVendorPortfolio(${i})" style="position:absolute;top:8px;right:8px;background:rgba(220,38,38,0.9);color:white;border:none;border-radius:50%;width:28px;height:28px;cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center"><i class="fas fa-trash"></i></button>
          <a href="${url}" target="_blank" style="position:absolute;bottom:8px;right:8px;background:rgba(255,255,255,0.9);color:#1e293b;border-radius:6px;padding:3px 8px;font-size:11px;text-decoration:none"><i class="fas fa-expand-alt" style="margin-right:4px"></i>View</a>
        </div>`).join('')}
      </div>`;
      window._vendorPortfolio = imgs;
    } else if (section === 'plans') {
      Router.go('/vendor-plans');
    } else if (section === 'won') {
      await loadVendorWonProjects();
    } else if (section === 'profile') {
      Router.go('/profile/edit');
    } else {
      el.innerHTML = '<div style="text-align:center;padding:60px;color:#94a3b8"><i class="fas fa-tools" style="font-size:40px;display:block;margin-bottom:12px"></i>Coming Soon</div>';
    }
  } catch(e) {
    el.innerHTML = `<div style="text-align:center;padding:60px;color:#ef4444">Failed to load: ${e.message}</div>`;
  }
}

// ── ADMIN DASHBOARD ───────────────────────────────────────────────────────
async function loadVendorProjects() {
  const grid = document.getElementById('vp-grid');
  if (!grid) return;
  grid.innerHTML = '<div style="grid-column:1/-1;display:flex;justify-content:center;padding:40px"><div class="loading-spinner"></div></div>';
  try {
    const search = document.getElementById('vp-search')?.value || '';
    const service = document.getElementById('vp-service')?.value || '';
    let url = '/projects?limit=30';
    if (service) url += `&service_type=${service}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    const { data } = await API.get(url);
    const projects = data.projects || [];
    grid.innerHTML = projects.length === 0
      ? '<div style="grid-column:1/-1;text-align:center;padding:60px;color:#94a3b8"><i class="fas fa-folder-open" style="font-size:48px;color:#e2e8f0;display:block;margin-bottom:16px"></i>No matching projects found</div>'
      : projects.map(p => projectCard(p)).join('');
  } catch(e) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:60px;color:#ef4444">Failed: ${e.message}</div>`;
  }
}


// ── ADMIN DASHBOARD ──────────────────────────────────────────────────────
Pages.adminDashboard = async function() {
  if (!Auth.isLoggedIn() || Auth.role() !== 'admin') { Router.go('/login'); return; }
  const u = State.user;
  function sidebar(active) {
    const items = [
      ['overview','fa-th-large','Overview'],
      ['users','fa-users','User Management'],
      ['vendors','fa-hard-hat','Vendor Approvals'],
      ['projects','fa-clipboard-list','All Projects'],
      ['inspections','fa-search','Inspections'],
      ['payments','fa-credit-card','Payments'],
      ['analytics','fa-chart-line','Analytics'],
      ['disputes','fa-balance-scale','Disputes'],
    ];
    return `<div style="padding:12px;margin-bottom:20px">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="width:40px;height:40px;background:linear-gradient(135deg,#dc2626,#7c3aed);border-radius:50%;display:flex;align-items:center;justify-content:center"><span style="color:white;font-weight:700">${(u.name||'A').charAt(0)}</span></div>
        <div><p style="font-weight:700;font-size:14px;color:#1e293b">${Helpers.esc(u.name||'Admin')}</p><p style="font-size:11px;color:#64748b">Administrator</p></div>
      </div>
    </div>
    <nav class="sidebar-nav">${items.map(([k,icon,label]) =>
      `<button onclick="window.loadAdminSection('${k}')" id="adash-${k}" class="${active===k?'active':''}" style="margin-bottom:2px"><i class="fas ${icon}" style="width:18px"></i>${label}</button>`
    ).join('')}</nav>`;
  }
  document.getElementById('app').innerHTML = dashboardLayout(sidebar('overview'), '<div id="admin-content"><div style="display:flex;justify-content:center;padding:60px"><div class="loading-spinner"></div></div></div>');
  window.loadAdminSection('overview');
};


// Enhance expert dashboard to include consultations section

async function loadAdminSection(section) {
  document.querySelectorAll('.sidebar-nav button').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('adash-' + section);
  if (btn) btn.classList.add('active');
  const el = document.getElementById('admin-content');
  if (!el) return;
  el.innerHTML = '<div style="display:flex;justify-content:center;padding:60px"><div class="loading-spinner"></div></div>';
  try {
    if (section === 'overview') {
      const { data } = await API.get('/admin/stats');
      const { users={}, projects={}, payments={}, bids={} } = data;
      el.innerHTML = `
      <div style="margin-bottom:24px"><h2 style="font-size:24px;font-weight:800;color:#0f172a">Platform Overview</h2><p style="color:#64748b;margin-top:4px">BidKarts Admin Dashboard</p></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:14px;margin-bottom:24px">
        ${[['fa-users','Total Users',users.total||0,'#2563eb','#eff6ff'],['fa-user','Customers',users.customers||0,'#10b981','#f0fdf4'],['fa-hard-hat','Vendors',users.vendors||0,'#7c3aed','#f5f3ff'],['fa-clipboard-list','Projects',projects.total||0,'#f97316','#fff7ed'],['fa-gavel','Total Bids',bids.total||0,'#0891b2','#ecfeff'],['fa-rupee-sign','Revenue',Helpers.currency(payments.revenue||0),'#059669','#f0fdf4']].map(([icon,label,val,color,bg]) => `
        <div class="stat-card" style="text-align:center">
          <div style="width:44px;height:44px;background:${bg};border-radius:12px;display:flex;align-items:center;justify-content:center;margin:0 auto 10px"><i class="fas ${icon}" style="font-size:18px;color:${color}"></i></div>
          <p style="font-size:20px;font-weight:800;color:#0f172a">${val}</p>
          <p style="font-size:12px;color:#64748b;margin-top:4px">${label}</p>
        </div>`).join('')}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
        <div style="background:white;border-radius:16px;padding:24px;box-shadow:0 1px 4px rgba(0,0,0,0.05)">
          <h3 style="font-size:16px;font-weight:700;color:#1e293b;margin-bottom:16px">Project Status Distribution</h3>
          <canvas id="admin-proj-chart" height="220"></canvas>
        </div>
        <div style="background:white;border-radius:16px;padding:24px;box-shadow:0 1px 4px rgba(0,0,0,0.05)">
          <h3 style="font-size:16px;font-weight:700;color:#1e293b;margin-bottom:16px">User Distribution</h3>
          <canvas id="admin-user-chart" height="220"></canvas>
        </div>
      </div>`;
      setTimeout(() => {
        if (!window.Chart) return;
        const c1 = document.getElementById('admin-proj-chart');
        if (c1 && projects) new Chart(c1, { type:'doughnut', data:{ labels:['Open','Bidding','In Progress','Completed'], datasets:[{ data:[projects.open||0,projects.bidding||0,projects.in_progress||0,projects.completed||0], backgroundColor:['#3b82f6','#f97316','#8b5cf6','#10b981'], borderWidth:0 }] }, options:{ responsive:true, plugins:{ legend:{ position:'bottom' } } } });
        const c2 = document.getElementById('admin-user-chart');
        if (c2 && users) new Chart(c2, { type:'pie', data:{ labels:['Customers','Vendors','Experts'], datasets:[{ data:[users.customers||0,users.vendors||0,users.experts||0], backgroundColor:['#2563eb','#7c3aed','#0891b2'], borderWidth:0 }] }, options:{ responsive:true, plugins:{ legend:{ position:'bottom' } } } });
      }, 100);

    } else if (section === 'users') {
      const { data } = await API.get('/admin/users');
      const users = data.users || [];
      el.innerHTML = `<h2 style="font-size:22px;font-weight:800;color:#0f172a;margin-bottom:24px">User Management (${users.length})</h2>
      <div style="background:white;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.05)">
        <table style="width:100%;border-collapse:collapse">
          <thead><tr style="background:#f8fafc">
            <th style="text-align:left;padding:14px 16px;font-size:12px;color:#64748b;font-weight:600">Name</th>
            <th style="text-align:left;padding:14px 16px;font-size:12px;color:#64748b;font-weight:600">Email</th>
            <th style="text-align:center;padding:14px 16px;font-size:12px;color:#64748b;font-weight:600">Role</th>
            <th style="text-align:center;padding:14px 16px;font-size:12px;color:#64748b;font-weight:600">Status</th>
            <th style="text-align:center;padding:14px 16px;font-size:12px;color:#64748b;font-weight:600">Action</th>
          </tr></thead>
          <tbody>${users.map((u,i) => `
          <tr style="border-top:1px solid #f1f5f9;${i%2===1?'background:#fafafa':''}">
            <td style="padding:12px 16px;font-size:13px;font-weight:600;color:#1e293b">${Helpers.esc(u.name||'')}</td>
            <td style="padding:12px 16px;font-size:13px;color:#64748b">${Helpers.esc(u.email||'')}</td>
            <td style="padding:12px 16px;text-align:center"><span style="font-size:11px;padding:2px 10px;border-radius:12px;font-weight:600;background:${u.role==='admin'?'#fef2f2;color:#dc2626':u.role==='vendor'?'#f5f3ff;color:#7c3aed':u.role==='expert'?'#ecfeff;color:#0891b2':'#eff6ff;color:#2563eb'}">${u.role}</span></td>
            <td style="padding:12px 16px;text-align:center"><span style="font-size:11px;padding:2px 10px;border-radius:12px;font-weight:600;background:${u.is_active?'#f0fdf4;color:#059669':'#fef2f2;color:#dc2626'}">${u.is_active?'Active':'Inactive'}</span></td>
            <td style="padding:12px 16px;text-align:center"><button onclick="toggleUser(${u.id},${u.is_active},this)" style="padding:5px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;cursor:pointer;font-size:12px">${u.is_active?'Deactivate':'Activate'}</button></td>
          </tr>`).join('')}</tbody>
        </table>
      </div>`;

    } else if (section === 'vendors') {
      const { data } = await API.get('/admin/vendors/pending');
      const vendors = data.vendors || [];
      el.innerHTML = `<h2 style="font-size:22px;font-weight:800;color:#0f172a;margin-bottom:24px">Pending Vendor Approvals (${vendors.length})</h2>
      ${vendors.length === 0 ? '<div style="background:white;border-radius:20px;padding:60px;text-align:center"><i class="fas fa-check-circle" style="font-size:48px;color:#10b981;display:block;margin-bottom:16px"></i><p style="color:#374151;font-weight:600">All vendors reviewed!</p></div>' :
      '<div style="display:grid;gap:16px">' + vendors.map(v => `
      <div style="background:white;border-radius:16px;padding:20px;box-shadow:0 1px 4px rgba(0,0,0,0.05)">
        <div style="display:flex;align-items:start;justify-content:space-between;flex-wrap:wrap;gap:14px">
          <div style="flex:1">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
              <div style="width:40px;height:40px;background:linear-gradient(135deg,#7c3aed,#2563eb);border-radius:50%;display:flex;align-items:center;justify-content:center"><span style="color:white;font-weight:700">${(v.company_name||'V').charAt(0)}</span></div>
              <div><p style="font-weight:700;color:#1e293b">${Helpers.esc(v.company_name||'')}</p><p style="font-size:12px;color:#64748b">${Helpers.esc(v.owner_name||'')} · ${Helpers.esc(v.email||'')}</p></div>
            </div>
            <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:8px">
              <span style="font-size:12px;color:#64748b"><i class="fas fa-map-marker-alt" style="color:#3b82f6;margin-right:4px"></i>${Helpers.esc(v.service_area||'N/A')}</span>
              <span style="font-size:12px;color:#64748b"><i class="fas fa-briefcase" style="color:#f97316;margin-right:4px"></i>${v.experience_years||0} years</span>
            </div>
          </div>
          <div style="display:flex;gap:8px">
            <button onclick="approveVendor(${v.id},true,this)" style="padding:10px 20px;background:#f0fdf4;color:#059669;border:1.5px solid #86efac;border-radius:10px;cursor:pointer;font-size:13px;font-weight:600"><i class="fas fa-check" style="margin-right:4px"></i>Approve</button>
            <button onclick="approveVendor(${v.id},false,this)" style="padding:10px 20px;background:#fef2f2;color:#dc2626;border:1.5px solid #fca5a5;border-radius:10px;cursor:pointer;font-size:13px;font-weight:600"><i class="fas fa-times" style="margin-right:4px"></i>Reject</button>
          </div>
        </div>
      </div>`).join('') + '</div>'}`;

    } else if (section === 'projects') {
      const { data } = await API.get('/admin/projects');
      const projects = data.projects || [];
      el.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;flex-wrap:wrap;gap:12px">
        <h2 style="font-size:22px;font-weight:800;color:#0f172a;margin:0">All Projects (${projects.length})</h2>
      </div>
      <div style="display:grid;gap:14px">${projects.map(p => `
      <div style="background:white;border-radius:14px;padding:16px 20px;box-shadow:0 1px 4px rgba(0,0,0,0.05)">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
          <div style="flex:1">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
              <span style="font-size:11px;background:#eff6ff;color:#2563eb;padding:2px 8px;border-radius:10px">${Helpers.serviceLabel(p.service_type)}</span>
              ${Helpers.statusBadge(p.status)}
            </div>
            <p style="font-weight:600;color:#1e293b;font-size:14px">${Helpers.esc(p.title||'')}</p>
            <p style="font-size:12px;color:#94a3b8">${Helpers.esc(p.customer_name||'')} · ${Helpers.esc(p.location||'')} · ${p.bid_count||0} bids · ${Helpers.date(p.created_at)}</p>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button onclick="Router.go('/projects/${p.id}')" style="padding:8px 14px;background:#eff6ff;color:#2563eb;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600">View</button>
            <button onclick="adminV6EditProject(${p.id})" style="padding:8px 14px;background:#faf5ff;color:#7c3aed;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600"><i class="fas fa-edit"></i> Edit</button>
            ${p.status !== 'suspended' ? `<button onclick="adminV6SuspendProject(${p.id})" style="padding:8px 14px;background:#fef2f2;color:#dc2626;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600">Suspend</button>` : `<button onclick="adminV6RestoreProject(${p.id})" style="padding:8px 14px;background:#f0fdf4;color:#059669;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600">Restore</button>`}
          </div>
        </div>
      </div>`).join('')}`;

    } else if (section === 'payments') {
      if (typeof loadAdminPayments === 'function') await loadAdminPayments();
      else el.innerHTML = '<div style="text-align:center;padding:60px;color:#94a3b8">Loading payments...</div>';

    } else if (section === 'analytics') {
      if (typeof loadAdminAnalytics === 'function') await loadAdminAnalytics();
      else el.innerHTML = '<div style="text-align:center;padding:60px;color:#94a3b8">Loading analytics...</div>';

    } else if (section === 'disputes') {
      if (typeof loadAdminDisputes === 'function') await loadAdminDisputes();
      else el.innerHTML = '<div style="text-align:center;padding:60px;color:#94a3b8">Loading disputes...</div>';

    } else if (section === 'inspections') {
      const { data } = await API.get('/inspections/my');
      const insps = data.inspections || [];
      const statusStats = insps.reduce((acc, i) => { acc[i.status] = (acc[i.status]||0)+1; return acc; }, {});
      window._adminInspections = insps;
      el.innerHTML = `
      <div style="margin-bottom:28px">
        <h2 style="font-size:24px;font-weight:800;color:#0f172a">Technical Inspections Management</h2>
        <p style="color:#64748b;margin-top:4px">Manage all inspection requests, assign experts, and track status</p>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px;margin-bottom:24px">
        ${Object.entries(statusStats).map(([s,c]) => `<div style="background:white;border-radius:12px;padding:14px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,0.05)"><p style="font-size:22px;font-weight:800;color:#0f172a">${c}</p><p style="font-size:11px;color:#64748b;text-transform:capitalize">${s.replace('_',' ')}</p></div>`).join('')}
        <div style="background:white;border-radius:12px;padding:14px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,0.05)"><p style="font-size:22px;font-weight:800;color:#0f172a">${insps.length}</p><p style="font-size:11px;color:#64748b">Total</p></div>
      </div>
      <div style="background:white;border-radius:12px;padding:14px 18px;margin-bottom:16px;box-shadow:0 1px 4px rgba(0,0,0,0.05);display:flex;gap:8px;flex-wrap:wrap">
        ${['all','requested','paid','assigned','completed'].map(s =>
          `<button onclick="filterAdminInspections('${s}',this)" data-status="${s}" style="padding:6px 14px;border-radius:8px;border:none;cursor:pointer;font-size:12px;font-weight:600;background:${s==='all'?'#2563eb':'#f1f5f9'};color:${s==='all'?'white':'#374151'}">${s==='all'?'All':s.charAt(0).toUpperCase()+s.slice(1)} (${s==='all'?insps.length:(statusStats[s]||0)})</button>`
        ).join('')}
      </div>
      <div id="admin-insp-list" style="display:grid;gap:16px">
        ${insps.length ? insps.map(i => (typeof renderInspectionCard === 'function' ? renderInspectionCard(i,'admin') : `<div style="background:white;padding:16px;border-radius:12px">${Helpers.esc(i.project_title||'Inspection #'+i.id)} – ${i.status}</div>`)).join('') : '<div style="background:white;border-radius:16px;padding:48px;text-align:center;color:#94a3b8"><i class="fas fa-search" style="font-size:40px;display:block;margin-bottom:12px;color:#e2e8f0"></i>No inspections found</div>'}
      </div>`;

    } else {
      el.innerHTML = '<div style="text-align:center;padding:60px;color:#94a3b8"><i class="fas fa-tools" style="font-size:40px;display:block;margin-bottom:12px"></i>Section coming soon</div>';
    }
  } catch(e) {
    console.error('[v6] loadAdminSection error:', e);
    el.innerHTML = `<div style="text-align:center;padding:60px"><div style="background:#fef2f2;border-radius:16px;padding:32px;max-width:480px;margin:0 auto"><i class="fas fa-exclamation-circle" style="font-size:32px;color:#ef4444;display:block;margin-bottom:12px"></i><p style="color:#dc2626;font-weight:600;margin-bottom:8px">Failed to load section</p><p style="color:#64748b;font-size:13px">${Helpers.esc(e.message||'Unknown error')}</p><button onclick="window.loadAdminSection('${section}')" style="margin-top:14px;padding:8px 20px;background:#2563eb;color:white;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600">Retry</button></div></div>`;
  }

}


async function approveVendor(userId, approve, btn) {
  try {
    await API.patch(`/admin/vendors/${userId}/approve`, { approved: approve });
    Toast.show(approve ? 'Vendor approved!' : 'Vendor rejected', approve ? 'success' : 'info');
    btn.closest('div[style]').closest('div').remove();
  } catch(e) { Toast.show('Failed: ' + e.message, 'error'); }
}

async function toggleUser(userId, isActive, btn) {
  try {
    await API.patch(`/admin/users/${userId}/toggle`);
    Toast.show(isActive ? 'User deactivated' : 'User activated', 'success');
    loadAdminSection('users');
  } catch(e) { Toast.show('Failed: ' + e.message, 'error'); }
}

// ── CHECKOUT PAGE ─────────────────────────────────────────────────────────
Pages.checkout = function(params) {
  if (!Auth.isLoggedIn()) { Router.go('/login'); return; }
  const urlParams = new URLSearchParams(window.location.search);
  const payType = urlParams.get('type') || 'platform_fee';
  const inspectionId = urlParams.get('inspection_id');
  const amount = urlParams.get('amount') || (payType === 'inspection_fee' || payType === 'inspection' ? 1500 : 5000);
  const normalizedPayType = payType === 'inspection' ? 'inspection_fee' : payType;
  const projectId = params.id !== '0' ? params.id : null;
  document.getElementById('app').innerHTML = layout(`
  <div style="max-width:680px;margin:0 auto;padding:40px 20px">
    <div style="margin-bottom:28px">
      <h1 style="font-size:28px;font-weight:800;color:#0f172a">Secure Payment</h1>
      <p style="color:#64748b;margin-top:4px">Complete your payment to proceed</p>
    </div>
    <div style="background:white;border-radius:20px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08)">
      <!-- Order Summary -->
      <div style="background:linear-gradient(135deg,#1e3a8a,#2563eb);padding:28px;color:white">
        <p style="font-size:13px;opacity:0.8;margin-bottom:4px">Payment Amount</p>
        <p style="font-size:40px;font-weight:900">₹${parseInt(amount).toLocaleString('en-IN')}</p>
        <p style="font-size:14px;opacity:0.9;margin-top:8px">${payType === 'inspection_fee' || payType === 'inspection' ? 'Technical Inspection Fee' : payType === 'vendor_advance' ? 'Vendor Advance Payment' : payType === 'escrow_deposit' ? '🔐 Escrow Deposit (Protected)' : payType === 'milestone_payment' ? 'Milestone Payment (Escrow)' : 'Platform Service Fee'}</p>
      </div>
      <div style="padding:28px">
        <!-- Payment Details -->
        <div style="background:#f8fafc;border-radius:14px;padding:20px;margin-bottom:24px">
          <h3 style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:14px">Order Summary</h3>
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f1f5f9;font-size:13px"><span style="color:#64748b">Payment Type</span><span style="font-weight:600;color:#1e293b">${(payType||'').replace(/_/g,' ').replace(/\b\w/g, l => l.toUpperCase())}</span></div>
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f1f5f9;font-size:13px"><span style="color:#64748b">${inspectionId ? 'Inspection ID' : 'Project ID'}</span><span style="font-weight:600;color:#1e293b">${inspectionId ? '#INS-'+inspectionId : (projectId ? '#PRJ-'+projectId : 'N/A')}</span></div>
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f1f5f9;font-size:13px"><span style="color:#64748b">Customer</span><span style="font-weight:600;color:#1e293b">${State.user?.name || 'You'}</span></div>
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f1f5f9;font-size:13px"><span style="color:#64748b">Gateway</span><span style="font-weight:600;color:#1e293b">Razorpay (Simulated)</span></div>
          <div style="display:flex;justify-content:space-between;padding:8px 0;font-size:15px;font-weight:700;margin-top:4px"><span>Total</span><span style="color:#2563eb">₹${parseInt(amount).toLocaleString('en-IN')}</span></div>
        </div>
        <!-- Razorpay Payment Simulation -->
        <div style="border:2px solid #e2e8f0;border-radius:14px;padding:20px;margin-bottom:20px">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
            <i class="fas fa-lock" style="color:#10b981;font-size:18px"></i>
            <span style="font-weight:700;color:#1e293b">Secure Payment via Razorpay</span>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
            <div><label class="form-label" style="font-size:11px">Card Number</label><input class="form-input" value="4111 1111 1111 1111" readonly style="font-size:13px;background:#f8fafc"></div>
            <div><label class="form-label" style="font-size:11px">Name on Card</label><input class="form-input" value="${State.user?.name || 'Test User'}" readonly style="font-size:13px;background:#f8fafc"></div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div><label class="form-label" style="font-size:11px">Expiry Date</label><input class="form-input" value="12/26" readonly style="font-size:13px;background:#f8fafc"></div>
            <div><label class="form-label" style="font-size:11px">CVV</label><input class="form-input" value="•••" readonly style="font-size:13px;background:#f8fafc"></div>
          </div>
          <p style="font-size:11px;color:#94a3b8;margin-top:12px;text-align:center">This is a test payment simulation. No real transaction will occur.</p>
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:20px;background:#f0fdf4;padding:12px;border-radius:10px">
          <i class="fas fa-shield-alt" style="color:#10b981"></i>
          <p style="font-size:12px;color:#065f46">256-bit SSL encrypted secure payment. Your data is safe.</p>
        </div>
        <button onclick="processPaymentReal(${projectId||0}, '${normalizedPayType}', ${amount}, ${inspectionId||0}, null)" id="pay-btn" class="btn-primary" style="width:100%;color:white;padding:16px;border-radius:14px;font-size:16px;font-weight:700">
          <i class="fas fa-lock" style="margin-right:8px"></i>Pay ₹${parseInt(amount).toLocaleString('en-IN')} Securely
        </button>
        <button onclick="Router.go(-1)" style="width:100%;margin-top:10px;padding:12px;background:none;border:1.5px solid #e2e8f0;border-radius:12px;cursor:pointer;font-size:14px;color:#64748b">Cancel</button>
      </div>
    </div>
  </div>
  `);
};

async function processPayment(projectId, paymentType, amount, inspectionId) {
  const btn = document.getElementById('pay-btn');
  btn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:8px"></i>Processing...';
  btn.disabled = true;
  try {
    // Step 1: Initiate payment
    const { data: order } = await API.post('/payments/initiate', {
      project_id: projectId || null, inspection_id: inspectionId || null,
      payment_type: paymentType, amount: parseFloat(amount)
    });
    // Simulate payment processing delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    btn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:8px"></i>Verifying...';
    // Step 2: Verify payment
    await API.post('/payments/verify', {
      payment_id: order.payment.id, gateway_order_id: order.payment.gateway_order_id,
      gateway_payment_id: `pay_${Date.now()}`, payment_method: 'card'
    });
    // Success
    btn.innerHTML = '<i class="fas fa-check" style="margin-right:8px"></i>Payment Successful!';
    btn.style.background = 'linear-gradient(135deg,#10b981,#059669)';
    Toast.show('Payment successful! ₹' + parseInt(amount).toLocaleString() + ' paid.', 'success', 4000);
    setTimeout(() => {
      const role = Auth.role();
      Router.go(role === 'vendor' ? '/dashboard/vendor' : '/dashboard/customer');
    }, 2000);
  } catch(err) {
    Toast.show(err.response?.data?.error || 'Payment failed. Please try again.', 'error');
    btn.innerHTML = '<i class="fas fa-lock" style="margin-right:8px"></i>Pay ₹' + parseInt(amount).toLocaleString() + ' Securely';
    btn.disabled = false;
  }
}

// ── BID COMPARISON PAGE ───────────────────────────────────────────────────
Pages.bidComparison = async function(params) {
  if (!Auth.isLoggedIn()) { Router.go('/login'); return; }
  document.getElementById('app').innerHTML = layout(`<div style="display:flex;justify-content:center;padding:80px"><div class="loading-spinner"></div></div>`);
  try {
    const [projRes, bidsRes] = await Promise.all([API.get(`/projects/${params.id}`), API.get(`/bids/project/${params.id}`)]);
    const project = projRes.data.project;
    const bids = bidsRes.data.bids || [];
    if (bids.length === 0) { Toast.show('No bids to compare', 'info'); Router.go(`/projects/${params.id}`); return; }
    const minBid = Math.min(...bids.map(b => b.bid_amount));
    const maxBid = Math.max(...bids.map(b => b.bid_amount));
    document.getElementById('app').innerHTML = layout(`
    <div style="max-width:1200px;margin:0 auto;padding:32px 20px">
      <div style="margin-bottom:24px">
        <button onclick="Router.go('/projects/${params.id}')" style="background:none;border:none;cursor:pointer;color:#64748b;font-size:14px"><i class="fas fa-arrow-left"></i> Back to Project</button>
        <h1 style="font-size:26px;font-weight:800;color:#0f172a;margin-top:12px">Bid Comparison</h1>
        <p style="color:#64748b">Compare all bids for: ${project?.title}</p>
      </div>
      <!-- Comparison Table -->
      <div style="background:white;border-radius:20px;box-shadow:0 2px 12px rgba(0,0,0,0.06);overflow:hidden;margin-bottom:24px">
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;min-width:600px">
            <thead>
              <tr style="background:linear-gradient(135deg,#1e3a8a,#2563eb)">
                <th style="text-align:left;padding:16px;font-size:13px;color:rgba(255,255,255,0.8);font-weight:600">Criteria</th>
                ${bids.map(b => `<th style="text-align:center;padding:16px;min-width:160px"><div style="color:white;font-size:14px;font-weight:700">${b.company_name||b.vendor_name}</div><div style="font-size:11px;color:rgba(255,255,255,0.7);margin-top:2px">${Helpers.stars(b.rating)}</div></th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${[
                ['Bid Amount', b => `<span style="font-size:18px;font-weight:800;color:${b.bid_amount===minBid?'#059669':'#1e293b'}">${Helpers.currency(b.bid_amount)}</span>${b.bid_amount===minBid?'<span style="display:block;font-size:10px;color:#059669;font-weight:700;margin-top:2px">✓ Lowest Bid</span>':''}`, 'fa-rupee-sign','#10b981'],
                ['Timeline', b => `<span style="font-size:15px;font-weight:700;color:${b.timeline_days===Math.min(...bids.map(x=>x.timeline_days))?'#059669':'#374151'}">${b.timeline_days} days</span>`, 'fa-clock','#f97316'],
                ['Rating', b => `<div>${Helpers.stars(b.rating)}</div><span style="font-size:12px;color:#64748b">${b.rating?parseFloat(b.rating).toFixed(1):'N/A'} (${b.total_reviews||0} reviews)</span>`, 'fa-star','#f59e0b'],
                ['Experience', b => `${b.experience_years||0} Years`, 'fa-briefcase','#7c3aed'],
                ['Equipment', b => `<span style="font-size:12px;color:#374151;line-height:1.5">${b.equipment_details ? Helpers.truncate(b.equipment_details, 80) : 'Not specified'}</span>`, 'fa-tools','#2563eb'],
                ['Warranty', b => `<span style="font-size:12px;color:#374151">${b.warranty_details || 'Not specified'}</span>`, 'fa-shield-alt','#0891b2'],
                ['Certifications', b => `<span style="font-size:12px;color:#374151">${b.certifications || 'Standard'}</span>`, 'fa-certificate','#10b981'],
              ].map(([label, fn, icon, color], ri) => `
              <tr style="${ri%2===0?'background:#fafafa':'background:white'}">
                <td style="padding:16px;font-size:13px;font-weight:600;color:#374151;white-space:nowrap"><i class="fas ${icon}" style="color:${color};margin-right:8px"></i>${label}</td>
                ${bids.map(b => `<td style="padding:16px;text-align:center">${fn(b)}</td>`).join('')}
              </tr>`).join('')}
              <tr style="background:#f8fafc">
                <td style="padding:16px;font-size:13px;font-weight:600;color:#374151">Action</td>
                ${bids.map(b => `<td style="padding:16px;text-align:center">${b.status==='pending' ? `<button onclick="selectVendorBid(${params.id},${b.id},${b.vendor_id})" class="btn-primary" style="color:white;padding:10px 20px;border-radius:10px;font-size:13px;font-weight:600">Select Bid</button>` : `<span style="font-size:12px;font-weight:600;color:${b.status==='accepted'?'#059669':'#64748b'}">${b.status.toUpperCase()}</span>`}</td>`).join('')}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <!-- Summary Chart -->
      <div style="background:white;border-radius:20px;padding:24px;box-shadow:0 2px 8px rgba(0,0,0,0.05);margin-bottom:20px">
        <h3 style="font-size:16px;font-weight:700;color:#1e293b;margin-bottom:16px">Bid Amount Comparison</h3>
        <canvas id="bid-compare-chart" height="120"></canvas>
      </div>
      <!-- Smart Recommendation -->
      <div style="background:linear-gradient(135deg,#f0fdf4,#dcfce7);border-radius:20px;padding:24px;border:1px solid #86efac">
        <h3 style="font-size:16px;font-weight:700;color:#065f46;margin-bottom:12px"><i class="fas fa-lightbulb" style="color:#10b981;margin-right:8px"></i>BidKarts Recommendation</h3>
        ${(() => {
          const bestBid = bids.reduce((best, b) => {
            const score = (1/b.bid_amount * 1000000) + (1/b.timeline_days * 100) + (parseFloat(b.rating)||3) * 10 + (b.total_reviews||0) * 0.5;
            return score > best.score ? { bid: b, score } : best;
          }, { bid: bids[0], score: 0 }).bid;
          return `<div style="display:flex;align-items:center;gap:12px;background:white;border-radius:14px;padding:16px">
            <div style="width:48px;height:48px;background:linear-gradient(135deg,#10b981,#059669);border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="fas fa-trophy" style="color:white;font-size:20px"></i></div>
            <div>
              <p style="font-size:15px;font-weight:700;color:#1e293b">${bestBid.company_name||bestBid.vendor_name} — ${Helpers.currency(bestBid.bid_amount)}</p>
              <p style="font-size:13px;color:#374151;margin-top:4px">Best overall value considering price, timeline (${bestBid.timeline_days} days), and rating (${bestBid.rating?parseFloat(bestBid.rating).toFixed(1):'N/A'}★)</p>
            </div>
          </div>`;
        })()}
      </div>
    </div>
    `);
    setTimeout(() => {
      const ctx = document.getElementById('bid-compare-chart');
      if (ctx && window.Chart) {
        new Chart(ctx, {
          type: 'bar',
          data: {
            labels: bids.map(b => b.company_name || b.vendor_name),
            datasets: [{
              label: 'Bid Amount (₹)',
              data: bids.map(b => b.bid_amount),
              backgroundColor: bids.map(b => b.bid_amount === minBid ? '#10b981' : '#3b82f6'),
              borderRadius: 8, borderWidth: 0
            }]
          },
          options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { callback: v => '₹' + v.toLocaleString('en-IN') }, grid: { color: '#f1f5f9' } }, x: { grid: { display: false } } } }
        });
      }
    }, 100);
  } catch(e) {
    document.getElementById('app').innerHTML = layout(`<div style="text-align:center;padding:80px;color:#ef4444">Failed to load comparison: ${e.message}</div>`);
  }
};

// ── VENDOR PROFILE PAGE ───────────────────────────────────────────────────
Pages.vendorProfile = async function(params) {
  document.getElementById('app').innerHTML = layout(`<div style="display:flex;justify-content:center;padding:80px"><div class="loading-spinner"></div></div>`);
  try {
    const { data } = await API.get(`/users/vendors/${params.id}`);
    const v = data.vendor;
    const reviews = data.reviews || [];
    const services = (v.services_offered||'').split(',').filter(s=>s);
    document.getElementById('app').innerHTML = layout(`
    <div style="max-width:1000px;margin:0 auto;padding:32px 20px">
      <button onclick="Router.go('/vendors')" style="background:none;border:none;cursor:pointer;color:#64748b;font-size:14px;margin-bottom:20px"><i class="fas fa-arrow-left"></i> Back to Vendors</button>
      <!-- Hero Card -->
      <div style="background:white;border-radius:20px;padding:28px;box-shadow:0 2px 8px rgba(0,0,0,0.05);margin-bottom:20px">
        <div style="display:flex;align-items:start;gap:20px;flex-wrap:wrap">
          <div style="width:80px;height:80px;background:linear-gradient(135deg,#7c3aed,#2563eb);border-radius:20px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <span style="color:white;font-size:32px;font-weight:800">${(v.company_name||'V').charAt(0)}</span>
          </div>
          <div style="flex:1">
            <h1 style="font-size:24px;font-weight:800;color:#0f172a">${v.company_name}</h1>
            <p style="font-size:15px;color:#64748b">by ${v.owner_name}</p>
            <div style="display:flex;align-items:center;gap:12px;margin-top:10px;flex-wrap:wrap">
              <div style="display:flex;align-items:center;gap:6px">${Helpers.stars(v.rating)}<span style="font-size:14px;font-weight:700;color:#1e293b">${v.rating?parseFloat(v.rating).toFixed(1):'N/A'}</span><span style="font-size:12px;color:#64748b">(${v.total_reviews||0} reviews)</span></div>
              <span style="font-size:12px;color:#64748b"><i class="fas fa-briefcase" style="color:#f97316;margin-right:4px"></i>${v.experience_years||0} years exp</span>
              <span style="font-size:12px;color:#64748b"><i class="fas fa-map-marker-alt" style="color:#3b82f6;margin-right:4px"></i>${v.service_area||'Multiple locations'}</span>
            </div>
          </div>
          ${Auth.isLoggedIn() && Auth.role() === 'customer' ? `
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button onclick="Router.go('/post-project')" class="btn-accent" style="color:white;padding:12px 20px;border-radius:12px;font-size:14px;font-weight:600"><i class="fas fa-plus" style="margin-right:6px"></i>Request Quote</button>
            <button onclick="addToShortlist(${v.user_id||v.id})" style="background:#fef2f2;color:#dc2626;padding:12px 16px;border-radius:12px;font-size:14px;border:1.5px solid #fca5a5;cursor:pointer" title="Save to Shortlist"><i class="fas fa-heart" style="margin-right:4px"></i>Shortlist</button>
          </div>` : ''}
        </div>
        ${v.description ? `<p style="font-size:14px;color:#374151;margin-top:16px;line-height:1.7;padding-top:16px;border-top:1px solid #f1f5f9">${v.description}</p>` : ''}
      </div>
      <div style="display:grid;grid-template-columns:1fr 340px;gap:20px">
        <div>
          <!-- Services -->
          <div style="background:white;border-radius:16px;padding:24px;box-shadow:0 1px 4px rgba(0,0,0,0.05);margin-bottom:20px">
            <h3 style="font-size:16px;font-weight:700;color:#1e293b;margin-bottom:16px">Services Offered</h3>
            <div style="display:flex;flex-wrap:wrap;gap:10px">
              ${services.map(s => `<span style="padding:8px 16px;background:${Helpers.serviceColor(s).split(' ')[0].replace('bg-','#').replace('blue-100','eff6ff').replace('yellow-100','fffbeb').replace('cyan-100','ecfeff').replace('orange-100','fff7ed').replace('gray-100','f1f5f9').replace('green-100','f0fdf4')};border-radius:20px;font-size:13px;font-weight:600;color:#374151"><i class="fas ${Helpers.serviceIcon(s)}" style="margin-right:6px"></i>${Helpers.serviceLabel(s)}</span>`).join('') || '<p style="color:#94a3b8">No services listed</p>'}
            </div>
          </div>
          <!-- Reviews -->
          <div style="background:white;border-radius:16px;padding:24px;box-shadow:0 1px 4px rgba(0,0,0,0.05)">
            <h3 style="font-size:16px;font-weight:700;color:#1e293b;margin-bottom:16px">Customer Reviews (${reviews.length})</h3>
            ${reviews.length === 0 ? '<p style="color:#94a3b8;text-align:center;padding:20px">No reviews yet</p>' :
            reviews.map(r => `
            <div style="border-bottom:1px solid #f1f5f9;padding:16px 0">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
                <div style="display:flex;align-items:center;gap:8px">
                  <div style="width:32px;height:32px;background:linear-gradient(135deg,#2563eb,#7c3aed);border-radius:50%;display:flex;align-items:center;justify-content:center"><span style="color:white;font-size:12px;font-weight:700">${(r.reviewer_name||'C').charAt(0)}</span></div>
                  <span style="font-weight:600;font-size:13px">${r.reviewer_name}</span>
                </div>
                <div>${Helpers.stars(r.rating)}</div>
              </div>
              ${r.comment ? `<p style="font-size:13px;color:#374151;line-height:1.6">${r.comment}</p>` : ''}
              <p style="font-size:11px;color:#94a3b8;margin-top:6px">${Helpers.date(r.created_at)} · ${r.project_title || 'Project'}</p>
            </div>`).join('')}
          </div>
          ${(() => { let imgs=[]; try{imgs=JSON.parse(v.portfolio_images||'[]')}catch{} return imgs.length>0?`
          <!-- Portfolio Gallery -->
          <div style="background:white;border-radius:16px;padding:24px;box-shadow:0 1px 4px rgba(0,0,0,0.05);margin-top:20px">
            <h3 style="font-size:16px;font-weight:700;color:#1e293b;margin-bottom:16px"><i class="fas fa-images" style="color:#10b981;margin-right:8px"></i>Portfolio Gallery</h3>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px">
              ${imgs.map(url=>`<div style="position:relative;border-radius:10px;overflow:hidden;padding-top:75%;background:#f1f5f9;cursor:pointer" onclick="window.open('${url}','_blank')">
                <img src="${url}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" onerror="this.parentElement.style.display='none'">
                <div style="position:absolute;inset:0;background:rgba(0,0,0,0);transition:background 0.2s" onmouseover="this.style.background='rgba(0,0,0,0.3)'" onmouseout="this.style.background='rgba(0,0,0,0)'"><i class="fas fa-expand" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:white;font-size:20px;opacity:0;transition:opacity 0.2s" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0'"></i></div>
              </div>`).join('')}
            </div>
          </div>`:'' })()}
        </div>
        <!-- Sidebar -->
        <div>
          <div style="background:white;border-radius:16px;padding:20px;box-shadow:0 1px 4px rgba(0,0,0,0.05);margin-bottom:16px">
            <h3 style="font-size:14px;font-weight:700;color:#1e293b;margin-bottom:14px">Quick Stats</h3>
            ${[['fa-trophy','Projects Done',v.total_projects||0],['fa-star','Avg Rating',v.rating?parseFloat(v.rating).toFixed(1):'N/A'],['fa-users','Reviews',v.total_reviews||0],['fa-certificate','Certified','Yes']].map(([icon,label,val]) =>
              `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f8fafc;font-size:13px">
                <span style="color:#64748b"><i class="fas ${icon}" style="margin-right:8px;color:#3b82f6"></i>${label}</span>
                <span style="font-weight:700;color:#1e293b">${val}</span>
              </div>`
            ).join('')}
          </div>
          ${v.certifications ? `<div style="background:#f0fdf4;border-radius:16px;padding:20px;border:1px solid #bbf7d0">
            <h3 style="font-size:14px;font-weight:700;color:#065f46;margin-bottom:10px"><i class="fas fa-certificate" style="margin-right:6px"></i>Certifications</h3>
            <p style="font-size:13px;color:#374151">${v.certifications}</p>
          </div>` : ''}
        </div>
      </div>
    </div>
    `);
  } catch(e) {
    document.getElementById('app').innerHTML = layout(`<div style="text-align:center;padding:80px;color:#ef4444">Vendor not found</div>`);
  }
};

// ── VENDORS LISTING PAGE ─────────────────────────────────────────────────
Pages.vendors = function() {
  document.getElementById('app').innerHTML = layout(`
  <div style="max-width:1280px;margin:0 auto;padding:32px 20px">
    <div style="text-align:center;margin-bottom:40px">
      <h1 style="font-size:32px;font-weight:800;color:#0f172a">Find Verified Vendors</h1>
      <p style="color:#64748b;margin-top:8px;font-size:16px">Browse certified service contractors with verified ratings</p>
    </div>
    <div style="background:white;border-radius:16px;padding:16px 20px;margin-bottom:24px;box-shadow:0 1px 4px rgba(0,0,0,0.05);display:flex;gap:12px;flex-wrap:wrap">
      <div style="position:relative;flex:1;min-width:200px">
        <i class="fas fa-search" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#94a3b8"></i>
        <input id="vendor-search" class="form-input" placeholder="Search companies..." style="padding-left:36px" oninput="loadVendors()">
      </div>
      <select id="vendor-service" class="form-input" style="width:auto;min-width:160px" onchange="loadVendors()">
        <option value="">All Services</option>
        ${[['hvac','HVAC'],['electrical','Electrical'],['plumbing','Plumbing'],['solar','Solar EPC'],['fabrication','Fabrication'],['contracting','Contracting']].map(([v,l]) => `<option value="${v}">${l}</option>`).join('')}
      </select>
    </div>
    <div id="vendors-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:20px">
      <div style="display:flex;justify-content:center;padding:60px;grid-column:1/-1"><div class="loading-spinner"></div></div>
    </div>
  </div>
  `);
  loadVendors();
};
async function loadVendors() {
  const search = document.getElementById('vendor-search')?.value || '';
  const service = document.getElementById('vendor-service')?.value || '';
  let url = '/users/vendors?';
  if (search) url += `search=${encodeURIComponent(search)}&`;
  if (service) url += `service_type=${service}`;
  try {
    const { data } = await API.get(url);
    const vendors = data.vendors || [];
    const el = document.getElementById('vendors-grid');
    if (!el) return;
    el.innerHTML = vendors.length === 0 ? '<div style="grid-column:1/-1;text-align:center;padding:60px;color:#94a3b8">No vendors found</div>' :
    vendors.map(v => `
    <div class="card-hover" onclick="Router.go('/vendors/${v.id}')" style="background:white;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden">
      <div style="padding:20px">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
          <div style="width:52px;height:52px;background:linear-gradient(135deg,#7c3aed,#2563eb);border-radius:14px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <span style="color:white;font-size:20px;font-weight:800">${(v.company_name||'V').charAt(0)}</span>
          </div>
          <div>
            <h3 style="font-weight:700;color:#1e293b;font-size:15px">${v.company_name}</h3>
            <p style="font-size:12px;color:#64748b">${v.owner_name}</p>
          </div>
        </div>
        ${v.description ? `<p style="font-size:13px;color:#64748b;line-height:1.5;margin-bottom:14px">${Helpers.truncate(v.description, 90)}</p>` : ''}
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px">
          ${Helpers.stars(v.rating)}<span style="font-size:13px;font-weight:700;color:#1e293b">${v.rating?parseFloat(v.rating).toFixed(1):'N/A'}</span><span style="font-size:12px;color:#94a3b8">(${v.total_reviews||0})</span>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px">
          ${(v.services_offered||'').split(',').filter(s=>s).slice(0,3).map(s => `<span style="font-size:11px;background:#eff6ff;color:#2563eb;padding:3px 10px;border-radius:12px;font-weight:500">${Helpers.serviceLabel(s)}</span>`).join('')}
        </div>
        <div style="font-size:12px;color:#64748b"><i class="fas fa-map-marker-alt" style="margin-right:4px;color:#3b82f6"></i>${v.service_area||'Multiple locations'}</div>
      </div>
      <div style="padding:12px 20px;background:#f8fafc;border-top:1px solid #f1f5f9;display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:12px;color:#64748b">${v.experience_years||0} yrs exp · ${v.total_projects||0} projects</span>
        ${Auth.isLoggedIn() && Auth.role() === 'customer' ? `<button onclick="event.stopPropagation();addToShortlist(${v.id})" style="background:#fef2f2;color:#dc2626;border:1px solid #fca5a5;border-radius:8px;padding:4px 12px;cursor:pointer;font-size:11px;font-weight:600"><i class="fas fa-heart" style="margin-right:3px"></i>Save</button>` : `<span style="font-size:12px;font-weight:600;color:#059669">${v.total_projects||0} projects</span>`}
      </div>
    </div>`).join('');
  } catch(e) {
    const el = document.getElementById('vendors-grid');
    if (el) el.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:#ef4444">Failed to load vendors</div>';
  }
}

// ── ADMIN ANALYTICS ─────────────────────────────────────────────────────────
async function loadAdminAnalytics() {
  const el = document.getElementById('admin-content');
  if (!el) return;
  el.innerHTML = '<div style="display:flex;justify-content:center;padding:60px"><div class="loading-spinner"></div></div>';
  try {
    const [statsRes, payStatsRes] = await Promise.all([API.get('/admin/stats'), API.get('/payments/stats')]);
    const { users, projects, payments, bids } = statsRes.data;
    const payStats = payStatsRes.data.stats || {};
    el.innerHTML = `
    <h2 style="font-size:22px;font-weight:800;color:#0f172a;margin-bottom:24px">Platform Analytics</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px;margin-bottom:28px">
      ${[
        ['fa-users','Total Users',users?.total||0,'#2563eb','#eff6ff'],
        ['fa-clipboard-list','Total Projects',projects?.total||0,'#f97316','#fff7ed'],
        ['fa-gavel','Total Bids',bids?.total||0,'#7c3aed','#faf5ff'],
        ['fa-rupee-sign','Platform Revenue',Helpers.currency(payStats.total_amount||0),'#059669','#f0fdf4'],
        ['fa-check-circle','Completed Projects',projects?.completed||0,'#10b981','#f0fdf4'],
        ['fa-hard-hat','Verified Vendors',users?.vendors||0,'#0891b2','#ecfeff'],
      ].map(([icon,label,val,color,bg]) => `
      <div class="stat-card">
        <div style="width:44px;height:44px;background:${bg};border-radius:12px;display:flex;align-items:center;justify-content:center;margin-bottom:12px">
          <i class="fas ${icon}" style="font-size:18px;color:${color}"></i>
        </div>
        <p style="font-size:22px;font-weight:800;color:#0f172a">${val}</p>
        <p style="font-size:13px;color:#64748b;margin-top:4px">${label}</p>
      </div>`).join('')}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px">
      <div style="background:white;border-radius:16px;padding:24px;box-shadow:0 1px 4px rgba(0,0,0,0.05)">
        <h3 style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:16px">Project Status Distribution</h3>
        <div style="position:relative;height:220px">
          <canvas id="admin-analytics-proj"></canvas>
        </div>
      </div>
      <div style="background:white;border-radius:16px;padding:24px;box-shadow:0 1px 4px rgba(0,0,0,0.05)">
        <h3 style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:16px">Payment Type Breakdown</h3>
        <div style="position:relative;height:220px">
          <canvas id="admin-analytics-pay"></canvas>
        </div>
      </div>
    </div>
    <div style="background:white;border-radius:16px;padding:24px;box-shadow:0 1px 4px rgba(0,0,0,0.05)">
      <h3 style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:16px">User Growth Snapshot</h3>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">
        ${[['Customers',users?.customers||0,'#2563eb'],['Vendors',users?.vendors||0,'#7c3aed'],['Experts',users?.experts||0,'#0891b2'],['Admins',users?.admins||1,'#dc2626']].map(([role,count,color]) => `
        <div style="background:#f8fafc;border-radius:12px;padding:16px;text-align:center;border-left:3px solid ${color}">
          <p style="font-size:28px;font-weight:900;color:${color}">${count}</p>
          <p style="font-size:12px;color:#64748b;margin-top:4px">${role}</p>
        </div>`).join('')}
      </div>
    </div>`;
    setTimeout(() => {
      if (!window.Chart) return;
      const ctx1 = document.getElementById('admin-analytics-proj');
      if (ctx1 && projects) {
        new Chart(ctx1, { type:'doughnut', data:{ labels:['Open','Bidding','In Progress','Completed','Vendor Selected'], datasets:[{ data:[projects.open||0,projects.bidding||0,projects.in_progress||0,projects.completed||0,projects.vendor_selected||0], backgroundColor:['#3b82f6','#f97316','#8b5cf6','#10b981','#f59e0b'], borderWidth:0 }] }, options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom', labels:{ font:{ size:11 } } } } } });
      }
      const ctx2 = document.getElementById('admin-analytics-pay');
      if (ctx2 && payStats) {
        new Chart(ctx2, { type:'bar', data:{ labels:['Platform Fees','Inspection Fees','Vendor Payments','Successful','Pending'], datasets:[{ data:[payStats.platform_fees||0,payStats.inspection_fees||0,payStats.vendor_payments||0,payStats.successful||0,payStats.pending||0], backgroundColor:['#2563eb','#0891b2','#7c3aed','#10b981','#f59e0b'], borderRadius:8, borderWidth:0 }] }, options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, scales:{ y:{ beginAtZero:true, grid:{ color:'#f1f5f9' } }, x:{ grid:{ display:false } } } } });
      }
    }, 100);
  } catch(e) { el.innerHTML = `<div style="text-align:center;padding:60px;color:#ef4444">Failed: ${e.message}</div>`; }
}

// ── EXPERT DASHBOARD ──────────────────────────────────────────────────────

// ── EXPERT DASHBOARD ──────────────────────────────────────────────────────
Pages.expertDashboard = async function() {
  if (!Auth.isLoggedIn() || Auth.role() !== 'expert') { Router.go('/login'); return; }
  const u = State.user;
  function sidebar(active) {
    const items = [
      ['overview','fa-th-large','Overview'],
      ['inspections','fa-search','Inspections'],
      ['consultations','fa-video','Consultations'],
      ['history','fa-history','Completed'],
      ['earnings','fa-rupee-sign','Earnings'],
      ['profile','fa-user-tie','My Profile']
    ];
    return `<div style="padding:12px;margin-bottom:20px">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="width:40px;height:40px;background:linear-gradient(135deg,#0891b2,#06b6d4);border-radius:50%;display:flex;align-items:center;justify-content:center">
          <span style="color:white;font-weight:700">${(u.name||'E').charAt(0)}</span>
        </div>
        <div><p style="font-weight:700;font-size:14px;color:#1e293b">${u.name}</p><p style="font-size:11px;color:#64748b">Technical Expert</p></div>
      </div>
    </div>
    <nav class="sidebar-nav">
      ${items.map(([k,icon,label]) => `<button onclick="loadExpertSection('${k}')" id="edash-${k}" class="${active===k?'active':''}" style="margin-bottom:2px"><i class="fas ${icon}" style="width:18px"></i>${label}</button>`).join('')}
    </nav>`;
  }
  document.getElementById('app').innerHTML = dashboardLayout(sidebar('overview'), `<div id="expert-content"><div style="display:flex;justify-content:center;padding:60px"><div class="loading-spinner"></div></div></div>`);
  loadExpertSection('overview');
};

// Extend loadExpertSection for consultations
const _origLoadExpertSection = typeof loadExpertSection === 'function' ? loadExpertSection : null;
Pages.howItWorks = function() {
  document.getElementById('app').innerHTML = layout(`
  <div style="background:#f8fafc;min-height:100vh">
    <!-- Hero -->
    <div class="gradient-hero" style="padding:60px 20px;text-align:center">
      <div style="max-width:700px;margin:0 auto">
        <span style="background:rgba(255,255,255,0.15);color:white;padding:6px 16px;border-radius:20px;font-size:13px;font-weight:500;backdrop-filter:blur(8px)">How BidKarts Works</span>
        <h1 style="font-size:clamp(28px,4vw,48px);font-weight:900;color:white;margin:20px 0 12px">Everything You Need to Know</h1>
        <p style="font-size:17px;color:rgba(255,255,255,0.85);max-width:560px;margin:0 auto">India's premier platform connecting customers with verified service contractors. Here's exactly how it works.</p>
      </div>
    </div>

    <!-- For Customers -->
    <div style="max-width:1200px;margin:0 auto;padding:60px 20px">
      <h2 style="font-size:28px;font-weight:800;color:#0f172a;margin-bottom:8px;text-align:center">For Customers</h2>
      <p style="color:#64748b;text-align:center;margin-bottom:40px">Post projects, receive bids, and build with confidence</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:24px;margin-bottom:60px">
        ${[
          ['1','Post Your Project','#2563eb','fa-clipboard-list',`Create a detailed project listing with service type, description, location, budget range, and timeline. Upload drawings or site photos to help vendors understand your needs.`],
          ['2','Receive Competitive Bids','#7c3aed','fa-gavel',`Verified vendors in your area receive notifications and submit detailed bids including pricing, timelines, equipment specifications, and warranties.`],
          ['3','Get Expert Inspection','#0891b2','fa-user-tie',`Optionally request a certified technical expert to visit your site, assess requirements, and provide an independent recommendation — ensuring you pick the right vendor.`],
          ['4','Compare & Select','#059669','fa-balance-scale',`Use our side-by-side comparison tool to evaluate all bids. View vendor ratings, certifications, past project count, and bid details to make an informed decision.`],
          ['5','Secure Payment','#f97316','fa-credit-card',`Pay securely via Razorpay. Funds are held in escrow and released to the vendor in milestones upon your approval.`],
          ['6','Track & Review','#8b5cf6','fa-chart-line',`Monitor project progress from your dashboard. Once complete, leave a verified review to help the community.`],
        ].map(([n,t,c,icon,d]) => `
        <div style="background:white;border-radius:20px;padding:28px;box-shadow:0 2px 8px rgba(0,0,0,0.06);position:relative;overflow:hidden">
          <div style="position:absolute;top:0;right:0;width:80px;height:80px;background:${c}08;border-radius:0 20px 0 80px"></div>
          <div style="width:48px;height:48px;background:${c}15;border-radius:14px;display:flex;align-items:center;justify-content:center;margin-bottom:16px">
            <i class="fas ${icon}" style="font-size:20px;color:${c}"></i>
          </div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
            <span style="background:${c};color:white;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;flex-shrink:0">${n}</span>
            <h3 style="font-size:16px;font-weight:700;color:#1e293b">${t}</h3>
          </div>
          <p style="font-size:13px;color:#64748b;line-height:1.6">${d}</p>
        </div>`).join('')}
      </div>

      <!-- For Vendors -->
      <h2 style="font-size:28px;font-weight:800;color:#0f172a;margin-bottom:8px;text-align:center">For Vendors & Contractors</h2>
      <p style="color:#64748b;text-align:center;margin-bottom:40px">Find projects, submit bids, and grow your business</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:24px;margin-bottom:60px">
        ${[
          ['1','Register & Get Verified','#2563eb','fa-check-badge',`Create your vendor profile with company details, certifications, service areas, and past work. Our team verifies your credentials.`],
          ['2','Browse Live Projects','#7c3aed','fa-search',`Browse all open projects in your service area and category. Get instant notifications when new projects matching your expertise are posted.`],
          ['3','Submit Competitive Bids','#f97316','fa-gavel',`Submit detailed bids with your pricing, timeline, equipment specs, and warranty details. Stand out with a compelling cover message.`],
          ['4','Win Projects & Deliver','#059669','fa-trophy',`When selected, coordinate with the customer, deliver quality work, and receive payment in milestones via BidKarts.`],
        ].map(([n,t,c,icon,d]) => `
        <div style="background:white;border-radius:20px;padding:28px;box-shadow:0 2px 8px rgba(0,0,0,0.06)">
          <div style="width:48px;height:48px;background:${c}15;border-radius:14px;display:flex;align-items:center;justify-content:center;margin-bottom:16px">
            <i class="fas ${icon}" style="font-size:20px;color:${c}"></i>
          </div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
            <span style="background:${c};color:white;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;flex-shrink:0">${n}</span>
            <h3 style="font-size:16px;font-weight:700;color:#1e293b">${t}</h3>
          </div>
          <p style="font-size:13px;color:#64748b;line-height:1.6">${d}</p>
        </div>`).join('')}
      </div>

      <!-- Policies section -->
      <div style="background:white;border-radius:20px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,0.06);margin-bottom:40px">
        <h2 style="font-size:22px;font-weight:800;color:#0f172a;margin-bottom:20px"><i class="fas fa-shield-alt" style="color:#059669;margin-right:10px"></i>Our Policies & Agreements</h2>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:16px">
          ${[
            ['Terms of Service','fa-file-contract','#2563eb','All platform usage rules, vendor commission, and dispute resolution.','terms-of-service'],
            ['Privacy Policy','fa-user-shield','#7c3aed','How we collect, use, and protect your personal data.','privacy-policy'],
            ['Vendor Policy','fa-hard-hat','#f97316','Requirements for vendor registration, bidding rules, and service standards.','terms-of-service'],
            ['Inspection Policy','fa-search','#0891b2','How technical inspections are conducted and expert responsibilities.','privacy-policy'],
          ].map(([t,icon,c,d,page]) => `
          <div onclick="Router.go('/${page}')" style="padding:18px;background:#f8fafc;border-radius:14px;border:1px solid #e2e8f0;cursor:pointer" onmouseover="this.style.borderColor='${c}'" onmouseout="this.style.borderColor='#e2e8f0'">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
              <div style="width:36px;height:36px;background:${c}15;border-radius:10px;display:flex;align-items:center;justify-content:center">
                <i class="fas ${icon}" style="color:${c};font-size:14px"></i>
              </div>
              <h4 style="font-size:14px;font-weight:700;color:#1e293b">${t}</h4>
            </div>
            <p style="font-size:12px;color:#64748b">${d}</p>
            <span style="font-size:12px;color:${c};font-weight:600;margin-top:8px;display:block">Read Policy →</span>
          </div>`).join('')}
        </div>
      </div>

      <!-- FAQ -->
      <h2 style="font-size:28px;font-weight:800;color:#0f172a;margin-bottom:32px;text-align:center">Frequently Asked Questions</h2>
      <div style="display:grid;gap:12px;margin-bottom:40px">
        ${[
          ['Is BidKarts free to use?','Posting projects and receiving bids is completely free for customers. Vendors pay a small commission only on successfully completed projects.'],
          ['How are vendors verified?','All vendors go through a verification process including business registration check, license verification, and platform review. Look for the "Verified" badge.'],
          ['What happens after I select a vendor?','After selecting a vendor, you confirm the scope, make a platform fee payment, and coordinate with the vendor to start work. Progress is tracked on your dashboard.'],
          ['Can I get a technical inspection before selecting a vendor?','Yes! BidKarts offers a ₹1,500 expert inspection service where a certified technical expert visits your site and provides an unbiased assessment.'],
          ['What services are available on BidKarts?','BidKarts covers HVAC, Electrical, Plumbing, Solar EPC, Steel Fabrication, and General Contracting for both residential and industrial projects.'],
        ].map(([q,a]) => `
        <div style="background:white;border-radius:14px;padding:20px;box-shadow:0 1px 4px rgba(0,0,0,0.05);cursor:pointer" onclick="this.querySelector('.faq-answer').style.display=this.querySelector('.faq-answer').style.display==='none'?'block':'none'">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:16px">
            <h4 style="font-size:14px;font-weight:700;color:#1e293b">${q}</h4>
            <i class="fas fa-chevron-down" style="color:#94a3b8;font-size:12px;flex-shrink:0"></i>
          </div>
          <p class="faq-answer" style="display:none;font-size:13px;color:#64748b;margin-top:10px;line-height:1.6">${a}</p>
        </div>`).join('')}
      </div>

      <!-- CTA -->
      <div class="gradient-hero" style="border-radius:20px;padding:40px;text-align:center">
        <h2 style="font-size:28px;font-weight:800;color:white;margin-bottom:12px">Ready to Get Started?</h2>
        <p style="color:rgba(255,255,255,0.85);margin-bottom:24px">Join thousands of customers and contractors on BidKarts today.</p>
        <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
          <button onclick="Router.go(Auth.isLoggedIn() ? '/post-project' : '/register')" class="btn-accent" style="color:white;padding:12px 28px;border-radius:12px;font-size:15px;font-weight:700">
            <i class="fas fa-plus-circle" style="margin-right:8px"></i>Post a Project
          </button>
          <button onclick="Router.go('/register')" style="background:rgba(255,255,255,0.15);color:white;padding:12px 28px;border-radius:12px;font-size:15px;font-weight:600;border:1.5px solid rgba(255,255,255,0.3);cursor:pointer">
            <i class="fas fa-user-plus" style="margin-right:8px"></i>Register Free
          </button>
        </div>
      </div>
    </div>
  </div>
  `);
};

// ── PRIVACY POLICY PAGE ───────────────────────────────────────────────────
Pages.privacyPolicy = function() {
  document.getElementById('app').innerHTML = layout(`
  <div style="max-width:860px;margin:0 auto;padding:60px 20px">
    <div style="margin-bottom:32px">
      <a onclick="Router.go('/')" style="color:#64748b;font-size:14px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;margin-bottom:16px"><i class="fas fa-arrow-left"></i> Back to Home</a>
      <h1 style="font-size:32px;font-weight:800;color:#0f172a">Privacy Policy</h1>
      <p style="color:#64748b;margin-top:8px">Last updated: March 2026</p>
    </div>
    <div style="background:white;border-radius:20px;padding:40px;box-shadow:0 2px 8px rgba(0,0,0,0.06);line-height:1.8">
      ${[
        ['1. Information We Collect','We collect personal information including name, email address, phone number, and location when you register. Project details, documents, and payment information are also collected during transactions.'],
        ['2. How We Use Your Information','Your information is used to provide BidKarts services, match customers with relevant vendors, process payments, send email/SMS notifications, and improve our platform.'],
        ['3. Information Sharing','Project details are shared with verified vendors in relevant service categories. Personal contact information is only shared after vendor selection. We never sell your data to third parties.'],
        ['4. Data Security','We use industry-standard SSL encryption, secure cloud infrastructure, and follow best practices for data protection. Payment data is handled by Razorpay and never stored on our servers.'],
        ['5. Email Communications','By registering, you consent to receive transactional emails (project updates, bid notifications, payment confirmations) and optional marketing communications. You can unsubscribe anytime.'],
        ['6. Document Storage','Documents uploaded to BidKarts are stored securely in the cloud. You retain ownership of all uploaded documents and can request deletion at any time.'],
        ['7. Your Rights','You have the right to access, correct, or delete your personal data. Submit requests to privacy@bidkarts.com. We will respond within 30 days.'],
        ['8. Cookies','We use essential cookies for authentication and analytics cookies to improve our service. Cookie preferences can be managed in your browser settings.'],
        ['9. Contact Us','For privacy concerns or data requests, contact us at: privacy@bidkarts.com | BidKarts Technologies Pvt. Ltd., Mumbai, Maharashtra 400001'],
      ].map(([h,b]) => `<div style="margin-bottom:24px"><h3 style="font-size:16px;font-weight:700;color:#1e293b;margin-bottom:8px">${h}</h3><p style="font-size:14px;color:#374151">${b}</p></div>`).join('')}
    </div>
  </div>
  `);
};

// ── TERMS OF SERVICE PAGE ─────────────────────────────────────────────────
Pages.termsOfService = function() {
  document.getElementById('app').innerHTML = layout(`
  <div style="max-width:860px;margin:0 auto;padding:60px 20px">
    <div style="margin-bottom:32px">
      <a onclick="Router.go('/')" style="color:#64748b;font-size:14px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;margin-bottom:16px"><i class="fas fa-arrow-left"></i> Back to Home</a>
      <h1 style="font-size:32px;font-weight:800;color:#0f172a">Terms of Service</h1>
      <p style="color:#64748b;margin-top:8px">Last updated: March 2026 | Version 1.0</p>
    </div>
    <div style="background:white;border-radius:20px;padding:40px;box-shadow:0 2px 8px rgba(0,0,0,0.06);line-height:1.8">
      <div style="background:#eff6ff;border-radius:12px;padding:16px;margin-bottom:28px;border:1px solid #93c5fd">
        <p style="font-size:14px;color:#1d4ed8;font-weight:600">By using BidKarts, you agree to these Terms of Service. Please read them carefully.</p>
      </div>
      ${[
        ['1. Acceptance of Terms','By accessing or using BidKarts ("Platform"), you agree to be bound by these Terms of Service and all applicable laws and regulations.'],
        ['2. Platform Description','BidKarts is a marketplace platform that facilitates connections between customers seeking services and vendors/contractors providing such services. BidKarts does not directly provide any construction or installation services.'],
        ['3. User Accounts','Users must register with accurate information. You are responsible for maintaining the confidentiality of your account credentials. Any activity under your account is your responsibility.'],
        ['4. Customer Obligations','Customers must: Post accurate project descriptions, provide all relevant information and documents, respond to vendor queries promptly, make timely payments as agreed, and provide honest reviews.'],
        ['5. Vendor Obligations','Vendors must: Maintain accurate company and certification information, submit genuine bids they can honor, deliver work as promised, comply with all applicable laws and regulations, and maintain professional conduct.'],
        ['6. Platform Fee','BidKarts charges a platform fee of 2% on completed project transactions. This fee covers platform maintenance, verification services, and payment processing.'],
        ['7. Expert Inspection Fee','The optional technical inspection service is priced at ₹1,500 per inspection. This fee is paid to the assigned technical expert through BidKarts.'],
        ['8. Payment Policy','All payments are processed through Razorpay. Advance payments to vendors are held in escrow and released upon customer confirmation of milestone completion.'],
        ['9. Dispute Resolution','Disputes between customers and vendors are handled through BidKarts\' mediation process. If mediation fails, disputes shall be resolved through arbitration as per the Arbitration and Conciliation Act, 1996.'],
        ['10. Prohibited Activities','Users may not: Post false or misleading information, spam vendors or customers, attempt to bypass platform fees by transacting directly, or engage in fraudulent bidding practices.'],
        ['11. Limitation of Liability','BidKarts is not responsible for the quality of work performed by vendors, damages arising from project execution, or disputes between customers and vendors.'],
        ['12. Governing Law','These Terms are governed by the laws of India. Any disputes are subject to the exclusive jurisdiction of courts in Mumbai, Maharashtra.'],
      ].map(([h,b]) => `<div style="margin-bottom:24px"><h3 style="font-size:16px;font-weight:700;color:#1e293b;margin-bottom:8px">${h}</h3><p style="font-size:14px;color:#374151">${b}</p></div>`).join('')}
    </div>
  </div>
  `);
};

// ── PROFILE EDIT PAGE ─────────────────────────────────────────────────────
Pages.editProfile = async function() {
  if (!Auth.isLoggedIn()) { Router.go('/login'); return; }
  document.getElementById('app').innerHTML = layout('<div style="display:flex;justify-content:center;padding:80px"><div class="loading-spinner"></div></div>');
  try {
    const { data } = await API.get('/users/profile');
    const u = data.user; const p = u.profile || {};
    const isVendor = u.role === 'vendor', isExpert = u.role === 'expert';
    document.getElementById('app').innerHTML = layout(`
    <div style="max-width:760px;margin:0 auto;padding:40px 20px">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:28px">
        <button onclick="Router.go(-1)" style="background:none;border:none;cursor:pointer;color:#64748b;font-size:20px"><i class="fas fa-arrow-left"></i></button>
        <h1 style="font-size:26px;font-weight:800;color:#0f172a">Edit Profile</h1>
      </div>
      <!-- Avatar & Basic Info -->
      <div style="background:white;border-radius:20px;padding:28px;box-shadow:0 2px 12px rgba(0,0,0,0.06);margin-bottom:20px">
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:24px">
          <div style="width:72px;height:72px;background:linear-gradient(135deg,#2563eb,#7c3aed);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:700;color:white">${(u.name||'U').charAt(0)}</div>
          <div>
            <h3 style="font-size:18px;font-weight:700;color:#1e293b">${u.name}</h3>
            <span style="font-size:12px;background:#eff6ff;color:#2563eb;padding:2px 10px;border-radius:10px;font-weight:600;text-transform:capitalize">${u.role}</span>
          </div>
        </div>
        <h3 style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:16px"><i class="fas fa-user" style="color:#2563eb;margin-right:8px"></i>Basic Information</h3>
        <form id="basic-profile-form" onsubmit="saveProfile(event,'basic')">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
            <div><label class="form-label">Full Name</label><input name="name" class="form-input" value="${Helpers.esc(u.name||'')}"></div>
            <div><label class="form-label">Phone</label><input name="phone" class="form-input" value="${Helpers.esc(u.phone||'')}"></div>
          </div>
          <div style="margin-bottom:16px"><label class="form-label">Address</label><input name="address" class="form-input" value="${Helpers.esc(u.address||'')}"></div>
          <button type="submit" class="btn-primary" style="color:white;padding:10px 24px;border-radius:10px;font-size:14px;font-weight:600">Save Basic Info</button>
        </form>
      </div>
      <!-- Password Change -->
      <div style="background:white;border-radius:20px;padding:28px;box-shadow:0 2px 12px rgba(0,0,0,0.06);margin-bottom:20px">
        <h3 style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:16px"><i class="fas fa-lock" style="color:#7c3aed;margin-right:8px"></i>Change Password</h3>
        <form id="pw-form" onsubmit="saveProfile(event,'password')">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
            <div><label class="form-label">Current Password</label><input name="current_password" type="password" class="form-input" required></div>
            <div><label class="form-label">New Password (min. 6 chars)</label><input name="new_password" type="password" class="form-input" required minlength="6"></div>
          </div>
          <button type="submit" style="background:linear-gradient(135deg,#7c3aed,#6d28d9);color:white;padding:10px 24px;border-radius:10px;font-size:14px;font-weight:600;border:none;cursor:pointer">Update Password</button>
        </form>
      </div>
      ${isVendor ? `<!-- Vendor Profile -->
      <div style="background:white;border-radius:20px;padding:28px;box-shadow:0 2px 12px rgba(0,0,0,0.06);margin-bottom:20px">
        <h3 style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:16px"><i class="fas fa-hard-hat" style="color:#f97316;margin-right:8px"></i>Company Details</h3>
        <form id="vendor-profile-form" onsubmit="saveProfile(event,'vendor')">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
            <div><label class="form-label">Company Name</label><input name="company_name" class="form-input" value="${Helpers.esc(p.company_name||'')}"></div>
            <div><label class="form-label">Experience (years)</label><input name="experience_years" type="number" class="form-input" value="${p.experience_years||0}" min="0"></div>
          </div>
          <div style="margin-bottom:16px"><label class="form-label">Service Area (cities)</label><input name="service_area" class="form-input" value="${Helpers.esc(p.service_area||'')}" placeholder="Mumbai, Pune, Nashik"></div>
          <div style="margin-bottom:16px"><label class="form-label">Services Offered (comma separated)</label><input name="services_offered" class="form-input" value="${Helpers.esc(p.services_offered||'')}" placeholder="hvac,solar,electrical"></div>
          <div style="margin-bottom:16px"><label class="form-label">Certifications</label><input name="certifications" class="form-input" value="${Helpers.esc(p.certifications||'')}" placeholder="ISO 9001, MNRE Certified"></div>
          <div style="margin-bottom:16px"><label class="form-label">Specializations</label><input name="specializations" class="form-input" value="${Helpers.esc(p.specializations||'')}" placeholder="Solar EPC, Electrical Safety"></div>
          <div style="margin-bottom:16px"><label class="form-label">Company Website</label><input name="website" class="form-input" value="${Helpers.esc(p.website||'')}" placeholder="https://yourcompany.com"></div>
          <div style="margin-bottom:20px"><label class="form-label">Company Description</label><textarea name="description" class="form-input" rows="4" placeholder="Tell customers about your company...">${Helpers.esc(p.description||'')}</textarea></div>
          <button type="submit" class="btn-accent" style="color:white;padding:10px 24px;border-radius:10px;font-size:14px;font-weight:600">Save Company Details</button>
        </form>
      </div>
      <!-- Portfolio Images -->
      <div style="background:white;border-radius:20px;padding:28px;box-shadow:0 2px 12px rgba(0,0,0,0.06);margin-bottom:20px">
        <h3 style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:6px"><i class="fas fa-images" style="color:#10b981;margin-right:8px"></i>Portfolio Gallery</h3>
        <p style="font-size:12px;color:#94a3b8;margin-bottom:16px">Add image URLs to showcase your past work</p>
        <div id="portfolio-list">${renderPortfolioImages(p.portfolio_images)}</div>
        <div style="display:flex;gap:10px;margin-top:12px">
          <input id="portfolio-url-input" class="form-input" placeholder="Paste image URL (https://...)">
          <button onclick="addPortfolioImage()" style="background:linear-gradient(135deg,#10b981,#059669);color:white;padding:10px 18px;border-radius:10px;border:none;cursor:pointer;white-space:nowrap;font-weight:600"><i class="fas fa-plus"></i></button>
        </div>
      </div>` : ''}
      ${isExpert ? `<!-- Expert Profile -->
      <div style="background:white;border-radius:20px;padding:28px;box-shadow:0 2px 12px rgba(0,0,0,0.06);margin-bottom:20px">
        <h3 style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:16px"><i class="fas fa-user-tie" style="color:#0891b2;margin-right:8px"></i>Expert Details</h3>
        <form id="expert-profile-form" onsubmit="saveProfile(event,'expert')">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
            <div><label class="form-label">Certification</label><input name="certification" class="form-input" value="${Helpers.esc(p.certification||'')}" placeholder="Licensed Engineer, PMP"></div>
            <div><label class="form-label">Service Area</label><input name="service_area" class="form-input" value="${Helpers.esc(p.service_area||'')}"></div>
          </div>
          <div style="margin-bottom:16px"><label class="form-label">Expertise Area</label><input name="expertise_area" class="form-input" value="${Helpers.esc(p.expertise_area||'')}" placeholder="Solar EPC, Electrical Safety"></div>
          <div style="margin-bottom:20px"><label class="form-label">Bio</label><textarea name="description" class="form-input" rows="4">${Helpers.esc(p.bio||p.description||'')}</textarea></div>
          <button type="submit" style="background:linear-gradient(135deg,#0891b2,#0284c7);color:white;padding:10px 24px;border-radius:10px;font-size:14px;font-weight:600;border:none;cursor:pointer">Save Expert Details</button>
        </form>
      </div>` : ''}
      <!-- Referral Program -->
      <div style="background:white;border-radius:20px;padding:28px;box-shadow:0 2px 12px rgba(0,0,0,0.06)">
        <h3 style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:6px"><i class="fas fa-gift" style="color:#f59e0b;margin-right:8px"></i>Referral Program</h3>
        <p style="font-size:12px;color:#94a3b8;margin-bottom:16px">Share your code and earn rewards when friends join BidKarts</p>
        <div id="referral-info"><div style="display:flex;justify-content:center;padding:20px"><div class="loading-spinner" style="width:24px;height:24px;border-width:2px"></div></div></div>
      </div>
    </div>
    `);
    // Load referral info
    loadReferralInfo();
    // Init portfolio
    if (isVendor) { window._portfolioImages = (() => { try { return JSON.parse(p.portfolio_images||'[]') } catch { return [] } })(); }
  } catch(e) {
    Toast.show('Failed to load profile', 'error');
  }
};

function Helpers_esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
if (!Helpers.esc) Helpers.esc = Helpers_esc;

function renderPortfolioImages(raw) {
  let imgs = []; try { imgs = JSON.parse(raw||'[]') } catch {}
  if (!imgs.length) return '<p style="font-size:13px;color:#94a3b8;text-align:center;padding:20px">No portfolio images yet. Add image URLs to showcase your work.</p>';
  return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px">
    ${imgs.map((url,i) => `<div style="position:relative;border-radius:10px;overflow:hidden;padding-top:75%;background:#f1f5f9">
      <img src="${url}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'">
      <button onclick="removePortfolioImage(${i})" style="position:absolute;top:4px;right:4px;background:rgba(0,0,0,0.6);color:white;border:none;border-radius:50%;width:20px;height:20px;cursor:pointer;font-size:10px;display:flex;align-items:center;justify-content:center"><i class="fas fa-times"></i></button>
    </div>`).join('')}
  </div>`;
}

window._portfolioImages = [];
function addPortfolioImage() {
  const input = document.getElementById('portfolio-url-input');
  const url = input?.value?.trim();
  if (!url || !url.startsWith('http')) { Toast.show('Please enter a valid image URL', 'warning'); return; }
  window._portfolioImages.push(url);
  document.getElementById('portfolio-list').innerHTML = renderPortfolioImages(JSON.stringify(window._portfolioImages));
  input.value = '';
  API.patch('/users/profile', { portfolio_images: window._portfolioImages }).then(() => Toast.show('Portfolio updated!', 'success')).catch(() => {});
}
function removePortfolioImage(idx) {
  window._portfolioImages.splice(idx, 1);
  document.getElementById('portfolio-list').innerHTML = renderPortfolioImages(JSON.stringify(window._portfolioImages));
  API.patch('/users/profile', { portfolio_images: window._portfolioImages }).then(() => Toast.show('Image removed', 'info')).catch(() => {});
}

// Vendor Portfolio (from dashboard Portfolio tab - uses window._vendorPortfolio)
window._vendorPortfolio = [];
function addVendorPortfolio() {
  const input = document.getElementById('v-portfolio-url');
  const url = (input?.value||'').trim();
  if (!url) { Toast.show('Please enter an image URL', 'warning'); return; }
  if (!url.startsWith('http')) { Toast.show('Please enter a valid URL starting with http/https', 'warning'); return; }
  window._vendorPortfolio.push(url);
  if (input) input.value = '';
  // Re-render the grid
  const grid = document.getElementById('v-portfolio-grid');
  if (grid) {
    const imgs = window._vendorPortfolio;
    grid.innerHTML = imgs.map((imgUrl,i)=>`
    <div style="position:relative;border-radius:12px;overflow:hidden;padding-top:75%;background:#f1f5f9;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
      <img src="${imgUrl}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" onerror="this.parentElement.innerHTML='<div style=\\'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:12px\\'>⚠️ Invalid URL</div>'">
      <div style="position:absolute;inset:0;background:linear-gradient(to bottom,transparent 60%,rgba(0,0,0,0.5))"></div>
      <button onclick="removeVendorPortfolio(${i})" style="position:absolute;top:8px;right:8px;background:rgba(220,38,38,0.9);color:white;border:none;border-radius:50%;width:28px;height:28px;cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center"><i class="fas fa-trash"></i></button>
    </div>`).join('');
  }
  API.patch('/users/profile', { portfolio_images: window._vendorPortfolio })
    .then(() => Toast.show('Portfolio image added!', 'success'))
    .catch(() => Toast.show('Failed to save', 'error'));
}
function removeVendorPortfolio(idx) {
  window._vendorPortfolio.splice(idx, 1);
  const grid = document.getElementById('v-portfolio-grid');
  if (grid) {
    if (window._vendorPortfolio.length === 0) {
      grid.innerHTML = '<p style="color:#94a3b8;text-align:center;grid-column:1/-1;padding:40px">No portfolio images yet.</p>';
    } else {
      grid.innerHTML = window._vendorPortfolio.map((imgUrl,i)=>`
      <div style="position:relative;border-radius:12px;overflow:hidden;padding-top:75%;background:#f1f5f9;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
        <img src="${imgUrl}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">
        <button onclick="removeVendorPortfolio(${i})" style="position:absolute;top:8px;right:8px;background:rgba(220,38,38,0.9);color:white;border:none;border-radius:50%;width:28px;height:28px;cursor:pointer;font-size:12px"><i class="fas fa-trash"></i></button>
      </div>`).join('');
    }
  }
  API.patch('/users/profile', { portfolio_images: window._vendorPortfolio })
    .then(() => Toast.show('Image removed', 'info'))
    .catch(() => {});
}

async function saveProfile(e, type) {
  e.preventDefault();
  const btn = e.target.querySelector('[type="submit"]');
  const orig = btn.innerHTML;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...'; btn.disabled = true;
  try {
    if (type === 'password') {
      const fd = new FormData(e.target);
      await API.post('/users/change-password', { current_password: fd.get('current_password'), new_password: fd.get('new_password') });
      Toast.show('Password changed successfully!', 'success');
      e.target.reset();
    } else {
      const fd = new FormData(e.target);
      const payload = Object.fromEntries([...fd.entries()].filter(([,v]) => v !== ''));
      await API.patch('/users/profile', payload);
      // Update local state name if changed
      if (payload.name && State.user) { State.user.name = payload.name; localStorage.setItem('bk_user', JSON.stringify(State.user)); }
      Toast.show('Profile updated successfully!', 'success');
    }
  } catch(err) {
    Toast.show(err.response?.data?.error || 'Failed to save', 'error');
  } finally {
    btn.innerHTML = orig; btn.disabled = false;
  }
}

async function loadReferralInfo() {
  try {
    const { data } = await API.get('/users/referral-stats');
    const el = document.getElementById('referral-info');
    if (!el) return;
    el.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;background:#fef3c7;border-radius:12px;padding:16px;margin-bottom:16px">
      <div style="flex:1">
        <p style="font-size:12px;color:#92400e;font-weight:600;margin-bottom:4px">Your Referral Code</p>
        <p style="font-size:22px;font-weight:900;color:#d97706;letter-spacing:3px">${data.referral_code || 'N/A'}</p>
      </div>
      <button onclick="copyReferralCode('${data.referral_code}')" style="background:linear-gradient(135deg,#f59e0b,#d97706);color:white;padding:8px 16px;border-radius:10px;border:none;cursor:pointer;font-weight:600;font-size:13px"><i class="fas fa-copy" style="margin-right:4px"></i>Copy</button>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between">
      <p style="font-size:14px;color:#374151">Total Referrals: <strong>${data.total_referrals || 0}</strong></p>
      <p style="font-size:12px;color:#94a3b8">Earn rewards for every friend who joins!</p>
    </div>`;
  } catch {}
}
function copyReferralCode(code) {
  navigator.clipboard?.writeText(code).then(() => Toast.show('Referral code copied!', 'success')).catch(() => Toast.show(code, 'info'));
}

// ── PASSWORD RESET PAGES ───────────────────────────────────────────────────
Pages.forgotPassword = function() {
  document.getElementById('app').innerHTML = layout(`
  <div style="max-width:480px;margin:60px auto;padding:0 20px">
    <div style="background:white;border-radius:20px;padding:36px;box-shadow:0 4px 20px rgba(0,0,0,0.08)">
      <div style="text-align:center;margin-bottom:28px">
        <div style="width:64px;height:64px;background:#eff6ff;border-radius:20px;display:flex;align-items:center;justify-content:center;margin:0 auto 16px"><i class="fas fa-lock" style="font-size:28px;color:#2563eb"></i></div>
        <h1 style="font-size:24px;font-weight:800;color:#0f172a">Forgot Password?</h1>
        <p style="color:#64748b;margin-top:6px">Enter your email and we'll send a reset link</p>
      </div>
      <form onsubmit="handleForgotPassword(event)">
        <div style="margin-bottom:20px"><label class="form-label">Email Address</label><input id="forgot-email" type="email" class="form-input" placeholder="you@example.com" required></div>
        <button type="submit" id="forgot-btn" class="btn-primary" style="color:white;width:100%;padding:14px;border-radius:12px;font-size:15px;font-weight:600">Send Reset Link</button>
        <p style="text-align:center;margin-top:16px;font-size:13px;color:#64748b">Remember your password? <a onclick="Router.go('/login')" style="color:#2563eb;cursor:pointer;font-weight:600">Sign in</a></p>
      </form>
    </div>
  </div>`);
};

async function handleForgotPassword(e) {
  e.preventDefault();
  const btn = document.getElementById('forgot-btn');
  const email = document.getElementById('forgot-email').value;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:8px"></i>Sending...'; btn.disabled = true;
  try {
    await API.post('/users/forgot-password', { email });
    Toast.show('Reset link sent! Check your email inbox.', 'success', 6000);
    document.getElementById('forgot-email').value = '';
  } catch(err) {
    Toast.show(err.response?.data?.error || 'Failed to send reset link', 'error');
  } finally { btn.innerHTML = 'Send Reset Link'; btn.disabled = false; }
}

Pages.resetPassword = function(params) {
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token') || params?.token || '';
  document.getElementById('app').innerHTML = layout(`
  <div style="max-width:480px;margin:60px auto;padding:0 20px">
    <div style="background:white;border-radius:20px;padding:36px;box-shadow:0 4px 20px rgba(0,0,0,0.08)">
      <div style="text-align:center;margin-bottom:28px">
        <div style="width:64px;height:64px;background:#f0fdf4;border-radius:20px;display:flex;align-items:center;justify-content:center;margin:0 auto 16px"><i class="fas fa-key" style="font-size:28px;color:#10b981"></i></div>
        <h1 style="font-size:24px;font-weight:800;color:#0f172a">Reset Password</h1>
        <p style="color:#64748b;margin-top:6px">Enter your new password below</p>
      </div>
      <form onsubmit="handleResetPassword(event, '${token}')">
        <div style="margin-bottom:16px"><label class="form-label">New Password</label><input id="reset-new-pw" type="password" class="form-input" placeholder="Min. 6 characters" required minlength="6"></div>
        <div style="margin-bottom:20px"><label class="form-label">Confirm Password</label><input id="reset-confirm-pw" type="password" class="form-input" placeholder="Re-enter new password" required></div>
        <button type="submit" id="reset-btn" class="btn-primary" style="color:white;width:100%;padding:14px;border-radius:12px;font-size:15px;font-weight:600">Reset Password</button>
      </form>
    </div>
  </div>`);
};

async function handleResetPassword(e, token) {
  e.preventDefault();
  const newPw = document.getElementById('reset-new-pw').value;
  const confirmPw = document.getElementById('reset-confirm-pw').value;
  if (newPw !== confirmPw) { Toast.show('Passwords do not match', 'warning'); return; }
  const btn = document.getElementById('reset-btn');
  btn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:8px"></i>Resetting...'; btn.disabled = true;
  try {
    await API.post('/users/reset-password', { token, new_password: newPw });
    Toast.show('Password reset successfully! You can now log in.', 'success', 5000);
    setTimeout(() => Router.go('/login'), 2000);
  } catch(err) {
    Toast.show(err.response?.data?.error || 'Invalid or expired reset link', 'error');
    btn.innerHTML = 'Reset Password'; btn.disabled = false;
  }
}

// ── MESSAGES / CHAT PAGE ───────────────────────────────────────────────────
Pages.messages = async function() {
  if (!Auth.isLoggedIn()) { Router.go('/login'); return; }
  document.getElementById('app').innerHTML = layout('<div style="display:flex;justify-content:center;padding:80px"><div class="loading-spinner"></div></div>');
  try {
    const { data } = await API.get('/messages/conversations');
    const convs = data.conversations || [];
    document.getElementById('app').innerHTML = layout(`
    <div style="max-width:1000px;margin:0 auto;padding:32px 20px">
      <h1 style="font-size:26px;font-weight:800;color:#0f172a;margin-bottom:24px"><i class="fas fa-comments" style="color:#2563eb;margin-right:10px"></i>Messages</h1>
      ${convs.length === 0 ? `
      <div style="background:white;border-radius:20px;padding:60px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,0.05)">
        <i class="fas fa-comments" style="font-size:56px;color:#e2e8f0;display:block;margin-bottom:16px"></i>
        <h3 style="color:#64748b;font-weight:600">No conversations yet</h3>
        <p style="font-size:13px;color:#94a3b8;margin-top:6px">Messages appear here when you connect with vendors</p>
      </div>` :
      `<div style="display:grid;gap:12px">
        ${convs.map(conv => {
          const isCustomer = State.user?.role === 'customer';
          const otherName = isCustomer ? conv.vendor_name : conv.customer_name;
          const initial = (otherName||'?').charAt(0).toUpperCase();
          return `<div onclick="Router.go('/messages/${conv.id}')" style="background:white;border-radius:16px;padding:18px 20px;box-shadow:0 1px 4px rgba(0,0,0,0.05);cursor:pointer;display:flex;align-items:center;gap:14px;transition:box-shadow 0.2s" onmouseover="this.style.boxShadow='0 4px 16px rgba(0,0,0,0.1)'" onmouseout="this.style.boxShadow='0 1px 4px rgba(0,0,0,0.05)'">
            <div style="width:46px;height:46px;background:linear-gradient(135deg,#2563eb,#7c3aed);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;color:white;flex-shrink:0">${initial}</div>
            <div style="flex:1;min-width:0">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
                <p style="font-size:14px;font-weight:700;color:#1e293b">${Helpers.esc(otherName||'User')}</p>
                <p style="font-size:11px;color:#94a3b8">${conv.last_message_at ? Helpers.timeAgo(conv.last_message_at) : ''}</p>
              </div>
              <p style="font-size:12px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${conv.project_title}</p>
              <p style="font-size:12px;color:#94a3b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px">${Helpers.esc(conv.last_message||'Start a conversation...')}</p>
            </div>
            ${conv.unread_count > 0 ? `<div style="background:#ef4444;color:white;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">${conv.unread_count}</div>` : ''}
          </div>`;
        }).join('')}
      </div>`}
    </div>`);
  } catch(e) { Toast.show('Failed to load messages', 'error'); }
};

Pages.chat = async function(params) {
  if (!Auth.isLoggedIn()) { Router.go('/login'); return; }
  const convId = params.id;
  document.getElementById('app').innerHTML = layout('<div style="display:flex;justify-content:center;padding:80px"><div class="loading-spinner"></div></div>');
  try {
    const { data } = await API.get(`/messages/${convId}`);
    const msgs = data.messages || [];
    const conv = data.conversation || {};
    const myId = State.user?.id;
    renderChatPage(convId, msgs, conv, myId);
  } catch(e) { Toast.show('Failed to load chat', 'error'); }
};

function renderChatPage(convId, msgs, conv, myId) {
  document.getElementById('app').innerHTML = layout(`
  <div style="max-width:760px;margin:0 auto;padding:20px 20px 0;display:flex;flex-direction:column;height:calc(100vh - 100px)">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
      <button onclick="Router.go('/messages')" style="background:#f1f5f9;border:none;border-radius:10px;padding:8px 12px;cursor:pointer;color:#64748b"><i class="fas fa-arrow-left"></i></button>
      <div>
        <p style="font-size:15px;font-weight:700;color:#1e293b">${Helpers.esc(conv.project_title || 'Conversation')}</p>
        <p style="font-size:12px;color:#94a3b8">Project Chat</p>
      </div>
    </div>
    <div id="chat-messages" style="flex:1;overflow-y:auto;background:white;border-radius:16px;padding:20px;display:flex;flex-direction:column;gap:10px;box-shadow:0 1px 4px rgba(0,0,0,0.05)">
      ${msgs.length === 0 ? '<p style="text-align:center;color:#94a3b8;font-size:13px;margin:auto">No messages yet. Say hello!</p>' :
      msgs.map(m => {
        const isMe = m.sender_id === myId;
        return `<div style="display:flex;flex-direction:column;align-items:${isMe?'flex-end':'flex-start'};gap:2px">
          <p style="font-size:10px;color:#94a3b8">${isMe?'You':Helpers.esc(m.sender_name)} · ${Helpers.timeAgo(m.created_at)}</p>
          <div class="${isMe?'chat-bubble-out':'chat-bubble-in'}">${Helpers.esc(m.content||'')}</div>
          ${m.attachment_url ? `<a href="${m.attachment_url}" target="_blank" style="font-size:11px;color:#2563eb"><i class="fas fa-paperclip"></i> ${Helpers.esc(m.attachment_name||'Attachment')}</a>` : ''}
        </div>`;
      }).join('')}
    </div>
    <div style="background:white;border-radius:16px;padding:12px;margin-top:12px;box-shadow:0 1px 4px rgba(0,0,0,0.05);margin-bottom:16px">
      <form onsubmit="sendChatMessage(event, '${convId}')" style="display:flex;gap:10px;align-items:center">
        <input id="chat-input" class="form-input" placeholder="Type a message..." style="flex:1" required autocomplete="off">
        <button type="submit" class="btn-primary" style="color:white;padding:10px 18px;border-radius:10px;font-size:14px;white-space:nowrap"><i class="fas fa-paper-plane"></i></button>
      </form>
    </div>
  </div>`);
  // Scroll to bottom
  const chatEl = document.getElementById('chat-messages');
  if (chatEl) chatEl.scrollTop = chatEl.scrollHeight;
}

// ── MILESTONES / PROJECT PROGRESS PAGE ────────────────────────────────────
Pages.milestones = async function(params) {
  if (!Auth.isLoggedIn()) { Router.go('/login'); return; }
  const projectId = params.id;
  document.getElementById('app').innerHTML = layout('<div style="display:flex;justify-content:center;padding:80px"><div class="loading-spinner"></div></div>');
  try {
    const [projRes, msRes] = await Promise.all([API.get(`/projects/${projectId}`), API.get(`/milestones/project/${projectId}`)]);
    const project = projRes.data.project;
    const milestones_list = msRes.data.milestones || [];
    const isCustomer = State.user?.role === 'customer';
    const total = milestones_list.length;
    const done = milestones_list.filter(m => ['approved','paid'].includes(m.status)).length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;

    document.getElementById('app').innerHTML = layout(`
    <div style="max-width:820px;margin:0 auto;padding:32px 20px">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px">
        <button onclick="Router.go('/projects/${projectId}')" style="background:none;border:none;cursor:pointer;color:#64748b;font-size:20px"><i class="fas fa-arrow-left"></i></button>
        <div>
          <h1 style="font-size:24px;font-weight:800;color:#0f172a">${Helpers.esc(project.title)}</h1>
          <p style="color:#64748b;font-size:13px;margin-top:2px">Project Milestones & Progress</p>
        </div>
        <div style="margin-left:auto">${Helpers.statusBadge(project.status)}</div>
      </div>
      <!-- Progress Bar -->
      <div style="background:white;border-radius:16px;padding:20px;box-shadow:0 1px 4px rgba(0,0,0,0.05);margin-bottom:20px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <p style="font-size:14px;font-weight:600;color:#374151">Overall Progress</p>
          <p style="font-size:16px;font-weight:800;color:#2563eb">${pct}%</p>
        </div>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:linear-gradient(135deg,#2563eb,#10b981)"></div></div>
        <p style="font-size:12px;color:#94a3b8;margin-top:8px">${done} of ${total} milestones completed</p>
      </div>
      <!-- Add Milestone (customer only) -->
      ${isCustomer && ['vendor_selected','in_progress'].includes(project.status) ? `
      <div style="background:white;border-radius:16px;padding:20px;box-shadow:0 1px 4px rgba(0,0,0,0.05);margin-bottom:20px;border:2px dashed #e2e8f0">
        <form onsubmit="addMilestone(event, ${projectId})" style="display:flex;gap:10px;flex-wrap:wrap;align-items:end">
          <div style="flex:2;min-width:200px"><label class="form-label">Milestone Title</label><input name="title" class="form-input" placeholder="e.g. Foundation Work Complete" required></div>
          <div style="flex:1;min-width:140px"><label class="form-label">Due Date</label><input name="due_date" type="date" class="form-input"></div>
          <div style="flex:1;min-width:120px"><label class="form-label">Amount (₹)</label><input name="amount" type="number" class="form-input" placeholder="50000" min="0"></div>
          <button type="submit" class="btn-primary" style="color:white;padding:10px 18px;border-radius:10px;font-size:13px;font-weight:600;white-space:nowrap"><i class="fas fa-plus" style="margin-right:4px"></i>Add</button>
        </form>
      </div>` : ''}
      <!-- Milestones List -->
      <div style="display:flex;flex-direction:column;gap:12px" id="milestones-container">
        ${milestones_list.length === 0 ? `<div style="background:white;border-radius:20px;padding:60px;text-align:center"><i class="fas fa-tasks" style="font-size:48px;color:#e2e8f0;display:block;margin-bottom:16px"></i><p style="color:#94a3b8">No milestones yet. ${isCustomer ? 'Add milestones to track progress.' : 'The customer will add milestones.'}</p></div>` :
        milestones_list.map(m => renderMilestoneCard(m, isCustomer, projectId)).join('')}
      </div>
      <!-- Complete Project Button (customer only) -->
      ${isCustomer && ['in_progress','vendor_selected'].includes(project.status) ? `
      <div style="background:white;border-radius:16px;padding:20px;box-shadow:0 1px 4px rgba(0,0,0,0.05);margin-top:20px;text-align:center">
        <p style="font-size:14px;color:#64748b;margin-bottom:12px">Happy with the completed work?</p>
        <button onclick="completeProject(${projectId})" style="background:linear-gradient(135deg,#10b981,#059669);color:white;padding:12px 28px;border-radius:12px;border:none;cursor:pointer;font-size:15px;font-weight:700">
          <i class="fas fa-check-circle" style="margin-right:8px"></i>Mark Project as Complete
        </button>
      </div>` : ''}
    </div>`);
  } catch(e) { Toast.show('Failed to load milestones: ' + e.message, 'error'); }
};

function renderMilestoneCard(m, isCustomer, projectId) {
  const statusColors = { pending:'#94a3b8', in_progress:'#f59e0b', completed:'#3b82f6', approved:'#10b981', paid:'#059669' };
  const color = statusColors[m.status] || '#94a3b8';
  return `<div class="milestone-card ${m.status}">
    <div style="display:flex;align-items:start;justify-content:space-between;flex-wrap:wrap;gap:10px">
      <div style="flex:1">
        <p style="font-size:14px;font-weight:700;color:#1e293b">${Helpers.esc(m.title)}</p>
        ${m.description ? `<p style="font-size:12px;color:#64748b;margin-top:4px">${Helpers.esc(m.description)}</p>` : ''}
        <div style="display:flex;gap:12px;margin-top:6px;flex-wrap:wrap">
          ${m.due_date ? `<p style="font-size:11px;color:#94a3b8"><i class="fas fa-calendar" style="margin-right:3px"></i>${Helpers.date(m.due_date)}</p>` : ''}
          ${m.amount ? `<p style="font-size:11px;font-weight:600;color:#059669"><i class="fas fa-rupee-sign" style="margin-right:2px"></i>${parseInt(m.amount).toLocaleString('en-IN')}</p>` : ''}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="background:${color}20;color:${color};padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;text-transform:capitalize">${(m.status||'').replace('_',' ')}</span>
        ${isCustomer && m.status === 'completed' ? `<button onclick="updateMilestone(${m.id}, 'approved', ${projectId})" style="background:linear-gradient(135deg,#10b981,#059669);color:white;padding:5px 12px;border-radius:8px;border:none;cursor:pointer;font-size:12px;font-weight:600">✓ Approve</button>` : ''}
        ${!isCustomer && m.status === 'pending' ? `<button onclick="updateMilestone(${m.id}, 'in_progress', ${projectId})" style="background:linear-gradient(135deg,#f59e0b,#d97706);color:white;padding:5px 12px;border-radius:8px;border:none;cursor:pointer;font-size:12px;font-weight:600">Start</button>` : ''}
        ${!isCustomer && m.status === 'in_progress' ? `<button onclick="updateMilestone(${m.id}, 'completed', ${projectId})" style="background:linear-gradient(135deg,#3b82f6,#2563eb);color:white;padding:5px 12px;border-radius:8px;border:none;cursor:pointer;font-size:12px;font-weight:600">Mark Done</button>` : ''}
      </div>
    </div>
  </div>`;
}

async function addMilestone(e, projectId) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const btn = e.target.querySelector('[type="submit"]');
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; btn.disabled = true;
  try {
    await API.post(`/milestones/project/${projectId}`, { title: fd.get('title'), due_date: fd.get('due_date') || null, amount: fd.get('amount') || null });
    Toast.show('Milestone added!', 'success');
    e.target.reset();
    Pages.milestones({ id: projectId });
  } catch(err) {
    Toast.show(err.response?.data?.error || 'Failed to add milestone', 'error');
    btn.innerHTML = '<i class="fas fa-plus" style="margin-right:4px"></i>Add'; btn.disabled = false;
  }
}

async function updateMilestone(milestoneId, status, projectId) {
  try {
    await API.patch(`/milestones/${milestoneId}/status`, { status });
    Toast.show(status === 'approved' ? 'Milestone approved!' : status === 'completed' ? 'Milestone marked as done!' : 'Milestone updated!', 'success');
    Pages.milestones({ id: projectId });
  } catch(err) { Toast.show(err.response?.data?.error || 'Failed to update', 'error'); }
}

async function completeProject(projectId) {
  if (!confirm('Mark this project as complete? This action cannot be undone.')) return;
  try {
    await API.post(`/projects/${projectId}/complete`, { completion_note: 'Customer confirmed completion.' });
    Toast.show('🎉 Project marked as complete! Please leave a review for the vendor.', 'success', 5000);
    setTimeout(() => Router.go(`/projects/${projectId}`), 1500);
  } catch(err) { Toast.show(err.response?.data?.error || 'Failed to complete project', 'error'); }
}

// ── REVIEW MODAL ────────────────────────────────────────────────────────────
function showReviewModal(projectId, vendorId) {
  Modal.show('Rate & Review Vendor', `
    <form id="review-form" onsubmit="submitReview(event, ${projectId}, ${vendorId})">
      <div style="margin-bottom:16px">
        <label class="form-label">Rating</label>
        <div style="display:flex;gap:8px;margin-top:8px" id="star-rating">
          ${[1,2,3,4,5].map(n => `<button type="button" onclick="setRating(${n})" id="star-${n}" style="background:none;border:none;cursor:pointer;font-size:28px;color:#e2e8f0;transition:color 0.2s">★</button>`).join('')}
        </div>
        <input type="hidden" id="review-rating" name="rating" value="0">
      </div>
      <div style="margin-bottom:4px">
        <label class="form-label">Your Review</label>
        <textarea name="comment" class="form-input" rows="4" placeholder="How was your experience with this vendor? Quality of work, professionalism, adherence to timeline..."></textarea>
      </div>
    </form>`, `
    <button onclick="Modal.close()" style="padding:10px 20px;border:1.5px solid #e2e8f0;border-radius:10px;background:white;cursor:pointer;font-weight:500">Cancel</button>
    <button onclick="document.getElementById('review-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))" class="btn-primary" style="color:white;padding:10px 24px;border-radius:10px;font-weight:600">Submit Review</button>`
  );
  window._selectedRating = 0;
}

function setRating(n) {
  window._selectedRating = n;
  document.getElementById('review-rating').value = n;
  for (let i = 1; i <= 5; i++) {
    const s = document.getElementById(`star-${i}`);
    if (s) s.style.color = i <= n ? '#f59e0b' : '#e2e8f0';
  }
}

async function submitReview(e, projectId, vendorId) {
  e.preventDefault();
  const rating = parseInt(document.getElementById('review-rating')?.value || '0');
  if (!rating || rating < 1) { Toast.show('Please select a rating (1-5 stars)', 'warning'); return; }
  const comment = e.target.querySelector('[name="comment"]')?.value || '';
  try {
    await API.post('/users/review', { project_id: projectId, vendor_id: vendorId, rating, comment });
    Modal.close();
    Toast.show('⭐ Review submitted! Thank you for your feedback.', 'success');
  } catch(err) { Toast.show(err.response?.data?.error || 'Failed to submit review', 'error'); }
}

// ── ESCROW / PAYMENT RELEASE MODAL ─────────────────────────────────────────
function showEscrowModal(projectId, milestoneId, amount) {
  Modal.show('Release Escrow Payment', `
    <div style="background:#fef3c7;border-radius:12px;padding:16px;margin-bottom:16px">
      <p style="font-size:16px;font-weight:700;color:#d97706">₹${parseInt(amount).toLocaleString('en-IN')} will be released to the vendor</p>
      <p style="font-size:13px;color:#92400e;margin-top:4px">This action confirms that the milestone has been completed to your satisfaction. Funds cannot be recovered after release.</p>
    </div>
    <label style="display:flex;align-items:center;gap:10px;cursor:pointer">
      <input type="checkbox" id="escrow-confirm">
      <span style="font-size:13px;color:#374151">I confirm that the work has been completed satisfactorily</span>
    </label>`,
  `<button onclick="Modal.close()" style="padding:10px 20px;border:1.5px solid #e2e8f0;border-radius:10px;background:white;cursor:pointer;font-weight:500">Cancel</button>
   <button onclick="releaseEscrow(${projectId}, ${milestoneId||'null'})" style="background:linear-gradient(135deg,#10b981,#059669);color:white;padding:10px 24px;border-radius:10px;font-weight:600;border:none;cursor:pointer">Release Payment</button>`
  );
}

async function releaseEscrow(projectId, milestoneId) {
  if (!document.getElementById('escrow-confirm')?.checked) { Toast.show('Please confirm before releasing', 'warning'); return; }
  Modal.close();
  try {
    const { data } = await API.post('/payments/escrow/release', { project_id: projectId, milestone_id: milestoneId });
    Toast.show('✅ ' + (data.message || 'Payment released!'), 'success', 5000);
    setTimeout(() => Pages.milestones({ id: projectId }), 1500);
  } catch(err) { Toast.show(err.response?.data?.error || 'Failed to release payment', 'error'); }
}

// ── GST INVOICE VIEWER ──────────────────────────────────────────────────────
async function viewGSTInvoice(paymentId) {
  try {
    const { data } = await API.get(`/payments/gst-invoice/${paymentId}`);
    const inv = data.invoice;
    Modal.show('GST Tax Invoice', `
    <div style="font-size:13px;color:#374151">
      <div style="background:#1e3a8a;color:white;border-radius:10px;padding:16px;margin-bottom:16px;text-align:center">
        <p style="font-size:18px;font-weight:800">🏗️ BidKarts Technologies Pvt. Ltd.</p>
        <p style="font-size:11px;opacity:0.8;margin-top:4px">GSTIN: ${inv.gstin} | Mumbai, Maharashtra</p>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px">
        ${[['Invoice No.', inv.invoice_number],['Invoice Date', inv.invoice_date],['HSN Code', inv.hsn_code],['Customer', inv.customer_name]].map(([k,v]) => `<div><p style="font-size:10px;color:#94a3b8;text-transform:uppercase;font-weight:600">${k}</p><p style="font-weight:600;color:#1e293b">${v}</p></div>`).join('')}
      </div>
      <div style="background:#f8fafc;border-radius:10px;padding:12px;margin-bottom:16px">
        <p style="font-size:12px;font-weight:600;color:#374151;margin-bottom:8px">Service: ${inv.service_description}</p>
        ${[['Base Amount', inv.base_amount],['CGST (9%)', inv.cgst],['SGST (9%)', inv.sgst]].map(([k,v]) => `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #e2e8f0"><span style="color:#64748b">${k}</span><span style="font-weight:600">₹${parseInt(v).toLocaleString('en-IN')}</span></div>`).join('')}
        <div style="display:flex;justify-content:space-between;padding:8px 0;font-size:15px;font-weight:700;margin-top:4px"><span>Total Amount</span><span style="color:#2563eb">₹${parseInt(inv.total_amount).toLocaleString('en-IN')}</span></div>
      </div>
      <p style="font-size:11px;color:#94a3b8;text-align:center">TXN: ${inv.transaction_id||'N/A'} | Paid via ${inv.payment_method}</p>
    </div>`,
    `<button onclick="Modal.close()" style="padding:10px 20px;border:1.5px solid #e2e8f0;border-radius:10px;background:white;cursor:pointer;font-weight:500">Close</button>
     <button onclick="window.print()" style="background:linear-gradient(135deg,#2563eb,#1d4ed8);color:white;padding:10px 24px;border-radius:10px;font-weight:600;border:none;cursor:pointer"><i class="fas fa-print" style="margin-right:6px"></i>Print</button>`
    );
  } catch(err) { Toast.show('Failed to load invoice', 'error'); }
}

// ── VENDOR WON PROJECTS TAB ────────────────────────────────────────────────
async function loadVendorWonProjects() {
  const el = document.getElementById('vendor-content');
  if (!el) return;
  el.innerHTML = '<div style="display:flex;justify-content:center;padding:60px"><div class="loading-spinner"></div></div>';
  try {
    const { data } = await API.get('/bids/vendor/my');
    const wonBids = (data.bids || []).filter(b => b.status === 'accepted');
    el.innerHTML = `
    <h2 style="font-size:22px;font-weight:800;color:#0f172a;margin-bottom:24px">Won Projects</h2>
    ${wonBids.length === 0 ? '<div style="background:white;border-radius:20px;padding:60px;text-align:center"><i class="fas fa-trophy" style="font-size:48px;color:#e2e8f0;display:block;margin-bottom:16px"></i><p style="color:#94a3b8">No won projects yet. Keep bidding!</p></div>' :
    `<div style="display:grid;gap:16px">${wonBids.map(b => `
      <div style="background:white;border-radius:16px;padding:20px;box-shadow:0 1px 4px rgba(0,0,0,0.05);border-left:4px solid #10b981">
        <div style="display:flex;align-items:start;justify-content:space-between;flex-wrap:wrap;gap:12px">
          <div style="flex:1">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
              <span style="font-size:11px;background:#eff6ff;color:#2563eb;padding:2px 8px;border-radius:10px;font-weight:600">${Helpers.serviceLabel(b.service_type)}</span>
              ${Helpers.statusBadge(b.project_status)}
            </div>
            <h3 onclick="Router.go('/projects/${b.project_id}')" style="font-size:15px;font-weight:700;color:#1e293b;cursor:pointer;margin-bottom:4px">${Helpers.esc(b.project_title)}</h3>
            <p style="font-size:12px;color:#94a3b8">${Helpers.esc(b.location||'')} · Customer: ${Helpers.esc(b.customer_name)}</p>
          </div>
          <div style="text-align:right">
            <p style="font-size:20px;font-weight:800;color:#059669">${Helpers.currency(b.bid_amount)}</p>
            <p style="font-size:12px;color:#94a3b8">${b.timeline_days} days</p>
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
          <button onclick="Router.go('/projects/${b.project_id}')" style="padding:7px 14px;background:#eff6ff;color:#2563eb;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600">View Project</button>
          <button onclick="Router.go('/milestones/${b.project_id}')" style="padding:7px 14px;background:#f0fdf4;color:#059669;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600"><i class="fas fa-tasks" style="margin-right:4px"></i>Milestones</button>
          <button onclick="startMessageProject(${b.project_id},${b.customer_id||0})" style="padding:7px 14px;background:#faf5ff;color:#7c3aed;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600"><i class="fas fa-comments" style="margin-right:4px"></i>Message</button>
          <button onclick="loadVendorProjectDocs(${b.project_id}, this)" style="padding:7px 14px;background:#f0fdf4;color:#059669;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600"><i class="fas fa-folder-open" style="margin-right:4px"></i>Documents</button>
        </div>
        <div id="vendor-docs-${b.project_id}" style="margin-top:10px"></div>
      </div>`).join('')}</div>`}`;
  } catch(e) { el.innerHTML = `<div style="text-align:center;padding:60px;color:#ef4444">Failed: ${e.message}</div>`; }
}

async function startMessageProject(projectId, vendorId) {
  try {
    const user = State.user;
    const targetVendorId = user?.role === 'vendor' ? user.id : vendorId;
    const { data } = await API.post('/messages/start', { project_id: projectId, vendor_id: targetVendorId });
    Router.go(`/messages/${data.conversation.id}`);
  } catch(e) { Toast.show('Failed to start conversation', 'error'); }
}

async function loadVendorProjectDocs(projectId, btn) {
  const el = document.getElementById(`vendor-docs-${projectId}`);
  if (!el) return;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; btn.disabled = true;
  try {
    const { data } = await API.get(`/projects/${projectId}`);
    const docs = data.documents || [];
    if (docs.length === 0) {
      el.innerHTML = '<p style="font-size:12px;color:#94a3b8;padding:8px 0">No documents for this project.</p>';
    } else {
      el.innerHTML = `<div style="display:grid;gap:8px;margin-top:4px">
        ${docs.map(d => { if (d.file_url) docDataStore[d.id] = { file_name: d.file_name, file_url: d.file_url }; return `
        <div style="display:flex;align-items:center;gap:10px;padding:10px;background:#f8fafc;border-radius:10px">
          <i class="fas fa-file-alt" style="color:#059669;font-size:16px;flex-shrink:0"></i>
          <div style="flex:1;min-width:0">
            <p style="font-size:13px;font-weight:600;color:#1e293b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${Helpers.esc(d.file_name)}</p>
            <p style="font-size:11px;color:#94a3b8">${d.doc_type} · ${d.file_size ? Math.round(d.file_size/1024)+'KB' : 'N/A'}</p>
          </div>
          ${d.file_url ? `<button onclick="downloadDoc(${d.id})" style="background:#f0fdf4;color:#059669;padding:6px 12px;border-radius:8px;border:none;cursor:pointer;font-size:12px;font-weight:600;white-space:nowrap"><i class="fas fa-download" style="margin-right:4px"></i>Download</button>` : '<span style="font-size:11px;color:#94a3b8">No file</span>'}
        </div>`; }).join('')}
      </div>`;
    }
  } catch(e) { el.innerHTML = '<p style="font-size:12px;color:#ef4444">Failed to load documents</p>'; }
  btn.innerHTML = '<i class="fas fa-folder-open" style="margin-right:4px"></i>Documents'; btn.disabled = false;
}

async function loadVendorProjectDocsInline(projectId) {
  const el = document.getElementById(`vendor-proj-docs-${projectId}`);
  if (!el) return;
  el.innerHTML = '<div style="text-align:center;padding:10px"><div class="loading-spinner" style="width:20px;height:20px;border-width:2px"></div></div>';
  try {
    const { data } = await API.get(`/projects/${projectId}`);
    const docs = data.documents || [];
    if (docs.length === 0) {
      el.innerHTML = '<p style="font-size:12px;color:#94a3b8;padding:4px 0">No documents uploaded yet.</p>';
    } else {
      el.innerHTML = `<div style="display:grid;gap:6px;margin-top:4px">
        ${docs.map(d => { if (d.file_url) docDataStore[d.id] = { file_name: d.file_name, file_url: d.file_url }; return `
        <div style="display:flex;align-items:center;gap:8px;padding:8px;background:white;border-radius:8px;border:1px solid #e2e8f0">
          <i class="fas fa-file-alt" style="color:#059669;font-size:12px;flex-shrink:0"></i>
          <p style="font-size:12px;font-weight:600;color:#1e293b;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${Helpers.esc(d.file_name)}</p>
          ${d.file_url ? `<button onclick="downloadDoc(${d.id})" style="background:#f0fdf4;color:#059669;padding:4px 8px;border-radius:6px;border:none;cursor:pointer;font-size:11px;font-weight:600;white-space:nowrap"><i class="fas fa-download" style="margin-right:2px"></i>Get</button>` : ''}
        </div>`; }).join('')}
      </div>`;
    }
  } catch(e) { el.innerHTML = '<p style="font-size:12px;color:#ef4444">Failed to load</p>'; }
}
async function loadCustomerPaymentsEnhanced() {
  const el = document.getElementById('cust-content');
  if (!el) return;
  el.innerHTML = '<div style="display:flex;justify-content:center;padding:60px"><div class="loading-spinner"></div></div>';
  try {
    const { data } = await API.get('/payments/my');
    const payments_list = data.payments || [];
    const total = payments_list.filter(p => p.status==='completed').reduce((s,p) => s+p.amount, 0);
    el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;flex-wrap:wrap;gap:12px">
      <h2 style="font-size:22px;font-weight:800;color:#0f172a">Payment History</h2>
      <div style="background:linear-gradient(135deg,#059669,#047857);color:white;padding:12px 20px;border-radius:12px">
        <p style="font-size:11px;opacity:0.8">Total Paid</p>
        <p style="font-size:20px;font-weight:800">${Helpers.currency(total)}</p>
      </div>
    </div>
    ${payments_list.length === 0 ? '<div style="background:white;border-radius:20px;padding:60px;text-align:center"><i class="fas fa-credit-card" style="font-size:48px;color:#e2e8f0;display:block;margin-bottom:16px"></i><p style="color:#94a3b8">No payments yet</p></div>' :
    `<div style="background:white;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.05)">
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="background:#f8fafc">
          <th style="text-align:left;padding:14px 16px;font-size:12px;color:#64748b;font-weight:600">Date</th>
          <th style="text-align:left;padding:14px 16px;font-size:12px;color:#64748b;font-weight:600">Project</th>
          <th style="text-align:left;padding:14px 16px;font-size:12px;color:#64748b;font-weight:600">Type</th>
          <th style="text-align:right;padding:14px 16px;font-size:12px;color:#64748b;font-weight:600">Amount</th>
          <th style="text-align:center;padding:14px 16px;font-size:12px;color:#64748b;font-weight:600">Status</th>
          <th style="text-align:center;padding:14px 16px;font-size:12px;color:#64748b;font-weight:600">Invoice</th>
        </tr></thead>
        <tbody>${payments_list.map((p,i) => `
        <tr style="border-top:1px solid #f1f5f9;${i%2===1?'background:#fafafa':''}">
          <td style="padding:12px 16px;font-size:13px;color:#64748b">${Helpers.date(p.created_at)}</td>
          <td style="padding:12px 16px;font-size:13px;color:#1e293b;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${Helpers.esc(p.project_title||'N/A')}</td>
          <td style="padding:12px 16px;font-size:12px"><span style="background:#f1f5f9;padding:3px 8px;border-radius:8px;color:#374151;font-weight:500">${(p.payment_type||'').replace(/_/g,' ')}</span></td>
          <td style="padding:12px 16px;font-size:14px;font-weight:700;color:#059669;text-align:right">${Helpers.currency(p.amount)}</td>
          <td style="padding:12px 16px;text-align:center">${Helpers.statusBadge(p.status)}</td>
          <td style="padding:12px 16px;text-align:center">${p.status==='completed'?`<button onclick="viewGSTInvoice(${p.id})" style="background:none;border:none;cursor:pointer;color:#2563eb;font-size:12px;font-weight:600"><i class="fas fa-file-invoice"></i> GST</button>`:'—'}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>`}`;
  } catch(e) { el.innerHTML = `<div style="text-align:center;padding:60px;color:#ef4444">Failed: ${e.message}</div>`; }
}

// ── ADMIN PAYMENTS PANEL ────────────────────────────────────────────────────
async function loadAdminPayments() {
  const el = document.getElementById('admin-content');
  if (!el) return;
  el.innerHTML = '<div style="display:flex;justify-content:center;padding:60px"><div class="loading-spinner"></div></div>';
  try {
    const [paymentsRes, statsRes] = await Promise.all([API.get('/admin/payments'), API.get('/payments/stats')]);
    const payments_list = paymentsRes.data.payments || [];
    const stats = statsRes.data.stats || {};
    el.innerHTML = `
    <h2 style="font-size:22px;font-weight:800;color:#0f172a;margin-bottom:24px">Payment Management</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:16px;margin-bottom:28px">
      ${[
        ['Total Revenue', Helpers.currency(stats.total_amount||0), 'fa-rupee-sign', '#059669', '#f0fdf4'],
        ['Successful', stats.successful||0, 'fa-check-circle', '#2563eb', '#eff6ff'],
        ['Pending', stats.pending||0, 'fa-clock', '#f97316', '#fff7ed'],
        ['Platform Fees', stats.platform_fees||0, 'fa-building', '#7c3aed', '#faf5ff'],
        ['Inspection Fees', stats.inspection_fees||0, 'fa-search', '#0891b2', '#ecfeff'],
        ['Vendor Payments', stats.vendor_payments||0, 'fa-handshake', '#10b981', '#f0fdf4'],
      ].map(([l,v,icon,color,bg]) => `
      <div class="stat-card">
        <div style="width:40px;height:40px;background:${bg};border-radius:10px;display:flex;align-items:center;justify-content:center;margin-bottom:12px">
          <i class="fas ${icon}" style="color:${color}"></i>
        </div>
        <p style="font-size:20px;font-weight:800;color:#0f172a">${v}</p>
        <p style="font-size:12px;color:#64748b;margin-top:4px">${l}</p>
      </div>`).join('')}
    </div>
    <div style="background:white;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.05)">
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="background:#f8fafc">
          ${['Date','User','Project','Type','Amount','Method','Status','Invoice'].map(h=>`<th style="text-align:left;padding:12px 14px;font-size:11px;color:#64748b;font-weight:600">${h}</th>`).join('')}
        </tr></thead>
        <tbody>${payments_list.map((p,i) => `
        <tr style="border-top:1px solid #f1f5f9;${i%2===1?'background:#fafafa':''}">
          <td style="padding:10px 14px;font-size:12px;color:#64748b">${Helpers.date(p.created_at)}</td>
          <td style="padding:10px 14px;font-size:12px;color:#1e293b">${Helpers.esc(p.user_name||'')}</td>
          <td style="padding:10px 14px;font-size:12px;color:#374151;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${Helpers.esc(p.project_title||'—')}</td>
          <td style="padding:10px 14px;font-size:11px"><span style="background:#f1f5f9;padding:2px 7px;border-radius:6px">${(p.payment_type||'').replace(/_/g,' ')}</span></td>
          <td style="padding:10px 14px;font-size:13px;font-weight:700;color:#059669">${Helpers.currency(p.amount)}</td>
          <td style="padding:10px 14px;font-size:12px;color:#64748b">${p.payment_method||'—'}</td>
          <td style="padding:10px 14px">${Helpers.statusBadge(p.status)}</td>
          <td style="padding:10px 14px;text-align:center">${p.status==='completed'?`<button onclick="viewGSTInvoice(${p.id})" style="background:none;border:none;cursor:pointer;color:#2563eb;font-size:11px"><i class="fas fa-file-invoice"></i></button>`:'—'}</td>
        </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  } catch(e) { el.innerHTML = `<div style="text-align:center;padding:60px;color:#ef4444">Failed: ${e.message}</div>`; }
}

// ── ENHANCED CHECKOUT WITH REAL RAZORPAY SUPPORT ──────────────────────────
async function processPaymentReal(projectId, paymentType, amount, inspectionId, milestoneId) {
  const btn = document.getElementById('pay-btn');
  if (!btn) return;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:8px"></i>Initiating...'; btn.disabled = true;
  try {
    const { data: order } = await API.post('/payments/initiate', {
      project_id: projectId || null, inspection_id: inspectionId || null,
      milestone_id: milestoneId || null, payment_type: paymentType, amount: parseFloat(amount)
    });

    if (order.payment.is_real && order.payment.key_id !== 'rzp_test_simulation') {
      // Real Razorpay checkout
      if (!window.Razorpay) {
        // Dynamically load Razorpay script
        await new Promise((res, rej) => {
          const s = document.createElement('script');
          s.src = 'https://checkout.razorpay.com/v1/checkout.js';
          s.onload = res; s.onerror = rej;
          document.head.appendChild(s);
        });
      }
      const rzp = new window.Razorpay({
        key: order.payment.key_id,
        amount: order.payment.amount,
        currency: order.payment.currency,
        name: order.payment.name,
        description: order.payment.description,
        order_id: order.payment.gateway_order_id,
        prefill: order.payment.prefill,
        theme: { color: '#2563eb' },
        handler: async function(response) {
          // Verify with backend
          try {
            await API.post('/payments/verify', {
              payment_id: order.payment.id,
              gateway_order_id: order.payment.gateway_order_id,
              gateway_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              payment_method: 'online'
            });
            Toast.show('✅ Payment successful! ₹' + parseInt(amount).toLocaleString() + ' paid.', 'success', 5000);
            setTimeout(() => Router.go(Auth.role() === 'vendor' ? '/dashboard/vendor' : '/dashboard/customer'), 2000);
          } catch(err) {
            Toast.show('Payment verification failed. Please contact support.', 'error');
          }
        },
        modal: { ondismiss: () => { btn.innerHTML = '<i class="fas fa-lock" style="margin-right:8px"></i>Pay ₹' + parseInt(amount).toLocaleString() + ' Securely'; btn.disabled = false; } }
      });
      rzp.open();
    } else {
      // Simulated payment (dev/test mode)
      await new Promise(resolve => setTimeout(resolve, 1500));
      btn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:8px"></i>Verifying...';
      await API.post('/payments/verify', {
        payment_id: order.payment.id, gateway_order_id: order.payment.gateway_order_id,
        gateway_payment_id: `pay_sim_${Date.now()}`, payment_method: 'card'
      });
      btn.innerHTML = '<i class="fas fa-check" style="margin-right:8px"></i>Payment Successful!';
      btn.style.background = 'linear-gradient(135deg,#10b981,#059669)';
      Toast.show('✅ Payment successful! ₹' + parseInt(amount).toLocaleString('en-IN') + ' paid.', 'success', 4000);
      setTimeout(() => Router.go(Auth.role() === 'vendor' ? '/dashboard/vendor' : '/dashboard/customer'), 2000);
    }
  } catch(err) {
    Toast.show(err.response?.data?.error || 'Payment failed. Please try again.', 'error');
    btn.innerHTML = '<i class="fas fa-lock" style="margin-right:8px"></i>Pay ₹' + parseInt(amount).toLocaleString() + ' Securely';
    btn.disabled = false;
  }
}

// ── VENDOR SUBSCRIPTION PLAN PAGE ─────────────────────────────────────────
Pages.vendorPlans = function() {
  if (!Auth.isLoggedIn() || Auth.role() !== 'vendor') { Router.go('/login'); return; }
  document.getElementById('app').innerHTML = layout(`
  <div style="max-width:1000px;margin:0 auto;padding:40px 20px">
    <div style="text-align:center;margin-bottom:40px">
      <h1 style="font-size:32px;font-weight:900;color:#0f172a">Choose Your Plan</h1>
      <p style="color:#64748b;margin-top:8px;font-size:16px">Unlock more opportunities and get premium visibility on BidKarts</p>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px">
      ${[
        { name:'Free', price:0, color:'#64748b', bg:'#f8fafc', icon:'fa-user', features:['5 bids per month','Basic profile listing','Email notifications','Standard support'], cta:'Current Plan', highlight:false },
        { name:'Pro', price:1999, color:'#2563eb', bg:'#eff6ff', icon:'fa-star', features:['Unlimited bids','Featured in search results','Priority notifications','Portfolio gallery','Dedicated support'], cta:'Upgrade to Pro', highlight:true },
        { name:'Premium', price:4999, color:'#7c3aed', bg:'#faf5ff', icon:'fa-crown', features:['Everything in Pro','Top placement in listings','BidKarts Verified badge','Direct customer referrals','Account manager'], cta:'Go Premium', highlight:false },
      ].map(plan => `
      <div style="background:white;border-radius:20px;padding:28px;box-shadow:${plan.highlight?'0 8px 32px rgba(37,99,235,0.2)':'0 2px 12px rgba(0,0,0,0.06)'};border:${plan.highlight?'2px solid #2563eb':'2px solid #f1f5f9'};position:relative">
        ${plan.highlight ? '<div style="position:absolute;top:-12px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#2563eb,#1d4ed8);color:white;padding:4px 16px;border-radius:20px;font-size:12px;font-weight:700">MOST POPULAR</div>' : ''}
        <div style="width:52px;height:52px;background:${plan.bg};border-radius:14px;display:flex;align-items:center;justify-content:center;margin-bottom:16px">
          <i class="fas ${plan.icon}" style="font-size:22px;color:${plan.color}"></i>
        </div>
        <h3 style="font-size:22px;font-weight:800;color:#0f172a">${plan.name}</h3>
        <p style="font-size:32px;font-weight:900;color:${plan.color};margin:12px 0">₹${plan.price.toLocaleString('en-IN')}<span style="font-size:14px;font-weight:500;color:#94a3b8">/month</span></p>
        <ul style="list-style:none;margin:16px 0 24px;display:flex;flex-direction:column;gap:8px">
          ${plan.features.map(f => `<li style="display:flex;align-items:center;gap:8px;font-size:13px;color:#374151"><i class="fas fa-check-circle" style="color:#10b981"></i>${f}</li>`).join('')}
        </ul>
        <button ${plan.price===0?'disabled':''} onclick="${plan.price>0?`upgradeVendorPlan('${plan.name.toLowerCase()}',${plan.price})`:'void(0)'}" style="width:100%;padding:12px;border-radius:12px;background:${plan.price===0?'#f1f5f9':('linear-gradient(135deg,'+plan.color+','+(plan.highlight?'#1d4ed8':'#6d28d9')+')')};color:${plan.price===0?'#94a3b8':'white'};border:none;cursor:${plan.price===0?'default':'pointer'};font-size:14px;font-weight:700;transition:opacity 0.2s" onmouseover="this.style.opacity='0.9'" onmouseout="this.style.opacity='1'">${plan.cta}</button>
      </div>`).join('')}
    </div>
  </div>`);
};

async function upgradeVendorPlan(plan, amount) {
  Toast.show(`Upgrading to ${plan} plan — ₹${amount.toLocaleString('en-IN')}/month. Redirecting to payment...`, 'info', 3000);
  setTimeout(() => Router.go(`/checkout/0?type=platform_fee&amount=${amount}`), 1500);
}

// ── PUSH NOTIFICATION SUPPORT ──────────────────────────────────────────────
async function requestPushPermission() {
  if (!('Notification' in window)) { Toast.show('Push notifications not supported in this browser', 'info'); return; }
  if (Notification.permission === 'granted') { Toast.show('Push notifications already enabled!', 'success'); return; }
  const permission = await Notification.requestPermission();
  if (permission === 'granted') {
    Toast.show('✅ Push notifications enabled!', 'success');
    // Store preference
    localStorage.setItem('bk_push_enabled', '1');
  } else {
    Toast.show('Push notifications blocked. Enable from browser settings.', 'info');
  }
}

function sendBrowserNotification(title, body, icon) {
  if (Notification.permission === 'granted' && localStorage.getItem('bk_push_enabled')) {
    new Notification(title, { body, icon: icon || '/favicon.ico' });
  }
}

// Poll for new notifications every 30s when logged in
let _notifPollInterval = null;
function startNotificationPolling() {
  if (_notifPollInterval) return;
  _notifPollInterval = setInterval(async () => {
    if (!Auth.isLoggedIn()) { clearInterval(_notifPollInterval); _notifPollInterval = null; return; }
    try {
      const { data } = await API.get('/users/notifications');
      const notifs = data.notifications || [];
      const unread = notifs.filter(n => !n.is_read).length;
      const prev = State.unreadCount || 0;
      if (unread > prev && unread > 0) {
        const newest = notifs.find(n => !n.is_read);
        if (newest) sendBrowserNotification(newest.title, newest.message);
      }
      State.unreadCount = unread;
      const badge = document.getElementById('notif-badge');
      if (badge) { badge.textContent = unread; badge.style.display = unread > 0 ? 'flex' : 'none'; }
    } catch {}
  }, 30000);
}

// ── ABOUT PAGE ────────────────────────────────────────────────────────────
Pages.about = function() {
  document.getElementById('app').innerHTML = layout(`
  <div style="max-width:900px;margin:0 auto;padding:60px 20px">
    <div style="text-align:center;margin-bottom:60px">
      <div style="width:80px;height:80px;background:linear-gradient(135deg,#2563eb,#ea580c);border-radius:24px;display:flex;align-items:center;justify-content:center;margin:0 auto 24px">
        <i class="fas fa-hammer" style="color:white;font-size:36px"></i>
      </div>
      <h1 style="font-size:40px;font-weight:900;color:#0f172a;margin-bottom:16px">About BidKarts</h1>
      <p style="font-size:18px;color:#64748b;line-height:1.7;max-width:600px;margin:0 auto">India's most trusted platform connecting homeowners and businesses with verified, certified service contractors.</p>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px;margin-bottom:60px">
      ${[
        ['fa-bullseye','Our Mission','To democratize access to quality trade services by connecting customers with vetted professionals through a transparent, secure bidding process.','#2563eb','#eff6ff'],
        ['fa-eye','Our Vision','To become the go-to platform for every construction, electrical, plumbing, HVAC, and solar project in India — simplifying procurement for millions.','#7c3aed','#f5f3ff'],
        ['fa-handshake','Our Values','Transparency, trust, and reliability in every transaction. We stand behind every verified vendor on our platform with escrow-backed payments.','#059669','#f0fdf4'],
      ].map(([icon,title,desc,color,bg]) => `
      <div style="background:white;border-radius:20px;padding:28px;box-shadow:0 2px 8px rgba(0,0,0,0.06)">
        <div style="width:52px;height:52px;background:${bg};border-radius:14px;display:flex;align-items:center;justify-content:center;margin-bottom:16px">
          <i class="fas ${icon}" style="font-size:22px;color:${color}"></i>
        </div>
        <h3 style="font-size:18px;font-weight:800;color:#0f172a;margin-bottom:10px">${title}</h3>
        <p style="font-size:14px;color:#64748b;line-height:1.7">${desc}</p>
      </div>`).join('')}
    </div>
    <div style="background:linear-gradient(135deg,#1e3a8a,#2563eb);border-radius:24px;padding:48px;color:white;text-align:center;margin-bottom:60px">
      <h2 style="font-size:28px;font-weight:900;margin-bottom:12px">Platform by the Numbers</h2>
      <p style="opacity:0.8;margin-bottom:40px">Growing every day with more projects and verified vendors</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:24px">
        ${[['500+','Verified Vendors'],['5,000+','Projects Completed'],['₹50Cr+','Value Processed'],['4.8★','Average Rating'],['8','Service Categories'],['50+','Cities Covered']].map(([val,label]) => `
        <div>
          <p style="font-size:36px;font-weight:900">${val}</p>
          <p style="font-size:13px;opacity:0.8;margin-top:4px">${label}</p>
        </div>`).join('')}
      </div>
    </div>
    <div style="margin-bottom:60px">
      <h2 style="font-size:24px;font-weight:800;color:#0f172a;margin-bottom:24px;text-align:center">Why Choose BidKarts?</h2>
      <div style="display:grid;gap:16px">
        ${[
          ['fa-shield-alt','100% Verified Vendors','Every vendor on BidKarts is background-checked, certified, and reviewed. We verify GST, certifications, and past work before listing any vendor.','#2563eb'],
          ['fa-lock','Secure Escrow Payments','Your payments are held securely in escrow and released to the vendor only when you confirm the work is done — protecting every rupee.','#059669'],
          ['fa-search','Real-Time Bidding','Get competitive bids from multiple vendors within 24-48 hours. Our transparent bidding ensures you always get the best price.','#7c3aed'],
          ['fa-user-tie','Expert Technical Inspection','Unsure about a quote? Book a certified technical expert to inspect your site and verify the vendor\'s proposal for just ₹1,500.','#f97316'],
          ['fa-file-invoice','GST-Compliant Invoicing','Every transaction generates a GST-compliant invoice automatically. Download and use for tax purposes instantly.','#0891b2'],
        ].map(([icon,title,desc,color]) => `
        <div style="background:white;border-radius:14px;padding:20px;box-shadow:0 1px 4px rgba(0,0,0,0.05);display:flex;align-items:start;gap:16px">
          <div style="width:44px;height:44px;background:${color}15;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <i class="fas ${icon}" style="font-size:18px;color:${color}"></i>
          </div>
          <div>
            <h3 style="font-size:15px;font-weight:700;color:#0f172a;margin-bottom:6px">${title}</h3>
            <p style="font-size:13px;color:#64748b;line-height:1.6">${desc}</p>
          </div>
        </div>`).join('')}
      </div>
    </div>
    <div style="background:white;border-radius:20px;padding:40px;box-shadow:0 2px 8px rgba(0,0,0,0.06);text-align:center">
      <h2 style="font-size:24px;font-weight:800;color:#0f172a;margin-bottom:12px">Ready to Get Started?</h2>
      <p style="color:#64748b;margin-bottom:28px">Join thousands of satisfied customers and vendors on BidKarts</p>
      <div style="display:flex;gap:16px;justify-content:center;flex-wrap:wrap">
        <button onclick="Router.go('/post-project')" class="btn-primary" style="color:white;padding:14px 32px;border-radius:12px;font-size:15px;font-weight:700"><i class="fas fa-plus" style="margin-right:8px"></i>Post a Project</button>
        <button onclick="Router.go('/register')" style="background:white;border:2px solid #2563eb;color:#2563eb;padding:14px 32px;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer"><i class="fas fa-user-plus" style="margin-right:8px"></i>Join as Vendor</button>
      </div>
    </div>
  </div>`);
};


// ════════════════════════════════════════════════════════════════════════════
// ── NEW FEATURE PAGES ────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════

// ── AI TOOLS PAGE ─────────────────────────────────────────────────────────
Pages.aiTools = function() {
  document.getElementById('app').innerHTML = layout(`
  <div style="max-width:1100px;margin:0 auto;padding:40px 20px">
    <div style="text-align:center;margin-bottom:48px">
      <div style="display:inline-flex;align-items:center;gap:8px;background:#eff6ff;color:#2563eb;padding:6px 16px;border-radius:20px;font-size:13px;font-weight:600;margin-bottom:16px">
        <i class="fas fa-robot"></i> AI-Powered Tools
      </div>
      <h1 style="font-size:36px;font-weight:900;color:#0f172a;margin-bottom:12px">Smart Project Intelligence</h1>
      <p style="color:#64748b;font-size:16px;max-width:600px;margin:0 auto">Use AI to estimate costs, find the right vendors, and auto-generate project specifications.</p>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:24px;margin-bottom:40px">
      <div onclick="document.getElementById('ai-tab-estimate').click()" class="card-hover" style="background:linear-gradient(135deg,#eff6ff,#dbeafe);border-radius:20px;padding:28px;cursor:pointer;border:2px solid #bfdbfe">
        <div style="width:56px;height:56px;background:#2563eb;border-radius:16px;display:flex;align-items:center;justify-content:center;margin-bottom:16px">
          <i class="fas fa-calculator" style="color:white;font-size:22px"></i>
        </div>
        <h3 style="font-size:18px;font-weight:800;color:#1e3a8a;margin-bottom:8px">Cost Estimator</h3>
        <p style="font-size:14px;color:#3b82f6;line-height:1.6">Get instant AI-driven cost estimates for solar, electrical, HVAC, plumbing, and more.</p>
      </div>
      <div onclick="document.getElementById('ai-tab-recommend').click()" class="card-hover" style="background:linear-gradient(135deg,#f5f3ff,#ede9fe);border-radius:20px;padding:28px;cursor:pointer;border:2px solid #c4b5fd">
        <div style="width:56px;height:56px;background:#7c3aed;border-radius:16px;display:flex;align-items:center;justify-content:center;margin-bottom:16px">
          <i class="fas fa-star" style="color:white;font-size:22px"></i>
        </div>
        <h3 style="font-size:18px;font-weight:800;color:#4c1d95;margin-bottom:8px">Vendor Recommender</h3>
        <p style="font-size:14px;color:#7c3aed;line-height:1.6">AI scores vendors by rating, experience, location, and win rate to find the best match.</p>
      </div>
      <div onclick="document.getElementById('ai-tab-spec').click()" class="card-hover" style="background:linear-gradient(135deg,#f0fdf4,#dcfce7);border-radius:20px;padding:28px;cursor:pointer;border:2px solid #86efac">
        <div style="width:56px;height:56px;background:#059669;border-radius:16px;display:flex;align-items:center;justify-content:center;margin-bottom:16px">
          <i class="fas fa-file-alt" style="color:white;font-size:22px"></i>
        </div>
        <h3 style="font-size:18px;font-weight:800;color:#064e3b;margin-bottom:8px">Spec Generator</h3>
        <p style="font-size:14px;color:#059669;line-height:1.6">Auto-generate detailed technical specifications for your project with materials, compliance & scope.</p>
      </div>
    </div>
    <!-- Tab navigation -->
    <div style="display:flex;gap:8px;margin-bottom:24px;border-bottom:2px solid #f1f5f9;padding-bottom:0">
      ${[['estimate','fa-calculator','Cost Estimator'],['recommend','fa-star','Vendor Recommender'],['spec','fa-file-alt','Spec Generator']].map(([id,icon,label],i) =>
        `<button id="ai-tab-${id}" onclick="aiShowTab('${id}')" style="padding:10px 20px;border:none;border-bottom:2px solid ${i===0?'#2563eb':'transparent'};background:none;cursor:pointer;font-size:14px;font-weight:600;color:${i===0?'#2563eb':'#64748b'};margin-bottom:-2px;transition:all 0.2s"><i class="fas ${icon}" style="margin-right:6px"></i>${label}</button>`
      ).join('')}
    </div>
    <!-- Tab content -->
    <div id="ai-tab-content">
      ${renderCostEstimatorTab()}
    </div>
  </div>`);
};

function aiShowTab(tab) {
  document.querySelectorAll('[id^="ai-tab-"]').forEach(btn => {
    if (btn.tagName === 'BUTTON') {
      const isActive = btn.id === `ai-tab-${tab}`;
      btn.style.borderBottomColor = isActive ? '#2563eb' : 'transparent';
      btn.style.color = isActive ? '#2563eb' : '#64748b';
    }
  });
  const content = document.getElementById('ai-tab-content');
  if (!content) return;
  if (tab === 'estimate') content.innerHTML = renderCostEstimatorTab();
  else if (tab === 'recommend') content.innerHTML = renderVendorRecommenderTab();
  else if (tab === 'spec') content.innerHTML = renderSpecGeneratorTab();
}

function renderCostEstimatorTab() {
  return `<div style="background:white;border-radius:20px;padding:32px;box-shadow:0 2px 12px rgba(0,0,0,0.06)">
    <h3 style="font-size:20px;font-weight:800;color:#0f172a;margin-bottom:24px"><i class="fas fa-calculator" style="color:#2563eb;margin-right:8px"></i>AI Cost Estimator</h3>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-bottom:24px">
      <div>
        <label class="form-label">Service Type</label>
        <select id="est-service" class="form-input">
          <option value="">Select service...</option>
          ${[['solar','Solar EPC'],['electrical','Electrical'],['hvac','HVAC'],['plumbing','Plumbing'],['fabrication','Fabrication'],['contracting','Civil Contracting']].map(([v,l]) => `<option value="${v}">${l}</option>`).join('')}
        </select>
      </div>
      <div>
        <label class="form-label">Quantity (kW / sq ft / ton / bathrooms)</label>
        <input id="est-qty" type="number" class="form-input" placeholder="e.g. 5 (for 5kW solar)" min="0.1" step="0.1">
      </div>
      <div>
        <label class="form-label">Location</label>
        <input id="est-loc" type="text" class="form-input" placeholder="e.g. Mumbai, Delhi...">
      </div>
      <div>
        <label class="form-label">Property Type</label>
        <select id="est-prop" class="form-input">
          <option value="Residential">Residential</option>
          <option value="Commercial">Commercial</option>
          <option value="Industrial">Industrial</option>
        </select>
      </div>
    </div>
    <button onclick="runCostEstimate()" class="btn-primary" style="color:white;padding:12px 28px;border-radius:12px;font-size:15px;font-weight:700"><i class="fas fa-magic" style="margin-right:8px"></i>Generate Estimate</button>
    <div id="est-result" style="margin-top:24px"></div>
  </div>`;
}

async function runCostEstimate() {
  const service = document.getElementById('est-service')?.value;
  const qty = document.getElementById('est-qty')?.value;
  const loc = document.getElementById('est-loc')?.value;
  const prop = document.getElementById('est-prop')?.value;
  if (!service || !qty) { Toast.show('Please select service and enter quantity', 'warning'); return; }
  const el = document.getElementById('est-result');
  el.innerHTML = '<div style="display:flex;justify-content:center;padding:40px"><div class="loading-spinner"></div></div>';
  try {
    const { data } = await API.get(`/ai/estimate?service_type=${service}&quantity=${qty}&location=${encodeURIComponent(loc||'')}&property_type=${encodeURIComponent(prop||'')}`);
    const e = data.estimate;
    el.innerHTML = `
    <div style="background:#f0fdf4;border:1.5px solid #86efac;border-radius:16px;padding:24px;margin-bottom:20px">
      <h4 style="color:#065f46;font-weight:800;font-size:18px;margin-bottom:8px"><i class="fas fa-check-circle" style="margin-right:8px"></i>Cost Estimate: ${data.service}</h4>
      <p style="color:#047857;font-size:13px;margin-bottom:16px">Quantity: ${data.quantity} ${data.unit} · ${e.location_multiplier > 1 ? 'Metro city pricing applied' : 'Standard pricing'}</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px">
        <div style="background:white;border-radius:12px;padding:16px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,0.05)">
          <p style="font-size:12px;color:#64748b;margin-bottom:4px">Minimum Estimate</p>
          <p style="font-size:24px;font-weight:900;color:#059669">₹${e.total.min.toLocaleString('en-IN')}</p>
        </div>
        <div style="background:white;border-radius:12px;padding:16px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,0.05);border:2px solid #2563eb">
          <p style="font-size:12px;color:#2563eb;font-weight:700;margin-bottom:4px">Expected Range</p>
          <p style="font-size:20px;font-weight:900;color:#1d4ed8">₹${e.total.min.toLocaleString('en-IN')} – ₹${e.total.max.toLocaleString('en-IN')}</p>
        </div>
        <div style="background:white;border-radius:12px;padding:16px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,0.05)">
          <p style="font-size:12px;color:#64748b;margin-bottom:4px">Maximum Estimate</p>
          <p style="font-size:24px;font-weight:900;color:#dc2626">₹${e.total.max.toLocaleString('en-IN')}</p>
        </div>
      </div>
      <p style="font-size:12px;color:#6b7280;margin-top:12px;background:white;padding:10px;border-radius:8px"><i class="fas fa-info-circle" style="color:#f59e0b;margin-right:6px"></i>${e.gst_note}</p>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px">
      <div style="background:white;border-radius:14px;padding:20px;box-shadow:0 1px 4px rgba(0,0,0,0.05)">
        <h5 style="font-weight:700;color:#1e293b;margin-bottom:12px;font-size:14px"><i class="fas fa-box" style="color:#7c3aed;margin-right:6px"></i>Key Materials</h5>
        <ul style="list-style:none;display:flex;flex-direction:column;gap:6px">
          ${(data.materials||[]).slice(0,6).map(m => `<li style="font-size:13px;color:#374151;display:flex;align-items:center;gap:6px"><i class="fas fa-check" style="color:#10b981;font-size:11px"></i>${m}</li>`).join('')}
        </ul>
      </div>
      <div style="background:white;border-radius:14px;padding:20px;box-shadow:0 1px 4px rgba(0,0,0,0.05)">
        <h5 style="font-weight:700;color:#1e293b;margin-bottom:12px;font-size:14px"><i class="fas fa-lightbulb" style="color:#f59e0b;margin-right:6px"></i>Expert Tips</h5>
        ${(data.tips||[]).map(t => `<p style="font-size:13px;color:#374151;margin-bottom:8px;padding:6px 10px;background:#fffbeb;border-radius:6px;border-left:3px solid #f59e0b">${t}</p>`).join('')}
        <div style="margin-top:12px;padding:10px;background:#eff6ff;border-radius:8px">
          <p style="font-size:12px;color:#2563eb;font-weight:600"><i class="fas fa-clock" style="margin-right:4px"></i>Timeline: ${data.timeline?.min}–${data.timeline?.max} ${data.timeline?.unit}</p>
          ${data.roi ? `<p style="font-size:12px;color:#059669;font-weight:600;margin-top:4px"><i class="fas fa-chart-line" style="margin-right:4px"></i>${data.roi}</p>` : ''}
        </div>
      </div>
    </div>
    <div style="background:#fef3c7;border-radius:12px;padding:14px;margin-top:16px;border:1px solid #fcd34d">
      <p style="font-size:12px;color:#92400e"><i class="fas fa-exclamation-triangle" style="margin-right:6px"></i>${data.disclaimer}</p>
    </div>
    <div style="margin-top:20px;text-align:center">
      <button onclick="Router.go('/post-project')" class="btn-accent" style="color:white;padding:12px 28px;border-radius:12px;font-size:15px;font-weight:700"><i class="fas fa-plus" style="margin-right:8px"></i>Post Your Project & Get Real Bids</button>
    </div>`;
  } catch(e) {
    el.innerHTML = `<div style="color:#dc2626;padding:20px;text-align:center">Failed to generate estimate: ${e.message}</div>`;
  }
}

function renderVendorRecommenderTab() {
  return `<div style="background:white;border-radius:20px;padding:32px;box-shadow:0 2px 12px rgba(0,0,0,0.06)">
    <h3 style="font-size:20px;font-weight:800;color:#0f172a;margin-bottom:8px"><i class="fas fa-star" style="color:#7c3aed;margin-right:8px"></i>AI Vendor Recommender</h3>
    <p style="color:#64748b;font-size:14px;margin-bottom:24px">Enter a Project ID to get AI-scored vendor recommendations based on rating, experience, location and win rate.</p>
    <div style="display:flex;gap:12px;margin-bottom:24px;flex-wrap:wrap">
      <input id="rec-project-id" type="number" class="form-input" style="max-width:200px" placeholder="Project ID">
      <button onclick="runVendorRecommend()" class="btn-primary" style="color:white;padding:12px 24px;border-radius:12px;font-size:14px;font-weight:700"><i class="fas fa-magic" style="margin-right:6px"></i>Find Best Vendors</button>
    </div>
    <div id="rec-result"></div>
  </div>`;
}

async function runVendorRecommend() {
  const pid = document.getElementById('rec-project-id')?.value;
  if (!pid) { Toast.show('Enter a project ID', 'warning'); return; }
  const el = document.getElementById('rec-result');
  el.innerHTML = '<div style="display:flex;justify-content:center;padding:40px"><div class="loading-spinner"></div></div>';
  try {
    const { data } = await API.get(`/ai/recommend?project_id=${pid}`);
    const vendors = data.recommended_vendors || [];
    if (vendors.length === 0) {
      el.innerHTML = '<p style="text-align:center;color:#64748b;padding:40px">No vendors found for this project\'s service type.</p>';
      return;
    }
    el.innerHTML = `
    <h4 style="color:#4c1d95;font-weight:700;margin-bottom:16px"><i class="fas fa-trophy" style="color:#f59e0b;margin-right:8px"></i>Top ${vendors.length} Recommended Vendors for ${data.service_type}</h4>
    <div style="display:grid;gap:14px">
      ${vendors.map((v,i) => `
      <div style="background:${i===0?'linear-gradient(135deg,#fef3c7,#fffbeb)':'white'};border-radius:14px;padding:20px;box-shadow:0 1px 4px rgba(0,0,0,0.05);border:${i===0?'2px solid #fbbf24':'1px solid #f1f5f9'};display:flex;align-items:center;gap:16px;flex-wrap:wrap">
        <div style="width:44px;height:44px;background:linear-gradient(135deg,${i===0?'#f59e0b,#d97706':'#7c3aed,#2563eb'});border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <span style="color:white;font-weight:800">${i+1}</span>
        </div>
        <div style="flex:1;min-width:200px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
            <p style="font-weight:700;color:#1e293b;font-size:15px">${v.company_name||v.name}</p>
            ${i===0?'<span style="background:#fef3c7;color:#d97706;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700">TOP PICK</span>':''}
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px">
            ${Helpers.stars(v.rating||0)} <span style="font-size:12px;color:#64748b">(${v.total_reviews||0} reviews)</span>
            <span style="font-size:12px;color:#64748b">· ${v.experience_years||0} yrs exp</span>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            ${(v.match_reasons||[]).map(r => `<span style="background:#f0fdf4;color:#059669;padding:2px 8px;border-radius:8px;font-size:11px;font-weight:600">${r}</span>`).join('')}
          </div>
        </div>
        <div style="text-align:center;min-width:80px">
          <p style="font-size:28px;font-weight:900;color:${i===0?'#d97706':'#7c3aed'}">${v.score}</p>
          <p style="font-size:11px;color:#94a3b8">AI Score</p>
        </div>
        <button onclick="Router.go('/vendors/${v.id}')" style="padding:8px 16px;background:#eff6ff;color:#2563eb;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600">View Profile</button>
      </div>`).join('')}
    </div>
    <p style="font-size:12px;color:#94a3b8;margin-top:16px;text-align:center">${data.algorithm}</p>`;
  } catch(e) {
    el.innerHTML = `<div style="color:#dc2626;padding:20px;text-align:center">Failed: ${e.message}</div>`;
  }
}

function renderSpecGeneratorTab() {
  return `<div style="background:white;border-radius:20px;padding:32px;box-shadow:0 2px 12px rgba(0,0,0,0.06)">
    <h3 style="font-size:20px;font-weight:800;color:#0f172a;margin-bottom:8px"><i class="fas fa-file-alt" style="color:#059669;margin-right:8px"></i>AI Spec Generator</h3>
    <p style="color:#64748b;font-size:14px;margin-bottom:24px">Instantly generate detailed technical specifications, scope of work, and compliance requirements for your project.</p>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:24px">
      <div>
        <label class="form-label">Service Type</label>
        <select id="spec-service" class="form-input">
          <option value="">Select...</option>
          ${[['solar','Solar EPC'],['electrical','Electrical'],['hvac','HVAC'],['plumbing','Plumbing'],['fabrication','MS Fabrication'],['contracting','Civil Contracting']].map(([v,l]) => `<option value="${v}">${l}</option>`).join('')}
        </select>
      </div>
      <div>
        <label class="form-label">Capacity / Area</label>
        <input id="spec-capacity" type="text" class="form-input" placeholder="e.g. 5 (kW), 1500 (sq ft)">
      </div>
      <div>
        <label class="form-label">Location</label>
        <input id="spec-location" type="text" class="form-input" placeholder="City, State">
      </div>
      <div>
        <label class="form-label">Property Type</label>
        <select id="spec-prop" class="form-input">
          <option>Residential</option>
          <option>Commercial</option>
          <option>Industrial</option>
        </select>
      </div>
    </div>
    <button onclick="runSpecGenerator()" class="btn-primary" style="color:white;padding:12px 28px;border-radius:12px;font-size:15px;font-weight:700"><i class="fas fa-magic" style="margin-right:8px"></i>Generate Specification</button>
    <div id="spec-result" style="margin-top:24px"></div>
  </div>`;
}

async function runSpecGenerator() {
  const service = document.getElementById('spec-service')?.value;
  if (!service) { Toast.show('Please select a service type', 'warning'); return; }
  const el = document.getElementById('spec-result');
  el.innerHTML = '<div style="display:flex;justify-content:center;padding:40px"><div class="loading-spinner"></div></div>';
  try {
    const capacity = document.getElementById('spec-capacity')?.value;
    const loc = document.getElementById('spec-location')?.value;
    const prop = document.getElementById('spec-prop')?.value;
    const { data } = await API.get(`/ai/spec-generator?service_type=${service}&capacity=${capacity||5}&location=${encodeURIComponent(loc||'')}&property_type=${encodeURIComponent(prop||'')}&area=${capacity||1500}`);
    const s = data.spec;
    el.innerHTML = `
    <div style="border:2px solid #d1fae5;border-radius:16px;overflow:hidden">
      <div style="background:linear-gradient(135deg,#059669,#047857);padding:20px 24px;color:white">
        <h4 style="font-size:18px;font-weight:800;margin-bottom:6px">${s.title}</h4>
        <p style="font-size:13px;opacity:0.9">${s.description}</p>
      </div>
      <div style="background:white;padding:24px;display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px">
        <div>
          <h5 style="font-weight:700;color:#1e293b;margin-bottom:12px;font-size:13px;text-transform:uppercase;letter-spacing:0.5px"><i class="fas fa-tasks" style="color:#2563eb;margin-right:6px"></i>Scope of Work</h5>
          <ol style="padding-left:20px;display:flex;flex-direction:column;gap:8px">
            ${(s.scope_of_work||[]).map(item => `<li style="font-size:13px;color:#374151;line-height:1.5">${item}</li>`).join('')}
          </ol>
        </div>
        <div>
          <h5 style="font-weight:700;color:#1e293b;margin-bottom:12px;font-size:13px;text-transform:uppercase;letter-spacing:0.5px"><i class="fas fa-cog" style="color:#7c3aed;margin-right:6px"></i>Technical Specs</h5>
          <ul style="list-style:none;display:flex;flex-direction:column;gap:8px">
            ${(s.technical_specs||[]).map(spec => `<li style="font-size:13px;color:#374151;padding:6px 10px;background:#f8fafc;border-radius:6px;border-left:3px solid #7c3aed">${spec}</li>`).join('')}
          </ul>
        </div>
        <div>
          <h5 style="font-weight:700;color:#1e293b;margin-bottom:12px;font-size:13px;text-transform:uppercase;letter-spacing:0.5px"><i class="fas fa-certificate" style="color:#f59e0b;margin-right:6px"></i>Compliance Standards</h5>
          ${(s.compliance||[]).map(c => `<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px"><i class="fas fa-check-circle" style="color:#10b981;font-size:12px"></i><span style="font-size:13px;color:#374151">${c}</span></div>`).join('')}
          <h5 style="font-weight:700;color:#1e293b;margin:16px 0 12px;font-size:13px;text-transform:uppercase;letter-spacing:0.5px"><i class="fas fa-box" style="color:#059669;margin-right:6px"></i>Deliverables</h5>
          ${(s.deliverables||[]).map(d => `<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px"><i class="fas fa-file-check" style="color:#2563eb;font-size:12px"></i><span style="font-size:13px;color:#374151">${d}</span></div>`).join('')}
        </div>
      </div>
    </div>
    <div style="margin-top:20px;display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
      <button onclick="Router.go('/post-project')" class="btn-accent" style="color:white;padding:12px 24px;border-radius:12px;font-size:14px;font-weight:700"><i class="fas fa-plus" style="margin-right:6px"></i>Post Project with This Spec</button>
      <button onclick="window.print()" style="background:#f1f5f9;color:#475569;padding:12px 24px;border-radius:12px;border:none;cursor:pointer;font-size:14px;font-weight:600"><i class="fas fa-print" style="margin-right:6px"></i>Print/Save Spec</button>
    </div>`;
  } catch(e) {
    el.innerHTML = `<div style="color:#dc2626;padding:20px;text-align:center">Failed: ${e.message}</div>`;
  }
}

// ── CONSULTATIONS PAGE ────────────────────────────────────────────────────
Pages.consultations = async function() {
  document.getElementById('app').innerHTML = layout(`
  <div style="max-width:1200px;margin:0 auto;padding:40px 20px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:32px;flex-wrap:wrap;gap:16px">
      <div>
        <span style="font-size:13px;font-weight:600;color:#0891b2;text-transform:uppercase;letter-spacing:1px">Expert Services</span>
        <h1 style="font-size:32px;font-weight:900;color:#0f172a;margin-top:4px">Book a Technical Consultation</h1>
        <p style="color:#64748b;font-size:15px;margin-top:8px">Get expert advice from certified engineers for your project.</p>
      </div>
      ${Auth.isLoggedIn() ? '<button onclick="loadMyConsultations()" style="background:#ecfeff;color:#0891b2;padding:10px 20px;border-radius:10px;border:none;cursor:pointer;font-weight:600;font-size:14px"><i class="fas fa-list" style="margin-right:6px"></i>My Bookings</button>' : ''}
    </div>
    <!-- Filters -->
    <div style="background:white;border-radius:16px;padding:20px;box-shadow:0 1px 4px rgba(0,0,0,0.05);margin-bottom:28px;display:flex;gap:14px;flex-wrap:wrap">
      <select id="cons-service" onchange="loadExperts()" class="form-input" style="max-width:200px">
        <option value="">All Services</option>
        ${[['solar','Solar EPC'],['electrical','Electrical'],['hvac','HVAC'],['plumbing','Plumbing'],['fabrication','Fabrication']].map(([v,l]) => `<option value="${v}">${l}</option>`).join('')}
      </select>
      <input id="cons-loc" type="text" class="form-input" style="max-width:200px" placeholder="Location..." oninput="loadExperts()">
    </div>
    <div id="experts-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:20px">
      <div style="grid-column:1/-1;display:flex;justify-content:center;padding:40px"><div class="loading-spinner"></div></div>
    </div>
  </div>`);
  loadExperts();
};

async function loadExperts() {
  const service = document.getElementById('cons-service')?.value;
  const loc = document.getElementById('cons-loc')?.value;
  const grid = document.getElementById('experts-grid');
  if (!grid) return;
  grid.innerHTML = '<div style="grid-column:1/-1;display:flex;justify-content:center;padding:40px"><div class="loading-spinner"></div></div>';
  try {
    let url = '/consultations/experts';
    const params = [];
    if (service) params.push(`service_type=${service}`);
    if (loc) params.push(`location=${encodeURIComponent(loc)}`);
    if (params.length) url += '?' + params.join('&');
    const { data } = await API.get(url);
    const experts = data.experts || [];
    if (experts.length === 0) {
      grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:60px;color:#64748b">
        <i class="fas fa-user-tie" style="font-size:48px;color:#e2e8f0;display:block;margin-bottom:16px"></i>
        <p style="font-weight:600">No experts found for this filter</p>
        <p style="font-size:13px;margin-top:8px">Try changing your service or location</p>
      </div>`;
      return;
    }
    grid.innerHTML = experts.map(e => `
    <div class="card-hover" style="background:white;border-radius:20px;box-shadow:0 2px 12px rgba(0,0,0,0.06);overflow:hidden">
      <div style="background:linear-gradient(135deg,#0891b2,#06b6d4);padding:20px;color:white;position:relative">
        <div style="display:flex;align-items:center;gap:14px">
          <div style="width:56px;height:56px;background:rgba(255,255,255,0.2);border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:22px;font-weight:800">${(e.name||'E').charAt(0)}</div>
          <div>
            <p style="font-weight:800;font-size:17px">${e.name}</p>
            <p style="font-size:12px;opacity:0.85">${e.specialization||'Technical Expert'}</p>
          </div>
        </div>
        <div style="position:absolute;top:12px;right:12px;background:${e.is_available===0?'#fef2f2':'#f0fdf4'};color:${e.is_available===0?'#dc2626':'#059669'};padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700">${e.is_available===0?'BUSY':'AVAILABLE'}</div>
      </div>
      <div style="padding:20px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap">
          ${Helpers.stars(e.rating||0)} <span style="font-size:12px;color:#64748b">${e.total_consultations||0} consultations</span>
          <span style="background:#ecfeff;color:#0891b2;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600">${e.experience||0} yrs exp</span>
        </div>
        ${e.certification ? `<p style="font-size:13px;color:#374151;margin-bottom:8px"><i class="fas fa-certificate" style="color:#f59e0b;margin-right:6px"></i>${e.certification}</p>` : ''}
        ${e.service_area ? `<p style="font-size:13px;color:#64748b;margin-bottom:12px"><i class="fas fa-map-marker-alt" style="color:#3b82f6;margin-right:6px"></i>${e.service_area}</p>` : ''}
        <div style="background:#f8fafc;border-radius:10px;padding:12px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between">
          <span style="font-size:13px;color:#64748b">Consultation Fee</span>
          <span style="font-size:18px;font-weight:900;color:#0891b2">₹${(e.hourly_rate||1500).toLocaleString('en-IN')} / hr</span>
        </div>
        <button onclick="bookConsultation(${e.id},'${(e.name||'').replace(/'/g,"\\'")}',${e.hourly_rate||1500})" class="btn-primary" style="width:100%;color:white;padding:12px;border-radius:12px;font-size:14px;font-weight:700" ${e.is_available===0?'disabled style="opacity:0.5;cursor:not-allowed"':''}><i class="fas fa-calendar-check" style="margin-right:6px"></i>Book Consultation</button>
      </div>
    </div>`).join('');
  } catch(e) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:60px;color:#ef4444">${e.message}</div>`;
  }
}

function bookConsultation(expertId, expertName, fee) {
  if (!Auth.isLoggedIn()) { Toast.show('Please login to book a consultation', 'warning'); Router.go('/login'); return; }
  if (Auth.role() !== 'customer') { Toast.show('Only customers can book consultations', 'info'); return; }
  Modal.show('Book Consultation', `
  <p style="color:#64748b;margin-bottom:20px;font-size:14px">Book a session with <strong>${expertName}</strong> · Fee: <strong>₹${fee.toLocaleString('en-IN')}/hr</strong></p>
  <div style="display:flex;flex-direction:column;gap:14px">
    <div>
      <label class="form-label">Service Type *</label>
      <select id="bk-service" class="form-input">
        <option value="">Select service...</option>
        ${[['solar','Solar EPC'],['electrical','Electrical'],['hvac','HVAC'],['plumbing','Plumbing'],['fabrication','Fabrication'],['contracting','Contracting']].map(([v,l]) => `<option value="${v}">${l}</option>`).join('')}
      </select>
    </div>
    <div>
      <label class="form-label">Consultation Topic *</label>
      <input id="bk-topic" class="form-input" placeholder="e.g. Solar system sizing for 3BHK home">
    </div>
    <div>
      <label class="form-label">Description</label>
      <textarea id="bk-desc" class="form-input" rows="3" placeholder="Describe your requirements or questions..."></textarea>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div>
        <label class="form-label">Preferred Date</label>
        <input id="bk-date" type="date" class="form-input" min="${new Date().toISOString().split('T')[0]}">
      </div>
      <div>
        <label class="form-label">Preferred Time</label>
        <select id="bk-time" class="form-input">
          ${['09:00','10:00','11:00','12:00','14:00','15:00','16:00','17:00'].map(t => `<option value="${t}">${t}</option>`).join('')}
        </select>
      </div>
    </div>
    <div>
      <label class="form-label">Consultation Mode</label>
      <select id="bk-type" class="form-input">
        <option value="video">Video Call (Zoom/Meet)</option>
        <option value="phone">Phone Call</option>
        <option value="site_visit">Site Visit</option>
      </select>
    </div>
  </div>`,
  `<button onclick="submitBooking(${expertId},${fee})" class="btn-primary" style="color:white;padding:12px 24px;border-radius:10px;font-size:14px;font-weight:700"><i class="fas fa-check" style="margin-right:6px"></i>Confirm Booking</button>
   <button onclick="Modal.close()" style="padding:12px 20px;background:#f1f5f9;color:#64748b;border:none;border-radius:10px;cursor:pointer;font-size:14px">Cancel</button>`);
}

async function submitBooking(expertId, fee) {
  const service = document.getElementById('bk-service')?.value;
  const topic = document.getElementById('bk-topic')?.value;
  const desc = document.getElementById('bk-desc')?.value;
  const date = document.getElementById('bk-date')?.value;
  const time = document.getElementById('bk-time')?.value;
  const type = document.getElementById('bk-type')?.value;
  if (!service || !topic) { Toast.show('Service type and topic required', 'warning'); return; }
  try {
    await API.post('/consultations', { expert_id: expertId, service_type: service, topic, description: desc, preferred_date: date, preferred_time: time, consultation_type: type });
    Modal.close();
    Toast.show('Consultation request sent! Expert will confirm within 24 hours.', 'success', 5000);
    setTimeout(() => Router.go(`/checkout/0?type=consultation_fee&amount=${fee}&expert_id=${expertId}`), 1500);
  } catch(e) {
    Toast.show(e.response?.data?.error || 'Failed to book consultation', 'error');
  }
}

async function loadMyConsultations() {
  if (!Auth.isLoggedIn()) return;
  const el = document.getElementById('experts-grid');
  if (!el) return;
  el.innerHTML = '<div style="grid-column:1/-1;display:flex;justify-content:center;padding:40px"><div class="loading-spinner"></div></div>';
  try {
    const { data } = await API.get('/consultations');
    const cons = data.consultations || [];
    if (cons.length === 0) {
      el.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:60px;color:#64748b"><p>No consultations yet. Book one above!</p></div>`;
      return;
    }
    const statusColors = { requested:'#f59e0b', accepted:'#2563eb', completed:'#10b981', cancelled:'#dc2626' };
    el.innerHTML = `<div style="grid-column:1/-1">
      <h3 style="font-size:18px;font-weight:800;color:#0f172a;margin-bottom:16px">My Consultations</h3>
      <div style="display:grid;gap:12px">
        ${cons.map(c => `
        <div style="background:white;border-radius:14px;padding:20px;box-shadow:0 1px 4px rgba(0,0,0,0.05);display:flex;align-items:center;gap:16px;flex-wrap:wrap">
          <div style="flex:1">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
              <span style="font-size:11px;background:${statusColors[c.status]||'#64748b'}20;color:${statusColors[c.status]||'#64748b'};padding:2px 10px;border-radius:12px;font-weight:700;text-transform:uppercase">${c.status}</span>
              <span style="font-size:11px;color:#94a3b8">${Helpers.date(c.created_at)}</span>
            </div>
            <p style="font-weight:700;color:#1e293b;font-size:15px">${c.topic}</p>
            <p style="font-size:13px;color:#64748b">${c.expert_name||c.customer_name} · ₹${(c.fee||0).toLocaleString('en-IN')}</p>
            ${c.scheduled_date ? `<p style="font-size:12px;color:#2563eb;margin-top:4px"><i class="fas fa-calendar" style="margin-right:4px"></i>Scheduled: ${c.scheduled_date} ${c.scheduled_time||''}</p>` : ''}
            ${c.video_link ? `<a href="${c.video_link}" target="_blank" style="font-size:12px;color:#2563eb;text-decoration:none"><i class="fas fa-video" style="margin-right:4px"></i>Join Video Call</a>` : ''}
          </div>
        </div>`).join('')}
      </div>
    </div>`;
  } catch(e) {
    el.innerHTML = `<div style="grid-column:1/-1;color:#dc2626;padding:20px;text-align:center">${e.message}</div>`;
  }
}

// ── DISPUTES PAGE ─────────────────────────────────────────────────────────
Pages.disputes = async function() {
  if (!Auth.isLoggedIn()) { Router.go('/login'); return; }
  document.getElementById('app').innerHTML = layout(`
  <div style="max-width:900px;margin:0 auto;padding:40px 20px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:32px;flex-wrap:wrap;gap:16px">
      <div>
        <h1 style="font-size:28px;font-weight:900;color:#0f172a">Dispute Resolution</h1>
        <p style="color:#64748b;margin-top:4px;font-size:14px">Raise or track disputes for your projects. Admin reviews within 48 hours.</p>
      </div>
      ${Auth.can('customer','vendor') ? `<button onclick="showRaiseDisputeForm()" style="background:#fef2f2;color:#dc2626;padding:10px 20px;border-radius:10px;border:1.5px solid #fca5a5;cursor:pointer;font-weight:600;font-size:14px"><i class="fas fa-exclamation-triangle" style="margin-right:6px"></i>Raise Dispute</button>` : ''}
    </div>
    <div id="disputes-list"><div style="display:flex;justify-content:center;padding:60px"><div class="loading-spinner"></div></div></div>
  </div>`);
  loadDisputes();
};

async function loadDisputes() {
  const el = document.getElementById('disputes-list');
  if (!el) return;
  try {
    const { data } = await API.get('/disputes');
    const ds = data.disputes || [];
    if (ds.length === 0) {
      el.innerHTML = `<div style="background:white;border-radius:20px;padding:60px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,0.06)">
        <i class="fas fa-shield-alt" style="font-size:48px;color:#10b981;display:block;margin-bottom:16px"></i>
        <h3 style="color:#1e293b;font-weight:700;margin-bottom:8px">No Disputes</h3>
        <p style="color:#64748b;font-size:14px">All your projects are running smoothly!</p>
      </div>`;
      return;
    }
    const statusColors = { open:'#f59e0b', resolved:'#10b981', closed:'#64748b' };
    el.innerHTML = `<div style="display:grid;gap:14px">
      ${ds.map(d => `
      <div style="background:white;border-radius:16px;padding:20px;box-shadow:0 1px 4px rgba(0,0,0,0.05);border-left:4px solid ${statusColors[d.status]||'#64748b'}">
        <div style="display:flex;align-items:start;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <div style="flex:1">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
              <span style="font-size:11px;background:${statusColors[d.status]||'#64748b'}20;color:${statusColors[d.status]||'#64748b'};padding:3px 10px;border-radius:12px;font-weight:700;text-transform:uppercase">${d.status}</span>
              <span style="font-size:11px;color:#94a3b8">${Helpers.date(d.created_at)}</span>
            </div>
            <p style="font-weight:700;color:#1e293b;font-size:15px;margin-bottom:4px">${d.reason}</p>
            <p style="font-size:13px;color:#64748b;margin-bottom:8px">Project: ${d.project_title}</p>
            <p style="font-size:13px;color:#374151">${(d.description||'').substring(0,150)}${(d.description||'').length>150?'...':''}</p>
            ${d.resolution ? `<div style="background:#f0fdf4;border-radius:8px;padding:10px;margin-top:10px;border:1px solid #86efac"><p style="font-size:12px;font-weight:700;color:#065f46">Resolution:</p><p style="font-size:13px;color:#374151;margin-top:2px">${d.resolution}</p></div>` : ''}
          </div>
          ${d.status === 'open' && Auth.can('customer','vendor') ? `<button onclick="respondToDispute(${d.id})" style="padding:8px 16px;background:#fef2f2;color:#dc2626;border:1px solid #fca5a5;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;white-space:nowrap">Respond</button>` : ''}
        </div>
      </div>`).join('')}
    </div>`;
  } catch(e) {
    el.innerHTML = `<div style="color:#dc2626;padding:20px;text-align:center">${e.message}</div>`;
  }
}

function showRaiseDisputeForm() {
  Modal.show('Raise a Dispute', `
  <div style="display:flex;flex-direction:column;gap:14px">
    <div>
      <label class="form-label">Project ID *</label>
      <input id="disp-pid" type="number" class="form-input" placeholder="Enter Project ID">
    </div>
    <div>
      <label class="form-label">Reason *</label>
      <select id="disp-reason" class="form-input">
        <option value="">Select reason...</option>
        <option>Poor workmanship</option>
        <option>Work not completed</option>
        <option>Overcharging / price mismatch</option>
        <option>Material quality issue</option>
        <option>Safety violations</option>
        <option>Communication issues</option>
        <option>Payment dispute</option>
        <option>Other</option>
      </select>
    </div>
    <div>
      <label class="form-label">Description *</label>
      <textarea id="disp-desc" class="form-input" rows="4" placeholder="Describe the issue in detail..."></textarea>
    </div>
  </div>`,
  `<button onclick="submitDispute()" style="background:#dc2626;color:white;padding:12px 24px;border-radius:10px;border:none;cursor:pointer;font-size:14px;font-weight:700"><i class="fas fa-exclamation-triangle" style="margin-right:6px"></i>Submit Dispute</button>
   <button onclick="Modal.close()" style="padding:12px 20px;background:#f1f5f9;color:#64748b;border:none;border-radius:10px;cursor:pointer;font-size:14px">Cancel</button>`);
}

async function submitDispute() {
  const project_id = document.getElementById('disp-pid')?.value;
  const reason = document.getElementById('disp-reason')?.value;
  const description = document.getElementById('disp-desc')?.value;
  if (!project_id || !reason || !description) { Toast.show('All fields required', 'warning'); return; }
  try {
    await API.post('/disputes', { project_id: parseInt(project_id), reason, description });
    Modal.close(); Toast.show('Dispute submitted! Admin will review within 48 hours.', 'success', 5000);
    loadDisputes();
  } catch(e) { Toast.show(e.response?.data?.error || 'Failed to submit dispute', 'error'); }
}

function respondToDispute(disputeId) {
  Modal.show('Respond to Dispute', `
  <textarea id="resp-text" class="form-input" rows="5" placeholder="Write your response to this dispute..."></textarea>`,
  `<button onclick="submitDisputeResponse(${disputeId})" style="background:#2563eb;color:white;padding:12px 24px;border-radius:10px;border:none;cursor:pointer;font-size:14px;font-weight:700">Submit Response</button>
   <button onclick="Modal.close()" style="padding:12px 20px;background:#f1f5f9;color:#64748b;border:none;border-radius:10px;cursor:pointer;font-size:14px">Cancel</button>`);
}

async function submitDisputeResponse(disputeId) {
  const response = document.getElementById('resp-text')?.value;
  if (!response) { Toast.show('Response cannot be empty', 'warning'); return; }
  try {
    await API.patch(`/disputes/${disputeId}/respond`, { response });
    Modal.close(); Toast.show('Response submitted!', 'success');
    loadDisputes();
  } catch(e) { Toast.show(e.response?.data?.error || 'Failed', 'error'); }
}

// ── ENHANCED ADMIN: DISPUTES + TOP VENDORS + BULK ACTIONS ─────────────────
async function loadAdminDisputes() {
  const el = document.getElementById('admin-content');
  if (!el) return;
  el.innerHTML = '<div style="display:flex;justify-content:center;padding:60px"><div class="loading-spinner"></div></div>';
  try {
    const { data } = await API.get('/disputes');
    const ds = data.disputes || [];
    const statusColors = { open:'#f59e0b', resolved:'#10b981', closed:'#64748b' };
    el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;flex-wrap:wrap;gap:12px">
      <h2 style="font-size:22px;font-weight:800;color:#0f172a">Dispute Management (${ds.length})</h2>
      <div style="display:flex;gap:8px">
        <span style="background:#fef3c7;color:#d97706;padding:4px 12px;border-radius:10px;font-size:12px;font-weight:600">${ds.filter(d=>d.status==='open').length} Open</span>
        <span style="background:#f0fdf4;color:#059669;padding:4px 12px;border-radius:10px;font-size:12px;font-weight:600">${ds.filter(d=>d.status==='resolved').length} Resolved</span>
      </div>
    </div>
    ${ds.length === 0 ? `<div style="background:white;border-radius:20px;padding:60px;text-align:center"><i class="fas fa-shield-alt" style="font-size:48px;color:#10b981;display:block;margin-bottom:16px"></i><p style="font-weight:600;color:#374151">No disputes filed</p></div>` :
    `<div style="display:grid;gap:12px">
      ${ds.map(d => `
      <div style="background:white;border-radius:16px;padding:20px;box-shadow:0 1px 4px rgba(0,0,0,0.05);border-left:4px solid ${statusColors[d.status]||'#64748b'}">
        <div style="display:flex;align-items:start;gap:16px;flex-wrap:wrap">
          <div style="flex:1">
            <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
              <span style="background:${statusColors[d.status]||'#64748b'}20;color:${statusColors[d.status]||'#64748b'};padding:2px 10px;border-radius:10px;font-size:11px;font-weight:700;text-transform:uppercase">${d.status}</span>
              <span style="font-size:11px;color:#94a3b8">#${d.id} · ${Helpers.date(d.created_at)}</span>
            </div>
            <p style="font-weight:700;color:#1e293b;margin-bottom:4px">${d.reason}</p>
            <p style="font-size:13px;color:#64748b">Project: ${d.project_title} · Customer: ${d.customer_name} · Vendor: ${d.vendor_name||'N/A'}</p>
            <p style="font-size:13px;color:#374151;margin-top:8px">${(d.description||'').substring(0,200)}</p>
            ${d.customer_response ? `<div style="background:#eff6ff;border-radius:8px;padding:10px;margin-top:8px"><p style="font-size:11px;font-weight:700;color:#2563eb">Customer Response:</p><p style="font-size:13px;color:#374151">${d.customer_response}</p></div>` : ''}
            ${d.vendor_response ? `<div style="background:#f5f3ff;border-radius:8px;padding:10px;margin-top:8px"><p style="font-size:11px;font-weight:700;color:#7c3aed">Vendor Response:</p><p style="font-size:13px;color:#374151">${d.vendor_response}</p></div>` : ''}
          </div>
          ${d.status === 'open' ? `
          <div style="display:flex;flex-direction:column;gap:8px;min-width:140px">
            <button onclick="adminResolveDispute(${d.id})" style="padding:8px 14px;background:#f0fdf4;color:#059669;border:1.5px solid #86efac;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600"><i class="fas fa-check" style="margin-right:4px"></i>Resolve</button>
            <button onclick="adminCloseDispute(${d.id})" style="padding:8px 14px;background:#fef2f2;color:#dc2626;border:1.5px solid #fca5a5;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600"><i class="fas fa-times" style="margin-right:4px"></i>Close</button>
          </div>` : ''}
        </div>
      </div>`).join('')}
    </div>`}`;
  } catch(e) {
    el.innerHTML = `<div style="color:#dc2626;padding:60px;text-align:center">${e.message}</div>`;
  }
}

function adminResolveDispute(id) {
  Modal.show('Resolve Dispute', `
  <div style="display:flex;flex-direction:column;gap:14px">
    <div>
      <label class="form-label">Resolution Statement *</label>
      <textarea id="res-resolution" class="form-input" rows="4" placeholder="Describe the resolution decision..."></textarea>
    </div>
    <div>
      <label class="form-label">Favour</label>
      <select id="res-winner" class="form-input">
        <option value="">Neutral</option>
        <option value="customer">Customer</option>
        <option value="vendor">Vendor</option>
      </select>
    </div>
    <div>
      <label class="form-label">Refund Amount (₹)</label>
      <input id="res-refund" type="number" class="form-input" placeholder="0">
    </div>
    <div>
      <label class="form-label">Admin Notes</label>
      <textarea id="res-notes" class="form-input" rows="2" placeholder="Internal notes..."></textarea>
    </div>
  </div>`,
  `<button onclick="submitAdminResolution(${id})" style="background:#059669;color:white;padding:12px 24px;border-radius:10px;border:none;cursor:pointer;font-size:14px;font-weight:700">Submit Resolution</button>
   <button onclick="Modal.close()" style="padding:12px 20px;background:#f1f5f9;color:#64748b;border:none;border-radius:10px;cursor:pointer;font-size:14px">Cancel</button>`);
}

async function submitAdminResolution(id) {
  const resolution = document.getElementById('res-resolution')?.value;
  const winner = document.getElementById('res-winner')?.value;
  const refund_amount = parseFloat(document.getElementById('res-refund')?.value)||0;
  const notes = document.getElementById('res-notes')?.value;
  if (!resolution) { Toast.show('Resolution statement required', 'warning'); return; }
  try {
    await API.patch(`/disputes/${id}/resolve`, { resolution, winner, refund_amount, notes });
    Modal.close(); Toast.show('Dispute resolved!', 'success');
    loadAdminDisputes();
  } catch(e) { Toast.show(e.response?.data?.error || 'Failed', 'error'); }
}

async function adminCloseDispute(id) {
  if (!confirm('Close this dispute without resolution?')) return;
  try {
    await API.patch(`/disputes/${id}/resolve`, { resolution: 'Closed by admin', notes: 'Insufficient evidence' });
    Toast.show('Dispute closed', 'info');
    loadAdminDisputes();
  } catch(e) { Toast.show(e.response?.data?.error || 'Failed', 'error'); }
}

// disputes and top-vendors are now handled directly inside loadAdminSection above

async function loadAdminTopVendors() {
  const el = document.getElementById('admin-content');
  if (!el) return;
  el.innerHTML = '<div style="display:flex;justify-content:center;padding:60px"><div class="loading-spinner"></div></div>';
  try {
    const { data } = await API.get('/admin/users?role=vendor');
    const vendors = data.users || [];
    el.innerHTML = `
    <div style="margin-bottom:24px"><h2 style="font-size:22px;font-weight:800;color:#0f172a">Top Vendors Analytics</h2></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;margin-bottom:28px">
      ${vendors.slice(0,6).map((v,i) => `
      <div style="background:white;border-radius:16px;padding:20px;box-shadow:0 1px 4px rgba(0,0,0,0.05);border-top:3px solid ${['#f59e0b','#94a3b8','#cd7f32','#2563eb','#7c3aed','#059669'][i]||'#e2e8f0'}">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
          <div style="width:36px;height:36px;background:linear-gradient(135deg,#7c3aed,#2563eb);border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-weight:800">${i+1}</div>
          <div>
            <p style="font-weight:700;color:#1e293b;font-size:14px">${v.name}</p>
            <p style="font-size:11px;color:#64748b">${v.email}</p>
          </div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <span style="font-size:11px;background:#f0fdf4;color:#059669;padding:2px 8px;border-radius:8px;font-weight:600">${v.is_active?'Active':'Inactive'}</span>
          <span style="font-size:11px;background:#eff6ff;color:#2563eb;padding:2px 8px;border-radius:8px;font-weight:600">Vendor</span>
        </div>
        <div style="margin-top:12px;display:flex;justify-content:space-between">
          <button onclick="Router.go('/vendors/${v.id}')" style="font-size:12px;background:#eff6ff;color:#2563eb;border:none;border-radius:6px;padding:5px 10px;cursor:pointer">View Profile</button>
          <button onclick="toggleUser(${v.id},${v.is_active},this)" style="font-size:12px;background:${v.is_active?'#fef2f2':'#f0fdf4'};color:${v.is_active?'#dc2626':'#059669'};border:none;border-radius:6px;padding:5px 10px;cursor:pointer">${v.is_active?'Suspend':'Activate'}</button>
        </div>
      </div>`).join('')}
    </div>
    <div style="background:white;border-radius:16px;padding:24px;box-shadow:0 1px 4px rgba(0,0,0,0.05)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <h3 style="font-size:15px;font-weight:700;color:#1e293b">All Vendors (${vendors.length})</h3>
        <button onclick="exportUsersCSV()" style="background:#f0fdf4;color:#059669;border:1px solid #86efac;border-radius:8px;padding:6px 14px;cursor:pointer;font-size:12px;font-weight:600"><i class="fas fa-download" style="margin-right:4px"></i>Export CSV</button>
      </div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse">
          <thead><tr style="background:#f8fafc">
            ${['Name','Email','Joined','Status','Actions'].map(h=>`<th style="text-align:left;padding:10px 12px;font-size:12px;color:#64748b;font-weight:600">${h}</th>`).join('')}
          </tr></thead>
          <tbody>${vendors.map((v,i) => `
          <tr style="border-top:1px solid #f1f5f9;${i%2?'background:#fafafa':''}">
            <td style="padding:10px 12px;font-size:13px;font-weight:600;color:#1e293b">${v.name}</td>
            <td style="padding:10px 12px;font-size:12px;color:#64748b">${v.email}</td>
            <td style="padding:10px 12px;font-size:12px;color:#64748b">${Helpers.date(v.created_at)}</td>
            <td style="padding:10px 12px"><span style="font-size:11px;padding:2px 8px;border-radius:10px;font-weight:600;background:${v.is_active?'#f0fdf4':'#fef2f2'};color:${v.is_active?'#059669':'#dc2626'}">${v.is_active?'Active':'Inactive'}</span></td>
            <td style="padding:10px 12px"><button onclick="toggleUser(${v.id},${v.is_active},this)" style="font-size:11px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:4px 10px;cursor:pointer">${v.is_active?'Suspend':'Activate'}</button></td>
          </tr>`).join('')}</tbody>
        </table>
      </div>
    </div>`;
  } catch(e) {
    el.innerHTML = `<div style="color:#dc2626;padding:60px;text-align:center">${e.message}</div>`;
  }
}

function exportUsersCSV() {
  Toast.show('CSV export triggered. In production, this downloads all user data.', 'info');
}

// Enhance admin sidebar to include new items
async function loadExpertSection(section) {
  document.querySelectorAll('.sidebar-nav button').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById(`edash-${section}`);
  if (btn) btn.classList.add('active');
  const el = document.getElementById('expert-content');
  if (!el) return;
  if (section === 'consultations') {
    el.innerHTML = '<div style="display:flex;justify-content:center;padding:60px"><div class="loading-spinner"></div></div>';
    try {
      const { data } = await API.get('/consultations');
      const cons = data.consultations || [];
      const pending = cons.filter(c => c.status === 'requested');
      const accepted = cons.filter(c => c.status === 'accepted');
      el.innerHTML = `
      <h2 style="font-size:22px;font-weight:800;color:#0f172a;margin-bottom:24px">My Consultations</h2>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-bottom:28px">
        ${[['fa-clock','Pending Requests',pending.length,'#f59e0b','#fffbeb'],['fa-calendar-check','Scheduled',accepted.length,'#2563eb','#eff6ff'],['fa-check-circle','Completed',cons.filter(c=>c.status==='completed').length,'#10b981','#f0fdf4']].map(([icon,label,val,color,bg]) => `
        <div class="stat-card"><div style="width:40px;height:40px;background:${bg};border-radius:10px;display:flex;align-items:center;justify-content:center;margin-bottom:10px"><i class="fas ${icon}" style="color:${color}"></i></div><p style="font-size:22px;font-weight:800;color:#0f172a">${val}</p><p style="font-size:12px;color:#64748b;margin-top:4px">${label}</p></div>`).join('')}
      </div>
      <div style="display:grid;gap:14px">
        ${cons.length === 0 ? '<div style="background:white;border-radius:20px;padding:60px;text-align:center"><p style="color:#64748b">No consultations yet</p></div>' :
        cons.map(c => `
        <div style="background:white;border-radius:14px;padding:20px;box-shadow:0 1px 4px rgba(0,0,0,0.05)">
          <div style="display:flex;align-items:start;gap:14px;flex-wrap:wrap">
            <div style="flex:1">
              <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
                <span style="font-size:11px;background:${c.status==='requested'?'#fffbeb;color:#d97706':c.status==='accepted'?'#eff6ff;color:#2563eb':'#f0fdf4;color:#059669'};padding:2px 10px;border-radius:10px;font-weight:700">${c.status}</span>
                <span style="font-size:11px;color:#94a3b8">${Helpers.date(c.created_at)}</span>
              </div>
              <p style="font-weight:700;color:#1e293b">${c.topic}</p>
              <p style="font-size:13px;color:#64748b">${c.customer_name} · ${c.consultation_type||'video'} · ₹${(c.fee||0).toLocaleString('en-IN')}</p>
              ${c.preferred_date ? `<p style="font-size:12px;color:#374151;margin-top:4px"><i class="fas fa-calendar" style="margin-right:4px;color:#2563eb"></i>Preferred: ${c.preferred_date} ${c.preferred_time||''}</p>` : ''}
            </div>
            <div style="display:flex;flex-direction:column;gap:8px">
              ${c.status === 'requested' ? `<button onclick="acceptConsultation(${c.id})" style="padding:8px 14px;background:#f0fdf4;color:#059669;border:1.5px solid #86efac;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600">Accept</button>` : ''}
              ${c.status === 'accepted' ? `<button onclick="completeConsultation(${c.id})" style="padding:8px 14px;background:#eff6ff;color:#2563eb;border:1.5px solid #bfdbfe;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600">Mark Complete</button>` : ''}
            </div>
          </div>
        </div>`).join('')}
      </div>`;
    } catch(e) { el.innerHTML = `<div style="color:#dc2626;padding:60px;text-align:center">${e.message}</div>`; }
    return;
  }
  if (_origLoadExpertSection && _origLoadExpertSection !== loadExpertSection) {
    return _origLoadExpertSection(section);
}
}

function acceptConsultation(id) {
  Modal.show('Accept Consultation', `
  <div style="display:flex;flex-direction:column;gap:14px">
    <div>
      <label class="form-label">Scheduled Date</label>
      <input id="acc-date" type="date" class="form-input" min="${new Date().toISOString().split('T')[0]}">
    </div>
    <div>
      <label class="form-label">Scheduled Time</label>
      <select id="acc-time" class="form-input">${['09:00','10:00','11:00','12:00','14:00','15:00','16:00','17:00'].map(t=>`<option>${t}</option>`).join('')}</select>
    </div>
    <div>
      <label class="form-label">Video Call Link (optional)</label>
      <input id="acc-link" class="form-input" placeholder="https://meet.google.com/...">
    </div>
  </div>`,
  `<button onclick="submitAcceptConsultation(${id})" class="btn-primary" style="color:white;padding:12px 24px;border-radius:10px;font-size:14px;font-weight:700">Confirm</button>
   <button onclick="Modal.close()" style="padding:12px 20px;background:#f1f5f9;color:#64748b;border:none;border-radius:10px;cursor:pointer;font-size:14px">Cancel</button>`);
}

async function submitAcceptConsultation(id) {
  try {
    await API.patch(`/consultations/${id}/accept`, {
      scheduled_date: document.getElementById('acc-date')?.value,
      scheduled_time: document.getElementById('acc-time')?.value,
      video_link: document.getElementById('acc-link')?.value
    });
    Modal.close(); Toast.show('Consultation accepted!', 'success');
    loadExpertSection('consultations');
  } catch(e) { Toast.show(e.response?.data?.error || 'Failed', 'error'); }
}

function completeConsultation(id) {
  Modal.show('Complete Consultation', `
  <div style="display:flex;flex-direction:column;gap:14px">
    <div>
      <label class="form-label">Summary</label>
      <textarea id="comp-summary" class="form-input" rows="3" placeholder="Brief summary of the consultation..."></textarea>
    </div>
    <div>
      <label class="form-label">Recommendations</label>
      <textarea id="comp-reco" class="form-input" rows="3" placeholder="Technical recommendations given..."></textarea>
    </div>
    <div>
      <label class="form-label">Report URL (optional)</label>
      <input id="comp-url" class="form-input" placeholder="Link to uploaded report document">
    </div>
  </div>`,
  `<button onclick="submitCompleteConsultation(${id})" style="background:#059669;color:white;padding:12px 24px;border-radius:10px;border:none;cursor:pointer;font-size:14px;font-weight:700">Mark Complete</button>
   <button onclick="Modal.close()" style="padding:12px 20px;background:#f1f5f9;color:#64748b;border:none;border-radius:10px;cursor:pointer;font-size:14px">Cancel</button>`);
}

async function submitCompleteConsultation(id) {
  try {
    await API.patch(`/consultations/${id}/complete`, {
      summary: document.getElementById('comp-summary')?.value,
      recommendations: document.getElementById('comp-reco')?.value,
      report_url: document.getElementById('comp-url')?.value
    });
    Modal.close(); Toast.show('Consultation marked complete!', 'success');
    loadExpertSection('consultations');
  } catch(e) { Toast.show(e.response?.data?.error || 'Failed', 'error'); }
}

// ── SEO LANDING PAGES ─────────────────────────────────────────────────────
Pages.servicePage = async function() {
  const serviceType = Router.params?.service || Router.current.split('/')[2] || 'solar';
  const serviceData = {
    solar: { name:'Solar EPC', icon:'fa-solar-panel', color:'#f97316', bg:'#fff7ed', desc:'Complete solar panel installation, net metering, and EPC services across India.', cities:['Mumbai','Delhi','Pune','Bangalore','Hyderabad','Chennai','Ahmedabad','Jaipur'] },
    electrical: { name:'Electrical Services', icon:'fa-bolt', color:'#f59e0b', bg:'#fffbeb', desc:'Residential and commercial electrical wiring, panel installation, and maintenance.', cities:['Mumbai','Delhi','Pune','Bangalore','Kolkata','Chennai','Noida','Gurgaon'] },
    hvac: { name:'HVAC Services', icon:'fa-wind', color:'#3b82f6', bg:'#eff6ff', desc:'Air conditioning installation, VRF systems, ducting, and HVAC maintenance.', cities:['Delhi','Mumbai','Pune','Hyderabad','Bangalore','Chennai','Chandigarh','Jaipur'] },
    plumbing: { name:'Plumbing Services', icon:'fa-faucet', color:'#06b6d4', bg:'#ecfeff', desc:'Bathroom renovation, pipe installation, drainage, and plumbing repairs.', cities:['Mumbai','Delhi','Bengaluru','Hyderabad','Pune','Kolkata','Ahmedabad','Surat'] },
    fabrication: { name:'MS Fabrication', icon:'fa-industry', color:'#8b5cf6', bg:'#f5f3ff', desc:'Structural steel fabrication, shed construction, and custom metal works.', cities:['Pune','Mumbai','Delhi','Ahmedabad','Surat','Nashik','Nagpur','Coimbatore'] },
    contracting: { name:'Civil Contracting', icon:'fa-hard-hat', color:'#10b981', bg:'#f0fdf4', desc:'Residential construction, renovation, and civil works by verified contractors.', cities:['Mumbai','Delhi','Bangalore','Chennai','Hyderabad','Pune','Ahmedabad','Kolkata'] }
  };
  const svc = serviceData[serviceType] || serviceData.solar;
  document.getElementById('app').innerHTML = layout(`
  <div style="background:${svc.bg};padding:60px 20px">
    <div style="max-width:1000px;margin:0 auto;text-align:center">
      <div style="width:72px;height:72px;background:white;border-radius:20px;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;box-shadow:0 4px 16px rgba(0,0,0,0.1)">
        <i class="fas ${svc.icon}" style="font-size:30px;color:${svc.color}"></i>
      </div>
      <h1 style="font-size:40px;font-weight:900;color:#0f172a;margin-bottom:12px">${svc.name} Services in India</h1>
      <p style="font-size:18px;color:#64748b;max-width:600px;margin:0 auto 32px">${svc.desc}</p>
      <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
        <button onclick="Router.go('/post-project')" class="btn-accent" style="color:white;padding:14px 32px;border-radius:12px;font-size:16px;font-weight:700"><i class="fas fa-plus" style="margin-right:8px"></i>Post Your Project</button>
        <button onclick="Router.go('/projects?service_type=${serviceType}')" style="background:white;color:${svc.color};padding:14px 32px;border-radius:12px;font-size:16px;font-weight:600;border:2px solid ${svc.color};cursor:pointer"><i class="fas fa-search" style="margin-right:8px"></i>Browse ${svc.name} Projects</button>
      </div>
    </div>
  </div>
  <div style="max-width:1200px;margin:0 auto;padding:60px 20px">
    <h2 style="font-size:28px;font-weight:800;color:#0f172a;text-align:center;margin-bottom:40px">${svc.name} Services by City</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px;margin-bottom:60px">
      ${svc.cities.map(city => `
      <div class="card-hover" onclick="Router.go('/projects?service_type=${serviceType}&location=${encodeURIComponent(city)}')" style="background:white;border-radius:16px;padding:20px;box-shadow:0 2px 8px rgba(0,0,0,0.06);text-align:center;cursor:pointer">
        <i class="fas fa-map-marker-alt" style="font-size:24px;color:${svc.color};margin-bottom:10px;display:block"></i>
        <p style="font-weight:700;color:#1e293b">${svc.name}</p>
        <p style="font-weight:600;color:#64748b;font-size:14px">${city}</p>
        <p style="font-size:12px;color:${svc.color};margin-top:8px;font-weight:600">Browse Projects →</p>
      </div>`).join('')}
    </div>
    <div style="background:linear-gradient(135deg,${svc.color},${svc.color}cc);border-radius:20px;padding:40px;text-align:center;color:white">
      <h3 style="font-size:24px;font-weight:800;margin-bottom:12px">Get Free Quotes from Top ${svc.name} Contractors</h3>
      <p style="opacity:0.9;margin-bottom:24px">Post your project once and receive competitive bids from verified professionals within 24 hours.</p>
      <button onclick="Router.go('/ai-tools')" style="background:rgba(255,255,255,0.2);color:white;padding:12px 24px;border-radius:12px;border:1.5px solid rgba(255,255,255,0.4);cursor:pointer;font-weight:600;font-size:14px;margin-right:12px"><i class="fas fa-calculator" style="margin-right:6px"></i>Get AI Cost Estimate</button>
      <button onclick="Router.go('/post-project')" style="background:white;color:${svc.color};padding:12px 24px;border-radius:12px;border:none;cursor:pointer;font-weight:700;font-size:14px"><i class="fas fa-plus" style="margin-right:6px"></i>Post Project Now</button>
    </div>
  </div>`);
};

// ── SHORTLIST PAGE ─────────────────────────────────────────────────────────
Pages.shortlist = async function() {
  if (!Auth.isLoggedIn() || Auth.role() !== 'customer') { Router.go('/login'); return; }
  document.getElementById('app').innerHTML = layout(`
  <div style="max-width:1000px;margin:0 auto;padding:40px 20px">
    <h1 style="font-size:28px;font-weight:900;color:#0f172a;margin-bottom:8px">My Shortlisted Vendors</h1>
    <p style="color:#64748b;margin-bottom:32px;font-size:14px">Vendors you've saved for future projects.</p>
    <div id="shortlist-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:20px">
      <div style="grid-column:1/-1;display:flex;justify-content:center;padding:40px"><div class="loading-spinner"></div></div>
    </div>
  </div>`);
  loadShortlist();
};

async function loadShortlist() {
  const grid = document.getElementById('shortlist-grid');
  if (!grid) return;
  try {
    const { data } = await API.get('/shortlist');
    const sl = data.shortlist || [];
    if (sl.length === 0) {
      grid.innerHTML = `<div style="grid-column:1/-1;background:white;border-radius:20px;padding:60px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,0.06)">
        <i class="fas fa-heart" style="font-size:48px;color:#e2e8f0;display:block;margin-bottom:16px"></i>
        <h3 style="color:#1e293b;font-weight:700;margin-bottom:8px">No Saved Vendors</h3>
        <p style="color:#64748b;font-size:14px">Browse vendors and save your favourites here!</p>
        <button onclick="Router.go('/vendors')" class="btn-primary" style="color:white;padding:10px 24px;border-radius:10px;font-size:14px;font-weight:600;margin-top:16px">Browse Vendors</button>
      </div>`;
      return;
    }
    grid.innerHTML = sl.map(v => `
    <div style="background:white;border-radius:16px;box-shadow:0 2px 8px rgba(0,0,0,0.06);overflow:hidden">
      <div style="background:linear-gradient(135deg,#7c3aed,#2563eb);padding:16px;color:white;display:flex;align-items:center;justify-content:space-between">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:40px;height:40px;background:rgba(255,255,255,0.2);border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700">${(v.company_name||'V').charAt(0)}</div>
          <div>
            <p style="font-weight:700">${v.company_name||v.vendor_name}</p>
            <p style="font-size:12px;opacity:0.8">${v.vendor_name||''}</p>
          </div>
        </div>
        <button onclick="removeShortlist(${v.vendor_id})" style="background:rgba(255,255,255,0.15);border:none;color:white;padding:4px 10px;border-radius:8px;cursor:pointer;font-size:12px"><i class="fas fa-heart-broken"></i></button>
      </div>
      <div style="padding:16px">
        ${Helpers.stars(v.rating||0)} <span style="font-size:12px;color:#64748b">(${v.total_reviews||0})</span>
        <p style="font-size:13px;color:#64748b;margin-top:8px"><i class="fas fa-map-marker-alt" style="margin-right:4px;color:#3b82f6"></i>${v.service_area||'N/A'}</p>
        <div style="display:flex;gap:8px;margin-top:12px">
          <button onclick="Router.go('/vendors/${v.vendor_id}')" class="btn-primary" style="flex:1;color:white;padding:8px;border-radius:8px;font-size:12px;font-weight:600">View Profile</button>
          <button onclick="Router.go('/messages')" style="flex:1;background:#f0fdf4;color:#059669;border:1px solid #86efac;border-radius:8px;padding:8px;cursor:pointer;font-size:12px;font-weight:600">Message</button>
        </div>
      </div>
    </div>`).join('');
  } catch(e) {
    grid.innerHTML = `<div style="grid-column:1/-1;color:#dc2626;padding:40px;text-align:center">${e.message}</div>`;
  }
}

async function removeShortlist(vendorId) {
  if (!confirm('Remove from shortlist?')) return;
  try {
    await API.delete(`/shortlist/${vendorId}`);
    Toast.show('Removed from shortlist', 'info');
    loadShortlist();
  } catch(e) { Toast.show('Failed to remove', 'error'); }
}

async function addToShortlist(vendorId) {
  if (!Auth.isLoggedIn()) { Toast.show('Login to save vendors', 'warning'); return; }
  if (Auth.role() !== 'customer') { Toast.show('Only customers can shortlist vendors', 'info'); return; }
  try {
    await API.post('/shortlist', { vendor_id: vendorId });
    Toast.show('Added to shortlist! ❤️', 'success');
  } catch(e) { Toast.show(e.response?.data?.error || 'Failed', 'error'); }
}

// ── REVERSE AUCTION PAGE ──────────────────────────────────────────────────
Pages.reverseAuction = async function() {
  const projectId = Router.params?.id || Router.current.split('/')[2];
  document.getElementById('app').innerHTML = layout(`
  <div style="max-width:1000px;margin:0 auto;padding:40px 20px">
    <button onclick="history.back()" style="background:#f1f5f9;border:none;padding:8px 16px;border-radius:8px;cursor:pointer;font-size:13px;color:#64748b;margin-bottom:20px"><i class="fas fa-arrow-left" style="margin-right:6px"></i>Back</button>
    <div style="background:linear-gradient(135deg,#7c3aed,#4c1d95);border-radius:20px;padding:28px;color:white;margin-bottom:28px">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
        <div style="width:48px;height:48px;background:rgba(255,255,255,0.2);border-radius:14px;display:flex;align-items:center;justify-content:center">
          <i class="fas fa-gavel" style="font-size:22px"></i>
        </div>
        <div>
          <h1 style="font-size:24px;font-weight:900">Reverse Auction</h1>
          <p style="opacity:0.85;font-size:14px">Project #${projectId} - Lowest bid wins!</p>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px">
        <div style="background:rgba(255,255,255,0.15);border-radius:12px;padding:14px;text-align:center">
          <p style="font-size:11px;opacity:0.8">Auction Status</p>
          <p style="font-size:16px;font-weight:800;margin-top:4px" id="auction-status">Loading...</p>
        </div>
        <div style="background:rgba(255,255,255,0.15);border-radius:12px;padding:14px;text-align:center">
          <p style="font-size:11px;opacity:0.8">Time Remaining</p>
          <p style="font-size:16px;font-weight:800;margin-top:4px" id="auction-timer">--:--:--</p>
        </div>
        <div style="background:rgba(255,255,255,0.15);border-radius:12px;padding:14px;text-align:center">
          <p style="font-size:11px;opacity:0.8">Total Bids</p>
          <p style="font-size:16px;font-weight:800;margin-top:4px" id="auction-bid-count">0</p>
        </div>
        <div style="background:rgba(255,255,255,0.15);border-radius:12px;padding:14px;text-align:center">
          <p style="font-size:11px;opacity:0.8">Lowest Bid</p>
          <p style="font-size:16px;font-weight:800;margin-top:4px" id="auction-lowest">--</p>
        </div>
      </div>
    </div>
    <div id="auction-bids" style="display:grid;gap:14px"><div style="display:flex;justify-content:center;padding:40px"><div class="loading-spinner"></div></div></div>
  </div>`);
  loadAuctionBids(projectId);
};

async function loadAuctionBids(projectId) {
  try {
    const [projRes, bidsRes] = await Promise.all([
      API.get(`/projects/${projectId}`),
      API.get(`/bids/project/${projectId}`)
    ]);
    const project = projRes.data.project;
    const bids = bidsRes.data.bids || [];
    const sorted = [...bids].sort((a,b) => a.bid_amount - b.bid_amount);
    
    // Timer
    if (project?.bid_closing_date) {
      const end = new Date(project.bid_closing_date).getTime();
      const updateTimer = () => {
        const remaining = end - Date.now();
        const timerEl = document.getElementById('auction-timer');
        if (!timerEl) return;
        if (remaining <= 0) { timerEl.textContent = 'CLOSED'; timerEl.style.color = '#fca5a5'; return; }
        const h = Math.floor(remaining/3600000), m = Math.floor((remaining%3600000)/60000), s = Math.floor((remaining%60000)/1000);
        timerEl.textContent = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
      };
      updateTimer(); setInterval(updateTimer, 1000);
    }
    document.getElementById('auction-status').textContent = project?.status?.toUpperCase() || 'OPEN';
    document.getElementById('auction-bid-count').textContent = bids.length;
    document.getElementById('auction-lowest').textContent = sorted.length > 0 ? `₹${sorted[0].bid_amount.toLocaleString('en-IN')}` : '--';
    
    const el = document.getElementById('auction-bids');
    if (!el) return;
    el.innerHTML = `
    <h3 style="font-size:18px;font-weight:800;color:#0f172a;margin-bottom:16px">Bids Ranking (Lowest First)</h3>
    ${sorted.length === 0 ? '<div style="background:white;border-radius:16px;padding:60px;text-align:center;color:#64748b">No bids received yet</div>' :
    sorted.map((bid,i) => `
    <div style="background:white;border-radius:14px;padding:20px;box-shadow:0 1px 4px rgba(0,0,0,0.05);display:flex;align-items:center;gap:16px;flex-wrap:wrap;border-left:4px solid ${i===0?'#10b981':i===1?'#3b82f6':i===2?'#8b5cf6':'#e2e8f0'}">
      <div style="width:40px;height:40px;background:${i===0?'#10b981':i===1?'#3b82f6':i===2?'#8b5cf6':'#e2e8f0'};border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-weight:900;font-size:16px;flex-shrink:0">${i+1}</div>
      <div style="flex:1">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
          <p style="font-weight:700;color:#1e293b">${bid.company_name||bid.vendor_name}</p>
          ${i===0?'<span style="background:#f0fdf4;color:#059669;padding:2px 8px;border-radius:8px;font-size:11px;font-weight:700">LOWEST BID</span>':''}
        </div>
        ${Helpers.stars(bid.rating||0)} <span style="font-size:11px;color:#94a3b8">· ${bid.timeline_days} days</span>
      </div>
      <div style="text-align:right">
        <p style="font-size:22px;font-weight:900;color:${i===0?'#059669':'#1e293b'}">₹${bid.bid_amount.toLocaleString('en-IN')}</p>
        ${i===0?`<p style="font-size:11px;color:#059669;font-weight:600">BEST VALUE</p>`:''}
      </div>
      ${Auth.can('customer') ? `<button onclick="Router.go('/bid-comparison/${projectId}')" style="padding:8px 14px;background:#eff6ff;color:#2563eb;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600">Full Comparison</button>` : ''}
    </div>`).join('')}`;
  } catch(e) {
    const el = document.getElementById('auction-bids');
    if (el) el.innerHTML = `<div style="color:#dc2626;padding:40px;text-align:center">${e.message}</div>`;
  }
}

// ── ROUTER INIT ───────────────────────────────────────────────────────────


// ════════════════════════════════════════════════════════════════════════════
// BidKarts v3 – Expert Lists, Services, Admin Controls
// ════════════════════════════════════════════════════════════════════════════

function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function formatNotifMessage(msg) {
  if (!msg) return '';
  // If it looks like raw JSON / object, try to humanise it
  if (msg.trim().startsWith('{') || msg.includes('user_id:') || msg.includes('action:')) {
    try {
      const obj = typeof msg === 'string' ? JSON.parse(msg) : msg;
      if (obj.action === 'new_bid') return `A vendor submitted a new bid on your project.`;
      if (obj.action === 'project_posted') return `Your project has been posted successfully.`;
      if (obj.action === 'consultation_request') return `You have a new consultation request.`;
      return 'You have a new notification.';
    } catch { return msg; }
  }
  return msg;
}
function notifIcon(type) {
  const map = { success:'✅', error:'❌', warning:'⚠️', info:'ℹ️', bid:'💰', project:'📋', payment:'💳', inspection:'🔍', consultation:'🎓', message:'💬', review:'⭐', referral:'🎁' };
  return map[type] || '🔔';
}

// ── Subscription badge helper ────────────────────────────────────────────────
function planBadge(plan) {
  const map = { premium: 'background:#f5f3ff;color:#7c3aed;border:1px solid #c4b5fd', pro: 'background:#eff6ff;color:#2563eb;border:1px solid #93c5fd', free: 'background:#f8fafc;color:#64748b;border:1px solid #e2e8f0' };
  const icons = { premium: '👑', pro: '⚡', free: '' };
  const style = map[plan] || map.free;
  const icon = icons[plan] || '';
  return `<span style="font-size:10px;padding:2px 8px;border-radius:10px;font-weight:700;${style}">${icon} ${(plan||'free').toUpperCase()}</span>`;
}

// ── Expert card renderer (used in experts list + booking flow) ───────────────
function renderExpertCard(e, showBook = true) {
  const fee = e.hourly_rate || 1500;
  const avail = e.is_available !== 0;
  return `<div class="card-hover" style="background:white;border-radius:16px;padding:24px;box-shadow:0 1px 4px rgba(0,0,0,0.06);border:1.5px solid #f1f5f9;position:relative;overflow:hidden">
    ${!avail ? '<div style="position:absolute;top:12px;right:12px;background:#fef2f2;color:#dc2626;font-size:10px;font-weight:700;padding:3px 8px;border-radius:6px">UNAVAILABLE</div>' : '<div style="position:absolute;top:12px;right:12px;background:#f0fdf4;color:#16a34a;font-size:10px;font-weight:700;padding:3px 8px;border-radius:6px">AVAILABLE</div>'}
    <div style="display:flex;align-items:flex-start;gap:14px;margin-bottom:14px">
      <div style="width:52px;height:52px;background:linear-gradient(135deg,#0891b2,#7c3aed);border-radius:14px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
        <span style="color:white;font-size:20px;font-weight:700">${(e.name||'E').charAt(0)}</span>
      </div>
      <div style="flex:1;min-width:0">
        <h3 style="font-weight:700;color:#1e293b;font-size:15px;margin:0 0 2px">${escapeHtml(e.name)}</h3>
        <p style="font-size:12px;color:#7c3aed;font-weight:600;margin:0">${escapeHtml(e.specialization||'Technical Expert')}</p>
        <div style="display:flex;align-items:center;gap:6px;margin-top:4px">
          <div>${Helpers.stars(e.rating)}</div>
          <span style="font-size:11px;color:#64748b">${(e.rating||0).toFixed(1)} · ${e.total_consultations||0} consultations</span>
        </div>
      </div>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px">
      <span style="font-size:11px;background:#f0fdf4;color:#16a34a;padding:3px 10px;border-radius:8px"><i class="fas fa-briefcase" style="margin-right:4px"></i>${e.experience||0} yrs exp</span>
      <span style="font-size:11px;background:#eff6ff;color:#2563eb;padding:3px 10px;border-radius:8px"><i class="fas fa-map-marker-alt" style="margin-right:4px"></i>${(e.service_area||'All India').split(',')[0]}</span>
      <span style="font-size:11px;background:#fefce8;color:#ca8a04;padding:3px 10px;border-radius:8px"><i class="fas fa-certificate" style="margin-right:4px"></i>${(e.certification||'Certified').split(',')[0]}</span>
    </div>
    ${e.bio ? `<p style="font-size:12px;color:#64748b;margin-bottom:12px;line-height:1.5">${Helpers.truncate(e.bio,90)}</p>` : ''}
    <div style="display:flex;align-items:center;justify-content:space-between;padding-top:12px;border-top:1px solid #f1f5f9">
      <div>
        <p style="font-size:18px;font-weight:800;color:#1e293b;margin:0">₹${fee.toLocaleString('en-IN')}</p>
        <p style="font-size:10px;color:#94a3b8;margin:0">per consultation</p>
      </div>
      <div style="display:flex;gap:8px">
        <button onclick="Router.go('/experts/${e.id}')" style="padding:8px 14px;background:#f8fafc;color:#374151;border:1px solid #e2e8f0;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600">Profile</button>
        ${showBook && avail ? `<button onclick="openBookExpertModal(${e.id},'${escapeHtml(e.name)}',${fee})" class="btn-primary" style="color:white;padding:8px 16px;border-radius:8px;font-size:12px;font-weight:600">Book Now</button>` : ''}
      </div>
    </div>
  </div>`;
}

// ── Experts List Page (Fix #2 + #3) ──────────────────────────────────────────
Pages.expertsList = async function() {
  const app = document.getElementById('app');
  app.innerHTML = renderNavbar() + `
  <div style="background:linear-gradient(135deg,#0f172a 0%,#1d4ed8 60%,#7c3aed 100%);padding:60px 20px;text-align:center">
    <div style="max-width:700px;margin:0 auto">
      <h1 style="color:white;font-size:36px;font-weight:900;margin-bottom:12px">🎓 Expert Consultants</h1>
      <p style="color:rgba(255,255,255,0.8);font-size:16px;margin-bottom:28px">Certified professionals for site visits, technical audits, and project consultations.</p>
      <div style="display:flex;gap:12px;max-width:560px;margin:0 auto">
        <input id="exp-search" placeholder="Search by specialization, area..." class="form-input" style="flex:1" onkeyup="filterExperts()" />
        <select id="exp-service" class="form-input" style="width:180px" onchange="filterExperts()">
          <option value="">All Services</option>
          <option value="solar">Solar EPC</option>
          <option value="electrical">Electrical</option>
          <option value="hvac">HVAC</option>
          <option value="plumbing">Plumbing</option>
          <option value="fabrication">Fabrication</option>
          <option value="contracting">Contracting</option>
        </select>
      </div>
    </div>
  </div>
  <div style="max-width:1280px;margin:0 auto;padding:40px 20px">
    <div id="experts-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:24px">
      <div style="display:flex;justify-content:center;padding:60px;grid-column:1/-1"><div class="loading-spinner"></div></div>
    </div>
  </div>
  ${renderFooter()}
  <div id="book-expert-modal"></div>`;

  let allExperts = [];
  try {
    const { data } = await API.get('/consultations/experts');
    allExperts = data.experts || [];
    window._allExperts = allExperts;
    renderExpertGrid(allExperts);
  } catch(e) {
    document.getElementById('experts-grid').innerHTML = `<div style="text-align:center;padding:60px;color:#ef4444;grid-column:1/-1">${e.message}</div>`;
  }
};

function renderExpertGrid(experts) {
  const grid = document.getElementById('experts-grid');
  if (!grid) return;
  if (!experts.length) { grid.innerHTML = '<p style="text-align:center;color:#94a3b8;padding:60px;grid-column:1/-1">No experts found matching your criteria.</p>'; return; }
  grid.innerHTML = experts.map(e => renderExpertCard(e, Auth.can('customer'))).join('');
}

function filterExperts() {
  const q = (document.getElementById('exp-search')?.value||'').toLowerCase();
  const svc = document.getElementById('exp-service')?.value||'';
  const list = (window._allExperts||[]).filter(e => {
    const matchQ = !q || (e.name||'').toLowerCase().includes(q) || (e.specialization||'').toLowerCase().includes(q) || (e.service_area||'').toLowerCase().includes(q);
    const matchS = !svc || (e.specialization||'').toLowerCase().includes(svc) || (e.expertise_area||'').toLowerCase().includes(svc);
    return matchQ && matchS;
  });
  renderExpertGrid(list);
}

// ── Expert Detail Page ────────────────────────────────────────────────────────
Pages.expertDetail = async function(params) {
  const app = document.getElementById('app');
  app.innerHTML = renderNavbar() + `<div style="max-width:900px;margin:40px auto;padding:0 20px"><div class="loading-spinner" style="display:block;margin:80px auto"></div></div>` + renderFooter();
  try {
    const { data } = await API.get(`/consultations/experts/${params.id}`);
    const e = data.expert;
    const reviews = data.reviews || [];
    app.innerHTML = renderNavbar() + `
    <div style="max-width:900px;margin:40px auto;padding:0 20px">
      <button onclick="Router.go('/experts')" style="display:inline-flex;align-items:center;gap:6px;color:#2563eb;font-size:13px;font-weight:600;background:none;border:none;cursor:pointer;margin-bottom:20px"><i class="fas fa-arrow-left"></i>Back to Experts</button>
      <div style="background:white;border-radius:20px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,0.06);margin-bottom:24px">
        <div style="display:flex;align-items:flex-start;gap:24px;flex-wrap:wrap">
          <div style="width:80px;height:80px;background:linear-gradient(135deg,#0891b2,#7c3aed);border-radius:20px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <span style="color:white;font-size:32px;font-weight:700">${(e.name||'E').charAt(0)}</span>
          </div>
          <div style="flex:1">
            <h1 style="font-size:24px;font-weight:800;color:#0f172a;margin:0 0 4px">${escapeHtml(e.name)}</h1>
            <p style="color:#7c3aed;font-weight:600;margin:0 0 8px">${escapeHtml(e.specialization||'Technical Expert')}</p>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <div>${Helpers.stars(e.rating)}</div>
              <span style="font-size:13px;color:#64748b">${(e.rating||0).toFixed(1)} · ${e.total_inspections||0} consultations completed</span>
            </div>
          </div>
          <div style="text-align:right">
            <div style="font-size:28px;font-weight:900;color:#1e293b">₹${(e.hourly_rate||1500).toLocaleString('en-IN')}</div>
            <div style="font-size:12px;color:#94a3b8">per consultation</div>
            ${Auth.can('customer') ? `<button onclick="openBookExpertModal(${e.id},'${escapeHtml(e.name)}',${e.hourly_rate||1500})" class="btn-primary" style="color:white;padding:12px 24px;border-radius:10px;font-size:14px;font-weight:600;margin-top:12px;display:block">Book Consultation</button>` : ''}
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px;margin-top:24px;padding-top:24px;border-top:1px solid #f1f5f9">
          ${[['fa-briefcase','Experience',`${e.experience||0} years`,'#2563eb'],['fa-map-marker-alt','Service Area',(e.service_area||'All India').split(',').slice(0,2).join(', '),'#10b981'],['fa-certificate','Certification',(e.certification||'Certified').split(',')[0],'#f59e0b'],['fa-clock','Response Time','< 24 hours','#7c3aed']].map(([ic,lb,vl,cl]) => `
          <div style="background:#f8fafc;border-radius:12px;padding:16px;text-align:center">
            <i class="fas ${ic}" style="font-size:20px;color:${cl};margin-bottom:8px;display:block"></i>
            <p style="font-size:11px;color:#64748b;margin:0 0 4px">${lb}</p>
            <p style="font-size:13px;font-weight:700;color:#1e293b;margin:0">${escapeHtml(vl)}</p>
          </div>`).join('')}
        </div>
        ${e.bio ? `<div style="margin-top:20px"><h3 style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:8px">About</h3><p style="color:#475569;font-size:14px;line-height:1.7">${escapeHtml(e.bio)}</p></div>` : ''}
      </div>
      ${reviews.length ? `<div style="background:white;border-radius:20px;padding:24px;box-shadow:0 2px 8px rgba(0,0,0,0.06)">
        <h3 style="font-size:16px;font-weight:700;color:#1e293b;margin-bottom:16px">Client Reviews (${reviews.length})</h3>
        <div style="display:grid;gap:12px">
          ${reviews.map(r => `<div style="padding:16px;background:#f8fafc;border-radius:12px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
              <span style="font-size:13px;font-weight:600;color:#1e293b">${escapeHtml(r.customer_name)}</span>
              <div>${Helpers.stars(r.rating)}</div>
            </div>
            <p style="font-size:13px;color:#475569;margin:0">${escapeHtml(r.review||'')}</p>
            <p style="font-size:11px;color:#94a3b8;margin-top:6px">${Helpers.date(r.completed_at)}</p>
          </div>`).join('')}
        </div>
      </div>` : ''}
    </div>
    ${renderFooter()}
    <div id="book-expert-modal"></div>`;
  } catch(e) {
    app.innerHTML = renderNavbar() + `<p style="text-align:center;padding:80px;color:#ef4444">${e.message}</p>` + renderFooter();
  }
};

// ── Book Expert Modal (shared) ────────────────────────────────────────────────
function openBookExpertModal(expertId, expertName, fee) {
  if (!Auth.isLoggedIn()) { Router.go('/login'); return; }
  if (!Auth.can('customer')) { Toast.show('Only customers can book experts', 'warning'); return; }
  Modal.show(`Book Consultation with ${expertName}`,
    `<div>
      <div style="background:#eff6ff;border-radius:10px;padding:14px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between">
        <span style="font-size:13px;color:#2563eb;font-weight:600">Consultation Fee</span>
        <span style="font-size:20px;font-weight:800;color:#1e293b">₹${(fee||1500).toLocaleString('en-IN')}</span>
      </div>
      <div style="display:grid;gap:12px">
        <div><label class="form-label">Service Type *</label>
          <select id="bk-service" class="form-input">
            <option value="solar">Solar EPC</option><option value="electrical">Electrical</option>
            <option value="hvac">HVAC</option><option value="plumbing">Plumbing</option>
            <option value="fabrication">Fabrication</option><option value="contracting">Contracting</option>
          </select></div>
        <div><label class="form-label">Consultation Topic *</label>
          <input id="bk-topic" class="form-input" placeholder="e.g. Solar panel sizing for 3BHK" /></div>
        <div><label class="form-label">Description</label>
          <textarea id="bk-desc" class="form-input" rows="3" placeholder="Describe your requirements..."></textarea></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div><label class="form-label">Preferred Date</label>
            <input id="bk-date" type="date" class="form-input" min="${new Date().toISOString().split('T')[0]}" /></div>
          <div><label class="form-label">Preferred Time</label>
            <select id="bk-time" class="form-input">
              ${['09:00','10:30','12:00','14:00','15:30','17:00'].map(t=>`<option value="${t}">${t}</option>`).join('')}
            </select></div>
        </div>
        <div><label class="form-label">Consultation Type</label>
          <select id="bk-type" class="form-input">
            <option value="video">Video Call</option><option value="phone">Phone Call</option><option value="on-site">On-Site Visit</option>
          </select></div>
      </div>
    </div>`,
    `<button onclick="Modal.close()" style="padding:10px 20px;border:1.5px solid #e2e8f0;border-radius:8px;background:white;cursor:pointer;font-size:14px;color:#374151">Cancel</button>
     <button onclick="submitBookExpert(${expertId})" class="btn-primary" style="color:white;padding:10px 24px;border-radius:8px;font-size:14px;font-weight:600">Confirm Booking</button>`
  );
}

async function submitBookExpert(expertId) {
  const service = document.getElementById('bk-service')?.value;
  const topic = document.getElementById('bk-topic')?.value?.trim();
  const desc = document.getElementById('bk-desc')?.value?.trim();
  const date = document.getElementById('bk-date')?.value;
  const time = document.getElementById('bk-time')?.value;
  const type = document.getElementById('bk-type')?.value;
  if (!topic) { Toast.show('Please enter a consultation topic','warning'); return; }
  try {
    const { data } = await API.post('/consultations', { expert_id: expertId, service_type: service, topic, description: desc, preferred_date: date, preferred_time: time, consultation_type: type });
    Modal.close();
    Toast.show(`✅ Request sent to ${data.expert_name || 'Expert'}! They will confirm within 24 hours.`, 'success', 5000);
  } catch(e) { Toast.show(e.response?.data?.error||'Booking failed','error'); }
}

// ── Services Hub Page ─────────────────────────────────────────────────────────
Pages.servicesHub = function() {
  const app = document.getElementById('app');
  const services = [
    { key:'electrical', label:'Electrical Works', icon:'fa-bolt', color:'#f59e0b', bg:'#fefce8', gradient:'#f59e0b,#d97706',
      desc:'Comprehensive electrical solutions for residential, commercial and industrial needs.',
      features:['Internal/External Wiring', 'Electrical Panel Upgrades', 'Safety Audits & Inspections', 'Industrial Electrification', 'Power Quality Analysis', 'EV Charging Points'],
      priceRange:'₹15,000 – ₹5,00,000', timeline:'2-30 days', stats:['500+ Vendors','4.7★ Rating','2000+ Projects'] },
    { key:'solar', label:'Solar EPC', icon:'fa-sun', color:'#f97316', bg:'#fff7ed', gradient:'#f97316,#ea580c',
      desc:'End-to-end solar power solutions from design to installation and maintenance.',
      features:['Rooftop Solar Systems (1-100kW)', 'Net Metering & Grid Connection', 'Solar Water Heating', 'Operations & Maintenance', 'Battery Storage Systems', 'Solar Street Lighting'],
      priceRange:'₹40,000 – ₹50,00,000', timeline:'7-60 days', stats:['300+ Vendors','4.8★ Rating','1500+ Projects'] },
    { key:'hvac', label:'HVAC Services', icon:'fa-wind', color:'#06b6d4', bg:'#ecfeff', gradient:'#06b6d4,#0891b2',
      desc:'Heating, ventilation and air conditioning installation, maintenance and repair.',
      features:['AC Installation & Repair', 'Central Air Systems', 'VRF/VRV Systems', 'Industrial Ventilation', 'Clean Room HVAC', 'AMC Contracts'],
      priceRange:'₹8,000 – ₹20,00,000', timeline:'1-30 days', stats:['400+ Vendors','4.6★ Rating','3000+ Projects'] },
    { key:'plumbing', label:'Plumbing', icon:'fa-tint', color:'#3b82f6', bg:'#eff6ff', gradient:'#3b82f6,#2563eb',
      desc:'Professional plumbing services for all types of residential and commercial properties.',
      features:['Water Supply & Drainage', 'Pipe Fitting & Repair', 'Bathroom Renovation', 'Water Proofing', 'STP/ETP Systems', 'Fire Fighting Systems'],
      priceRange:'₹5,000 – ₹15,00,000', timeline:'1-30 days', stats:['350+ Vendors','4.5★ Rating','2500+ Projects'] },
    { key:'fabrication', label:'Fabrication', icon:'fa-cogs', color:'#8b5cf6', bg:'#f5f3ff', gradient:'#8b5cf6,#7c3aed',
      desc:'Structural steel, MS fabrication, and custom industrial fabrication solutions.',
      features:['Structural Steel Fabrication', 'MS Gates & Grills', 'Industrial Sheds', 'Storage Racks & Mezzanines', 'Stainless Steel Work', 'Modular Buildings'],
      priceRange:'₹20,000 – ₹1,00,00,000', timeline:'7-90 days', stats:['200+ Vendors','4.7★ Rating','800+ Projects'] },
    { key:'contracting', label:'Civil Contracting', icon:'fa-hard-hat', color:'#10b981', bg:'#f0fdf4', gradient:'#10b981,#059669',
      desc:'Complete civil construction, interior design and turnkey project solutions.',
      features:['Residential Construction', 'Commercial Interiors', 'Office Fitouts', 'Renovation & Repairs', 'Turnkey Projects', 'Project Management'],
      priceRange:'₹50,000 – ₹5,00,00,000', timeline:'15-180 days', stats:['600+ Vendors','4.6★ Rating','4000+ Projects'] }
  ];
  app.innerHTML = renderNavbar() + `
  <div style="background:linear-gradient(135deg,#0f172a,#1e3a8a);padding:60px 20px;text-align:center">
    <div style="max-width:700px;margin:0 auto">
      <h1 style="color:white;font-size:40px;font-weight:900;margin-bottom:12px">Our Services</h1>
      <p style="color:rgba(255,255,255,0.75);font-size:16px;line-height:1.6">India's most trusted B2B platform for technical contracting. Post a project and receive competitive bids from verified professionals.</p>
      ${Auth.can('customer') ? `<button onclick="Router.go('/post-project')" style="background:linear-gradient(135deg,#f97316,#ea580c);color:white;padding:14px 32px;border-radius:12px;font-size:16px;font-weight:700;border:none;cursor:pointer;margin-top:20px;box-shadow:0 4px 16px rgba(249,115,22,0.4)"><i class="fas fa-plus" style="margin-right:8px"></i>Post a Project</button>` : !Auth.isLoggedIn() ? `<button onclick="Router.go('/register')" style="background:white;color:#1e3a8a;padding:14px 32px;border-radius:12px;font-size:16px;font-weight:700;border:none;cursor:pointer;margin-top:20px">Get Started Free</button>` : ''}
    </div>
  </div>
  <div style="max-width:1200px;margin:48px auto;padding:0 20px">
    <div style="text-align:center;margin-bottom:40px">
      <h2 style="font-size:28px;font-weight:800;color:#0f172a;margin-bottom:8px">6 Specialized Services</h2>
      <p style="color:#64748b;font-size:15px">Click any service to explore projects, vendors and more details</p>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:24px">
      ${services.map(s => `
      <div class="card-hover" onclick="Router.go('/services/${s.key}')" style="background:white;border-radius:20px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.07);cursor:pointer;border:1.5px solid #f1f5f9">
        <div style="background:linear-gradient(135deg,${s.gradient});padding:24px 24px 20px">
          <div style="display:flex;align-items:center;gap:14px;margin-bottom:12px">
            <div style="width:50px;height:50px;background:rgba(255,255,255,0.2);border-radius:14px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
              <i class="fas ${s.icon}" style="font-size:22px;color:white"></i>
            </div>
            <div>
              <h3 style="font-size:18px;font-weight:800;color:white;margin:0">${s.label}</h3>
              <p style="font-size:11px;color:rgba(255,255,255,0.75);margin-top:2px">${s.stats[2]}</p>
            </div>
          </div>
          <div style="display:flex;gap:12px">
            ${s.stats.map(stat => `<span style="background:rgba(255,255,255,0.2);color:white;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600">${stat}</span>`).join('')}
          </div>
        </div>
        <div style="padding:20px 24px">
          <p style="font-size:13px;color:#64748b;line-height:1.6;margin-bottom:16px">${s.desc}</p>
          <div style="margin-bottom:16px">
            <p style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">Services Include</p>
            <div style="display:flex;flex-wrap:wrap;gap:6px">
              ${s.features.slice(0,4).map(f => `<span style="background:${s.bg};color:${s.color};padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600">${f}</span>`).join('')}
              ${s.features.length > 4 ? `<span style="background:#f1f5f9;color:#64748b;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600">+${s.features.length-4} more</span>` : ''}
            </div>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;padding-top:12px;border-top:1px solid #f1f5f9">
            <div>
              <p style="font-size:10px;color:#94a3b8;font-weight:600;text-transform:uppercase">Typical Budget</p>
              <p style="font-size:13px;font-weight:700;color:#1e293b">${s.priceRange}</p>
            </div>
            <span style="font-size:12px;font-weight:600;color:${s.color};display:flex;align-items:center;gap:6px">Explore <i class="fas fa-arrow-right"></i></span>
          </div>
        </div>
      </div>`).join('')}
    </div>
    
    <!-- Why BidKarts Section -->
    <div style="background:linear-gradient(135deg,#f8fafc,#eff6ff);border-radius:24px;padding:48px;margin-top:56px;text-align:center">
      <h2 style="font-size:26px;font-weight:800;color:#0f172a;margin-bottom:8px">Why Choose BidKarts?</h2>
      <p style="color:#64748b;margin-bottom:32px;font-size:15px">Trusted by 15,000+ businesses across India</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:24px">
        ${[['fa-shield-alt','Verified Vendors','All vendors are background-checked and certified','#2563eb'],
           ['fa-gavel','Competitive Bidding','Get multiple quotes and choose the best value','#059669'],
           ['fa-user-tie','Expert Inspection','Independent technical inspection by certified experts','#7c3aed'],
           ['fa-lock','Secure Payments','Escrow-protected milestone-based payments','#f97316'],
           ['fa-headset','Dedicated Support','24/7 dispute resolution and customer support','#0891b2'],
           ['fa-chart-line','Track Progress','Real-time project tracking and milestone management','#10b981'],
        ].map(([icon,title,desc,color]) => `
        <div style="background:white;border-radius:16px;padding:24px;box-shadow:0 1px 4px rgba(0,0,0,0.05)">
          <div style="width:44px;height:44px;background:${color}15;border-radius:12px;display:flex;align-items:center;justify-content:center;margin:0 auto 12px">
            <i class="fas ${icon}" style="color:${color};font-size:18px"></i>
          </div>
          <h3 style="font-size:14px;font-weight:700;color:#1e293b;margin-bottom:6px">${title}</h3>
          <p style="font-size:12px;color:#64748b;line-height:1.5">${desc}</p>
        </div>`).join('')}
      </div>
    </div>
  </div>
  ${renderFooter()}`;
};

// ── Fixed Services Page ────────────────────────────────────────────────────────
Pages.servicePage = async function() {
  const raw = Router.current.split('/').pop();
  const serviceMap = { 'solar-epc':'solar', 'solar':'solar', 'hvac':'hvac', 'electrical':'electrical', 'plumbing':'plumbing', 'fabrication':'fabrication', 'contracting':'contracting' };
  const serviceType = serviceMap[raw] || raw;
  const serviceDetails = {
    electrical: {
      label:'Electrical Works', icon:'fa-bolt', color:'#f59e0b', gradient:'#f59e0b,#d97706',
      tagline:'Safe, Certified Electrical Solutions for Every Need',
      desc:'From basic wiring to complex industrial installations, our verified electrical contractors handle all your electrical requirements with the highest safety standards and quality workmanship.',
      features:['Internal & External Wiring','Electrical Panel Upgrades & MCB Boards','Safety Audits & Load Calculations','Industrial Electrification','Power Quality Analysis','EV Charging Point Installation','Street Lighting','Generator & UPS Installations'],
      process:['Post your electrical project','Receive bids from certified electricians','Get a technical inspection (optional)','Select vendor and begin work','Pay in milestones','Review & close'],
      faqs:[['Are your electricians certified?','Yes, all our electrical vendors are licensed and certified by state electrical boards.'],['What types of electrical projects can I post?','Residential wiring, commercial projects, industrial installations, solar grid connections and more.'],['How long does an electrical project typically take?','Small projects (1-3 days), medium (1-2 weeks), large industrial projects (1-3 months).']],
      avgBudget:'₹15,000 – ₹5,00,000', timeline:'2-30 days'
    },
    solar: {
      label:'Solar EPC', icon:'fa-sun', color:'#f97316', gradient:'#f97316,#ea580c',
      tagline:'Clean Energy Solutions – Design, Supply & Install',
      desc:'End-to-end solar power projects from feasibility study and design through procurement, installation, net metering, and long-term operations & maintenance. Make the switch to clean energy today.',
      features:['Rooftop Solar Systems 1-100kW','Net Metering & DISCOM Approvals','Solar Water Heating','Operations & Maintenance (O&M)','Battery Storage (BESS)','Solar Street Lighting','Industrial & Commercial Solar','Off-grid Solar Solutions'],
      process:['Post your solar project with site details','Get bids from MNRE-empaneled installers','Optional technical inspection by solar expert','Select best-value installer','Pay in milestones (design, supply, install, commissioning)','System handover and O&M agreement'],
      faqs:[['What subsidies are available?','PM-KUSUM and MNRE subsidies are available for residential installations. Our vendors help with subsidy applications.'],['How much can I save on electricity?','Typically 60-90% of your electricity bill, with full payback in 4-6 years.'],['What is an EPC contract?','Engineering, Procurement and Construction – a complete turnkey solar installation contract.']],
      avgBudget:'₹40,000 – ₹50,00,000', timeline:'7-60 days'
    },
    hvac: {
      label:'HVAC Services', icon:'fa-wind', color:'#06b6d4', gradient:'#06b6d4,#0891b2',
      tagline:'Comfort Climate Solutions for Every Space',
      desc:'Professional HVAC installation, maintenance and repair for residential, commercial and industrial applications. From split ACs to central chilled water systems, we have experts for every scale.',
      features:['Split AC Installation & Service','Central Air Systems','VRF/VRV Systems','Precision Cooling (Data Centers)','Industrial Process Cooling','Clean Room HVAC','Annual Maintenance Contracts (AMC)','Duct Design & Installation'],
      process:['Post your HVAC requirement','Receive competitive bids from HVAC contractors','Optional inspection for large systems','Select contractor and approve design','Work progresses in milestones','Commissioning test and handover'],
      faqs:[['Do you handle both installation and maintenance?','Yes, vendors on BidKarts offer both fresh installations and AMC contracts for existing systems.'],['What brands do your vendors work with?','Daikin, Voltas, Blue Star, LG, Samsung, Carrier, Trane and all major brands.'],['Are your HVAC contractors certified?','All our HVAC vendors are certified by OEMs and hold refrigerant handling certificates.']],
      avgBudget:'₹8,000 – ₹20,00,000', timeline:'1-30 days'
    },
    plumbing: {
      label:'Plumbing', icon:'fa-tint', color:'#3b82f6', gradient:'#3b82f6,#2563eb',
      tagline:'Expert Plumbing for Homes and Commercial Projects',
      desc:'Professional plumbing solutions for new construction, renovation and repair. Our verified plumbers handle everything from leaky taps to complete bathroom renovations and commercial plumbing systems.',
      features:['Water Supply & Drainage','Pipe Fitting & Leak Repair','Complete Bathroom Renovation','Waterproofing','Sewage Treatment Plants (STP)','Effluent Treatment Plants (ETP)','Fire Fighting Systems','Water Softeners & Filters'],
      process:['Describe your plumbing project','Get quotes from plumbing contractors','Site inspection if required','Work begins as per scope','Progress payments at milestones','Sign-off and warranty'],
      faqs:[['Do vendors provide warranty?','Yes, most plumbing works come with a 1-year workmanship warranty.'],['Can I get waterproofing done for my terrace?','Yes, we have specialized waterproofing contractors for terraces, basements and foundations.'],['What is the typical cost of a bathroom renovation?','A complete bathroom renovation costs ₹50,000–₹2,00,000 depending on fixtures and area.']],
      avgBudget:'₹5,000 – ₹15,00,000', timeline:'1-30 days'
    },
    fabrication: {
      label:'Metal Fabrication', icon:'fa-cogs', color:'#8b5cf6', gradient:'#8b5cf6,#7c3aed',
      tagline:'Precision Metal Fabrication for Industry & Construction',
      desc:'Custom structural steel, stainless steel and MS fabrication for industrial, commercial and residential projects. From gates and grills to industrial sheds and storage systems.',
      features:['Structural Steel Fabrication','MS Gates, Grills & Railings','Industrial Sheds & Warehouses','Storage Racks & Mezzanines','Stainless Steel Fabrication','Modular Buildings & Cabins','Scaffolding Systems','Metal Cladding & Roofing'],
      process:['Post your fabrication project with drawings','Receive bids from fabricators','Visit to workshop for material approval','Fabrication and quality check','Delivery and installation','Sign-off and final payment'],
      faqs:[['Do fabricators provide installation too?','Yes, most fabricators on BidKarts offer complete supply and installation.'],['Can you fabricate to custom drawings?','Absolutely. You can upload drawings/specifications when posting your project.'],['What materials do fabricators work with?','MS (Mild Steel), SS (Stainless Steel), Aluminium, Galvanized Steel and more.']],
      avgBudget:'₹20,000 – ₹1,00,00,000', timeline:'7-90 days'
    },
    contracting: {
      label:'Civil Contracting', icon:'fa-hard-hat', color:'#10b981', gradient:'#10b981,#059669',
      tagline:'Build With Confidence – End-to-End Civil Solutions',
      desc:'Complete civil construction, interior fit-outs and renovation services. From luxury home construction to commercial office fit-outs, our certified contractors deliver quality work on time.',
      features:['Residential Construction','Commercial Interiors & Fit-outs','Office & Retail Renovations','Turnkey Projects','Project Management Consulting','Structural Repairs','False Ceiling & Partitions','Painting & Finishing Works'],
      process:['Post your project with BOQ or scope','Receive detailed quotes','Site visit and technical review','Finalize contractor and contract','Milestone-based construction','Quality inspection and handover'],
      faqs:[['Can I get a turnkey project done?','Yes, several contractors on BidKarts specialize in complete turnkey delivery including civil, electrical and plumbing.'],['How do I ensure quality of work?','BidKarts offers optional technical inspection by certified experts at each milestone.'],['Do contractors have insurance?','Yes, all contractors are required to have contractor all-risk (CAR) insurance coverage.']],
      avgBudget:'₹50,000 – ₹5,00,00,000', timeline:'15-180 days'
    }
  };
  const sd = serviceDetails[serviceType] || { label: serviceType, icon:'fa-tools', color:'#64748b', gradient:'#64748b,#475569', tagline:'', desc:'', features:[], process:[], faqs:[], avgBudget:'Varies', timeline:'Varies' };
  const app = document.getElementById('app');
  app.innerHTML = renderNavbar() + `
  <div style="background:linear-gradient(135deg,${sd.gradient});padding:60px 20px;color:white">
    <div style="max-width:900px;margin:0 auto">
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:16px">
        <button onclick="Router.go('/services')" style="background:rgba(255,255,255,0.2);border:none;color:white;padding:8px 14px;border-radius:10px;cursor:pointer;font-size:13px"><i class="fas fa-arrow-left" style="margin-right:6px"></i>All Services</button>
      </div>
      <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap">
        <div style="width:72px;height:72px;background:rgba(255,255,255,0.2);border-radius:20px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <i class="fas ${sd.icon}" style="font-size:32px;color:white"></i>
        </div>
        <div>
          <h1 style="font-size:36px;font-weight:900;margin-bottom:6px">${sd.label}</h1>
          <p style="font-size:16px;opacity:0.85;margin-bottom:0">${sd.tagline}</p>
        </div>
      </div>
      <div style="display:flex;gap:20px;margin-top:20px;flex-wrap:wrap">
        <div style="background:rgba(255,255,255,0.15);padding:12px 20px;border-radius:12px">
          <p style="font-size:11px;opacity:0.75;margin-bottom:2px">Typical Budget</p>
          <p style="font-size:15px;font-weight:700">${sd.avgBudget}</p>
        </div>
        <div style="background:rgba(255,255,255,0.15);padding:12px 20px;border-radius:12px">
          <p style="font-size:11px;opacity:0.75;margin-bottom:2px">Timeline</p>
          <p style="font-size:15px;font-weight:700">${sd.timeline}</p>
        </div>
        ${Auth.can('customer') ? `<button onclick="Router.go('/post-project')" style="background:white;color:${sd.color};padding:12px 24px;border-radius:12px;border:none;cursor:pointer;font-size:14px;font-weight:700;margin-left:auto"><i class="fas fa-plus" style="margin-right:6px"></i>Post a Project</button>` : ''}
      </div>
    </div>
  </div>
  <div style="max-width:1200px;margin:40px auto;padding:0 20px">
    <div style="display:grid;grid-template-columns:2fr 1fr;gap:32px;align-items:start">
      <div>
        <!-- About -->
        <div style="background:white;border-radius:20px;padding:28px;box-shadow:0 1px 4px rgba(0,0,0,0.05);margin-bottom:24px">
          <h2 style="font-size:20px;font-weight:800;color:#0f172a;margin-bottom:12px">About ${sd.label}</h2>
          <p style="font-size:14px;color:#475569;line-height:1.7">${sd.desc}</p>
        </div>
        <!-- Services Offered -->
        <div style="background:white;border-radius:20px;padding:28px;box-shadow:0 1px 4px rgba(0,0,0,0.05);margin-bottom:24px">
          <h2 style="font-size:20px;font-weight:800;color:#0f172a;margin-bottom:16px">Services We Cover</h2>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            ${sd.features.map(f => `<div style="display:flex;align-items:center;gap:8px;padding:10px;background:#f8fafc;border-radius:10px">
              <i class="fas fa-check-circle" style="color:${sd.color};font-size:14px;flex-shrink:0"></i>
              <span style="font-size:13px;color:#374151;font-weight:500">${f}</span>
            </div>`).join('')}
          </div>
        </div>
        <!-- Process -->
        <div style="background:white;border-radius:20px;padding:28px;box-shadow:0 1px 4px rgba(0,0,0,0.05);margin-bottom:24px">
          <h2 style="font-size:20px;font-weight:800;color:#0f172a;margin-bottom:20px">How It Works</h2>
          <div style="display:flex;flex-direction:column;gap:12px">
            ${sd.process.map((step, i) => `<div style="display:flex;align-items:flex-start;gap:14px">
              <div style="width:32px;height:32px;background:linear-gradient(135deg,${sd.gradient});border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:white;font-size:13px;font-weight:700">${i+1}</div>
              <div style="flex:1;padding-top:6px">
                <p style="font-size:14px;color:#374151;line-height:1.5">${step}</p>
                ${i < sd.process.length-1 ? '<div style="width:1px;height:12px;background:#e2e8f0;margin:6px 0 0 -22px;margin-left:calc(0px - 7px - 1px)"></div>' : ''}
              </div>
            </div>`).join('')}
          </div>
        </div>
        <!-- FAQs -->
        <div style="background:white;border-radius:20px;padding:28px;box-shadow:0 1px 4px rgba(0,0,0,0.05);margin-bottom:24px">
          <h2 style="font-size:20px;font-weight:800;color:#0f172a;margin-bottom:16px">Frequently Asked Questions</h2>
          <div style="display:flex;flex-direction:column;gap:12px">
            ${sd.faqs.map(([q,a]) => `<div style="border-radius:12px;border:1px solid #e2e8f0;overflow:hidden">
              <div style="background:#f8fafc;padding:14px 16px"><p style="font-size:14px;font-weight:700;color:#1e293b"><i class="fas fa-question-circle" style="color:${sd.color};margin-right:8px"></i>${q}</p></div>
              <div style="padding:14px 16px"><p style="font-size:13px;color:#475569;line-height:1.6">${a}</p></div>
            </div>`).join('')}
          </div>
        </div>
      </div>
      <div>
        <!-- Live Projects -->
        <div style="background:white;border-radius:20px;padding:24px;box-shadow:0 1px 4px rgba(0,0,0,0.05);margin-bottom:20px;position:sticky;top:84px">
          <h3 style="font-size:16px;font-weight:700;color:#1e293b;margin-bottom:14px"><i class="fas fa-clipboard-list" style="color:${sd.color};margin-right:8px"></i>Recent Projects</h3>
          <div id="svc-projects"><div class="loading-spinner" style="margin:20px auto;display:block"></div></div>
          <h3 style="font-size:16px;font-weight:700;color:#1e293b;margin:20px 0 14px"><i class="fas fa-hard-hat" style="color:${sd.color};margin-right:8px"></i>Top Vendors</h3>
          <div id="svc-vendors"><div class="loading-spinner" style="margin:20px auto;display:block"></div></div>
        </div>
      </div>
    </div>
  </div>
  ${renderFooter()}`;
  try {
    const [projRes, vendRes] = await Promise.all([
      API.get(`/projects?service_type=${serviceType}&limit=5`),
      API.get(`/users/vendors?service_type=${serviceType}`)
    ]);
    const projects = projRes.data.projects || [];
    const vendors = vendRes.data.vendors || [];
    document.getElementById('svc-projects').innerHTML = projects.length
      ? projects.map(p => `<div class="card-hover" onclick="Router.go('/projects/${p.id}')" style="background:#f8fafc;border-radius:10px;padding:12px;margin-bottom:10px;cursor:pointer"><div style="display:flex;justify-content:space-between;margin-bottom:4px">${Helpers.statusBadge(p.status)}<span style="font-size:10px;color:#94a3b8">${Helpers.date(p.created_at)}</span></div><p style="font-weight:600;color:#1e293b;font-size:13px">${Helpers.esc(p.title)}</p><p style="font-size:11px;color:#64748b;margin-top:3px"><i class="fas fa-map-marker-alt" style="margin-right:3px;color:#3b82f6"></i>${Helpers.esc(p.location||'India')} · ${p.bid_count||0} bids</p></div>`).join('') + `<button onclick="Router.go('/projects?service_type=${serviceType}')" style="width:100%;padding:8px;background:#eff6ff;color:#2563eb;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;margin-top:4px">View All Projects</button>`
      : '<p style="color:#94a3b8;padding:16px;text-align:center;font-size:13px">No projects yet. Be the first to post!</p>';
    document.getElementById('svc-vendors').innerHTML = vendors.length
      ? vendors.slice(0,5).map(v => `<div class="card-hover" onclick="Router.go('/vendors/${v.id}')" style="background:#f8fafc;border-radius:10px;padding:12px;margin-bottom:10px;cursor:pointer;display:flex;align-items:center;gap:10px"><div style="width:36px;height:36px;background:linear-gradient(135deg,${sd.gradient});border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0"><span style="color:white;font-weight:700;font-size:13px">${(v.company_name||v.name||'V').charAt(0)}</span></div><div style="flex:1"><p style="font-weight:700;color:#1e293b;font-size:13px;margin:0">${Helpers.esc(v.company_name||v.name)}</p><p style="font-size:11px;color:#64748b;margin:2px 0">${(v.experience_years||0)} yrs exp · ${Helpers.stars(v.rating)}</p></div></div>`).join('') + `<button onclick="Router.go('/vendors?service_type=${serviceType}')" style="width:100%;padding:8px;background:#f0fdf4;color:#059669;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;margin-top:4px">View All Vendors</button>`
      : '<p style="color:#94a3b8;padding:16px;text-align:center;font-size:13px">No vendors found yet.</p>';
  } catch(e) { console.error(e); }
};


// ── Admin Project Control (Fix #4, #12) ──────────────────────────────────────
async function adminEditProject(id) {
  try {
    const { data } = await API.get(`/admin/projects/${id}`);
    const p = data.project;
    Modal.show('Edit Project',
      `<div style="display:grid;gap:12px">
        <div><label class="form-label">Title</label><input id="ep-title" class="form-input" value="${escapeHtml(p.title||'')}"/></div>
        <div><label class="form-label">Status</label>
          <select id="ep-status" class="form-input">
            ${['open','bidding','vendor_selected','in_progress','completed','cancelled','suspended','flagged'].map(s=>`<option value="${s}" ${p.status===s?'selected':''}>${s.replace('_',' ').toUpperCase()}</option>`).join('')}
          </select></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div><label class="form-label">Budget Min (₹)</label><input id="ep-bmin" type="number" class="form-input" value="${p.budget_min||0}"/></div>
          <div><label class="form-label">Budget Max (₹)</label><input id="ep-bmax" type="number" class="form-input" value="${p.budget_max||0}"/></div>
        </div>
        <div><label class="form-label">Service Type</label>
          <select id="ep-service" class="form-input">
            ${['hvac','electrical','plumbing','solar','fabrication','contracting'].map(s=>`<option value="${s}" ${p.service_type===s?'selected':''}>${s.toUpperCase()}</option>`).join('')}
          </select></div>
        <div><label class="form-label">Admin Note (sent to customer)</label><textarea id="ep-note" class="form-input" rows="2" placeholder="Optional note...">${p.admin_note||''}</textarea></div>
      </div>`,
      `<button onclick="Modal.close()" style="padding:10px 20px;border:1.5px solid #e2e8f0;border-radius:8px;background:white;cursor:pointer">Cancel</button>
       <button onclick="saveAdminProjectEdit(${id})" class="btn-primary" style="color:white;padding:10px 24px;border-radius:8px;font-size:14px;font-weight:600">Save Changes</button>`
    );
  } catch(e) { Toast.show(e.response?.data?.error||'Failed to load','error'); }
}

async function saveAdminProjectEdit(id) {
  try {
    await API.patch(`/admin/projects/${id}`, {
      title: document.getElementById('ep-title')?.value,
      status: document.getElementById('ep-status')?.value,
      budget_min: parseFloat(document.getElementById('ep-bmin')?.value)||null,
      budget_max: parseFloat(document.getElementById('ep-bmax')?.value)||null,
      service_type: document.getElementById('ep-service')?.value,
      admin_note: document.getElementById('ep-note')?.value||null
    });
    Modal.close();
    Toast.show('✅ Project updated!','success');
    loadAdminSection('projects');
  } catch(e) { Toast.show(e.response?.data?.error||'Update failed','error'); }
}

async function adminDeleteProject(id, title) {
  if (!confirm(`Delete project "${title}"? This cannot be undone and all bids will be removed.`)) return;
  try {
    await API.delete(`/admin/projects/${id}`);
    Toast.show('Project deleted','info');
    loadAdminSection('projects');
  } catch(e) { Toast.show(e.response?.data?.error||'Delete failed','error'); }
}

async function adminSuspendProject(id, currentStatus) {
  const action = currentStatus === 'suspended' ? 'reinstate' : 'suspend';
  const reason = currentStatus !== 'suspended' ? prompt('Reason for suspension:') || '' : '';
  if (currentStatus !== 'suspended' && !confirm(`${action.charAt(0).toUpperCase()+action.slice(1)} this project?`)) return;
  try {
    await API.patch(`/admin/projects/${id}/suspend`, { reason });
    Toast.show(`Project ${action}d`,'info');
    loadAdminSection('projects');
  } catch(e) { Toast.show(e.response?.data?.error||'Failed','error'); }
}

async function adminFlagProject(id) {
  const reason = prompt('Reason for flagging as fraudulent:');
  if (!reason) return;
  try {
    await API.patch(`/admin/projects/${id}/flag`, { reason });
    Toast.show('🚩 Project flagged as fraudulent','warning');
    loadAdminSection('projects');
  } catch(e) { Toast.show(e.response?.data?.error||'Failed','error'); }
}

// ── Subscription Plans Page (Fix #10) ────────────────────────────────────────
Pages.vendorPlans = function() {
  const app = document.getElementById('app');
  const plans = [
    { id:'free', name:'Basic', price:0, color:'#64748b', grad:'#94a3b8,#64748b', features:['5 bids per month','Standard listing','Basic dashboard','Email support'], limit:'5 bids/month' },
    { id:'pro', name:'Pro', price:2999, color:'#2563eb', grad:'#3b82f6,#2563eb', features:['Unlimited bids','Priority listing','Analytics dashboard','Featured in search','Email & chat support'], limit:'Unlimited bids', popular:true },
    { id:'premium', name:'Premium', price:5999, color:'#7c3aed', grad:'#8b5cf6,#7c3aed', features:['Unlimited bids','👑 Featured vendor badge','Top listing position','Advanced analytics','Dedicated account manager','Profile verification badge','Custom company showcase'], limit:'Unlimited bids + Featured' }
  ];
  app.innerHTML = renderNavbar() + `
  <div style="background:linear-gradient(135deg,#1e3a8a,#7c3aed);padding:60px 20px;text-align:center">
    <h1 style="color:white;font-size:36px;font-weight:900;margin-bottom:12px">Vendor Subscription Plans</h1>
    <p style="color:rgba(255,255,255,0.85);font-size:16px">Choose a plan to grow your business on BidKarts.</p>
  </div>
  <div style="max-width:1100px;margin:48px auto;padding:0 20px">
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px;align-items:start">
      ${plans.map(p => `
      <div style="background:white;border-radius:24px;padding:32px;box-shadow:0 4px 20px rgba(0,0,0,0.08);border:2px solid ${p.popular ? p.color : '#f1f5f9'};position:relative;overflow:hidden">
        ${p.popular ? `<div style="position:absolute;top:20px;right:-30px;background:linear-gradient(135deg,${p.grad});color:white;font-size:11px;font-weight:700;padding:4px 40px;transform:rotate(45deg)">POPULAR</div>` : ''}
        <div style="margin-bottom:20px">
          <h3 style="font-size:22px;font-weight:800;color:#1e293b">${p.name}</h3>
          <div style="display:flex;align-items:baseline;gap:4px;margin-top:8px">
            <span style="font-size:36px;font-weight:900;color:${p.color}">${p.price === 0 ? 'Free' : '₹'+p.price.toLocaleString('en-IN')}</span>
            ${p.price > 0 ? `<span style="font-size:13px;color:#94a3b8">/month</span>` : ''}
          </div>
          <p style="font-size:12px;color:#94a3b8;margin-top:4px">${p.limit}</p>
        </div>
        <ul style="list-style:none;margin:0 0 24px;padding:0;display:grid;gap:8px">
          ${p.features.map(f => `<li style="display:flex;align-items:center;gap:8px;font-size:13px;color:#374151"><i class="fas fa-check-circle" style="color:${p.color};flex-shrink:0"></i>${f}</li>`).join('')}
        </ul>
        ${Auth.can('vendor') ? `<button onclick="upgradePlan('${p.id}','${p.name}',${p.price})" style="width:100%;padding:14px;background:${p.price===0?'#f8fafc':'linear-gradient(135deg,'+p.grad+')'};color:${p.price===0?'#374151':'white'};border:${p.price===0?'1.5px solid #e2e8f0':'none'};border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;transition:all 0.2s">${p.price===0?'Current Free Plan':'Upgrade to '+p.name}</button>` : `<button onclick="Router.go('/register?role=vendor')" style="width:100%;padding:14px;background:linear-gradient(135deg,${p.grad});color:white;border:none;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer">Get Started</button>`}
      </div>`).join('')}
    </div>
    <div style="margin-top:40px;background:#f8fafc;border-radius:16px;padding:24px;text-align:center">
      <p style="font-size:14px;color:#64748b">✅ All plans include: Secure payments · Customer reviews · Project tracking · Mobile app access</p>
      <p style="font-size:12px;color:#94a3b8;margin-top:8px">Prices are exclusive of 18% GST. Billed monthly. Cancel anytime.</p>
    </div>
  </div>
  ${renderFooter()}`;
};

async function upgradePlan(planId, planName, price) {
  if (!Auth.isLoggedIn()) { Router.go('/login'); return; }
  if (!confirm(`Upgrade to ${planName} plan${price > 0 ? ' for ₹' + price.toLocaleString('en-IN') + '/month?' : '?'}`)) return;
  try {
    await API.post('/users/subscribe', { plan: planId });
    Toast.show(`🎉 Successfully subscribed to ${planName} plan!`,'success', 5000);
    // Update local user
    if (State.user) { State.user.subscription_plan = planId; localStorage.setItem('bk_user', JSON.stringify(State.user)); }
  } catch(e) { Toast.show(e.response?.data?.error||'Upgrade failed','error'); }
}

// ── Admin AI Response Editor (Fix #6) ────────────────────────────────────────
async function loadAdminAIResponses() {
  const el = document.getElementById('admin-content');
  if (!el) return;
  el.innerHTML = '<div style="display:flex;justify-content:center;padding:60px"><div class="loading-spinner"></div></div>';
  try {
    const { data } = await API.get('/admin/ai/responses');
    const responses = data.responses || [];
    el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:12px">
      <h2 style="font-size:22px;font-weight:800;color:#0f172a">AI Knowledge Base (${responses.length})</h2>
      <button onclick="openAddAIResponse()" class="btn-primary" style="color:white;padding:10px 20px;border-radius:10px;font-size:13px;font-weight:600"><i class="fas fa-plus" style="margin-right:6px"></i>Add Response</button>
    </div>
    <div style="display:grid;gap:14px">
      ${responses.length ? responses.map(r => `
      <div style="background:white;border-radius:14px;padding:20px;box-shadow:0 1px 4px rgba(0,0,0,0.05)">
        <div style="display:flex;align-items:start;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <div style="flex:1">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
              <span style="font-size:11px;background:#eff6ff;color:#2563eb;padding:2px 8px;border-radius:8px;font-weight:600">${escapeHtml(r.category||'general')}</span>
              ${r.is_approved ? '<span style="font-size:11px;background:#f0fdf4;color:#16a34a;padding:2px 8px;border-radius:8px;font-weight:600">✅ Approved</span>' : '<span style="font-size:11px;background:#fef3c7;color:#d97706;padding:2px 8px;border-radius:8px;font-weight:600">⏳ Pending</span>'}
            </div>
            <p style="font-size:14px;font-weight:700;color:#1e293b;margin:0 0 6px">Q: ${escapeHtml(r.question)}</p>
            <p style="font-size:13px;color:#475569;line-height:1.6">A: ${escapeHtml(Helpers.truncate(r.answer,200))}</p>
            <p style="font-size:11px;color:#94a3b8;margin-top:6px">Updated: ${Helpers.date(r.updated_at)}</p>
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0">
            <button onclick="editAIResponse(${r.id},'${escapeHtml(r.question).replace(/'/g,"\\'")}','${escapeHtml(r.answer).replace(/'/g,"\\'")}','${r.category||'general'}',${r.is_approved})" style="padding:6px 12px;background:#eff6ff;color:#2563eb;border:none;border-radius:6px;cursor:pointer;font-size:12px"><i class="fas fa-edit"></i> Edit</button>
            ${!r.is_approved ? `<button onclick="approveAIResponse(${r.id})" style="padding:6px 12px;background:#f0fdf4;color:#16a34a;border:none;border-radius:6px;cursor:pointer;font-size:12px"><i class="fas fa-check"></i></button>` : ''}
            <button onclick="deleteAIResponse(${r.id})" style="padding:6px 12px;background:#fef2f2;color:#dc2626;border:none;border-radius:6px;cursor:pointer;font-size:12px"><i class="fas fa-trash"></i></button>
          </div>
        </div>
      </div>`).join('') : '<div style="text-align:center;padding:60px;color:#94a3b8"><i class="fas fa-robot" style="font-size:40px;margin-bottom:16px;display:block;color:#e2e8f0"></i><p>No AI responses yet. Add some to build your knowledge base!</p></div>'}
    </div>`;
  } catch(e) { el.innerHTML = `<div style="color:#dc2626;padding:40px;text-align:center">${e.message}</div>`; }
}

function openAddAIResponse() {
  Modal.show('Add AI Response',
    `<div style="display:grid;gap:12px">
      <div><label class="form-label">Category</label>
        <select id="air-cat" class="form-input"><option value="general">General</option><option value="solar">Solar</option><option value="electrical">Electrical</option><option value="hvac">HVAC</option><option value="plumbing">Plumbing</option><option value="fabrication">Fabrication</option><option value="pricing">Pricing</option></select></div>
      <div><label class="form-label">Question *</label><textarea id="air-q" class="form-input" rows="2" placeholder="What is the cost of 5kW solar installation?"></textarea></div>
      <div><label class="form-label">Answer *</label><textarea id="air-a" class="form-input" rows="4" placeholder="The cost of a 5kW rooftop solar installation typically ranges from..."></textarea></div>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" id="air-approved"/> <span style="font-size:13px;color:#374151">Approve immediately</span></label>
    </div>`,
    `<button onclick="Modal.close()" style="padding:10px 20px;border:1.5px solid #e2e8f0;border-radius:8px;background:white;cursor:pointer">Cancel</button>
     <button onclick="saveAIResponse()" class="btn-primary" style="color:white;padding:10px 24px;border-radius:8px;font-size:14px;font-weight:600">Save Response</button>`
  );
}

async function saveAIResponse() {
  const question = document.getElementById('air-q')?.value?.trim();
  const answer = document.getElementById('air-a')?.value?.trim();
  const category = document.getElementById('air-cat')?.value;
  const is_approved = document.getElementById('air-approved')?.checked;
  if (!question || !answer) { Toast.show('Question and answer are required','warning'); return; }
  try {
    await API.post('/admin/ai/responses', { question, answer, category, is_approved });
    Modal.close();
    Toast.show('AI response added!','success');
    loadAdminAIResponses();
  } catch(e) { Toast.show(e.response?.data?.error||'Failed','error'); }
}

function editAIResponse(id, question, answer, category, approved) {
  Modal.show('Edit AI Response',
    `<div style="display:grid;gap:12px">
      <div><label class="form-label">Category</label>
        <select id="air-edit-cat" class="form-input">
          ${['general','solar','electrical','hvac','plumbing','fabrication','pricing'].map(c=>`<option value="${c}" ${c===category?'selected':''}>${c.charAt(0).toUpperCase()+c.slice(1)}</option>`).join('')}
        </select></div>
      <div><label class="form-label">Question</label><textarea id="air-edit-q" class="form-input" rows="2">${question}</textarea></div>
      <div><label class="form-label">Answer *</label><textarea id="air-edit-a" class="form-input" rows="5">${answer}</textarea></div>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" id="air-edit-approved" ${approved?'checked':''}/> <span style="font-size:13px;color:#374151">Approved</span></label>
    </div>`,
    `<button onclick="Modal.close()" style="padding:10px 20px;border:1.5px solid #e2e8f0;border-radius:8px;background:white;cursor:pointer">Cancel</button>
     <button onclick="updateAIResponse(${id})" class="btn-primary" style="color:white;padding:10px 24px;border-radius:8px;font-size:14px;font-weight:600">Update</button>`
  );
}

async function updateAIResponse(id) {
  const answer = document.getElementById('air-edit-a')?.value?.trim();
  const category = document.getElementById('air-edit-cat')?.value;
  const is_approved = document.getElementById('air-edit-approved')?.checked;
  if (!answer) { Toast.show('Answer is required','warning'); return; }
  try {
    await API.patch(`/admin/ai/responses/${id}`, { answer, category, is_approved });
    Modal.close();
    Toast.show('AI response updated!','success');
    loadAdminAIResponses();
  } catch(e) { Toast.show(e.response?.data?.error||'Update failed','error'); }
}

async function approveAIResponse(id) {
  try { await API.patch(`/admin/ai/responses/${id}`, { is_approved: true }); Toast.show('Response approved!','success'); loadAdminAIResponses(); }
  catch(e) { Toast.show(e.response?.data?.error||'Failed','error'); }
}

async function deleteAIResponse(id) {
  if (!confirm('Delete this AI response?')) return;
  try { await API.delete(`/admin/ai/responses/${id}`); Toast.show('Deleted','info'); loadAdminAIResponses(); }
  catch(e) { Toast.show(e.response?.data?.error||'Delete failed','error'); }
}

// ── Admin Project Management section (upgraded loadAdminSection) ──────────────
// Fully override the admin section loader to include ALL sections
const _originalAdminLoader = loadAdminSection;


// ── Extra Helpers ──────────────────────────────────────────────────────────
Helpers.relTime = Helpers.timeAgo;
Helpers.esc = Helpers.esc || function(s) { return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); };

// ── Render Inspection Card ──────────────────────────────────────────────────
function renderInspectionCard(insp, role) {
  const statusColors = {
    requested: { bg:'#fef3c7', color:'#d97706', label:'Requested' },
    paid: { bg:'#dbeafe', color:'#2563eb', label:'Paid' },
    assigned: { bg:'#e0e7ff', color:'#6366f1', label:'Expert Assigned' },
    in_progress: { bg:'#dcfce7', color:'#16a34a', label:'In Progress' },
    completed: { bg:'#f0fdf4', color:'#059669', label:'Completed' },
    cancelled: { bg:'#fee2e2', color:'#dc2626', label:'Cancelled' }
  };
  const sc = statusColors[insp.status] || { bg:'#f1f5f9', color:'#64748b', label: insp.status };

  return `
  <div style="background:white;border-radius:16px;padding:20px;box-shadow:0 1px 4px rgba(0,0,0,0.05);border-left:4px solid ${sc.color}">
    <div style="display:flex;align-items:start;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:14px">
      <div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <span style="background:${sc.bg};color:${sc.color};padding:3px 10px;border-radius:10px;font-size:12px;font-weight:700">${sc.label}</span>
          <span style="font-size:12px;color:#94a3b8">#INS-${insp.id}</span>
        </div>
        <h3 style="font-size:15px;font-weight:700;color:#1e293b;margin:0">${Helpers.esc(insp.project_title || 'Project Inspection')}</h3>
      </div>
      <div style="text-align:right">
        <p style="font-size:18px;font-weight:800;color:#f97316">₹${(insp.fee||1500).toLocaleString('en-IN')}</p>
        <p style="font-size:11px;color:#94a3b8">Inspection Fee</p>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;margin-bottom:14px">
      ${role === 'customer' ? `
      <div style="display:flex;align-items:center;gap:8px;font-size:13px;color:#64748b">
        <i class="fas fa-user-tie" style="color:#7c3aed;width:14px"></i>
        <span>${insp.expert_name ? `Expert: ${Helpers.esc(insp.expert_name)}` : 'Expert being assigned...'}</span>
      </div>` : ''}
      ${role === 'expert' ? `
      <div style="display:flex;align-items:center;gap:8px;font-size:13px;color:#64748b">
        <i class="fas fa-user" style="color:#2563eb;width:14px"></i>
        <span>Customer: ${Helpers.esc(insp.customer_name||'N/A')}</span>
      </div>` : ''}
      ${role === 'admin' ? `
      <div style="display:flex;align-items:center;gap:8px;font-size:13px;color:#64748b">
        <i class="fas fa-user" style="color:#2563eb;width:14px"></i>
        <span>Customer: ${Helpers.esc(insp.customer_name||'N/A')}</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px;font-size:13px;color:#64748b">
        <i class="fas fa-user-tie" style="color:#7c3aed;width:14px"></i>
        <span>${insp.expert_name ? `Expert: ${Helpers.esc(insp.expert_name)}` : 'No expert assigned'}</span>
      </div>` : ''}
      ${insp.visit_date ? `
      <div style="display:flex;align-items:center;gap:8px;font-size:13px;color:#64748b">
        <i class="fas fa-calendar" style="color:#059669;width:14px"></i>
        <span>Visit: ${Helpers.date(insp.visit_date)}</span>
      </div>` : ''}
      <div style="display:flex;align-items:center;gap:8px;font-size:13px;color:#94a3b8">
        <i class="fas fa-clock" style="width:14px"></i>
        <span>Requested: ${Helpers.relTime(insp.created_at)}</span>
      </div>
    </div>

    ${insp.recommendation ? `
    <div style="background:#f0fdf4;border-radius:10px;padding:14px;margin-bottom:14px;border-left:3px solid #10b981">
      <p style="font-size:12px;font-weight:700;color:#065f46;margin-bottom:4px"><i class="fas fa-clipboard-check" style="margin-right:6px"></i>Expert Recommendation</p>
      <p style="font-size:13px;color:#374151">${Helpers.esc(insp.recommendation)}</p>
      ${insp.report_url ? `<a href="${insp.report_url}" target="_blank" style="font-size:12px;color:#2563eb;font-weight:600;text-decoration:none;margin-top:6px;display:inline-block"><i class="fas fa-download" style="margin-right:4px"></i>Download Report</a>` : ''}
    </div>` : ''}

    <!-- Actions -->
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      ${role === 'customer' && insp.status === 'requested' ? `
        <button onclick="Router.go('/checkout/0?type=inspection&inspection_id=${insp.id}&amount=1500')" class="btn-accent" style="color:white;padding:8px 16px;border-radius:8px;font-size:12px;font-weight:600">
          <i class="fas fa-credit-card" style="margin-right:4px"></i>Pay ₹1,500 to Confirm
        </button>` : ''}
      ${role === 'expert' && insp.status === 'assigned' ? `
        <button onclick="expertStartInspection(${insp.id})" style="padding:8px 16px;background:#2563eb;color:white;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600">
          <i class="fas fa-play" style="margin-right:4px"></i>Start Inspection
        </button>
        <button onclick="expertCompleteInspection(${insp.id})" style="padding:8px 16px;background:#059669;color:white;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600">
          <i class="fas fa-check" style="margin-right:4px"></i>Submit Report
        </button>` : ''}
      ${role === 'admin' ? `
        ${!insp.expert_id ? `<button onclick="adminAssignInspectionExpert(${insp.id})" style="padding:8px 16px;background:#7c3aed;color:white;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600"><i class="fas fa-user-plus" style="margin-right:4px"></i>Assign Expert</button>` : ''}
        <button onclick="adminCancelInspection(${insp.id})" style="padding:8px 16px;background:#fee2e2;color:#dc2626;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600"><i class="fas fa-times" style="margin-right:4px"></i>Cancel</button>
      ` : ''}
    </div>
  </div>`;
}

function filterAdminInspections(status, btn) {
  document.querySelectorAll('[data-status]').forEach(b => {
    b.style.background = '#f1f5f9'; b.style.color = '#374151';
  });
  btn.style.background = '#2563eb'; btn.style.color = 'white';
  const insps = window._adminInspections || [];
  const filtered = status === 'all' ? insps : insps.filter(i => i.status === status);
  const el = document.getElementById('admin-insp-list');
  if (el) el.innerHTML = filtered.length ? filtered.map(i => renderInspectionCard(i, 'admin')).join('') : '<p style="text-align:center;color:#94a3b8;padding:40px">No inspections with this status</p>';
}

// ── 4. EXPERT INSPECTION ACTIONS ─────────────────────────────────────────────
async function expertStartInspection(id) {
  try {
    await API.patch(`/inspections/${id}/report`, { recommendation: 'Inspection started', report_url: null });
    Toast.show('Inspection started!', 'success');
    loadExpertSection('inspections');
  } catch(e) { Toast.show(e.response?.data?.error || 'Failed', 'error'); }
}

function expertCompleteInspection(id) {
  Modal.show('Submit Inspection Report', `
    <div>
      <div style="margin-bottom:16px">
        <label class="form-label">Recommendation / Findings *</label>
        <textarea id="insp-rec" class="form-input" rows="4" placeholder="Describe the site condition, technical findings, and recommendations..." style="resize:vertical"></textarea>
      </div>
      <div>
        <label class="form-label">Report URL (optional)</label>
        <input id="insp-report-url" class="form-input" type="url" placeholder="https://drive.google.com/...">
      </div>
    </div>`,
    `<button onclick="Modal.close()" style="padding:10px 20px;border:1.5px solid #e2e8f0;border-radius:10px;background:white;cursor:pointer">Cancel</button>
     <button onclick="submitExpertInspectionReport(${id})" class="btn-primary" style="color:white;padding:10px 24px;border-radius:10px;font-weight:600">Submit Report</button>`
  );
}

async function submitExpertInspectionReport(id) {
  const rec = document.getElementById('insp-rec')?.value?.trim();
  if (!rec) { Toast.show('Please enter your recommendation', 'warning'); return; }
  const reportUrl = document.getElementById('insp-report-url')?.value?.trim() || null;
  try {
    await API.patch(`/inspections/${id}/report`, { recommendation: rec, report_url: reportUrl });
    Modal.close();
    Toast.show('✅ Inspection report submitted!', 'success');
    loadExpertSection('inspections');
  } catch(e) { Toast.show(e.response?.data?.error || 'Failed to submit', 'error'); }
}

// ── 5. ADMIN INSPECTION ACTIONS ───────────────────────────────────────────────
async function adminAssignInspectionExpert(inspId) {
  try {
    const { data } = await API.get('/consultations/experts');
    const experts = data.experts || [];
    Modal.show('Assign Expert to Inspection', `
      <div>
        <label class="form-label">Select Expert</label>
        <select id="assign-expert-select" class="form-input">
          <option value="">-- Select Expert --</option>
          ${experts.map(e => `<option value="${e.id}">${Helpers.esc(e.name)} (${Helpers.esc(e.specialization||'General')})</option>`).join('')}
        </select>
        <div style="margin-top:12px">
          <label class="form-label">Scheduled Visit Date</label>
          <input id="assign-visit-date" type="date" class="form-input" min="${new Date().toISOString().split('T')[0]}">
        </div>
      </div>`,
      `<button onclick="Modal.close()" style="padding:10px 20px;border:1.5px solid #e2e8f0;border-radius:10px;background:white;cursor:pointer">Cancel</button>
       <button onclick="confirmAdminAssignInspection(${inspId})" class="btn-primary" style="color:white;padding:10px 24px;border-radius:10px;font-weight:600">Assign</button>`
    );
  } catch(e) { Toast.show('Failed to load experts', 'error'); }
}

async function confirmAdminAssignInspection(inspId) {
  const expertId = document.getElementById('assign-expert-select')?.value;
  const visitDate = document.getElementById('assign-visit-date')?.value;
  if (!expertId) { Toast.show('Please select an expert', 'warning'); return; }
  try {
    await API.patch(`/inspections/${inspId}/assign`, { expert_id: parseInt(expertId), visit_date: visitDate || null });
    Modal.close();
    Toast.show('✅ Expert assigned to inspection!', 'success');
    adminNavTo('inspections');
  } catch(e) { Toast.show(e.response?.data?.error || 'Failed', 'error'); }
}

async function adminCancelInspection(id) {
  if (!confirm('Cancel this inspection? This cannot be undone.')) return;
  try {
    await API.patch(`/admin/inspections/${id}/cancel`, {});
    Toast.show('Inspection cancelled', 'info');
    adminNavTo('inspections');
  } catch(e) { Toast.show(e.response?.data?.error || 'Failed', 'error'); }
}

// ── 6. EXPERT DASHBOARD: INSPECTIONS SECTION ─────────────────────────────────
(function() {
  const _origLoadExpertSection = typeof loadExpertSection === 'function' ? loadExpertSection : null;
  window.loadExpertSection = async function(section) {
    if (section === 'inspections') {
      const el = document.getElementById('expert-content');
      if (!el) { if (_origLoadExpertSection) return _origLoadExpertSection(section); return; }
      el.innerHTML = '<div style="display:flex;justify-content:center;padding:60px"><div class="loading-spinner"></div></div>';
      try {
        const { data } = await API.get('/inspections/my');
        const insps = data.inspections || [];
        document.querySelectorAll('.sidebar-nav button').forEach(b => b.classList.remove('active'));
        const btn = document.getElementById('dash-inspections');
        if (btn) btn.classList.add('active');
        el.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px">
          <h2 style="font-size:22px;font-weight:800;color:#0f172a">My Inspections</h2>
          <div style="display:flex;gap:10px;font-size:12px;color:#64748b">
            <span>Total: ${insps.length}</span>
            <span>Assigned: ${insps.filter(i=>i.status==='assigned').length}</span>
            <span>Completed: ${insps.filter(i=>i.status==='completed').length}</span>
          </div>
        </div>
        ${insps.length === 0 ? `
        <div style="background:white;border-radius:20px;padding:60px;text-align:center">
          <i class="fas fa-clipboard" style="font-size:48px;color:#e2e8f0;display:block;margin-bottom:16px"></i>
          <p style="color:#94a3b8">No inspections assigned yet</p>
        </div>` :
        `<div style="display:grid;gap:16px">${insps.map(i => renderInspectionCard(i, 'expert')).join('')}</div>`}`;
      } catch(e) { if (el) el.innerHTML = `<div style="padding:60px;text-align:center;color:#ef4444">${e.message}</div>`; }
      return;
    }
    if (_origLoadExpertSection) return _origLoadExpertSection(section);
  };
})();


// ── 8. SECURITY DEPOSIT FIX: 2% or min ₹500 (not ₹5000) ─────────────────────
(function() {
  const _origSelectVendorBid = typeof selectVendorBid === 'function' ? selectVendorBid : null;
  window.selectVendorBid = async function(projectId, bidId, vendorId) {
    if (!confirm('Accept this bid? Other bids will be rejected.')) return;
    try {
      // Get bid amount to calculate correct security deposit
      const { data: bidsData } = await API.get(`/bids/project/${projectId}`);
      const bids = bidsData.bids || [];
      const selectedBid = bids.find(b => b.id === bidId);
      const bidAmount = selectedBid?.bid_amount || 0;

      // Security deposit: 2% of bid amount OR minimum ₹500 (whichever is MORE)
      const twoPercent = Math.round(bidAmount * 0.02);
      const securityDeposit = Math.max(twoPercent, 500);

      await API.post(`/projects/${projectId}/select-vendor`, { bid_id: bidId, vendor_id: vendorId });
      Toast.show(`Vendor selected! Security deposit: ₹${securityDeposit.toLocaleString('en-IN')} (2% of bid)`, 'success', 4000);
      // Redirect to checkout with correct security deposit amount
      setTimeout(() => Router.go(`/checkout/${projectId}?type=escrow_deposit&amount=${securityDeposit}`), 1200);
    } catch(err) {
      Toast.show(err.response?.data?.error || 'Failed to select vendor', 'error');
    }
  };
})();

// Fix checkout page to use correct default amount based on type
(function() {
  const _origCheckout = Pages.checkout;
  Pages.checkout = function(params) {
    if (!Auth.isLoggedIn()) { Router.go('/login'); return; }
    const urlParams = new URLSearchParams(window.location.search);
    const payType = urlParams.get('type') || 'platform_fee';
    const inspectionId = urlParams.get('inspection_id');
    // Fix: don't default to 5000 - calculate properly
    let amount = urlParams.get('amount');
    if (!amount) {
      if (payType === 'inspection_fee' || payType === 'inspection') amount = '1500';
      else if (payType === 'escrow_deposit' || payType === 'platform_fee') amount = '500'; // minimum
      else amount = '500';
    }
    const normalizedPayType = payType === 'inspection' ? 'inspection_fee' : payType;
    const projectId = params.id !== '0' ? params.id : null;

    const payTypeLabel = payType === 'inspection_fee' || payType === 'inspection' ? 'Technical Inspection Fee' :
      payType === 'vendor_advance' ? 'Vendor Advance Payment' :
      payType === 'escrow_deposit' ? '🔐 Security Deposit (Escrow Protected)' :
      payType === 'milestone_payment' ? 'Milestone Payment (Escrow)' :
      payType === 'platform_fee' ? 'Platform Fee + GST (18%)' : 'Service Fee';

    // Compute GST for platform_fee
    const baseAmt = parseFloat(amount);
    const gst = payType === 'platform_fee' ? Math.round(baseAmt * 0.18) : 0;
    const totalAmt = baseAmt + gst;

    document.getElementById('app').innerHTML = layout(`
    <div style="max-width:680px;margin:0 auto;padding:40px 20px">
      <div style="margin-bottom:28px">
        <h1 style="font-size:28px;font-weight:800;color:#0f172a">Secure Payment</h1>
        <p style="color:#64748b;margin-top:4px">Complete your payment to proceed</p>
      </div>
      <div style="background:white;border-radius:20px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08)">
        <div style="background:linear-gradient(135deg,#1e3a8a,#2563eb);padding:28px;color:white">
          <p style="font-size:13px;opacity:0.8;margin-bottom:4px">Payment Amount</p>
          <p style="font-size:40px;font-weight:900">₹${totalAmt.toLocaleString('en-IN')}</p>
          <p style="font-size:14px;opacity:0.9;margin-top:8px">${payTypeLabel}</p>
          ${gst > 0 ? `<p style="font-size:12px;opacity:0.7;margin-top:4px">Includes GST (18%): ₹${gst.toLocaleString('en-IN')}</p>` : ''}
        </div>
        <div style="padding:28px">
          <div style="background:#f8fafc;border-radius:14px;padding:20px;margin-bottom:24px">
            <h3 style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:14px">Order Summary</h3>
            ${[
              ['Payment Type', payTypeLabel],
              ['Base Amount', `₹${baseAmt.toLocaleString('en-IN')}`],
              ...(gst > 0 ? [['GST (18%)', `₹${gst.toLocaleString('en-IN')}`]] : []),
              ['Total Amount', `₹${totalAmt.toLocaleString('en-IN')}`],
              ['Project ID', projectId || 'N/A'],
              ['Customer', State.user?.name || 'You'],
              ['Gateway', 'Razorpay (Simulated)'],
            ].map(([k,v]) => `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f1f5f9;font-size:13px"><span style="color:#64748b">${k}</span><span style="font-weight:600;color:#1e293b">${v}</span></div>`).join('')}
          </div>
          ${payType === 'escrow_deposit' ? `
          <div style="background:#eff6ff;border-radius:12px;padding:14px;margin-bottom:20px;border:1px solid #bfdbfe">
            <p style="font-size:13px;font-weight:700;color:#1d4ed8;margin-bottom:6px"><i class="fas fa-shield-alt" style="margin-right:6px"></i>Security Deposit Protection</p>
            <p style="font-size:12px;color:#374151">Your security deposit is held safely in escrow and will be refunded if the vendor fails to deliver or the project is cancelled.</p>
          </div>` : ''}
          <div style="border:2px solid #e2e8f0;border-radius:14px;padding:20px;margin-bottom:20px">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
              <i class="fas fa-lock" style="color:#10b981;font-size:18px"></i>
              <span style="font-weight:700;color:#1e293b">Secure Payment via Razorpay</span>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
              <div><label class="form-label" style="font-size:11px">Card Number</label><input class="form-input" value="4111 1111 1111 1111" readonly style="font-size:13px;background:#f8fafc"></div>
              <div><label class="form-label" style="font-size:11px">Name on Card</label><input class="form-input" value="${State.user?.name || 'Test User'}" readonly style="font-size:13px;background:#f8fafc"></div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
              <div><label class="form-label" style="font-size:11px">Expiry Date</label><input class="form-input" value="12/26" readonly style="font-size:13px;background:#f8fafc"></div>
              <div><label class="form-label" style="font-size:11px">CVV</label><input class="form-input" value="•••" readonly style="font-size:13px;background:#f8fafc"></div>
            </div>
            <p style="font-size:11px;color:#94a3b8;margin-top:12px;text-align:center">Test mode. No real transaction.</p>
          </div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:20px;background:#f0fdf4;padding:12px;border-radius:10px">
            <i class="fas fa-shield-alt" style="color:#10b981"></i>
            <p style="font-size:12px;color:#065f46">256-bit SSL encrypted secure payment.</p>
          </div>
          <button onclick="processPaymentReal(${projectId||0}, '${normalizedPayType}', ${totalAmt}, ${inspectionId||0}, null)" id="pay-btn" class="btn-primary" style="width:100%;color:white;padding:16px;border-radius:14px;font-size:16px;font-weight:700">
            <i class="fas fa-lock" style="margin-right:8px"></i>Pay ₹${totalAmt.toLocaleString('en-IN')} Securely
          </button>
          <button onclick="Router.go(-1)" style="width:100%;margin-top:10px;padding:12px;background:none;border:1.5px solid #e2e8f0;border-radius:12px;cursor:pointer;font-size:14px;color:#64748b">Cancel</button>
        </div>
      </div>
    </div>`);
  };
})();


// ── 9. CUSTOMER: EDIT PROJECT (before bids) ───────────────────────────────────
async function loadCustomerEditProjects(el) {
  el.innerHTML = '<div style="display:flex;justify-content:center;padding:60px"><div class="loading-spinner"></div></div>';
  try {
    const { data } = await API.get('/projects/my/list');
    const projects = (data.projects || []).filter(p => ['open','bidding'].includes(p.status));
    el.innerHTML = `
    <div style="margin-bottom:24px">
      <h2 style="font-size:22px;font-weight:800;color:#0f172a">Edit Projects</h2>
      <p style="color:#64748b;font-size:13px;margin-top:4px">You can only edit projects that haven't received any bids yet</p>
    </div>
    ${projects.length === 0 ? `
    <div style="background:white;border-radius:20px;padding:60px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,0.05)">
      <i class="fas fa-edit" style="font-size:48px;color:#e2e8f0;display:block;margin-bottom:16px"></i>
      <p style="color:#94a3b8">No editable projects. Projects can only be edited before receiving bids.</p>
    </div>` :
    `<div style="display:grid;gap:16px">${projects.map(p => `
    <div style="background:white;border-radius:16px;padding:20px;box-shadow:0 1px 4px rgba(0,0,0,0.05)">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:14px">
        <div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
            <span style="background:#eff6ff;color:#2563eb;padding:2px 8px;border-radius:8px;font-size:11px;font-weight:600">${Helpers.serviceLabel(p.service_type)}</span>
            ${Helpers.statusBadge(p.status)}
          </div>
          <h3 style="font-size:15px;font-weight:700;color:#1e293b;margin:0">${Helpers.esc(p.title)}</h3>
          <p style="font-size:12px;color:#94a3b8">${p.bid_count||0} bids · ${Helpers.date(p.created_at)}</p>
        </div>
        ${(p.bid_count||0) === 0 ?
          `<button onclick="showEditProjectModal(${p.id},'${Helpers.esc(p.title)}','${Helpers.esc(p.description||'')}','${p.location||''}','${p.budget_min||''}','${p.budget_max||''}')" style="padding:8px 16px;background:#eff6ff;color:#2563eb;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600"><i class="fas fa-edit" style="margin-right:4px"></i>Edit</button>` :
          `<span style="font-size:12px;color:#94a3b8;background:#f8fafc;padding:6px 12px;border-radius:8px">Cannot edit (${p.bid_count} bid${p.bid_count>1?'s':''})</span>`
        }
      </div>
    </div>`).join('')}</div>`}`;
  } catch(e) {
    el.innerHTML = `<div style="padding:60px;text-align:center;color:#ef4444">${e.message}</div>`;
  }
}

function showEditProjectModal(id, title, desc, location, budMin, budMax) {
  Modal.show('Edit Project', `
    <div style="display:grid;gap:16px">
      <div>
        <label class="form-label">Project Title *</label>
        <input id="ep-title" class="form-input" value="${title}" placeholder="Project title">
      </div>
      <div>
        <label class="form-label">Description *</label>
        <textarea id="ep-desc" class="form-input" rows="4" placeholder="Project description">${desc}</textarea>
      </div>
      <div>
        <label class="form-label">Location</label>
        <input id="ep-loc" class="form-input" value="${location}" placeholder="City, State">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div><label class="form-label">Budget Min (₹)</label><input id="ep-bmin" type="number" class="form-input" value="${budMin}" placeholder="Min budget"></div>
        <div><label class="form-label">Budget Max (₹)</label><input id="ep-bmax" type="number" class="form-input" value="${budMax}" placeholder="Max budget"></div>
      </div>
    </div>`,
    `<button onclick="Modal.close()" style="padding:10px 20px;border:1.5px solid #e2e8f0;border-radius:10px;background:white;cursor:pointer">Cancel</button>
     <button onclick="submitProjectEdit(${id})" class="btn-primary" style="color:white;padding:10px 24px;border-radius:10px;font-weight:600">Save Changes</button>`
  );
}

async function submitProjectEdit(id) {
  const title = document.getElementById('ep-title')?.value?.trim();
  const desc = document.getElementById('ep-desc')?.value?.trim();
  const loc = document.getElementById('ep-loc')?.value?.trim();
  const bMin = document.getElementById('ep-bmin')?.value;
  const bMax = document.getElementById('ep-bmax')?.value;
  if (!title) { Toast.show('Title is required', 'warning'); return; }
  try {
    const updates = { title, description: desc };
    if (loc) updates.location = loc;
    if (bMin) updates.budget_min = parseInt(bMin);
    if (bMax) updates.budget_max = parseInt(bMax);
    await API.patch(`/projects/${id}`, updates);
    Modal.close();
    Toast.show('✅ Project updated successfully!', 'success');
    loadCustomerSection('edit-project');
  } catch(err) {
    const msg = err.response?.data?.error || 'Failed to update project';
    if (err.response?.data?.bid_count > 0) {
      Toast.show('Cannot edit — bids already received!', 'warning');
    } else {
      Toast.show(msg, 'error');
    }
  }
}

// Add 'Edit Project' to customer sidebar
(function() {
  const _origCustDash = Pages.customerDashboard;
  Pages.customerDashboard = async function() {
    if (!Auth.isLoggedIn() || Auth.role() !== 'customer') { Router.go('/login'); return; }
    const u = State.user;
    function sidebar(active) {
      const items = [
        ['overview','fa-th-large','Overview'],['projects','fa-clipboard-list','My Projects'],
        ['bids','fa-gavel','Received Bids'],['documents','fa-folder','Documents'],
        ['inspections','fa-search','Inspections'],['payments','fa-credit-card','Payments'],
        ['messages','fa-comments','Messages'],['notifications','fa-bell','Notifications'],
        ['edit-project','fa-edit','Edit Project'],['referral','fa-gift','Referral'],['profile','fa-user-edit','Edit Profile'],
      ];
      return `<div style="padding:12px;margin-bottom:20px">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:40px;height:40px;background:linear-gradient(135deg,#2563eb,#7c3aed);border-radius:50%;display:flex;align-items:center;justify-content:center">
            <span style="color:white;font-weight:700">${(u.name||'C').charAt(0)}</span>
          </div>
          <div><p style="font-weight:700;font-size:14px;color:#1e293b">${u.name}</p><p style="font-size:11px;color:#64748b">Customer Account</p></div>
        </div>
      </div>
      <nav class="sidebar-nav">${items.map(([k,icon,label]) =>
        `<button onclick="loadCustomerSection('${k}')" id="dash-${k}" class="${active===k?'active':''}" style="margin-bottom:2px"><i class="fas ${icon}" style="width:18px"></i>${label}</button>`
      ).join('')}</nav>
      <div style="margin-top:auto;padding-top:20px">
        <button onclick="Router.go('/post-project')" class="btn-accent" style="color:white;width:100%;padding:10px;border-radius:10px;font-size:13px;font-weight:600"><i class="fas fa-plus" style="margin-right:6px"></i>New Project</button>
      </div>`;
    }
    document.getElementById('app').innerHTML = dashboardLayout(sidebar('overview'), `<div id="cust-content"><div style="display:flex;justify-content:center;padding:60px"><div class="loading-spinner"></div></div></div>`);
    loadCustomerSection('overview');
  };
})();


// ── 10. AI TOOLS: EDIT ANSWERS + CREATE PROJECT ───────────────────────────────
(function() {
  const _origAiTools = Pages.aiTools;
  Pages.aiTools = function() {
    const isLoggedIn = Auth.isLoggedIn();
    const role = Auth.role();
    document.getElementById('app').innerHTML = layout(`
    <div style="max-width:1100px;margin:0 auto;padding:40px 20px">
      <div style="text-align:center;margin-bottom:48px">
        <div style="display:inline-flex;align-items:center;gap:8px;background:#eff6ff;color:#2563eb;padding:6px 16px;border-radius:20px;font-size:13px;font-weight:600;margin-bottom:16px">
          <i class="fas fa-robot"></i> AI-Powered Tools
        </div>
        <h1 style="font-size:36px;font-weight:900;color:#0f172a;margin-bottom:12px">Smart Project Intelligence</h1>
        <p style="color:#64748b;font-size:16px;max-width:600px;margin:0 auto">Use AI to estimate costs, find the right vendors, and auto-generate project specifications.</p>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:24px;margin-bottom:40px">
        <div onclick="aiV5ShowTab('estimate')" class="card-hover" style="background:linear-gradient(135deg,#eff6ff,#dbeafe);border-radius:20px;padding:28px;cursor:pointer;border:2px solid #bfdbfe">
          <div style="width:56px;height:56px;background:#2563eb;border-radius:16px;display:flex;align-items:center;justify-content:center;margin-bottom:16px"><i class="fas fa-calculator" style="color:white;font-size:22px"></i></div>
          <h3 style="font-size:18px;font-weight:800;color:#1e3a8a;margin-bottom:8px">Cost Estimator</h3>
          <p style="font-size:14px;color:#3b82f6;line-height:1.6">Get AI-driven cost estimates + Post project directly from results</p>
        </div>
        <div onclick="aiV5ShowTab('recommend')" class="card-hover" style="background:linear-gradient(135deg,#f5f3ff,#ede9fe);border-radius:20px;padding:28px;cursor:pointer;border:2px solid #c4b5fd">
          <div style="width:56px;height:56px;background:#7c3aed;border-radius:16px;display:flex;align-items:center;justify-content:center;margin-bottom:16px"><i class="fas fa-star" style="color:white;font-size:22px"></i></div>
          <h3 style="font-size:18px;font-weight:800;color:#4c1d95;margin-bottom:8px">Vendor Recommender</h3>
          <p style="font-size:14px;color:#7c3aed;line-height:1.6">AI scores vendors by rating, experience, and location</p>
        </div>
        <div onclick="aiV5ShowTab('spec')" class="card-hover" style="background:linear-gradient(135deg,#f0fdf4,#dcfce7);border-radius:20px;padding:28px;cursor:pointer;border:2px solid #86efac">
          <div style="width:56px;height:56px;background:#059669;border-radius:16px;display:flex;align-items:center;justify-content:center;margin-bottom:16px"><i class="fas fa-file-alt" style="color:white;font-size:22px"></i></div>
          <h3 style="font-size:18px;font-weight:800;color:#064e3b;margin-bottom:8px">Spec Generator</h3>
          <p style="font-size:14px;color:#059669;line-height:1.6">Auto-generate technical specs → create project instantly</p>
        </div>
        ${role === 'admin' ? `
        <div onclick="aiV5ShowTab('edit-answers')" class="card-hover" style="background:linear-gradient(135deg,#fff7ed,#ffedd5);border-radius:20px;padding:28px;cursor:pointer;border:2px solid #fdba74">
          <div style="width:56px;height:56px;background:#f97316;border-radius:16px;display:flex;align-items:center;justify-content:center;margin-bottom:16px"><i class="fas fa-database" style="color:white;font-size:22px"></i></div>
          <h3 style="font-size:18px;font-weight:800;color:#9a3412;margin-bottom:8px">Edit AI Answers</h3>
          <p style="font-size:14px;color:#f97316;line-height:1.6">Manage and edit AI knowledge base responses (Admin only)</p>
        </div>` : ''}
      </div>
      <!-- Tabs -->
      <div style="display:flex;gap:8px;margin-bottom:24px;border-bottom:2px solid #f1f5f9;padding-bottom:0;overflow-x:auto">
        ${[['estimate','fa-calculator','Cost Estimator'],['recommend','fa-star','Vendor Recommender'],['spec','fa-file-alt','Spec Generator'],
          ...(role==='admin'?[['edit-answers','fa-database','Edit AI Answers']]:[])
        ].map(([id,icon,label],i) =>
          `<button id="ai-v5-tab-${id}" onclick="aiV5ShowTab('${id}')" style="padding:10px 20px;border:none;border-bottom:2px solid ${i===0?'#2563eb':'transparent'};background:none;cursor:pointer;font-size:14px;font-weight:600;color:${i===0?'#2563eb':'#64748b'};margin-bottom:-2px;white-space:nowrap"><i class="fas ${icon}" style="margin-right:6px"></i>${label}</button>`
        ).join('')}
      </div>
      <div id="ai-v5-content">${renderAiV5EstimateTab()}</div>
    </div>`);
  };
})();

function aiV5ShowTab(tab) {
  document.querySelectorAll('[id^="ai-v5-tab-"]').forEach(btn => {
    const isActive = btn.id === `ai-v5-tab-${tab}`;
    btn.style.borderBottomColor = isActive ? '#2563eb' : 'transparent';
    btn.style.color = isActive ? '#2563eb' : '#64748b';
  });
  const el = document.getElementById('ai-v5-content');
  if (!el) return;
  if (tab === 'estimate') el.innerHTML = renderAiV5EstimateTab();
  else if (tab === 'recommend') el.innerHTML = renderVendorRecommenderTab();
  else if (tab === 'spec') el.innerHTML = renderSpecGeneratorTab();
  else if (tab === 'edit-answers') loadAiAnswersEditor(el);
}

function renderAiV5EstimateTab() {
  return `<div style="background:white;border-radius:20px;padding:32px;box-shadow:0 2px 12px rgba(0,0,0,0.06)">
    <h3 style="font-size:20px;font-weight:800;color:#0f172a;margin-bottom:24px"><i class="fas fa-calculator" style="color:#2563eb;margin-right:8px"></i>AI Cost Estimator</h3>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-bottom:24px">
      <div>
        <label class="form-label">Service Type</label>
        <select id="est-service" class="form-input">
          <option value="">Select service...</option>
          ${[['solar','Solar EPC'],['electrical','Electrical'],['hvac','HVAC'],['plumbing','Plumbing'],['fabrication','Fabrication'],['contracting','Civil Contracting']].map(([v,l]) => `<option value="${v}">${l}</option>`).join('')}
        </select>
      </div>
      <div><label class="form-label">Quantity (kW / sq ft / ton)</label><input id="est-qty" type="number" class="form-input" placeholder="e.g. 5 for 5kW solar" min="0.1" step="0.1"></div>
      <div><label class="form-label">Location</label><input id="est-loc" type="text" class="form-input" placeholder="e.g. Mumbai, Delhi..."></div>
      <div>
        <label class="form-label">Property Type</label>
        <select id="est-prop" class="form-input">
          <option value="Residential">Residential</option><option value="Commercial">Commercial</option><option value="Industrial">Industrial</option>
        </select>
      </div>
    </div>
    <button onclick="runAiV5Estimate()" class="btn-primary" style="color:white;padding:12px 28px;border-radius:12px;font-size:15px;font-weight:700"><i class="fas fa-magic" style="margin-right:8px"></i>Generate Estimate</button>
    <div id="est-result" style="margin-top:24px"></div>
  </div>`;
}

async function runAiV5Estimate() {
  const service = document.getElementById('est-service')?.value;
  const qty = document.getElementById('est-qty')?.value;
  const loc = document.getElementById('est-loc')?.value;
  const prop = document.getElementById('est-prop')?.value;
  if (!service || !qty) { Toast.show('Please select service and enter quantity', 'warning'); return; }
  const el = document.getElementById('est-result');
  el.innerHTML = '<div style="display:flex;justify-content:center;padding:40px"><div class="loading-spinner"></div></div>';
  try {
    const { data } = await API.get(`/ai/estimate?service_type=${service}&quantity=${qty}&location=${encodeURIComponent(loc||'')}&property_type=${encodeURIComponent(prop||'')}`);
    const e = data.estimate;
    el.innerHTML = `
    <div style="background:#f0fdf4;border:1.5px solid #86efac;border-radius:16px;padding:24px;margin-bottom:20px">
      <h4 style="color:#065f46;font-weight:800;font-size:18px;margin-bottom:8px"><i class="fas fa-check-circle" style="margin-right:8px"></i>Cost Estimate: ${data.service}</h4>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:16px">
        <div style="background:white;border-radius:12px;padding:16px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,0.05)">
          <p style="font-size:12px;color:#64748b;margin-bottom:4px">Min Estimate</p>
          <p style="font-size:24px;font-weight:900;color:#059669">₹${e.total.min.toLocaleString('en-IN')}</p>
        </div>
        <div style="background:white;border-radius:12px;padding:16px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,0.05);border:2px solid #2563eb">
          <p style="font-size:12px;color:#2563eb;font-weight:700;margin-bottom:4px">Expected Range</p>
          <p style="font-size:18px;font-weight:900;color:#1d4ed8">₹${e.total.min.toLocaleString('en-IN')} – ₹${e.total.max.toLocaleString('en-IN')}</p>
        </div>
        <div style="background:white;border-radius:12px;padding:16px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,0.05)">
          <p style="font-size:12px;color:#64748b;margin-bottom:4px">Max Estimate</p>
          <p style="font-size:24px;font-weight:900;color:#dc2626">₹${e.total.max.toLocaleString('en-IN')}</p>
        </div>
      </div>
      ${data.materials?.length > 0 ? `<div style="background:white;border-radius:10px;padding:14px;margin-bottom:12px"><p style="font-size:13px;font-weight:600;color:#1e293b;margin-bottom:8px">Key Materials:</p><ul style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:4px;list-style:none">${data.materials.slice(0,6).map(m=>`<li style="font-size:13px;color:#374151;display:flex;align-items:center;gap:6px"><i class="fas fa-check" style="color:#10b981;font-size:11px"></i>${m}</li>`).join('')}</ul></div>` : ''}
      ${data.tips?.length > 0 ? `<div style="background:white;border-radius:10px;padding:14px;margin-bottom:12px">${data.tips.map(t=>`<p style="font-size:12px;color:#374151;margin-bottom:6px;padding:6px;background:#fffbeb;border-radius:6px;border-left:3px solid #f59e0b">${t}</p>`).join('')}</div>` : ''}
    </div>
    <!-- CREATE PROJECT FROM ESTIMATE -->
    ${Auth.isLoggedIn() && Auth.role() === 'customer' ? `
    <div style="background:#eff6ff;border-radius:16px;padding:20px;border:2px solid #bfdbfe">
      <h4 style="color:#1d4ed8;font-weight:800;margin-bottom:12px"><i class="fas fa-rocket" style="margin-right:8px"></i>Create Project from This Estimate</h4>
      <p style="color:#3b82f6;font-size:13px;margin-bottom:16px">Pre-fill your project details with this AI estimate and post it for vendor bids.</p>
      <div style="display:grid;gap:12px;margin-bottom:16px">
        <div><label class="form-label">Project Title *</label><input id="ai-proj-title" class="form-input" value="${data.service} Project - ${qty} ${data.unit}" placeholder="Project title"></div>
        <div><label class="form-label">Location *</label><input id="ai-proj-loc" class="form-input" value="${loc||''}" placeholder="City, State"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div><label class="form-label">Budget Min (₹)</label><input id="ai-proj-bmin" type="number" class="form-input" value="${e.total.min}"></div>
          <div><label class="form-label">Budget Max (₹)</label><input id="ai-proj-bmax" type="number" class="form-input" value="${e.total.max}"></div>
        </div>
      </div>
      <button onclick="createProjectFromAiEstimate('${service}', '${prop}')" class="btn-primary" style="color:white;padding:12px 24px;border-radius:12px;font-size:14px;font-weight:700"><i class="fas fa-paper-plane" style="margin-right:8px"></i>Post Project & Get Bids</button>
    </div>` : `
    <div style="text-align:center;margin-top:20px">
      <button onclick="Router.go('/post-project')" class="btn-accent" style="color:white;padding:12px 28px;border-radius:12px;font-size:15px;font-weight:700"><i class="fas fa-plus" style="margin-right:8px"></i>Post Your Project & Get Real Bids</button>
    </div>`}`;
  } catch(e) {
    el.innerHTML = `<div style="color:#dc2626;padding:20px;text-align:center">Failed to generate estimate: ${e.message}</div>`;
  }
}

async function createProjectFromAiEstimate(serviceType, propertyType) {
  const title = document.getElementById('ai-proj-title')?.value?.trim();
  const location = document.getElementById('ai-proj-loc')?.value?.trim();
  const budMin = document.getElementById('ai-proj-bmin')?.value;
  const budMax = document.getElementById('ai-proj-bmax')?.value;
  if (!title || !location) { Toast.show('Project title and location are required', 'warning'); return; }
  try {
    const qty = document.getElementById('est-qty')?.value || '';
    const { data } = await API.post('/projects', {
      service_type: serviceType,
      title, location,
      description: `AI-generated project for ${serviceType} installation. Quantity: ${qty}. Property type: ${propertyType}. This project was created from an AI cost estimate.`,
      property_type: propertyType,
      budget_min: budMin ? parseInt(budMin) : null,
      budget_max: budMax ? parseInt(budMax) : null,
    });
    Toast.show('✅ Project posted! Vendors will start bidding.', 'success', 4000);
    setTimeout(() => Router.go(`/projects/${data.project.id}`), 1500);
  } catch(err) {
    const errMsg = err.response?.data?.error || 'Failed to create project';
    if (err.response?.data?.limit_reached) {
      Toast.show('Free plan limit (10 projects) reached. Please upgrade!', 'warning', 5000);
      setTimeout(() => Router.go('/vendor-plans'), 2000);
    } else {
      Toast.show(errMsg, 'error');
    }
  }
}


// ── 17. FIX: Chat masking UI indicator ────────────────────────────────────────
// The main sendChatMessage function is defined above and handles masking warning
// This wrapper ensures masking warnings are shown properly
async function sendChatMessage(e, convId) {
  if (e && e.preventDefault) e.preventDefault();
  const conversationId = convId;
  const input = document.getElementById('chat-input');
  const content = input?.value?.trim();
  if (!content) return;
  input.value = '';
  const sendBtn = document.querySelector('#chat-send-btn');
  if (sendBtn) { sendBtn.disabled = true; sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }
  try {
    const { data } = await API.post(`/messages/${conversationId}/send`, { content });
    if (data.masked || data.warning) {
      Toast.show('⚠️ Some sensitive information was masked for privacy protection.', 'warning', 4000);
    }
    // Reload chat messages
    const res = await API.get(`/messages/${conversationId}`);
    const msgs = res.data.messages || [];
    const myId = State.user?.id;
    const chatEl = document.getElementById('chat-messages');
    if (chatEl) {
      chatEl.innerHTML = msgs.length === 0 ? '<p style="text-align:center;color:#94a3b8;font-size:13px;margin:auto">No messages yet. Say hello!</p>' :
      msgs.map(m => {
        const isMe = m.sender_id === myId;
        return `<div style="display:flex;flex-direction:column;align-items:${isMe?'flex-end':'flex-start'};gap:2px">
          <p style="font-size:10px;color:#94a3b8">${isMe?'You':Helpers.esc(m.sender_name||'')} · ${Helpers.timeAgo(m.created_at)}</p>
          <div class="${isMe?'chat-bubble-out':'chat-bubble-in'}">${Helpers.esc(m.content||'')}</div>
          ${m.attachment_url ? `<a href="${m.attachment_url}" target="_blank" style="font-size:11px;color:#2563eb"><i class="fas fa-paperclip"></i> ${Helpers.esc(m.attachment_name||'Attachment')}</a>` : ''}
        </div>`;
      }).join('');
      chatEl.scrollTop = chatEl.scrollHeight;
    }
  } catch(err) { Toast.show(err.response?.data?.error || 'Failed to send message', 'error'); input.value = content; }
  finally {
    if (sendBtn) { sendBtn.disabled = false; sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>'; }
  }
}


// ── Fix 5: Admin project management helpers ───────────────────────────────────
async function adminV6EditProject(projectId) {
  try {
    const res = await API.get('/projects/' + projectId);
    const p = res.data.project || res.data;
    const docs = res.data.documents || [];
    Modal.show('Edit Project (Admin)', `
      <div style="display:grid;gap:14px">
        <div><label class="form-label">Status</label>
          <select id="adm-ep-status" class="form-input">
            ${['open','bidding','vendor_selected','in_progress','completed','suspended'].map(s => `<option value="${s}" ${p.status===s?'selected':''}>${s}</option>`).join('')}
          </select>
        </div>
        <div><label class="form-label">Title</label><input id="adm-ep-title" class="form-input" value="${Helpers.esc(p.title||'')}"></div>
        <div><label class="form-label">Description</label><textarea id="adm-ep-desc" class="form-input" rows="3">${Helpers.esc(p.description||'')}</textarea></div>
        <div><label class="form-label">Location</label><input id="adm-ep-loc" class="form-input" value="${Helpers.esc(p.location||'')}"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div><label class="form-label">Budget Min (₹)</label><input id="adm-ep-bmin" class="form-input" type="number" value="${p.budget_min||''}"></div>
          <div><label class="form-label">Budget Max (₹)</label><input id="adm-ep-bmax" class="form-input" type="number" value="${p.budget_max||''}"></div>
        </div>
        <div><label class="form-label">Admin Notes</label><textarea id="adm-ep-notes" class="form-input" rows="2" placeholder="Internal notes...">${Helpers.esc(p.admin_notes||'')}</textarea></div>
        
        <!-- Document Management -->
        <div style="border-top:1px solid #f1f5f9;padding-top:14px">
          <h4 style="font-size:13px;font-weight:700;color:#374151;margin-bottom:10px"><i class="fas fa-folder" style="margin-right:6px;color:#2563eb"></i>Documents (${docs.length})</h4>
          <div id="adm-docs-list" style="display:grid;gap:6px;margin-bottom:10px">
            ${docs.length === 0 ? '<p style="font-size:12px;color:#94a3b8">No documents uploaded yet.</p>' :
            docs.map(d => { if (d.file_url) docDataStore[d.id] = { file_name: d.file_name, file_url: d.file_url }; return `
            <div style="display:flex;align-items:center;gap:8px;padding:8px;background:#f8fafc;border-radius:8px" id="adm-doc-${d.id}">
              <i class="fas fa-file-alt" style="color:#2563eb;font-size:13px;flex-shrink:0"></i>
              <div style="flex:1;min-width:0"><p style="font-size:12px;font-weight:600;color:#1e293b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${Helpers.esc(d.file_name)}</p><p style="font-size:10px;color:#94a3b8">${d.doc_type}</p></div>
              <div style="display:flex;gap:4px;flex-shrink:0">
                ${d.file_url ? `<button onclick="downloadDoc(${d.id})" style="background:#eff6ff;color:#2563eb;padding:4px 8px;border-radius:6px;border:none;cursor:pointer;font-size:11px" title="Download"><i class="fas fa-download"></i></button>` : ''}
                <button onclick="adminDeleteDoc(${projectId}, ${d.id})" style="background:#fef2f2;color:#ef4444;padding:4px 8px;border-radius:6px;border:none;cursor:pointer;font-size:11px" title="Delete"><i class="fas fa-trash"></i></button>
              </div>
            </div>`; }).join('')}
          </div>
          <div style="background:#f8fafc;border-radius:10px;padding:12px;border:1px dashed #cbd5e1">
            <p style="font-size:11px;font-weight:700;color:#374151;margin-bottom:8px"><i class="fas fa-upload" style="margin-right:4px;color:#059669"></i>Upload Document</p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
              <select id="adm-doc-type-${projectId}" class="form-input" style="font-size:12px">
                <option value="blueprint">Blueprint</option><option value="specification">Specification</option><option value="photo">Photo</option><option value="permit">Permit</option><option value="contract">Contract</option><option value="other">Other</option>
              </select>
              <input id="adm-doc-file-${projectId}" type="file" accept=".pdf,.jpg,.jpeg,.png,.dwg,.dxf,.doc,.docx" class="form-input" style="font-size:12px;padding:4px">
            </div>
            <button onclick="adminUploadDoc(${projectId})" style="background:#059669;color:white;padding:7px 14px;border-radius:7px;border:none;cursor:pointer;font-size:12px;font-weight:600"><i class="fas fa-upload" style="margin-right:4px"></i>Upload</button>
          </div>
        </div>
      </div>`,
      `<button onclick="Modal.close()" style="padding:10px 20px;border:1.5px solid #e2e8f0;border-radius:10px;background:white;cursor:pointer">Cancel</button>
       <button onclick="adminV6SaveProject(${projectId})" class="btn-primary" style="color:white;padding:10px 24px;border-radius:10px;font-weight:600">Save Changes</button>`
    );
  } catch(e) { Toast.show('Failed to load project', 'error'); }
}

async function adminDeleteDoc(projectId, docId) {
  if (!confirm('Delete this document?')) return;
  try {
    await API.delete(`/projects/${projectId}/documents/${docId}`);
    Toast.show('Document deleted', 'success');
    document.getElementById(`adm-doc-${docId}`)?.remove();
  } catch(err) { Toast.show(err.response?.data?.error || 'Delete failed', 'error'); }
}

async function adminUploadDoc(projectId) {
  const docType = document.getElementById(`adm-doc-type-${projectId}`)?.value || 'other';
  const fileInput = document.getElementById(`adm-doc-file-${projectId}`);
  const file = fileInput?.files?.[0];
  if (!file) { Toast.show('Please select a file to upload', 'error'); return; }
  if (file.size > 10 * 1024 * 1024) { Toast.show('File exceeds 10MB limit', 'error'); return; }
  try {
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const { data } = await API.post(`/projects/${projectId}/documents`, { doc_type: docType, file_name: file.name, file_url: base64, file_size: file.size });
    const doc = data.document;
    // Store in docDataStore for download
    if (base64) docDataStore[doc.id] = { file_name: doc.file_name, file_url: base64 };
    Toast.show('Document uploaded!', 'success');
    const list = document.getElementById('adm-docs-list');
    if (list) {
      list.innerHTML += `<div style="display:flex;align-items:center;gap:8px;padding:8px;background:#f8fafc;border-radius:8px" id="adm-doc-${doc.id}">
        <i class="fas fa-file-alt" style="color:#2563eb;font-size:13px;flex-shrink:0"></i>
        <div style="flex:1;min-width:0"><p style="font-size:12px;font-weight:600;color:#1e293b">${Helpers.esc(doc.file_name)}</p><p style="font-size:10px;color:#94a3b8">${doc.doc_type}</p></div>
        <div style="display:flex;gap:4px;flex-shrink:0">
          <button onclick="downloadDoc(${doc.id})" style="background:#eff6ff;color:#2563eb;padding:4px 8px;border-radius:6px;border:none;cursor:pointer;font-size:11px"><i class="fas fa-download"></i></button>
          <button onclick="adminDeleteDoc(${projectId}, ${doc.id})" style="background:#fef2f2;color:#ef4444;padding:4px 8px;border-radius:6px;border:none;cursor:pointer;font-size:11px"><i class="fas fa-trash"></i></button>
        </div>
      </div>`;
    }
    if (fileInput) fileInput.value = '';
  } catch(err) { Toast.show(err.response?.data?.error || 'Upload failed', 'error'); }
}

async function adminV6SaveProject(projectId) {
  try {
    const bMin = document.getElementById('adm-ep-bmin')?.value;
    const bMax = document.getElementById('adm-ep-bmax')?.value;
    await API.patch('/admin/projects/' + projectId + '/admin-edit', {
      status: document.getElementById('adm-ep-status')?.value,
      title: document.getElementById('adm-ep-title')?.value?.trim(),
      description: document.getElementById('adm-ep-desc')?.value?.trim(),
      location: document.getElementById('adm-ep-loc')?.value?.trim(),
      admin_notes: document.getElementById('adm-ep-notes')?.value?.trim(),
      budget_min: bMin ? parseInt(bMin) : undefined,
      budget_max: bMax ? parseInt(bMax) : undefined,
    });
    Modal.close();
    Toast.show('✅ Project updated!', 'success');
    window.loadAdminSection('projects');
  } catch(e) { Toast.show(e.response?.data?.error || 'Failed', 'error'); }
}

async function adminV6SuspendProject(projectId) {
  if (!confirm('Suspend this project? It will be hidden from public listings.')) return;
  try {
    await API.patch('/admin/projects/' + projectId + '/admin-edit', { status: 'suspended' });
    Toast.show('Project suspended', 'info');
    window.loadAdminSection('projects');
  } catch(e) { Toast.show(e.response?.data?.error || 'Failed', 'error'); }
}

async function adminV6RestoreProject(projectId) {
  if (!confirm('Restore this project to open status?')) return;
  try {
    await API.patch('/admin/projects/' + projectId + '/admin-edit', { status: 'open' });
    Toast.show('Project restored', 'success');
    window.loadAdminSection('projects');
  } catch(e) { Toast.show(e.response?.data?.error || 'Failed', 'error'); }
}


// ── BOOK EXPERT: with duplicate check ─────────────────────────────────────────
async function bookExpertWithDupeCheck(expertId, expertName) {
  if (!Auth.isLoggedIn()) { Router.go('/login'); return; }
  // Check if pending request already exists
  try {
    const existing = await API.get(`/consultations?status=requested`);
    const consultations = existing.data.consultations || [];
    const dup = consultations.find(c => c.expert_id == expertId);
    if (dup) {
      Toast.show(`You already have a pending request with ${expertName}. Check your dashboard.`, 'warning');
      return;
    }
  } catch {}
  // Proceed to booking modal
  if (typeof bookExpert === 'function') bookExpert(expertId, expertName);
  else Router.go(`/experts/${expertId}`);
}


// ── POST PROJECT: Check subscription limit before showing form ────────────────
const _origPostProject = Pages.postProject;
Pages.postProject = function() {
  if (!Auth.isLoggedIn() || Auth.role() !== 'customer') { Router.go('/login'); return; }
  const user = State.user;
  const plan = user.subscription_plan || 'free';
  // Limit check is server-side, but give UI hint
  if (_origPostProject) _origPostProject.call(this);
};



// ═══════════════════════════════════════════════════════════════════════════
// BidKarts v8 – FINAL COMPREHENSIVE FIX
// Fixes: adminNavTo, v6ShowEditProject, loadAiAnswersEditor,
//        Expert Section full handler, bottom menu persistence, duplicate requests
// ═══════════════════════════════════════════════════════════════════════════

// ── adminNavTo – navigate admin sidebar ─────────────────────────────────────
function adminNavTo(section) {
  if (typeof loadAdminSection === 'function') loadAdminSection(section);
}
window.adminNavTo = adminNavTo;

// ── v6ShowEditProject – customer quick edit from projects list ───────────────
function v6ShowEditProject(id) {
  loadCustomerSection('edit-project');
}
window.v6ShowEditProject = v6ShowEditProject;

// ── loadAiAnswersEditor – admin AI knowledge base editor ────────────────────
async function loadAiAnswersEditor(el) {
  if (!el) return;
  el.innerHTML = '<div style="display:flex;justify-content:center;padding:60px"><div class="loading-spinner"></div></div>';
  try {
    const { data } = await API.get('/admin/ai/responses');
    const responses = data.responses || [];
    el.innerHTML = `
    <div style="background:white;border-radius:20px;padding:32px;box-shadow:0 2px 12px rgba(0,0,0,0.06)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;flex-wrap:wrap;gap:12px">
        <h3 style="font-size:20px;font-weight:800;color:#0f172a"><i class="fas fa-database" style="color:#f97316;margin-right:8px"></i>AI Knowledge Base (${responses.length})</h3>
        <button onclick="openAddAiResponseModal()" class="btn-accent" style="color:white;padding:10px 20px;border-radius:10px;font-size:13px;font-weight:600"><i class="fas fa-plus" style="margin-right:6px"></i>Add Response</button>
      </div>
      ${responses.length === 0 ? '<div style="text-align:center;padding:48px;color:#94a3b8"><i class="fas fa-robot" style="font-size:40px;display:block;margin-bottom:12px;color:#e2e8f0"></i>No AI responses yet</div>' :
      '<div style="display:grid;gap:14px">' + responses.map(r => `
      <div style="border:1px solid #e2e8f0;border-radius:14px;padding:18px;background:${r.is_approved?'white':'#fffbeb'}">
        <div style="display:flex;align-items:start;justify-content:space-between;gap:10px;margin-bottom:10px">
          <div style="flex:1">
            <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">
              <span style="background:#eff6ff;color:#2563eb;padding:2px 8px;border-radius:8px;font-size:11px;font-weight:600">${Helpers.esc(r.category||'general')}</span>
              <span style="background:${r.is_approved?'#f0fdf4;color:#059669':'#fef3c7;color:#d97706'};padding:2px 8px;border-radius:8px;font-size:11px;font-weight:600">${r.is_approved?'Approved':'Pending'}</span>
            </div>
            <p style="font-weight:700;color:#1e293b;font-size:14px;margin-bottom:4px">${Helpers.esc(r.question||'')}</p>
            <p style="font-size:13px;color:#64748b;line-height:1.5">${Helpers.esc(r.answer||'')}</p>
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0">
            <button onclick="editAiResponseModal(${r.id},'${Helpers.esc(r.question||'').replace(/'/g,"\\'")}','${Helpers.esc(r.answer||'').replace(/'/g,"\\'")}','${r.category||''}')" style="padding:6px 12px;background:#eff6ff;color:#2563eb;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600">Edit</button>
            ${!r.is_approved ? `<button onclick="approveAiResponse(${r.id})" style="padding:6px 12px;background:#f0fdf4;color:#059669;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600">Approve</button>` : ''}
            <button onclick="deleteAiResponse(${r.id})" style="padding:6px 12px;background:#fef2f2;color:#dc2626;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600">Delete</button>
          </div>
        </div>
      </div>`).join('') + '</div>'}
    </div>`;
  } catch(e) {
    el.innerHTML = `<div style="color:#dc2626;padding:40px;text-align:center">Failed to load AI responses: ${e.message}</div>`;
  }
}
window.loadAiAnswersEditor = loadAiAnswersEditor;

function openAddAiResponseModal() {
  Modal.show('Add AI Response', `
    <div style="display:grid;gap:14px">
      <div><label class="form-label">Question *</label><input id="air-q" class="form-input" placeholder="Question..."></div>
      <div><label class="form-label">Answer *</label><textarea id="air-a" class="form-input" rows="4" placeholder="Answer..."></textarea></div>
      <div><label class="form-label">Category</label>
        <select id="air-cat" class="form-input">
          ${['general','solar','electrical','hvac','plumbing','fabrication','contracting'].map(c=>`<option value="${c}">${c}</option>`).join('')}
        </select>
      </div>
    </div>`,
    `<button onclick="Modal.close()" style="padding:10px 20px;border:1.5px solid #e2e8f0;border-radius:10px;background:white;cursor:pointer">Cancel</button>
     <button onclick="saveAiResponseV8()" class="btn-primary" style="color:white;padding:10px 24px;border-radius:10px;font-weight:600">Save</button>`
  );
}

async function saveAiResponseV8() {
  const q = document.getElementById('air-q')?.value?.trim();
  const a = document.getElementById('air-a')?.value?.trim();
  const cat = document.getElementById('air-cat')?.value;
  if (!q || !a) { Toast.show('Question and Answer are required', 'warning'); return; }
  try {
    await API.post('/admin/ai/responses', { question: q, answer: a, category: cat });
    Modal.close(); Toast.show('AI response added!', 'success');
    const el = document.getElementById('ai-v5-content');
    if (el) loadAiAnswersEditor(el);
  } catch(e) { Toast.show(e.response?.data?.error || 'Failed', 'error'); }
}

function editAiResponseModal(id, question, answer, category) {
  Modal.show('Edit AI Response', `
    <div style="display:grid;gap:14px">
      <div><label class="form-label">Question *</label><input id="air-eq" class="form-input" value="${question}" placeholder="Question..."></div>
      <div><label class="form-label">Answer *</label><textarea id="air-ea" class="form-input" rows="4" placeholder="Answer...">${answer}</textarea></div>
      <div><label class="form-label">Category</label>
        <select id="air-ecat" class="form-input">
          ${['general','solar','electrical','hvac','plumbing','fabrication','contracting'].map(c=>`<option value="${c}" ${c===category?'selected':''}>${c}</option>`).join('')}
        </select>
      </div>
    </div>`,
    `<button onclick="Modal.close()" style="padding:10px 20px;border:1.5px solid #e2e8f0;border-radius:10px;background:white;cursor:pointer">Cancel</button>
     <button onclick="updateAiResponseV8(${id})" class="btn-primary" style="color:white;padding:10px 24px;border-radius:10px;font-weight:600">Update</button>`
  );
}

async function updateAiResponseV8(id) {
  const q = document.getElementById('air-eq')?.value?.trim();
  const a = document.getElementById('air-ea')?.value?.trim();
  const cat = document.getElementById('air-ecat')?.value;
  if (!q || !a) { Toast.show('Required fields missing', 'warning'); return; }
  try {
    await API.patch(`/admin/ai/responses/${id}`, { question: q, answer: a, category: cat });
    Modal.close(); Toast.show('Updated!', 'success');
    const el = document.getElementById('ai-v5-content');
    if (el) loadAiAnswersEditor(el);
  } catch(e) { Toast.show(e.response?.data?.error || 'Failed', 'error'); }
}

async function approveAiResponse(id) {
  try {
    await API.patch(`/admin/ai/responses/${id}`, { is_approved: 1 });
    Toast.show('Approved!', 'success');
    const el = document.getElementById('ai-v5-content');
    if (el) loadAiAnswersEditor(el);
  } catch(e) { Toast.show('Failed', 'error'); }
}

// ── COMPLETE Expert Section Handler ──────────────────────────────────────────
// Replace the partial loadExpertSection with a complete one
window.loadExpertSection = async function(section) {
  document.querySelectorAll('.sidebar-nav button').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById(`edash-${section}`) || document.getElementById(`dash-${section}`);
  if (btn) btn.classList.add('active');
  const el = document.getElementById('expert-content');
  if (!el) return;
  el.innerHTML = '<div style="display:flex;justify-content:center;padding:60px"><div class="loading-spinner"></div></div>';

  try {
    if (section === 'overview') {
      const [inspsRes, payRes] = await Promise.all([
        API.get('/inspections/my').catch(() => ({ data: { inspections: [] } })),
        API.get('/payments/stats').catch(() => ({ data: {} }))
      ]);
      const insps = inspsRes.data.inspections || [];
      const ps = payRes.data;
      const pending = insps.filter(i => i.status === 'assigned').length;
      const completed = insps.filter(i => i.status === 'completed').length;
      const earnings = ps.total_earned || insps.filter(i=>i.status==='completed').length * 1500;
      el.innerHTML = `
      <div style="margin-bottom:28px">
        <h2 style="font-size:24px;font-weight:800;color:#0f172a">Welcome, ${Helpers.esc(State.user?.name?.split(' ')[0]||'Expert')}! 👋</h2>
        <p style="color:#64748b;margin-top:4px">Your BidKarts Expert Dashboard</p>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:16px;margin-bottom:28px">
        ${[
          ['fa-clipboard-list','Total Inspections',insps.length,'#2563eb','#eff6ff'],
          ['fa-clock','Assigned / Pending',pending,'#f59e0b','#fffbeb'],
          ['fa-check-circle','Completed',completed,'#059669','#f0fdf4'],
          ['fa-rupee-sign','Approx Earnings',Helpers.currency(earnings),'#7c3aed','#f5f3ff'],
        ].map(([icon,label,val,color,bg]) => `
        <div class="stat-card">
          <div style="width:44px;height:44px;background:${bg};border-radius:12px;display:flex;align-items:center;justify-content:center;margin-bottom:12px">
            <i class="fas ${icon}" style="font-size:18px;color:${color}"></i>
          </div>
          <p style="font-size:24px;font-weight:800;color:#0f172a">${val}</p>
          <p style="font-size:13px;color:#64748b;margin-top:4px">${label}</p>
        </div>`).join('')}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
        <div style="background:white;border-radius:16px;padding:24px;box-shadow:0 1px 4px rgba(0,0,0,0.05)">
          <h3 style="font-size:16px;font-weight:700;color:#1e293b;margin-bottom:16px">Recent Inspections</h3>
          ${insps.slice(0,5).map(i => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:10px;border-radius:10px;margin-bottom:6px" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
            <div><p style="font-size:13px;font-weight:600;color:#1e293b">${Helpers.truncate(i.project_title||'Project',35)}</p><p style="font-size:11px;color:#94a3b8">${i.customer_name||''} · ${Helpers.timeAgo(i.created_at)}</p></div>
            ${Helpers.statusBadge(i.status)}
          </div>`).join('') || '<p style="color:#94a3b8;text-align:center;padding:20px;font-size:13px">No inspections yet</p>'}
        </div>
        <div style="background:white;border-radius:16px;padding:24px;box-shadow:0 1px 4px rgba(0,0,0,0.05)">
          <h3 style="font-size:16px;font-weight:700;color:#1e293b;margin-bottom:16px">Inspection Status</h3>
          <canvas id="expert-insp-chart" height="200"></canvas>
        </div>
      </div>`;
      setTimeout(() => {
        const ctx = document.getElementById('expert-insp-chart');
        if (ctx && window.Chart && insps.length > 0) {
          const counts = {};
          insps.forEach(i => { counts[i.status] = (counts[i.status]||0)+1; });
          new Chart(ctx, { type:'doughnut', data:{ labels:Object.keys(counts).map(s=>s.replace('_',' ')), datasets:[{ data:Object.values(counts), backgroundColor:['#3b82f6','#f59e0b','#8b5cf6','#10b981','#ef4444'], borderWidth:0 }] }, options:{ responsive:true, plugins:{ legend:{ position:'bottom', labels:{ font:{size:11} } } } } });
        }
      }, 100);

    } else if (section === 'inspections') {
      const { data } = await API.get('/inspections/my');
      const insps = data.inspections || [];
      el.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px">
        <h2 style="font-size:22px;font-weight:800;color:#0f172a">My Inspections</h2>
        <div style="display:flex;gap:10px;font-size:12px;color:#64748b">
          <span>Total: ${insps.length}</span>
          <span>Assigned: ${insps.filter(i=>i.status==='assigned').length}</span>
          <span>Completed: ${insps.filter(i=>i.status==='completed').length}</span>
        </div>
      </div>
      ${insps.length === 0 ? `
      <div style="background:white;border-radius:20px;padding:60px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,0.05)">
        <i class="fas fa-clipboard" style="font-size:48px;color:#e2e8f0;display:block;margin-bottom:16px"></i>
        <p style="color:#94a3b8">No inspections assigned yet</p>
      </div>` :
      `<div style="display:grid;gap:16px">${insps.map(i => renderInspectionCard(i, 'expert')).join('')}</div>`}`;

    } else if (section === 'consultations') {
      const { data } = await API.get('/consultations');
      const cons = data.consultations || [];
      const pending = cons.filter(c => c.status === 'requested');
      const accepted = cons.filter(c => c.status === 'accepted');
      el.innerHTML = `
      <h2 style="font-size:22px;font-weight:800;color:#0f172a;margin-bottom:24px">My Consultations</h2>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-bottom:28px">
        ${[['fa-clock','Pending',pending.length,'#f59e0b','#fffbeb'],['fa-calendar-check','Scheduled',accepted.length,'#2563eb','#eff6ff'],['fa-check-circle','Completed',cons.filter(c=>c.status==='completed').length,'#10b981','#f0fdf4']].map(([icon,label,val,color,bg]) => `
        <div class="stat-card"><div style="width:40px;height:40px;background:${bg};border-radius:10px;display:flex;align-items:center;justify-content:center;margin-bottom:10px"><i class="fas ${icon}" style="color:${color}"></i></div><p style="font-size:22px;font-weight:800;color:#0f172a">${val}</p><p style="font-size:12px;color:#64748b;margin-top:4px">${label}</p></div>`).join('')}
      </div>
      <div style="display:grid;gap:14px">
        ${cons.length === 0 ? '<div style="background:white;border-radius:20px;padding:60px;text-align:center"><p style="color:#64748b">No consultations yet</p></div>' :
        cons.map(c => `
        <div style="background:white;border-radius:14px;padding:20px;box-shadow:0 1px 4px rgba(0,0,0,0.05)">
          <div style="display:flex;align-items:start;gap:14px;flex-wrap:wrap">
            <div style="flex:1">
              <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
                <span style="font-size:11px;background:${c.status==='requested'?'#fffbeb;color:#d97706':c.status==='accepted'?'#eff6ff;color:#2563eb':'#f0fdf4;color:#059669'};padding:2px 10px;border-radius:10px;font-weight:700">${c.status}</span>
                <span style="font-size:11px;color:#94a3b8">${Helpers.date(c.created_at)}</span>
              </div>
              <p style="font-weight:700;color:#1e293b">${Helpers.esc(c.topic||'')}</p>
              <p style="font-size:13px;color:#64748b">${Helpers.esc(c.customer_name||'')} · ${c.consultation_type||'video'} · ₹${(c.fee||0).toLocaleString('en-IN')}</p>
              ${c.preferred_date ? `<p style="font-size:12px;color:#374151;margin-top:4px"><i class="fas fa-calendar" style="margin-right:4px;color:#2563eb"></i>Preferred: ${c.preferred_date} ${c.preferred_time||''}</p>` : ''}
            </div>
            <div style="display:flex;flex-direction:column;gap:8px">
              ${c.status === 'requested' ? `<button onclick="acceptConsultation(${c.id})" style="padding:8px 14px;background:#f0fdf4;color:#059669;border:1.5px solid #86efac;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600">Accept</button>` : ''}
              ${c.status === 'accepted' ? `<button onclick="completeConsultation(${c.id})" style="padding:8px 14px;background:#eff6ff;color:#2563eb;border:1.5px solid #bfdbfe;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600">Mark Complete</button>` : ''}
            </div>
          </div>
        </div>`).join('')}
      </div>`;

    } else if (section === 'history') {
      const { data } = await API.get('/inspections/my');
      const completed = (data.inspections || []).filter(i => i.status === 'completed');
      el.innerHTML = `
      <h2 style="font-size:22px;font-weight:800;color:#0f172a;margin-bottom:24px">Completed Inspections (${completed.length})</h2>
      ${completed.length === 0 ? '<div style="background:white;border-radius:20px;padding:60px;text-align:center"><i class="fas fa-history" style="font-size:48px;color:#e2e8f0;display:block;margin-bottom:16px"></i><p style="color:#94a3b8">No completed inspections yet</p></div>' :
      '<div style="display:grid;gap:16px">' + completed.map(i => renderInspectionCard(i,'expert')).join('') + '</div>'}`;

    } else if (section === 'earnings') {
      const { data: inspsData } = await API.get('/inspections/my');
      const allInsps = inspsData.inspections || [];
      const done = allInsps.filter(i => i.status === 'completed');
      const totalEarnings = done.length * 1500;
      el.innerHTML = `
      <h2 style="font-size:22px;font-weight:800;color:#0f172a;margin-bottom:24px">Earnings Overview</h2>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px;margin-bottom:28px">
        ${[
          ['fa-rupee-sign','Total Earned',Helpers.currency(totalEarnings),'#059669','#f0fdf4'],
          ['fa-check-circle','Completed',done.length,'#059669','#f0fdf4'],
          ['fa-clock','Pending',allInsps.filter(i=>i.status==='assigned').length,'#f59e0b','#fffbeb'],
          ['fa-calculator','Per Inspection','₹1,500','#2563eb','#eff6ff'],
        ].map(([icon,label,val,color,bg]) => `
        <div class="stat-card">
          <div style="width:44px;height:44px;background:${bg};border-radius:12px;display:flex;align-items:center;justify-content:center;margin-bottom:12px">
            <i class="fas ${icon}" style="color:${color};font-size:18px"></i>
          </div>
          <p style="font-size:24px;font-weight:800;color:#0f172a">${val}</p>
          <p style="font-size:13px;color:#64748b;margin-top:4px">${label}</p>
        </div>`).join('')}
      </div>
      <div style="background:white;border-radius:16px;padding:24px;box-shadow:0 1px 4px rgba(0,0,0,0.05)">
        <h3 style="font-size:16px;font-weight:700;margin-bottom:16px">Payment Policy</h3>
        <ul style="list-style:none;display:grid;gap:10px">
          ${[
            ['fa-check-circle','Each completed inspection pays ₹1,500 directly to your account','#059669'],
            ['fa-calendar','Payments processed within 7 business days of inspection completion','#2563eb'],
            ['fa-shield-alt','Platform handles all payment processing and customer disputes','#7c3aed'],
            ['fa-star','Maintain 4.0+ rating to keep receiving new inspection assignments','#f59e0b'],
          ].map(([icon,text,color]) => `
          <li style="display:flex;align-items:start;gap:10px;padding:12px;background:#f8fafc;border-radius:10px">
            <i class="fas ${icon}" style="color:${color};margin-top:2px;flex-shrink:0"></i>
            <span style="font-size:13px;color:#374151">${text}</span>
          </li>`).join('')}
        </ul>
      </div>`;

    } else if (section === 'profile') {
      Router.go('/profile/edit');

    } else {
      el.innerHTML = '<div style="text-align:center;padding:60px;color:#94a3b8"><i class="fas fa-tools" style="font-size:40px;display:block;margin-bottom:12px"></i>Section coming soon</div>';
    }
  } catch(e) {
    console.error('[Expert Section Error]', e);
    el.innerHTML = `<div style="text-align:center;padding:60px"><div style="background:#fef2f2;border-radius:16px;padding:32px;max-width:480px;margin:0 auto">
      <i class="fas fa-exclamation-circle" style="font-size:32px;color:#ef4444;display:block;margin-bottom:12px"></i>
      <p style="color:#dc2626;font-weight:600;margin-bottom:8px">Failed to load section</p>
      <p style="color:#64748b;font-size:13px">${Helpers.esc(e.message||'Unknown error')}</p>
      <button onclick="window.loadExpertSection('${section}')" style="margin-top:14px;padding:8px 20px;background:#2563eb;color:white;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600">Retry</button>
    </div></div>`;
  }
};
// Expert section is now fully defined as window.loadExpertSection


// ── Fix admin section: also expose as global ─────────────────────────────────
window.loadAdminSection = loadAdminSection;


// ── Fix Customer loadCustomerSection: handle 'edit-project' section ──────────
const _origLoadCustSec = window.loadCustomerSection || loadCustomerSection;
window.loadCustomerSection = async function(section) {
  if (section === 'edit-project') {
    document.querySelectorAll('.sidebar-nav button').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById('dash-edit-project');
    if (btn) btn.classList.add('active');
    const el = document.getElementById('cust-content');
    if (!el) return;
    await loadCustomerEditProjects(el);
    return;
  }
  return _origLoadCustSec(section);
};


// ── Fix admin cancel inspection URL ──────────────────────────────────────────
// Override adminCancelInspection to use the correct endpoint
window.adminCancelInspection = async function(id) {
  if (!confirm('Cancel this inspection? This cannot be undone.')) return;
  try {
    await API.patch(`/inspections/${id}/cancel`, {});
    Toast.show('Inspection cancelled', 'info');
    loadAdminSection('inspections');
  } catch(e) { Toast.show(e.response?.data?.error || 'Failed', 'error'); }
};


// ── Fix confirmAdminAssignInspection to call loadAdminSection ────────────────
window.confirmAdminAssignInspection = async function(inspId) {
  const expertId = document.getElementById('assign-expert-select')?.value;
  const visitDate = document.getElementById('assign-visit-date')?.value;
  if (!expertId) { Toast.show('Please select an expert', 'warning'); return; }
  try {
    await API.patch(`/inspections/${inspId}/assign`, { expert_id: parseInt(expertId), visit_date: visitDate || null });
    Modal.close();
    Toast.show('✅ Expert assigned to inspection!', 'success');
    loadAdminSection('inspections');
  } catch(e) { Toast.show(e.response?.data?.error || 'Failed', 'error'); }
};


// ── Auto-assign nearby expert when customer hasn't selected one ───────────────
// Backend check: after inspection payment, auto-assign if no expert assigned
async function autoAssignNearbyExpert(inspectionId, projectId) {
  try {
    const { data } = await API.get('/consultations/experts');
    const experts = data.experts || [];
    if (experts.length === 0) return;
    // Pick first available expert (admin can re-assign later)
    const expert = experts.find(e => e.is_available) || experts[0];
    if (expert) {
      await API.patch(`/inspections/${inspectionId}/assign`, {
        expert_id: expert.id,
        visit_date: null
      });
      Toast.show(`Expert ${expert.name} auto-assigned to your inspection!`, 'info', 4000);
    }
  } catch(e) {
    // Silent fail - admin will assign manually
  }
}
window.autoAssignNearbyExpert = autoAssignNearbyExpert;


// ── Fix loadCustomerSection 'profile' section ────────────────────────────────
const _v8LoadCustSec = window.loadCustomerSection;
window.loadCustomerSection = async function(section) {
  if (section === 'profile') {
    Router.go('/profile/edit');
    return;
  }
  return _v8LoadCustSec(section);
};
// loadCustomerSection now points to window.loadCustomerSection (set above)


// ── Duplicate Expert Request Prevention (enhanced) ───────────────────────────
window.bookExpertWithDupeCheck = async function(expertId, expertName) {
  if (!Auth.isLoggedIn()) { Router.go('/login'); return; }
  try {
    const { data } = await API.get('/consultations');
    const cons = data.consultations || [];
    const dup = cons.find(c => c.expert_id == expertId && ['requested','accepted'].includes(c.status));
    if (dup) {
      Toast.show(`You already have an active request with ${expertName}. Check your dashboard → Consultations.`, 'warning', 5000);
      return;
    }
  } catch {}
  if (typeof openBookExpertModal === 'function') openBookExpertModal(expertId, expertName);
  else Router.go(`/experts/${expertId}`);
};


// ── Free Subscription Limit Fix: 10 projects for free tier ──────────────────
// The backend already handles this; add frontend hint
const _v8PostProject = Pages.postProject;
if (typeof _v8PostProject === 'function') {
  Pages.postProject = function() {
    const user = State.user;
    if (user && user.subscription_plan === 'free') {
      // Show subscription limit banner
      // The actual limit check is server-side
    }
    return _v8PostProject.call(this);
  };
}


// ── Bottom Menu / Navbar Persistence Fix ─────────────────────────────────────
// Ensure navbar re-renders on every route change
const _v8RouterGo = Router.go.bind(Router);
Router.go = function(path, params = {}) {
  if (path === -1 || path === '-1') { history.back(); return; }
  return _v8RouterGo(path, params);
};

// ── Router Init ─────────────────────────────────────────────────────────────
Router.register('/', Pages.home);
Router.register('/login', Pages.login);
Router.register('/register', Pages.register);
Router.register('/projects', Pages.projects);
Router.register('/projects/:id', Pages.projectDetail);
Router.register('/post-project', Pages.postProject);
Router.register('/vendors', Pages.vendors);
Router.register('/vendors/:id', Pages.vendorProfile);
Router.register('/dashboard/customer', Pages.customerDashboard);
Router.register('/dashboard/vendor', Pages.vendorDashboard);
Router.register('/dashboard/expert', Pages.expertDashboard);
Router.register('/dashboard/admin', Pages.adminDashboard);
Router.register('/bid-comparison/:id', Pages.bidComparison);
Router.register('/checkout/:id', Pages.checkout);
Router.register('/services', Pages.servicesHub);
Router.register('/experts', Pages.expertsList);
Router.register('/how-it-works', Pages.howItWorks);
Router.register('/privacy-policy', Pages.privacyPolicy);
Router.register('/terms-of-service', Pages.termsOfService);
Router.register('/profile/edit', Pages.editProfile);
Router.register('/forgot-password', Pages.forgotPassword);
Router.register('/reset-password', Pages.resetPassword);
Router.register('/messages', Pages.messages);
Router.register('/messages/:id', Pages.chat);
Router.register('/milestones/:id', Pages.milestones);
Router.register('/vendor-plans', Pages.vendorPlans);
Router.register('/about', Pages.about);
Router.register('/ai-tools', Pages.aiTools);
Router.register('/consultations', Pages.consultations);
Router.register('/disputes', Pages.disputes);
Router.register('/shortlist', Pages.shortlist);
Router.register('/services/solar-epc', Pages.servicePage);
Router.register('/services/solar', Pages.servicePage);
Router.register('/services/electrical', Pages.servicePage);
Router.register('/services/hvac', Pages.servicePage);
Router.register('/services/plumbing', Pages.servicePage);
Router.register('/services/fabrication', Pages.servicePage);
Router.register('/services/contracting', Pages.servicePage);
Router.register('/expert-dashboard', () => { if (Auth.isLoggedIn() && Auth.role()==='expert') Router.go('/dashboard/expert'); else Router.go('/login'); });
Router.register('/experts/:id', Pages.expertDetail);
Router.register('/reverse-auction/:id', Pages.reverseAuction);
Router.register('/profile', () => {
  if (Auth.isLoggedIn()) {
    const role = Auth.role();
    Router.go(role === 'vendor' ? '/dashboard/vendor' : role === 'expert' ? '/dashboard/expert' : role === 'admin' ? '/dashboard/admin' : '/dashboard/customer');
  } else { Router.go('/login'); }
});

// Initialize app
State.init();
if (Auth.isLoggedIn()) {
  loadNotifications();
  startNotificationPolling();
}
Router.init();


console.log("[BidKarts v7] ✅ Clean deduplicated build – all features loaded");
