/* ══════════════════════════════════════════════════════
   COCKPIT NATURALITY · Noyau
   Auth Supabase · Navigation · Page Recherche
   ══════════════════════════════════════════════════════ */

const CONFIG = {
  SUPABASE_URL: 'https://ijxmpudqfbxkmjmzdkfc.supabase.co',
  SUPABASE_KEY: 'sb_publishable_E4-j1Xic0N5BJuntRYmcBg_mGS1HUxx',
  SHEETS_API: 'https://script.google.com/macros/s/AKfycbxp3Ch9lvOtu4uVLHZDR7r55nnxAy178gqZAfd7fsv4vltE2rw7he2I4Lgh18qDAt6F/exec',
  SEARCH_REFRESH_MS: 60000
};

// Client Supabase
const sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

// État global partagé
const State = {
  user: null,       // compte auth
  profile: null,    // ligne profiles
  page: 'search',
  events: [],
  searchData: {},
  searchMeta: {},
  searchFilter: 'all'
};

/* ─────────── HELPERS ─────────── */
const $ = (id) => document.getElementById(id);

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
function escAttr(s) { return String(s ?? '').replace(/"/g, '&quot;'); }
function norm(s) {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function pad(n, len = 3) { return String(n).padStart(len, '0'); }

function highlight(text, q) {
  text = String(text ?? '');
  if (!q) return esc(text);
  const i = norm(text).indexOf(norm(q));
  if (i === -1) return esc(text);
  return esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length));
}

const MOIS = ['janv','févr','mars','avr','mai','juin','juil','août','sept','oct','nov','déc'];

function fmtDate(d) {
  if (!d) return null;
  const dt = new Date(d + 'T00:00:00');
  if (isNaN(dt)) return null;
  return { d: dt.getDate(), m: MOIS[dt.getMonth()], y: dt.getFullYear() };
}
function fmtHeure(h) {
  if (!h) return null;
  return String(h).slice(0, 5).replace(':', 'h');
}
function timeAgo(iso) {
  if (!iso) return '—';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `il y a ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h}h`;
  return `il y a ${Math.floor(h / 24)}j`;
}

function toast(text, kind) {
  const el = $('toast');
  $('toastText').textContent = text;
  el.className = 'toast show' + (kind ? ' ' + kind : '');
  if (kind !== 'work') setTimeout(() => el.classList.remove('show'), 2200);
}
function hideToast() { $('toast').classList.remove('show'); }

function setSync(state, text) {
  $('syncDot').className = 'sync-dot' + (state === 'ok' ? '' : ' ' + state);
  $('syncText').textContent = text;
}

function showAlert(id, msg, kind) {
  const el = $(id);
  el.className = 'alert show alert-' + (kind || 'error');
  el.textContent = msg;
}
function hideAlert(id) { $(id).className = 'alert'; }

function initial(name) { return (name || '?').trim().charAt(0).toUpperCase(); }

function roleColor(role) {
  return { admin: '#6b3fa0', bureau: '#2e7dca', membre: '#2c9970', benevole: '#e8722a' }[role] || '#4a4f70';
}

// Le staff (admin + bureau) peut écrire
function canEdit() {
  return State.profile && ['admin', 'bureau'].includes(State.profile.role);
}

/* ─────────── AUTH ─────────── */

async function boot() {
  $('bootText').textContent = 'Vérification de la session…';
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
      await onSignedIn(session.user);
    } else {
      showLogin();
    }
  } catch (err) {
    console.error('Boot error', err);
    showLogin('Impossible de joindre le serveur. Vérifie ta connexion.');
  }
}

function showLogin(msg) {
  $('bootScreen').classList.add('hidden');
  $('app').classList.add('hidden');
  $('loginScreen').classList.remove('hidden');
  if (msg) showAlert('loginAlert', msg, 'error');
  $('loginEmail').focus();
}

async function doLogin() {
  const email = $('loginEmail').value.trim();
  const pw = $('loginPw').value;
  hideAlert('loginAlert');

  if (!email || !pw) {
    showAlert('loginAlert', 'Renseigne ton e-mail et ton mot de passe.', 'error');
    return;
  }

  const btn = $('loginBtn');
  btn.disabled = true;
  btn.textContent = 'Connexion…';

  const { data, error } = await sb.auth.signInWithPassword({ email, password: pw });

  btn.disabled = false;
  btn.textContent = 'Se connecter';

  if (error) {
    const msg = /invalid login/i.test(error.message)
      ? 'E-mail ou mot de passe incorrect.'
      : error.message;
    showAlert('loginAlert', msg, 'error');
    return;
  }
  await onSignedIn(data.user);
}

async function onSignedIn(user) {
  State.user = user;
  $('loginScreen').classList.add('hidden');
  $('bootScreen').classList.remove('hidden');
  $('bootText').textContent = 'Chargement de ton profil…';

  const { data: profile, error } = await sb
    .from('profiles').select('*').eq('id', user.id).maybeSingle();

  if (error) {
    console.error(error);
    await sb.auth.signOut();
    showLogin('Impossible de lire ton profil : ' + error.message);
    return;
  }
  if (!profile) {
    await sb.auth.signOut();
    showLogin("Aucun profil associé à ce compte. Inscris-toi d'abord sur le Hub.");
    return;
  }
  if (profile.statut !== 'valide') {
    await sb.auth.signOut();
    showLogin('Ton compte est en attente de validation par un administrateur.');
    return;
  }

  State.profile = profile;
  renderUser();

  $('bootScreen').classList.add('hidden');
  $('app').classList.remove('hidden');

  setSync('ok', 'Connecté');
  loadEvents();
  fetchSearch();
  if (window.Meetings) Meetings.load();
}

function renderUser() {
  const p = State.profile;
  const nom = p.prenom || p.nom || p.email || '—';
  $('userName').textContent = nom;
  $('userRole').textContent = p.role || '—';
  $('userAv').textContent = initial(nom);
  $('userAv').style.background = roleColor(p.role);
}

async function doLogout() {
  if (!confirm('Se déconnecter du Cockpit ?')) return;
  await sb.auth.signOut();
  location.reload();
}

/* ─────────── ÉVÉNEMENTS ─────────── */

async function loadEvents() {
  const { data, error } = await sb
    .from('cockpit_events').select('*').eq('actif', true).order('nom');
  if (error) { console.error(error); return; }
  State.events = data || [];

  const opts = State.events.map(e =>
    `<option value="${e.id}">${esc(e.nom)}</option>`).join('');
  $('filterEvent').innerHTML = '<option value="">Tous les événements</option>' + opts;
  $('mfEvent').innerHTML = '<option value="">— Aucun / réunion générale —</option>' + opts;
}

function eventById(id) { return State.events.find(e => e.id === id) || null; }

/* ─────────── NAVIGATION ─────────── */

function setPage(page) {
  State.page = page;
  document.querySelectorAll('.nav-link[data-page]').forEach(l =>
    l.classList.toggle('active', l.dataset.page === page));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  $('page-' + page).classList.add('active');
  if (page === 'meetings' && window.Meetings) Meetings.load();
  if (page === 'pilotage' && window.Pilotage) Pilotage.render();
}

/* ─────────── PAGE RECHERCHE (Google Sheets) ─────────── */

const SHEET_TYPES = {
  stands:     { label: 'Stands',     title: 'Nom du stand',           meta: ['Catégorie', 'Type / Activité', 'Emplacement (zone)'] },
  sponsors:   { label: 'Sponsors',   title: 'Nom du sponsor',         meta: ['Statut', 'Niveau', 'Montant prévisionnel (€)'] },
  animations: { label: 'Animations', title: "Titre de l'animation",   meta: ['Jour', 'Horaire début', 'Lieu / Zone'] },
  benevoles:  { label: 'Bénévoles',  title: 'Nom',                    meta: ['Prénom', 'Poste principal', 'Statut'] },
  taches:     { label: 'Tâches',     title: 'Titre de la tâche',      meta: ['Responsable', 'Priorité', 'Échéance'] },
  budget:     { label: 'Budget',     title: 'Poste budgétaire',       meta: ['Catégorie', 'Type', 'Montant prévu (€)'] }
};

async function fetchSearch() {
  try {
    const res = await fetch(CONFIG.SHEETS_API + '?action=all');
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'Réponse invalide');
    State.searchData = json.data || {};
    State.searchMeta = json.meta || {};
    const total = Object.values(State.searchData).reduce((s, a) => s + a.length, 0);
    $('badgeSearch').textContent = total;
    renderSearch();
    if (window.Pilotage) Pilotage.render();
  } catch (err) {
    $('searchSub').textContent = 'Google Drive injoignable';
    $('searchResults').innerHTML =
      `<div class="empty"><div class="empty-ico">⚠</div>
       <div class="empty-title">Drive injoignable</div>
       <div class="empty-text">${esc(err.message)}</div></div>`;
  }
}

function renderSearch() {
  const q = $('searchInput').value.trim();
  const groups = {};
  let total = 0;

  Object.keys(SHEET_TYPES).forEach(type => {
    if (State.searchFilter !== 'all' && State.searchFilter !== type) return;
    const items = State.searchData[type] || [];
    const hits = items.filter(it => {
      if (!q) return true;
      const nq = norm(q);
      return Object.values(it).some(v => norm(v).includes(nq));
    });
    if (hits.length) { groups[type] = hits; total += hits.length; }
  });

  if (q) {
    $('searchSub').innerHTML = `<strong>${total}</strong> résultat${total > 1 ? 's' : ''} pour « ${esc(q)} »`;
  } else {
    const all = Object.values(State.searchData).reduce((s, a) => s + a.length, 0);
    $('searchSub').innerHTML = `<strong>${all}</strong> entrées lues depuis Google Drive`;
  }

  if (!total) {
    $('searchResults').innerHTML =
      `<div class="empty"><div class="empty-ico">⌕</div>
       <div class="empty-title">Aucun résultat</div>
       <div class="empty-text">${q ? 'Essaie un autre mot-clé.' : 'Cette catégorie est vide.'}</div></div>`;
    return;
  }

  let html = '';
  Object.keys(SHEET_TYPES).forEach(type => {
    if (!groups[type]) return;
    const cfg = SHEET_TYPES[type];
    const m = State.searchMeta[type];
    const metaTxt = m && m.modifiedTime
      ? `Modifié ${timeAgo(m.modifiedTime)} par ${esc(m.modifiedBy)}` : '';
    html += `<div class="grp">
      <div class="grp-head">
        <span class="grp-name">${cfg.label}</span>
        <span class="grp-count">${groups[type].length}</span>
        <span class="grp-meta">${metaTxt}</span>
      </div>
      <div class="res-grid">
        ${groups[type].map((it, i) => {
          const t = it[cfg.title] || '(sans nom)';
          const sub = cfg.meta.map(f => it[f])
            .filter(v => v !== '' && v != null).join(' · ');
          return `<div class="res-item">
            <div class="res-num">#${pad(it['#'] || i + 1)}</div>
            <div class="res-body">
              <div class="res-title">${highlight(t, q)}</div>
              <div class="res-meta">${highlight(sub || '—', q)}</div>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  });
  $('searchResults').innerHTML = html;
}

/* ─────────── ÉVÉNEMENTS DOM ─────────── */

document.addEventListener('DOMContentLoaded', () => {

  // Login
  $('loginBtn').addEventListener('click', doLogin);
  $('loginPw').addEventListener('keypress', e => { if (e.key === 'Enter') doLogin(); });
  $('loginEmail').addEventListener('keypress', e => { if (e.key === 'Enter') $('loginPw').focus(); });
  $('pwToggle').addEventListener('click', () => {
    const f = $('loginPw');
    f.type = f.type === 'password' ? 'text' : 'password';
  });

  // Déconnexion
  $('userChip').addEventListener('click', doLogout);

  // Navigation
  document.querySelectorAll('.nav-link[data-page]').forEach(l =>
    l.addEventListener('click', () => setPage(l.dataset.page)));

  // Recherche
  $('searchInput').addEventListener('input', renderSearch);
  document.querySelectorAll('#searchChips .chip').forEach(c =>
    c.addEventListener('click', () => {
      document.querySelectorAll('#searchChips .chip').forEach(x => x.classList.remove('active'));
      c.classList.add('active');
      State.searchFilter = c.dataset.f;
      renderSearch();
    }));

  // Fermeture des modals
  document.querySelectorAll('[data-close]').forEach(b =>
    b.addEventListener('click', () => $(b.dataset.close).classList.remove('open')));
  document.querySelectorAll('.overlay').forEach(o =>
    o.addEventListener('click', e => { if (e.target === o) o.classList.remove('open'); }));

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') document.querySelectorAll('.overlay.open').forEach(o => o.classList.remove('open'));
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      setPage('search');
      $('searchInput').focus();
      $('searchInput').select();
    }
  });

  // Rafraîchissement des Sheets
  setInterval(() => {
    if (['search', 'pilotage'].includes(State.page) && State.profile &&
        document.activeElement?.tagName !== 'INPUT') fetchSearch();
  }, CONFIG.SEARCH_REFRESH_MS);

  boot();
});
