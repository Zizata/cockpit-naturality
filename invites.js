/* ══════════════════════════════════════════════════════
   COCKPIT NATURALITY · Module Invités
   Pipeline de négociation · Jauge par invité · Relances

   Source : onglet "Invités" du Drive, lu par l'Apps Script
   sous la clé `invites`. Tant que l'Apps Script n'expose pas
   cette clé, la page affiche la marche à suivre.
   ══════════════════════════════════════════════════════ */

const Invites = (() => {

  /* Les 6 étapes de la négociation, dans l'ordre.
     Écris exactement l'un de ces libellés dans la colonne "Étape". */
  const ETAPES = [
    { cle: 'contacte',  label: 'Contacté',      motifs: /contact|envoye|envoi|prise de contact/ },
    { cle: 'repondu',   label: 'A répondu',     motifs: /repond|repons|interess|discussion|echange/ },
    { cle: 'devis_recu',label: 'Devis reçu',    motifs: /devis re[çc]|devis recu|proposition re/ },
    { cle: 'devis_sign',label: 'Devis signé',   motifs: /sign|contrat|accord|valide/ },
    { cle: 'acompte',   label: 'Acompte versé', motifs: /acompte|arrhes|avance|paye|regl/ },
    { cle: 'confirme',  label: 'Confirmé',      motifs: /confirm|ok definitif|boucl|final/ }
  ];

  const REFUS = /refus|annul|decline|abandon|non|perdu/;

  const COLS = {
    nom:     ['Nom', "Nom de l'invité", 'Invité', 'Invite', 'Nom / Pseudo'],
    type:    ['Type', 'Catégorie', 'Categorie', 'Profil'],
    etape:   ['Étape', 'Etape', 'Statut', 'État', 'Etat', 'Avancement'],
    cachet:  ['Cachet (€)', 'Cachet', 'Montant', 'Montant (€)', 'Prix'],
    contact: ['Contact', 'Email', 'E-mail', 'Mail', 'Téléphone'],
    relance: ['Relance le', 'Relance', 'Prochaine relance', 'À relancer le'],
    notes:   ['Notes', 'Note', 'Commentaire', 'Remarques']
  };

  const MOIS = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];

  /* ─────────── OUTILS ─────────── */

  function pick(row, names) {
    for (const n of names) {
      if (row[n] !== undefined && row[n] !== null && String(row[n]).trim() !== '') return row[n];
    }
    return null;
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

  function joursRestants(d) {
    if (!d) return null;
    const a = new Date(); a.setHours(0, 0, 0, 0);
    const b = new Date(d);  b.setHours(0, 0, 0, 0);
    return Math.round((b - a) / 86400000);
  }

  function dateCourte(d) {
    return d ? d.getDate() + ' ' + MOIS[d.getMonth()] : '';
  }

  function montant(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = parseFloat(String(v).replace(/[^\d.,-]/g, '').replace(',', '.'));
    return isNaN(n) ? null : n;
  }

  function euros(n) {
    return n.toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' €';
  }

  /* Retrouve l'index de l'étape à partir du texte saisi */
  function indexEtape(v) {
    const s = normalize(v);
    if (!s) return -1;
    if (REFUS.test(s)) return -2;                       // dossier abandonné
    for (let i = ETAPES.length - 1; i >= 0; i--) {      // du plus avancé au moins avancé
      if (ETAPES[i].motifs.test(s)) return i;
    }
    return -1;
  }

  /* ─────────── LECTURE ─────────── */

  function lire() {
    const src = (typeof searchData !== 'undefined')
      ? (searchData.invites || searchData.invités || searchData.guests)
      : null;

    if (!src) return { absent: true, invites: [] };

    const invites = src.map(r => {
      const rel = parseDate(pick(r, COLS.relance));
      return {
        nom:     pick(r, COLS.nom) || '(sans nom)',
        type:    pick(r, COLS.type) || null,
        etapeTxt: pick(r, COLS.etape) || '',
        idx:     indexEtape(pick(r, COLS.etape)),
        cachet:  montant(pick(r, COLS.cachet)),
        contact: pick(r, COLS.contact) || null,
        relance: rel,
        jours:   joursRestants(rel),
        notes:   pick(r, COLS.notes) || null
      };
    });

    return { absent: false, invites };
  }

  function aRelancer(i) {
    return i.idx >= 0 && i.idx < ETAPES.length - 1 && i.jours !== null && i.jours <= 0;
  }

  function majBadge(n) {
    const el = $('badge-invites');
    if (!el) return;
    el.textContent = n || '';
    el.className = 'nav-badge' + (n ? ' urgent' : '');
    el.style.display = n ? '' : 'none';
  }

  /* ─────────── RENDU ─────────── */

  function render() {
    if (!$('page-invites')) return;

    const { absent, invites } = lire();

    if (absent) {
      $('invSubtitle').textContent = "L'onglet Invités n'est pas encore lu par le Drive";
      $('invFunnel').innerHTML = '';
      $('invList').innerHTML = `<div class="pi-block">
        <div class="empty">
          <div class="empty-emoji">◷</div>
          <div class="empty-title">Onglet Invités introuvable</div>
          <div class="empty-text">Deux choses à faire, dans l'ordre :<br><br>
          <strong>1.</strong> Créer l'onglet <strong>Invités</strong> dans le classeur, avec les colonnes
          <code>Nom</code> <code>Type</code> <code>Étape</code> <code>Cachet (€)</code>
          <code>Contact</code> <code>Relance le</code> <code>Notes</code><br><br>
          <strong>2.</strong> Ajouter cet onglet à l'Apps Script sous la clé <code>invites</code>,
          pour qu'il sorte avec les autres.<br><br>
          Cette page se remplira toute seule ensuite.</div>
        </div>
      </div>`;
      majBadge(0);
      return;
    }

    if (!invites.length) {
      $('invSubtitle').textContent = "L'onglet Invités est vide";
      $('invFunnel').innerHTML = '';
      $('invList').innerHTML = `<div class="pi-block"><div class="pi-calme">
        Ajoute une ligne par invité dans l'onglet Invités du Drive, et écris son étape dans la colonne
        <strong>Étape</strong> : ${ETAPES.map(e => e.label).join(' → ')}.
      </div></div>`;
      majBadge(0);
      return;
    }

    const actifs   = invites.filter(i => i.idx !== -2);
    const confirmes = invites.filter(i => i.idx === ETAPES.length - 1).length;
    const relances = invites.filter(aRelancer).length;

    /* Argent : engagé dès le devis signé */
    const engage = invites
      .filter(i => i.idx >= 3 && i.cachet !== null)
      .reduce((s, i) => s + i.cachet, 0);

    $('invSubtitle').innerHTML =
      `<strong>${actifs.length}</strong> invité${actifs.length > 1 ? 's' : ''} en négociation · ${confirmes} confirmé${confirmes > 1 ? 's' : ''}`
      + (engage ? ` · <strong>${euros(engage)}</strong> engagés` : '')
      + (relances ? ` · <span class="pi-late-txt">${relances} à relancer</span>` : '');

    majBadge(relances);
    renderFunnel(invites);
    renderList(invites);
  }

  /* Entonnoir : combien d'invités à chaque étape */
  function renderFunnel(invites) {
    const total = invites.filter(i => i.idx !== -2).length || 1;

    const cases = ETAPES.map((e, i) => {
      const n = invites.filter(x => x.idx === i).length;
      const passes = invites.filter(x => x.idx >= i && x.idx !== -2).length;
      const pct = Math.round(passes / total * 100);
      return `<div class="iv-step${n ? ' on' : ''}">
        <div class="iv-step-n">${passes}</div>
        <div class="iv-step-lab">${e.label}</div>
        <div class="iv-step-bar"><span style="width:${pct}%"></span></div>
      </div>`;
    }).join('<div class="iv-step-arrow">›</div>');

    const abandons = invites.filter(i => i.idx === -2).length;
    const sansEtape = invites.filter(i => i.idx === -1).length;

    let sous = '';
    if (abandons || sansEtape) {
      const bouts = [];
      if (abandons)  bouts.push(`${abandons} abandon${abandons > 1 ? 's' : ''}`);
      if (sansEtape) bouts.push(`${sansEtape} sans étape renseignée`);
      sous = `<div class="iv-funnel-sub">${bouts.join(' · ')}</div>`;
    }

    $('invFunnel').innerHTML = `<div class="pi-block">
      <div class="pi-block-head">
        <span class="pi-block-title">Où en sont les négociations</span>
        <span class="pi-block-hint">nombre d'invités ayant atteint chaque étape</span>
      </div>
      <div class="iv-funnel">${cases}</div>
      ${sous}
    </div>`;
  }

  /* Liste : une jauge par invité, relances en tête */
  function renderList(invites) {
    const tri = [...invites].sort((a, b) => {
      if (aRelancer(a) !== aRelancer(b)) return aRelancer(a) ? -1 : 1;  // relances d'abord
      if (a.idx !== b.idx) return b.idx - a.idx;                        // puis les plus avancés
      return a.nom.localeCompare(b.nom);
    });

    const lignes = tri.map(i => {
      const abandonne = i.idx === -2;
      const inconnu   = i.idx === -1;
      const pct = abandonne || inconnu ? 0 : (i.idx + 1) / ETAPES.length * 100;

      const crans = ETAPES.map((e, k) => {
        const cls = abandonne ? 'ko' : (k <= i.idx ? 'ok' : '');
        return `<span class="iv-cran ${cls}" title="${e.label}"></span>`;
      }).join('');

      const etat = abandonne ? 'Abandonné'
                 : inconnu   ? 'Étape non renseignée'
                 : ETAPES[i.idx].label;

      const infos = [];
      if (i.type)   infos.push(escapeHtml(i.type));
      if (i.cachet !== null) infos.push(euros(i.cachet));
      if (i.contact) infos.push(escapeHtml(i.contact));

      let relTxt = '';
      if (aRelancer(i)) {
        relTxt = `<span class="iv-relance">à relancer${i.jours < 0 ? ' · ' + Math.abs(i.jours) + 'j de retard' : " aujourd'hui"}</span>`;
      } else if (i.relance && i.idx >= 0 && i.idx < ETAPES.length - 1) {
        relTxt = `<span class="iv-relance-ok">relance le ${dateCourte(i.relance)}</span>`;
      }

      return `<div class="iv-row${abandonne ? ' ko' : ''}${aRelancer(i) ? ' alert' : ''}">
        <div class="iv-row-top">
          <span class="iv-nom">${escapeHtml(i.nom)}</span>
          <span class="iv-etat${abandonne ? ' ko' : inconnu ? ' unk' : ''}">${etat}</span>
          ${relTxt}
        </div>
        <div class="iv-crans">${crans}</div>
        ${infos.length ? `<div class="iv-infos">${infos.join(' · ')}</div>` : ''}
        ${i.notes ? `<div class="iv-notes">${escapeHtml(i.notes)}</div>` : ''}
      </div>`;
    }).join('');

    $('invList').innerHTML = `<div class="pi-block">
      <div class="pi-block-head">
        <span class="pi-block-title">Invités</span>
        <span class="pi-block-hint">les relances en retard remontent en haut</span>
      </div>
      <div class="iv-list">${lignes}</div>
    </div>`;
  }

  /* ─────────── INIT ─────────── */
  if (document.readyState !== 'loading') {
    setTimeout(render, 0);
  } else {
    document.addEventListener('DOMContentLoaded', () => setTimeout(render, 0));
  }

  return { render };
})();

/* `const` au niveau global ne crée pas window.Invites : on l'expose. */
window.Invites = Invites;
