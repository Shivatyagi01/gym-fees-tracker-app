const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const iso = d => { const z = new Date(d.getTime() - d.getTimezoneOffset() * 6e4); return z.toISOString().slice(0, 10) };
const today = () => iso(new Date());
const D = s => new Date(s + 'T00:00:00');
const addDays = (s, n) => { const d = D(s); d.setDate(d.getDate() + n); return iso(d) };
const diff = (a, b) => Math.round((D(a) - D(b)) / 864e5);
const fmt = s => D(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const inr = n => '₹ ' + Number(n || 0).toLocaleString('en-IN');
const PLANS = { 'Monthly': 30, 'Quarterly': 90, 'Half-yearly': 180, 'Yearly': 365 };
const MODES = ['Cash', 'UPI', 'Card', 'Bank transfer'];
let db = null, members = [], payments = [], ready = false, view = 'home', sel = null, filt = 'All', pf = 'Recent', q = '', arm = false;

const LS = { data(n) { try { return JSON.parse(localStorage.getItem('gym:' + n) || '{}') } catch (e) { return {} } }, save(n, o) { localStorage.setItem('gym:' + n, JSON.stringify(o)) } };
const subs = {}; const notify = n => (subs[n] || []).forEach(f => f());
function localDb() {
  return {
    collection(n) {
      return {
        onSnapshot(next) { const f = () => { const o = LS.data(n); next({ docs: Object.keys(o).map(id => ({ id, data: () => o[id] })) }) }; (subs[n] = subs[n] || []).push(f); f(); return () => { } },
        doc(id) { return { set: async d => { const o = LS.data(n); o[id] = JSON.parse(JSON.stringify(d)); LS.save(n, o); notify(n) }, delete: async () => { const o = LS.data(n); delete o[id]; LS.save(n, o); notify(n) } } }
      }
    }
  }
}
function init() {
  db = localDb();
  const sub = (n, set) => db.collection(n).onSnapshot(s => { set(s.docs.map(d => Object.assign({ id: d.id }, d.data()))); ready = true; render() });
  sub('members', v => members = v); sub('payments', v => payments = v);
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => { });
}
function exportB() { const b = new Blob([JSON.stringify({ v: 1, members: LS.data('members'), payments: LS.data('payments') })], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'gym-backup-' + today() + '.json'; document.body.appendChild(a); a.click(); a.remove() }
const mm = (m, x) => { const o = Object.assign({}, m, x); delete o.id; return o };
const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const put = (c, id, o) => db.collection(c).doc(id).set(o);
const status = m => { const d = diff(m.end, today()); return d < 0 ? 'Expired' : d <= 7 ? 'Expiring' : 'Active' };
const tagc = s => s === 'Active' ? '' : s === 'Expiring' ? 'w' : 'e';
const memRow = m => { const s = status(m); return `<div class="row" data-a="open" data-id="${esc(m.id)}"><div class="ic">${esc((m.name || '?')[0].toUpperCase())}</div><div class="grow"><b>${esc(m.name)}</b><span class="mut">${esc(m.plan)} · ${s === 'Expired' ? 'Ended' : 'Ends'} ${fmt(m.end)}</span></div><span class="tag ${tagc(s)}">${s}</span></div>` };
const month = () => today().slice(0, 7);
const sum = a => a.reduce((t, x) => t + Number(x.amount || 0), 0);

function render() {
  const titles = { home: 'Dashboard', members: 'Members', pay: 'Payments', profile: 'Member profile' };
  $('#hd').innerHTML = (view === 'profile' ? '<button class="back" data-a="back">← Back</button>' : '') + `<h1>${titles[view]}</h1><div class="av"></div>`;
  $('#nav').innerHTML = [['home', 'Home'], ['members', 'Members'], ['pay', 'Payments']].map(([k, l]) => `<button data-a="nav" data-id="${k}" class="${view === k || (view === 'profile' && k === 'members') ? 'on' : ''}">${l}</button>`).join('');
  let h = '';
  if (!ready) h = '<div class="empty">Loading…</div>';
  else if (!db) h = '<div class="empty">Storage is unavailable in this browser.</div>';
  else h = view === 'home' ? dash() : view === 'members' ? mems() : view === 'pay' ? pays() : prof();
  $('#main').innerHTML = h;
}
function dash() {
  const act = members.filter(m => status(m) !== 'Expired').length;
  const nw = members.filter(m => (m.joined || '').startsWith(month())).length;
  const rev = sum(payments.filter(p => (p.date || '').startsWith(month())));
  const ex = members.filter(m => status(m) === 'Expiring').sort((a, b) => a.end < b.end ? -1 : 1);
  return `<div class="grid"><div class="card stat" style="--c:#0F766E"><span class="mut">Active members</span><b>${act}</b></div><div class="card stat" style="--c:#1D4ED8"><span class="mut">New members (month)</span><b>${nw}</b></div><div class="card stat" style="--c:#15803D"><span class="mut">Revenue (month)</span><b>${inr(rev)}</b></div><div class="card stat" style="--c:#B45309"><span class="mut">Expiring in 7 days</span><b>${ex.length}</b></div></div>`
    + (ex.length ? `<button class="ban" data-a="goexp">${ex.length} membership${ex.length > 1 ? 's' : ''} expire this week · View</button>` : '')
    + `<h2>Expiring soon</h2><div class="card">${ex.length ? ex.slice(0, 5).map(memRow).join('') : '<div class="empty">Nothing expiring in the next 7 days.</div>'}</div>`
    + `<div class="btns"><button class="b" data-a="add">+ Add member</button><button class="b o" data-a="pay" data-id="">Record payment</button></div>`
    + `<div class="card"><h2>Backup</h2><span class="mut">Data is stored on this phone. Save a backup file regularly.</span><div class="btns" style="margin-top:8px"><button class="b o" data-a="export">Export</button><button class="b o" data-a="import">Import</button></div></div><input type="file" id="imp" accept="application/json" hidden>`;
}
function mems() {
  return `<input id="q" type="search" placeholder="Search name or phone" value="${esc(q)}" aria-label="Search members"><div class="chips">${['All', 'Active', 'Expiring', 'Expired'].map(c => `<button class="chip ${filt === c ? 'on' : ''}" data-a="filt" data-id="${c}">${c}</button>`).join('')}</div><div class="card" id="list">${list()}</div><button class="b" data-a="add">+ Add member</button>`;
}
function list() {
  const t = q.trim().toLowerCase();
  const r = members.filter(m => (filt === 'All' || status(m) === filt) && (!t || (m.name || '').toLowerCase().includes(t) || (m.phone || '').includes(t))).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  return r.length ? r.map(memRow).join('') : `<div class="empty">${members.length ? 'No members match.' : 'No members yet. Add your first member.'}</div>`;
}
function pays() {
  const dues = members.filter(m => Number(m.due) > 0);
  const col = sum(payments.filter(p => (p.date || '').startsWith(month())));
  const rec = [...payments].sort((a, b) => (b.date + b.id) < (a.date + a.id) ? -1 : 1).slice(0, 50);
  const body = pf === 'Recent' ? (rec.length ? rec.map(p => `<div class="row" data-a="open" data-id="${esc(p.memberId)}"><div class="ic">₹</div><div class="grow"><b>${esc(p.name)}</b><span class="mut">${esc(p.note || 'Payment')} · ${esc(p.mode)} · ${fmt(p.date)}</span></div><span class="tag">${inr(p.amount)}</span></div>`).join('') : '<div class="empty">No payments recorded yet.</div>')
    : (dues.length ? dues.map(m => `<div class="row" data-a="open" data-id="${esc(m.id)}"><div class="ic">${esc((m.name || '?')[0].toUpperCase())}</div><div class="grow"><b>${esc(m.name)}</b><span class="mut">${esc(m.phone || '')}</span></div><span class="tag w">${inr(m.due)}</span></div>`).join('') : '<div class="empty">No pending dues.</div>');
  return `<div class="grid"><div class="card stat" style="--c:#15803D"><span class="mut">Collected (month)</span><b>${inr(col)}</b></div><div class="card stat" style="--c:#B91C1C"><span class="mut">Pending dues</span><b>${inr(sum(dues.map(m => ({ amount: m.due }))))}</b></div></div><div class="chips">${['Recent', 'Dues'].map(c => `<button class="chip ${pf === c ? 'on' : ''}" data-a="pf" data-id="${c}">${c}</button>`).join('')}</div><div class="card">${body}</div><button class="b" data-a="pay" data-id="">Record payment</button>`;
}
function prof() {
  const m = members.find(x => x.id === sel); if (!m) return '<div class="empty">Member not found.</div>';
  const s = status(m), d = diff(m.end, today());
  const ph = payments.filter(p => p.memberId === m.id).sort((a, b) => (b.date + b.id) < (a.date + a.id) ? -1 : 1);
  return `<div style="display:flex;gap:14px;align-items:center"><div class="ic" style="width:72px;height:72px;font-size:28px">${esc((m.name || '?')[0].toUpperCase())}</div><div><div style="font-size:18px;font-weight:700">${esc(m.name)}</div><span class="mut">${esc(m.phone || 'No phone')} · Joined ${fmt(m.joined || m.start)}</span></div></div>
  <div class="card"><span class="mut">Membership</span><div style="font-weight:600;margin-top:2px">${esc(m.plan)} · <span class="tag ${tagc(s)}">${s}</span></div><span class="mut">${d < 0 ? 'Ended ' + fmt(m.end) + ' (' + (-d) + ' days ago)' : 'Ends ' + fmt(m.end) + ' · ' + d + ' days left'}</span>${Number(m.due) > 0 ? `<div class="kv"><span>Pending dues</span><b style="color:var(--er-t)">${inr(m.due)}</b></div>` : ''}</div>
  <div class="btns"><button class="b" data-a="renew" data-id="${esc(m.id)}">Renew</button><button class="b o" data-a="pay" data-id="${esc(m.id)}">Record payment</button></div>
  <div class="card"><h2>Payment history</h2>${ph.length ? ph.map(p => `<div class="kv"><span>${fmt(p.date)} · ${esc(p.mode)}<br><span class="mut">${esc(p.note || 'Payment')}</span></span><b>${inr(p.amount)}</b></div>`).join('') : '<div class="mut" style="padding-top:6px">No payments yet.</div>'}</div>
  <div class="btns"><button class="b o" data-a="edit" data-id="${esc(m.id)}">Edit</button><button class="b d" data-a="del" data-id="${esc(m.id)}">${arm ? 'Tap again to delete' : 'Delete'}</button></div>`;
}
const fld = (l, id, t, v, x = '') => `<label for="${id}">${l}</label><input id="${id}" type="${t}" value="${esc(v)}" ${x}>`;
const sel2 = (l, id, opts, v) => `<label for="${id}">${l}</label><select id="${id}">${opts.map(o => `<option${o === v ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
function modal(h) {
  $('#sheet').innerHTML = '<div class="shd"><button class="x" data-a="close" aria-label="Close">✕</button></div>' + h;
  $('#modal').classList.add('show');
}
function close() { $('#modal').classList.remove('show') }
const val = id => ($('#' + id) || {}).value || '';
const num = id => Math.max(0, parseFloat(val(id)) || 0);
function mForm(m) {
  const e = !!m;
  modal(`<h2>${e ? 'Edit member' : 'Add member'}</h2>${fld('Name', 'f-name', 'text', e ? m.name : '', 'autocomplete="off"')}${fld('Phone', 'f-phone', 'tel', e ? m.phone : '')}${e ? fld('Membership ends', 'f-end', 'date', m.end) + fld('Pending dues (₹)', 'f-due', 'number', m.due || 0, 'min="0"') : sel2('Plan', 'f-plan', Object.keys(PLANS), 'Monthly') + fld('Start date', 'f-start', 'date', today()) + fld('Amount paid now (₹)', 'f-amt', 'number', '', 'min="0" inputmode="numeric"') + sel2('Payment mode', 'f-mode', MODES, 'Cash') + fld('Pending dues (₹)', 'f-due', 'number', '', 'min="0"')}
  <div class="btns" style="margin-top:16px"><button class="b o" data-a="close">Cancel</button><button class="b" data-a="${e ? 'saveedit' : 'saveadd'}" data-id="${e ? esc(m.id) : ''}">Save</button></div>`);
}
async function saveAdd() {
  const name = val('f-name').trim(); if (!name) { $('#f-name').focus(); return }
  const plan = val('f-plan'), start = val('f-start') || today(), amt = num('f-amt'), id = uid('m');
  await put('members', id, { name, phone: val('f-phone').trim(), plan, start, joined: start, end: addDays(start, PLANS[plan]), due: num('f-due') });
  if (amt > 0) await put('payments', uid('p'), { memberId: id, name, amount: amt, mode: val('f-mode'), date: start, note: plan + ' plan' });
  close(); view = 'members'; render();
}
async function saveEdit(id) {
  const m = members.find(x => x.id === id), name = val('f-name').trim(); if (!m || !name) return;
  await put('members', id, mm(m, { name, phone: val('f-phone').trim(), end: val('f-end') || m.end, due: num('f-due') }));
  close();
}
function renewForm(id) {
  const m = members.find(x => x.id === id);
  modal(`<h2>Renew ${esc(m.name)}</h2>${sel2('Plan', 'f-plan', Object.keys(PLANS), m.plan)}${fld('Amount paid (₹)', 'f-amt', 'number', '', 'min="0" inputmode="numeric"')}${sel2('Payment mode', 'f-mode', MODES, 'Cash')}<p class="mut">New end date is counted from the current end date, or today if already expired.</p><div class="btns"><button class="b o" data-a="close">Cancel</button><button class="b" data-a="saverenew" data-id="${esc(id)}">Renew</button></div>`);
}
async function saveRenew(id) {
  const m = members.find(x => x.id === id), plan = val('f-plan'), amt = num('f-amt');
  const base = m.end > today() ? m.end : today();
  await put('members', id, mm(m, { plan, end: addDays(base, PLANS[plan]) }));
  if (amt > 0) await put('payments', uid('p'), { memberId: id, name: m.name, amount: amt, mode: val('f-mode'), date: today(), note: 'Renewal · ' + plan });
  close();
}
function payForm(id) {
  const opts = members.map(m => `<option value="${esc(m.id)}"${m.id === id ? ' selected' : ''}>${esc(m.name)}</option>`).join('');
  if (!members.length) { modal('<h2>Record payment</h2><p>Add a member first.</p><button class="b" data-a="close">OK</button>'); return }
  modal(`<h2>Record payment</h2><label for="f-mem">Member</label><select id="f-mem">${opts}</select>${fld('Amount (₹)', 'f-amt', 'number', '', 'min="0" inputmode="numeric"')}${sel2('Payment mode', 'f-mode', MODES, 'Cash')}${fld('Date', 'f-date', 'date', today())}${fld('Note (optional)', 'f-note', 'text', '')}<p class="mut">Any pending dues are reduced by this amount.</p><div class="btns"><button class="b o" data-a="close">Cancel</button><button class="b" data-a="savepay">Save</button></div>`);
}
async function savePay() {
  const m = members.find(x => x.id === val('f-mem')), amt = num('f-amt'); if (!m || !amt) { $('#f-amt').focus(); return }
  await put('payments', uid('p'), { memberId: m.id, name: m.name, amount: amt, mode: val('f-mode'), date: val('f-date') || today(), note: val('f-note').trim() || 'Payment' });
  if (Number(m.due) > 0) await put('members', m.id, mm(m, { due: Math.max(0, Number(m.due) - amt) }));
  close();
}
document.addEventListener('click', async e => {
  if (e.target.id === 'modal') { close(); return }
  const t = e.target.closest('[data-a]'); if (!t) return;
  const a = t.dataset.a, id = t.dataset.id;
  try {
    if (a === 'nav') { view = id; arm = false; render() }
    else if (a === 'open') { if (members.find(x => x.id === id)) { sel = id; view = 'profile'; arm = false; render(); scrollTo(0, 0) } }
    else if (a === 'back') { view = 'members'; arm = false; render() }
    else if (a === 'goexp') { view = 'members'; filt = 'Expiring'; render() }
    else if (a === 'filt') { filt = id; render() }
    else if (a === 'pf') { pf = id; render() }
    else if (a === 'add') mForm(null);
    else if (a === 'edit') mForm(members.find(x => x.id === id));
    else if (a === 'renew') renewForm(id);
    else if (a === 'pay') payForm(id);
    else if (a === 'close') close();
    else if (a === 'export') exportB();
    else if (a === 'import') $('#imp').click();
    else if (a === 'saveadd') await saveAdd();
    else if (a === 'saveedit') await saveEdit(id);
    else if (a === 'saverenew') await saveRenew(id);
    else if (a === 'savepay') await savePay();
    else if (a === 'del') {
      if (!arm) { arm = true; render(); return }
      await db.collection('members').doc(id).delete();
      for (const p of payments.filter(p => p.memberId === id)) await db.collection('payments').doc(p.id).delete();
      arm = false; view = 'members'; render();
    }
  } catch (err) { alert('Could not save. Please try again.') }
});
document.addEventListener('change', e => { if (e.target.id !== 'imp' || !e.target.files[0]) return; e.target.files[0].text().then(t => { const j = JSON.parse(t); if (typeof j.members !== 'object' || typeof j.payments !== 'object') throw 0; LS.save('members', j.members); LS.save('payments', j.payments); notify('members'); notify('payments') }).catch(() => alert('That file is not a valid backup.')) });
document.addEventListener('input', e => { if (e.target.id === 'q') { q = e.target.value; $('#list').innerHTML = list() } });
init();
