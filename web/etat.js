// The page « État des services » of the documentation: asks every service the maps depend on, at once, and
// shows each one as it answers. It lives next to the page that generates the maps, whose core it shares.

import { SERVICES, checkService, duration } from './core/status.js';

const container = document.getElementById('etat-services');
const LABELS = { ok: 'Fonctionne', slow: 'Lent', down: 'En panne', pending: 'Vérification…' };

render();

/** Draws the table of the services, all waiting, then fills each line as its service answers. */
function render() {
  const summary = document.createElement('p');
  summary.className = 'status-summary';
  summary.textContent = 'Vérification en cours…';

  const again = document.createElement('button');
  again.type = 'button';
  again.className = 'button';
  again.textContent = 'Vérifier de nouveau';
  again.disabled = true;
  again.addEventListener('click', render);

  const header = document.createElement('div');
  header.className = 'status-header';
  header.append(summary, again);

  const groups = [...new Set(SERVICES.map(({ group }) => group))];
  const tables = groups.map((group) => {
    const title = document.createElement('h3');
    title.textContent = group;
    const table = document.createElement('table');
    // The state comes right after the name: on a phone, where the table scrolls, it is what shows first.
    table.innerHTML = '<thead><tr><th>Service</th><th>État</th><th>Sert à</th></tr></thead>';
    const body = document.createElement('tbody');
    table.append(body);
    const frame = document.createElement('div');
    frame.className = 'table';
    frame.append(table);
    return { group, title, frame, body };
  });

  const rows = new Map();
  for (const service of SERVICES) {
    const row = document.createElement('tr');
    const name = document.createElement('td');
    name.innerHTML = `<strong></strong><br /><span class="status-provider"></span>`;
    name.querySelector('strong').textContent = service.name;
    name.querySelector('span').textContent = service.provider;
    const use = document.createElement('td');
    use.textContent = service.use;
    const state = document.createElement('td');
    row.append(name, state, use);
    tables.find(({ group }) => group === service.group).body.append(row);
    rows.set(service.id, state);
    show(state, { state: 'pending' });
  }

  const checkedAt = new Date();
  container.replaceChildren(header, ...tables.flatMap(({ title, frame }) => [title, frame]));

  let down = 0;
  let slow = 0;
  Promise.all(
    SERVICES.map(async (service) => {
      const check = await checkService(service);
      if (check.state === 'down') down++;
      if (check.state === 'slow') slow++;
      show(rows.get(service.id), check);
    }),
  ).then(() => {
    const time = checkedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    summary.textContent =
      (down > 0
        ? `${down} service(s) en panne : les cartes qui en ont besoin ne peuvent pas être générées pour l’instant.`
        : slow > 0
          ? `Tous les services répondent, ${slow} lentement.`
          : 'Tous les services répondent.') + ` Vérifié à ${time}.`;
    summary.dataset.state = down > 0 ? 'down' : slow > 0 ? 'slow' : 'ok';
    again.disabled = false;
  });
}

/** A cell of state: a colored pill, and what was measured or what went wrong. */
function show(cell, check) {
  const pill = document.createElement('span');
  pill.className = `status-pill ${check.state}`;
  pill.textContent = LABELS[check.state];
  cell.replaceChildren(pill);
  if (check.state === 'pending') return;
  const detail = document.createElement('span');
  detail.className = 'status-detail';
  detail.textContent = check.state === 'down' ? check.detail : `en ${duration(check.ms)}`;
  cell.append(detail);
}
