/* ══════════════════════════════════════════════════════
   COCKPIT NATURALITY · Module Pilotage
   Jauges d'avancement · Deadlines · Ce qui presse
   Source unique : le Google Sheet "Tâches" (via Apps Script)

   Ce fichier s'appuie sur les fonctions déjà présentes
   dans index.html : $, escapeHtml, normalize, searchData.
   ══════════════════════════════════════════════════════ */

const Pilotage = (() => {

  /* ─────────────────────────────────────────────
     SEUL BLOC À MODIFIER À LA MAIN :
     les dates des événements.
     Tout le reste vient du Sheet Tâches.
     ───────────────────────────────────────────── */
  const EVENEMENTS = [
    { nom: "PJ'ESPORT",           date: '2026-10-24', lieu: "L'ARCADE · Port-Jérôme" },
    { nom: "Gravenchon GeekFest", date: '2027-02-06', lieu: 'Salle Charles Péguy'    }
  ];

  const SEUIL_URGENT = 7;    // échéance à moins de 7 jours → orange
  const SEUIL_PROCHE = 21;   // horizon du bloc "Ce qui arrive ensuite"

  /* Noms de colonnes acceptés : le Sheet peut évoluer sans casser le cockpit */
  const COLS = {
    titre:    ['Titre de la tâche', 'Tâche', 'Titre', 'Intitulé', 'Intitule'],
    pole:     ['Pôle', 'Pole', 'Catégorie', 'Categorie', 'Domaine', 'Groupe'],
    echeance: ['Échéance', 'Echeance', 'Date limite', 'Deadline', 'Date'],
    etat:     ['État', 'Etat', 'Statut', 'Avancement', 'Status'],
    resp:     ['Responsable', 'Qui', 'Assigné à', 'Assigne a', 'Référent', 'Referent'],
    prio:     ['Priorité', 'Priorite']
  };

  const COULEURS = ['#6b3fa0', '#e8722a', '#2e7dca', '#2c9970', '#c89a2a', '#3db8e8', '#d94548'];
  const MOIS = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];

  /* ─────────── OUTILS ─────────── */

  function pick(row, names) {
    for (const n of names) {
      if (row[n] !== undefined && row[n] !== null && String(row[n]).trim() !== '') return row[n];
    }
    return null;
  }

  function colTrouvee(rows, names) {
    if (!rows.length) return null;
    const cles = Object.keys(rows[0]);
    return names.find(n => cles.includes(n)) || null;
  }

  function parseDate(v) {
    if (!v) return null;
    if (v instanceof Date) return isNaN(v) ? null : v;
    const s = String(v).trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    m = s.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})$/);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
    const d = new Date(s);
    return isNaN(d) ? null : d;
  }

  function joursRestants(date) {
    if (!date) return null;
    const a = new Date(); a.setHours(0, 0, 0, 0);
    const b = new Date(date); b.setHours(0, 0, 0, 0);
    return Math.round((b - a) / 86400000);
  }

  /* Fait / En cours / À faire — tolérant sur l'orthographe */
  function etatOf(v) {
    const s = normalize(v);
    if (!s) return 'todo';
    if (/fait|termin|fini|ok|done|clotur|livr|valid/.test(s)) return 'done';
    if (/cours|wip|demarr|commenc|entam/.test(s))            return 'doing';
    return 'todo';
  }

  function libelleJours(j) {
    if (j === null) return 'sans date';
    if (j < 0)      return 'retard ' + Math.abs(j) + 'j';
    if (j === 0)    return "aujourd'hui";
    if (j === 1)    return 'demain';
    return 'J-' + j;
  }

  function dateCourte(d) {
    if (!d) return '';
    return d.getDate() + ' ' + MOIS[d.getMonth()] + ' ' + d.getFullYear();
  }

  /* ─────────── LECTURE DES TÂCHES ─────────── */

  function lireTaches() {
    const rows = (typeof searchData !== 'undefined' && searchData.taches) || [];

    const diag = {
      total: rows.length,
      colonnes: rows.length ? Object.keys(rows[0]).filter(k => k !== '#') : [],
      manquantes: []
    };
    ['pole', 'echeance', 'etat'].forEach(k => {
      if (!colTrouvee(rows, COLS[k])) diag.manquantes.push(k);
    });

    const taches = rows.map(r => {
      const d = parseDate(pick(r, COLS.echeance));
      return {
        titre: pick(r, COLS.titre) || '(sans titre)',
        pole:  pick(r, COLS.pole)  || 'Non classé',
        resp:  pick(r, COLS.resp)  || null,
        prio:  pick(r, COLS.prio)  || null,
        date:  d,
        jours: joursRestants(d),
        etat:  etatOf(pick(r, COLS.etat))
      };
    });

    return { taches, diag };
  }

  function enRetard(t) { return t.etat !== 'done' && t.jours !== null && t.jours < 0; }
  function urgente(t)  { return t.etat !== 'done' && t.jours !== null && t.jours >= 0 && t.jours <= SEUIL_URGENT; }

  function majBadge(n) {
    const el = $('badge-pilotage');
    if (!el) return;
    el.textContent = n || '';
    el.className = 'nav-badge' + (n ? ' urgent' : '');
    el.style.display = n ? '' : 'none';
  }

  /* ─────────── RENDU ─────────── */

  function render() {
    if (!$('page-pilotage')) return;

    const { taches, diag } = lireTaches();
    renderCountdowns();

    if (!diag.total) {
      $('pilotSubtitle').textContent = 'Aucune tâche lue depuis le Drive';
      $('pilotUrgent').innerHTML = `<div class="empty">
        <div class="empty-emoji">◷</div>
        <div class="empty-title">Le Sheet Tâches est vide</div>
        <div class="empty-text">Ajoute tes tâches dans le Sheet <strong>Tâches</strong> du Drive :
        une ligne par tâche, avec un <strong>Pôle</strong>, une <strong>Échéance</strong> et un <strong>État</strong>.
        Les jauges et les compteurs se remplissent tout seuls.</div>
      </div>`;
      $('pilotPoles').innerHTML = '';
      $('pilotNext').innerHTML = '';
      majBadge(0);
      return;
    }

    const faites  = taches.filter(t => t.etat === 'done').length;
    const retards = taches.filter(enRetard).length;
    const pct     = Math.round(faites / taches.length * 100);

    $('pilotSubtitle').innerHTML =
      `<strong>${pct}%</strong> de l'ensemble · ${faites}/${taches.length} tâches faites`
      + (retards ? ` · <span class="pi-late-txt">${retards} en retard</span>` : '');

    majBadge(retards);
    renderUrgent(taches, diag);
    renderPoles(taches, diag);
    renderSuite(taches);
  }

  function renderCountdowns() {
    $('pilotCountdowns').innerHTML = EVENEMENTS.map((e, i) => {
      const d = parseDate(e.date);
      const j = joursRestants(d);
      const passe = j < 0;
      return `<div class="pi-cd${passe ? ' passe' : ''}" style="--c:${COULEURS[i % COULEURS.length]}">
        <div class="pi-cd-nom">${escapeHtml(e.nom)}</div>
        <div class="pi-cd-j">${passe ? 'terminé' : 'J-' + j}</div>
        <div class="pi-cd-date">${dateCourte(d)} · ${escapeHtml(e.lieu)}</div>
      </div>`;
    }).join('');
  }

  function renderUrgent(taches, diag) {
    const urgent = taches
      .filter(t => enRetard(t) || urgente(t))
      .sort((a, b) => a.jours - b.jours);

    let html = '';

    if (diag.manquantes.length) {
      const noms = { pole: 'Pôle', echeance: 'Échéance', etat: 'État' };
      html += `<div class="pi-diag">
        <strong>Colonnes absentes du Sheet Tâches :</strong>
        ${diag.manquantes.map(k => `<code>${noms[k]}</code>`).join(' ')}
        — ajoute-les pour que les jauges et les compteurs fonctionnent.
        <span class="pi-diag-sub">Colonnes lues actuellement : ${diag.colonnes.map(escapeHtml).join(' · ') || '—'}</span>
      </div>`;
    }

    html += `<div class="pi-block">
      <div class="pi-block-head">
        <span class="pi-block-title">À traiter maintenant</span>
        <span class="pi-block-count${urgent.length ? ' on' : ''}">${urgent.length}</span>
        <span class="pi-block-hint">retards et échéances sous ${SEUIL_URGENT} jours</span>
      </div>`;

    html += urgent.length
      ? '<div class="pi-rows">' + urgent.map(ligne).join('') + '</div>'
      : `<div class="pi-calme">Rien d'urgent. Tout ce qui a une échéance est encore devant toi.</div>`;

    html += '</div>';
    $('pilotUrgent').innerHTML = html;
  }

  function ligne(t) {
    const cls  = enRetard(t) ? 'late' : (urgente(t) ? 'soon' : '');
    const meta = [t.pole, t.resp].filter(Boolean).map(escapeHtml).join(' · ');
    const etat = t.etat === 'doing' ? 'en cours' : t.etat === 'done' ? 'fait' : 'à faire';
    return `<div class="pi-row ${cls}">
      <div class="pi-row-when">${libelleJours(t.jours)}</div>
      <div class="pi-row-body">
        <div class="pi-row-title">${escapeHtml(t.titre)}</div>
        <div class="pi-row-meta">${meta || '—'}${t.date ? ' · ' + dateCourte(t.date) : ''}</div>
      </div>
      <div class="pi-row-etat e-${t.etat}">${etat}</div>
    </div>`;
  }

  function renderPoles(taches, diag) {
    const map = {};
    taches.forEach(t => { (map[t.pole] = map[t.pole] || []).push(t); });
    const poles = Object.keys(map).sort((a, b) => map[b].length - map[a].length);

    const cartes = poles.map((nom, i) => {
      const list   = map[nom];
      const done   = list.filter(t => t.etat === 'done').length;
      const doing  = list.filter(t => t.etat === 'doing').length;
      const todo   = list.length - done - doing;
      const late   = list.filter(enRetard).length;
      const pDone  = done / list.length * 100;
      const pDoing = doing / list.length * 100;

      return `<div class="pi-pole" style="--c:${COULEURS[i % COULEURS.length]}">
        <div class="pi-pole-head">
          <span class="pi-pole-dot"></span>
          <span class="pi-pole-nom">${escapeHtml(nom)}</span>
          <span class="pi-pole-pct">${Math.round(pDone)}%</span>
        </div>
        <div class="pi-bar">
          <span class="pi-bar-done"  style="width:${pDone}%"></span>
          <span class="pi-bar-doing" style="width:${pDoing}%"></span>
        </div>
        <div class="pi-pole-foot">
          <span>${done} faite${done > 1 ? 's' : ''}</span>
          <span>${doing} en cours</span>
          <span>${todo} à faire</span>
          ${late ? `<span class="pi-late-txt">${late} en retard</span>` : ''}
        </div>
      </div>`;
    }).join('');

    const titre = diag.manquantes.includes('pole')
      ? 'Avancement <span class="pi-h-hint">(ajoute une colonne Pôle pour découper)</span>'
      : 'Avancement par pôle';

    $('pilotPoles').innerHTML = `<div class="pi-block">
      <div class="pi-block-head"><span class="pi-block-title">${titre}</span></div>
      <div class="pi-poles">${cartes}</div>
    </div>`;
  }

  function renderSuite(taches) {
    const suite = taches
      .filter(t => t.etat !== 'done' && t.jours !== null && t.jours > SEUIL_URGENT && t.jours <= SEUIL_PROCHE)
      .sort((a, b) => a.jours - b.jours);

    const sansDate = taches.filter(t => t.etat !== 'done' && t.jours === null).length;

    let html = `<div class="pi-block">
      <div class="pi-block-head">
        <span class="pi-block-title">Ce qui arrive ensuite</span>
        <span class="pi-block-hint">les ${SEUIL_PROCHE} prochains jours</span>
      </div>`;

    html += suite.length
      ? '<div class="pi-rows">' + suite.map(ligne).join('') + '</div>'
      : `<div class="pi-calme">Rien de prévu sur cette période.</div>`;

    if (sansDate) {
      html += `<div class="pi-nodate">${sansDate} tâche${sansDate > 1 ? 's' : ''} sans échéance —
        elles n'apparaissent dans aucun compteur tant qu'elles n'ont pas de date.</div>`;
    }

    html += '</div>';
    $('pilotNext').innerHTML = html;
  }

  /* ─────────── INIT ───────────
     index.html appelle fetchSearch() avant que ce fichier soit chargé :
     si les données sont déjà arrivées, on affiche tout de suite. */
  if (document.readyState !== 'loading') {
    setTimeout(render, 0);
  } else {
    document.addEventListener('DOMContentLoaded', () => setTimeout(render, 0));
  }

  return { render };
})();

/* Important : une déclaration `const` au niveau global ne crée PAS window.Pilotage.
   index.html teste `window.Pilotage` avant d'appeler le rendu — on l'expose donc ici. */
window.Pilotage = Pilotage;
