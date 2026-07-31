/* ══════════════════════════════════════════════════════
   COCKPIT NATURALITY · Module Réunions
   Lecture / création / édition sur Supabase
   ══════════════════════════════════════════════════════ */

const Meetings = (() => {

  let list = [];
  let filterEvent = '';
  let filterStatut = '';
  let loaded = false;

  const STATUT_LABEL = {
    brouillon:  'Brouillon',
    a_preparer: 'À préparer',
    prete:      'Prête',
    en_cours:   'En cours',
    terminee:   'Terminée',
    archivee:   'Archivée'
  };

  /* ─────────── CHARGEMENT ─────────── */

  async function load(force) {
    if (loaded && !force) { render(); return; }

    const { data, error } = await sb
      .from('cockpit_meetings')
      .select('*, cockpit_events(id, nom, couleur)')
      .order('date_reunion', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.error(error);
      $('meetingsList').innerHTML = errorBlock(error.message);
      $('meetingsSub').textContent = 'Erreur de chargement';
      return;
    }

    list = data || [];
    loaded = true;
    $('badgeMeetings').textContent = list.length;
    render();
  }

  function errorBlock(msg) {
    return `<div class="empty">
      <div class="empty-ico">⚠</div>
      <div class="empty-title">Impossible de charger les réunions</div>
      <div class="empty-text">${esc(msg)}</div>
    </div>`;
  }

  /* ─────────── AFFICHAGE ─────────── */

  function render() {
    const filtered = list.filter(m => {
      if (filterEvent && m.event_id !== filterEvent) return false;
      if (filterStatut && m.statut !== filterStatut) return false;
      return true;
    });

    // Sous-titre
    const aVenir = list.filter(m =>
      m.date_reunion && new Date(m.date_reunion + 'T23:59') >= new Date() &&
      !['terminee', 'archivee'].includes(m.statut)).length;

    if (!list.length) {
      $('meetingsSub').textContent = 'Aucune réunion enregistrée';
    } else if (filterEvent || filterStatut) {
      $('meetingsSub').innerHTML = `<strong>${filtered.length}</strong> réunion${filtered.length > 1 ? 's' : ''} affichée${filtered.length > 1 ? 's' : ''} sur ${list.length}`;
    } else {
      $('meetingsSub').innerHTML = `<strong>${list.length}</strong> réunion${list.length > 1 ? 's' : ''} · ${aVenir} à venir`;
    }

    // Bouton création réservé au staff
    $('newMeetingBtn').style.display = canEdit() ? '' : 'none';

    if (!filtered.length) {
      $('meetingsList').innerHTML = `<div class="empty">
        <div class="empty-ico">▦</div>
        <div class="empty-title">${list.length ? 'Aucune réunion ne correspond' : 'Aucune réunion pour le moment'}</div>
        <div class="empty-text">${list.length
          ? 'Change les filtres pour voir les autres.'
          : (canEdit()
            ? 'Crée ta première réunion pour commencer à structurer le pilotage.'
            : 'Les réunions apparaîtront ici une fois créées.')}</div>
        ${(!list.length && canEdit())
          ? '<button class="btn btn-primary btn-sm" onclick="Meetings.openNew()">+ Créer une réunion</button>'
          : ''}
      </div>`;
      return;
    }

    $('meetingsList').innerHTML =
      '<div class="mt-list">' + filtered.map(card).join('') + '</div>';
  }

  function card(m) {
    const ev = m.cockpit_events;
    const color = ev?.couleur || '#b8aa8a';
    const d = fmtDate(m.date_reunion);
    const h = fmtHeure(m.heure_debut);

    const infos = [];
    if (h) infos.push(`<span>🕐 ${h}</span>`);
    if (m.duree_prevue) infos.push(`<span>⏱ ${m.duree_prevue} min</span>`);
    if (m.lieu) infos.push(`<span>📍 ${esc(m.lieu)}</span>`);
    if (m.lien_visio) infos.push(`<span>🎥 Visio</span>`);

    return `<div class="mt-card" style="--ev-color:${color}" onclick="Meetings.openEdit('${m.id}')">
      <div class="mt-date">
        ${d
          ? `<div class="mt-date-d">${d.d}</div>
             <div class="mt-date-m">${d.m}</div>
             <div class="mt-date-y">${d.y}</div>`
          : `<div class="mt-date-d" style="color:var(--ink-faint)">—</div>
             <div class="mt-date-m">sans date</div>`}
      </div>
      <div class="mt-body">
        <div class="mt-title">${esc(m.titre)}</div>
        ${infos.length ? `<div class="mt-info">${infos.join('')}</div>` : ''}
        ${ev ? `<div class="mt-event-tag"><span class="mt-event-dot"></span>${esc(ev.nom)}</div>` : ''}
      </div>
      <div class="mt-right">
        <span class="badge b-${m.statut}">${STATUT_LABEL[m.statut] || m.statut}</span>
      </div>
    </div>`;
  }

  /* ─────────── FORMULAIRE ─────────── */

  function openNew() {
    if (!canEdit()) return;
    hideAlert('meetingAlert');
    $('meetingModalTitle').textContent = 'Nouvelle réunion';
    $('mfId').value = '';
    $('mfTitre').value = '';
    $('mfEvent').value = '';
    $('mfDate').value = new Date().toISOString().slice(0, 10);
    $('mfHeure').value = '19:00';
    $('mfDuree').value = '90';
    $('mfStatut').value = 'brouillon';
    $('mfLieu').value = '';
    $('mfVisio').value = '';
    $('mfObjectifs').value = '';
    $('mfSave').textContent = 'Créer la réunion';
    $('meetingModal').classList.add('open');
    setTimeout(() => $('mfTitre').focus(), 60);
  }

  function openEdit(id) {
    const m = list.find(x => x.id === id);
    if (!m) return;
    hideAlert('meetingAlert');

    $('meetingModalTitle').textContent = canEdit() ? 'Modifier la réunion' : 'Détail de la réunion';
    $('mfId').value = m.id;
    $('mfTitre').value = m.titre || '';
    $('mfEvent').value = m.event_id || '';
    $('mfDate').value = m.date_reunion || '';
    $('mfHeure').value = m.heure_debut ? String(m.heure_debut).slice(0, 5) : '';
    $('mfDuree').value = m.duree_prevue || '';
    $('mfLieu').value = m.lieu || '';
    $('mfVisio').value = m.lien_visio || '';
    $('mfObjectifs').value = m.objectifs || '';

    // Le select de statut ne contient que les 3 états de préparation :
    // on ajoute temporairement l'état courant s'il est plus avancé.
    const sel = $('mfStatut');
    const base = ['brouillon', 'a_preparer', 'prete'];
    sel.innerHTML = base.map(s => `<option value="${s}">${STATUT_LABEL[s]}</option>`).join('');
    if (!base.includes(m.statut)) {
      sel.innerHTML += `<option value="${m.statut}">${STATUT_LABEL[m.statut]}</option>`;
    }
    sel.value = m.statut;

    // Lecture seule pour les non-staff
    const ro = !canEdit();
    ['mfTitre','mfDate','mfHeure','mfDuree','mfLieu','mfVisio','mfObjectifs'].forEach(f => {
      $(f).readOnly = ro;
    });
    ['mfEvent','mfStatut'].forEach(f => { $(f).disabled = ro; });
    $('mfSave').style.display = ro ? 'none' : '';
    $('mfSave').textContent = 'Enregistrer';

    $('meetingModal').classList.add('open');
  }

  async function save() {
    if (!canEdit()) return;
    hideAlert('meetingAlert');

    const titre = $('mfTitre').value.trim();
    if (!titre) {
      showAlert('meetingAlert', 'Le titre est obligatoire.', 'error');
      $('mfTitre').focus();
      return;
    }

    const payload = {
      titre,
      event_id:     $('mfEvent').value || null,
      date_reunion: $('mfDate').value || null,
      heure_debut:  $('mfHeure').value || null,
      duree_prevue: parseInt($('mfDuree').value) || null,
      statut:       $('mfStatut').value,
      lieu:         $('mfLieu').value.trim() || null,
      lien_visio:   $('mfVisio').value.trim() || null,
      objectifs:    $('mfObjectifs').value.trim() || null
    };

    const id = $('mfId').value;
    const btn = $('mfSave');
    btn.disabled = true;
    btn.textContent = 'Enregistrement…';
    toast('Enregistrement…', 'work');

    let error;
    if (id) {
      ({ error } = await sb.from('cockpit_meetings').update(payload).eq('id', id));
    } else {
      payload.organisateur_id = State.profile.id;
      payload.created_by = State.profile.id;
      ({ error } = await sb.from('cockpit_meetings').insert(payload));
    }

    btn.disabled = false;
    btn.textContent = id ? 'Enregistrer' : 'Créer la réunion';

    if (error) {
      console.error(error);
      hideToast();
      showAlert('meetingAlert', 'Échec : ' + error.message, 'error');
      return;
    }

    $('meetingModal').classList.remove('open');
    toast(id ? 'Réunion mise à jour' : 'Réunion créée');
    await load(true);
  }

  /* ─────────── INIT ─────────── */

  document.addEventListener('DOMContentLoaded', () => {
    $('newMeetingBtn').addEventListener('click', openNew);
    $('mfSave').addEventListener('click', save);
    $('filterEvent').addEventListener('change', e => { filterEvent = e.target.value; render(); });
    $('filterStatut').addEventListener('change', e => { filterStatut = e.target.value; render(); });
  });

  return { load, openNew, openEdit };
})();
