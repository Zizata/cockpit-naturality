/* ══════════════════════════════════════════════════════
   COCKPIT NATURALITY · Module Pilotage
   Jauges d'avancement · Deadlines · Semaine en cours
   Source unique : le Google Sheet "Tâches" (via Apps Script)
   ══════════════════════════════════════════════════════ */

const Pilotage = (() => {

  /* ─────────────────────────────────────────────
     SEUL BLOC À MODIFIER À LA MAIN
     Les dates des événements. Tout le reste est
     calculé depuis le Sheet Tâches.
     ───────────────────────────────────────────── */
  const EVENEMENTS = [
    { nom: "PJ'ESPORT",           date: '2026-10-24', lieu: "L'ARCADE · Port-Jérôme" },
    { nom: "Gravenchon GeekFest", date: '2027-02-06', lieu: 'Salle Charles Péguy'    }
  ];

  const SEUIL_URGENT = 7;    // une échéance à moins de 7 jours passe en orange
  const SEUIL_PROCHE = 21;   // horizon du bloc "Ce qui arrive"

  /* Noms de colonnes acceptés : le Sheet peut évoluer sans casser le cockpit */
  const COLS = {
    titre:    ['Titre de la tâche', 'Tâche', 'Titre', 'Intitulé', 'Intitule'],
    pole:     ['Pôle', 'Pole', 'Catégorie', 'Categorie', 'Domaine', 'Groupe'],
    echeance: ['Échéance', 'Echeance', 'Date limite', 'Deadline', 'Date'],
    etat:     ['État', 'Etat', 'Statut', 'Avancement', 'Status'],
    resp:     ['Responsable', 'Qui', 'Assigné à', 'Assigne a', 'Référent', 'Referent'],
    prio:     ['Priorité', 'Priorite']
  };

  const POLE_COULEURS = ['#6b3fa0', '#e8722a', '#2e7dca', '#2c9970', '#c89a2a', '#3db8e8', '#d94548'];

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
    const s = norm(v);
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
    const rows = (State.searchData && State.searchData.taches) || [];

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
        titre:  pick(r, COLS.titre) || '(sans titre)',
        pole:   pick(r, COLS.pole)  || 'Non classé',
        resp:   pick(r, COLS.resp)  || null,
        prio:   pick(r, COLS.prio)  || null,
        date:   d,
        jours:  joursRestants(d),
        etat:   etatOf(pick(r, COLS.etat))
      };
    });

    return { taches, diag };
  }

  /* Le badge de la nav ne s'affiche que s'il y a du retard */
  function majBadge(n) {
    const el = $('badgePilotage');
    if (!el) return;
    el.textContent = n || '';
    el.className = 'nav-badge' + (n ? ' urgent' : '');
    el.style.display = n ? '' : 'none';
  }

  function enRetard(t) { return t.etat !== 'done' && t.jours !== null && t.jours < 0; }
  function urgente(t)  { return t.etat !== 'done' && t.jours !== null && t.jours >= 0 && t.jours <= SEUIL_URGENT; }

  /* ─────────── RENDU ─────────── */

  function render() {
    const { taches, diag } = lireTaches();

    renderCountdowns();

    if (!diag.total) {
      $('pilotSub').textContent = 'Aucune tâche lue depuis le Sheet';
      $('pilotWeek').innerHTML = `<div class="empty">
        <div class="empty-ico">◷</div>
        <div class="empty-title">Le Sheet Tâches est vide</div>
        <div class="empty-text">Ajoute tes tâches dans <strong>Tâches 2027</strong> sur le Drive :
        une ligne par tâche, avec un <strong>Pôle</strong>, une <strong>Échéance</strong> et un <strong>État</strong>.
        Les jauges et les compteurs se remplissent tout seuls.</div>
      </div>`;
      $('pilotPoles').innerHTML = '';
      $('pilotNext').innerHTML = '';
      majBadge(0);
      return;
    }

    const faites   = taches.filter(t => t.etat === 'done').length;
    const retards  = taches.filter(enRetard).length;
    const pct      = Math.round(faites / taches.length * 100);

    $('pilotSub').innerHTML = `<strong>${pct}%</strong> de l'ensemble · ${faites}/${taches.length} tâches faites`
      + (retards ? ` · <span class="pi-late-txt">${retards} en retard</span>` : '');
    majBadge(retards);

    renderSemaine(taches, diag);
    renderPoles(taches, diag);
    renderSuite(taches);
  }

  /* Compte à rebours des événements */
  function renderCountdowns() {
    $('pilotCountdowns').innerHTML = EVENEMENTS.map((e, i) => {
      const d = parseDate(e.date);
      const j = joursRestants(d);
      const passe = j < 0;
      return `<div class="pi-cd${passe ? ' passe' : ''}" style="--c:${POLE_COULEURS[i % POLE_COULEURS.length]}">
        <div class="pi-cd-nom">${esc(e.nom)}</div>
        <div class="pi-cd-j">${passe ? 'terminé' : 'J-' + j}</div>
        <div class="pi-cd-date">${dateCourte(d)} · ${esc(e.lieu)}</div>
      </div>`;
    }).join('');
  }

  /* Bloc « À traiter maintenant » : retards + échéances à 7 jours */
  function renderSemaine(taches, diag) {
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
        <span class="pi-diag-sub">Colonnes lues actuellement : ${diag.colonnes.map(esc).join(' · ') || '—'}</span>
      </div>`;
    }

    html += `<div class="pi-block">
      <div class="pi-block-head">
        <span class="pi-block-title">À traiter maintenant</span>
        <span class="pi-block-count${urgent.length ? ' on' : ''}">${urgent.length}</span>
        <span class="pi-block-hint">retards et échéances sous ${SEUIL_URGENT} jours</span>
      </div>`;

    if (!urgent.length) {
      html += `<div class="pi-calme">Rien d'urgent. Tout ce qui a une échéance est encore devant toi.</div>`;
    } else {
      html += '<div class="pi-rows">' + urgent.map(ligne).join('') + '</div>';
    }

    html += '</div>';
    $('pilotWeek').innerHTML = html;
  }

  function ligne(t) {
    const late = enRetard(t);
    const cls  = late ? 'late' : (urgente(t) ? 'soon' : '');
    const meta = [t.pole, t.resp].filter(Boolean).map(esc).join(' · ');
    return `<div class="pi-row ${cls}">
      <div class="pi-row-when">${libelleJours(t.jours)}</div>
      <div class="pi-row-body">
        <div class="pi-row-title">${esc(t.titre)}</div>
        <div class="pi-row-meta">${meta || '—'}${t.date ? ' · ' + dateCourte(t.date) : ''}</div>
      </div>
      <div class="pi-row-etat e-${t.etat}">${t.etat === 'doing' ? 'en cours' : t.etat === 'done' ? 'fait' : 'à faire'}</div>
    </div>`;
  }

  /* Jauges par pôle */
  function renderPoles(taches, diag) {
    const map = {};
    taches.forEach(t => {
      (map[t.pole] = map[t.pole] || []).push(t);
    });

    const poles = Object.keys(map).sort((a, b) => map[b].length - map[a].length);

    const cartes = poles.map((nom, i) => {
      const list  = map[nom];
      const done  = list.filter(t => t.etat === 'done').length;
      const doing = list.filter(t => t.etat === 'doing').length;
      const todo  = list.length - done - doing;
      const late  = list.filter(enRetard).length;
      const pDone  = done / list.length * 100;
      const pDoing = doing / list.length * 100;
      const couleur = POLE_COULEURS[i % POLE_COULEURS.length];

      return `<div class="pi-pole" style="--c:${couleur}">
        <div class="pi-pole-head">
          <span class="pi-pole-dot"></span>
          <span class="pi-pole-nom">${esc(nom)}</span>
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

  /* Ce qui arrive ensuite */
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

  /* ─────────── INIT ─────────── */

  document.addEventListener('DOMContentLoaded', () => {
    const btn = $('pilotRefresh');
    if (btn) btn.addEventListener('click', () => {
      toast('Relecture du Drive…', 'work');
      fetchSearch().then(() => { hideToast(); render(); });
    });
  });

  return { render };
})();
