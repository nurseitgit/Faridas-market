const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

const KEYS = {
	sales: 'costume-profit-sales',
	goal: 'costume-profit-goal',
	expenses: 'costume-profit-expenses',
	categories: 'costume-profit-expense-categories',
	profile: 'costume-profit-profile',
	products: 'costume-profit-products',
	movements: 'costume-profit-movements',
	places: 'costume-profit-places'
};
const DEFAULT_CATEGORIES = ['Материалы', 'Аренда', 'Пошив и работа', 'Доставка', 'Другое'];
const DEFAULT_PLACES = ['Магазин', 'Instagram', 'WhatsApp', 'Доставка', 'Рынок'];
const ACCENTS = {coral: '#c8553d', red: '#b8364a', blue: '#2f6690', green: '#3f7a57', plum: '#7b4b8a'};
const MOVE_TYPES = {
	in: {label: 'Приход', sign: 1, icon: 'i-in'},
	return: {label: 'Возврат', sign: 1, icon: 'i-return'},
	sale: {label: 'Продажа', sign: -1, icon: 'i-receipt'},
	transfer: {label: 'Передача', sign: -1, icon: 'i-truck'},
	writeoff: {label: 'Списание', sign: -1, icon: 'i-minus'}
};
const PERIOD_LABELS = {today: 'За сегодня', month: 'За этот месяц', last: 'За прошлый месяц', all: 'За всё время'};
const LOW_STOCK = 2;

const isConfigured = SUPABASE_URL.startsWith('https://') && !SUPABASE_ANON_KEY.includes('YOUR_');
const client = isConfigured && window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const state = {
	sales: [], expenses: [], categories: [], products: [], movements: [], places: [],
	profile: {name: 'Baby Atelier', photo: '', color: 'coral', mode: 'light'},
	period: 'month', view: 'home', accountId: null, stockFilter: 'all',
	editingSaleId: null, editingProductId: null, openProductId: null, openSaleId: null,
	moveType: 'in', salePhoto: null, productPhoto: null
};

/* ---------- утилиты ---------- */
const $ = id => document.getElementById(id);
const $$ = sel => [...document.querySelectorAll(sel)];
const fmt = n => new Intl.NumberFormat('ru-RU', {maximumFractionDigits: 0}).format(Math.round(Number(n) || 0));
const money = n => fmt(n) + ' сом';
const signed = n => (n > 0 ? '+' : n < 0 ? '−' : '') + money(Math.abs(n));
const pct = n => (Number(n) || 0).toFixed(1).replace('.', ',') + '%';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const icon = (name, cls = 'i') => `<svg class="${cls}"><use href="#${name}"/></svg>`;
const uid = prefix => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const dateKey = d => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
const shortDate = d => new Date(d).toLocaleDateString('ru-RU', {day: 'numeric', month: 'short'});
const isCloudId = id => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id));
const plural = (n, one, few, many) => { const a = Math.abs(n) % 100, b = a % 10; return a > 10 && a < 20 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many; };
const hueOf = s => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 17);
const initials = s => String(s || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const saleId = s => String(s.id);
const saleQty = s => Math.max(1, Number(s.quantity) || 1);

function readJSON(key, fallback) { try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch { return fallback; } }
function writeJSON(key, value) {
	try { localStorage.setItem(key, JSON.stringify(value)); return true; }
	catch { toast('Память браузера заполнена. Удалите старые фото или подключите облако.'); return false; }
}
const salesKey = () => state.accountId ? `${KEYS.sales}:${state.accountId}` : KEYS.sales;
const saveSales = () => writeJSON(salesKey(), state.sales);
const saveProducts = () => writeJSON(KEYS.products, state.products);
const saveMovements = () => writeJSON(KEYS.movements, state.movements);
const saveExpenses = () => writeJSON(KEYS.expenses, state.expenses);
const readGoal = () => { const v = Number(localStorage.getItem(KEYS.goal)); return v > 0 ? v : 30000; };

let toastTimer;
function toast(message) {
	const el = $('toast');
	el.textContent = message;
	el.classList.add('show');
	clearTimeout(toastTimer);
	toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

const frames = new WeakMap();
function countTo(el, value, format = fmt) {
	const from = Number(el.dataset.value) || 0;
	el.dataset.value = value;
	cancelAnimationFrame(frames.get(el));
	if (reduceMotion || from === value) { el.textContent = format(value); return; }
	const start = performance.now();
	const step = now => {
		const k = Math.min(1, (now - start) / 800), e = 1 - Math.pow(1 - k, 4);
		el.textContent = format(from + (value - from) * e);
		if (k < 1) frames.set(el, requestAnimationFrame(step));
	};
	frames.set(el, requestAnimationFrame(step));
}

/* ---------- периоды ---------- */
function periodRange(period, now = new Date()) {
	const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
	if (period === 'today') return [new Date(y, m, d), new Date(y, m, d + 1)];
	if (period === 'month') return [new Date(y, m, 1), new Date(y, m + 1, 1)];
	if (period === 'last') return [new Date(y, m - 1, 1), new Date(y, m, 1)];
	return [new Date(0), new Date(8.64e15)];
}
function previousRange(period, now = new Date()) {
	const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
	if (period === 'today') return [new Date(y, m, d - 1), new Date(y, m, d)];
	if (period === 'month') return [new Date(y, m - 1, 1), new Date(y, m, 1)];
	if (period === 'last') return [new Date(y, m - 2, 1), new Date(y, m - 1, 1)];
	return null;
}
const inRange = (date, [a, b]) => { const t = new Date(date); return t >= a && t < b; };
const salesIn = range => state.sales.filter(s => inRange(s.sold_at, range));
function summarize(items) {
	const revenue = items.reduce((a, s) => a + (Number(s.sale_price) || 0), 0);
	const cost = items.reduce((a, s) => a + (Number(s.cost_price) || 0), 0);
	const profit = revenue - cost;
	return {revenue, cost, profit, margin: revenue ? profit / revenue * 100 : 0, count: items.length, units: items.reduce((a, s) => a + saleQty(s), 0)};
}
function dateFromInput(value, previous) {
	if (!value) return previous || new Date().toISOString();
	if (previous && dateKey(previous) === value) return previous;
	if (dateKey(new Date()) === value) return new Date().toISOString();
	const [y, m, d] = value.split('-').map(Number);
	return new Date(y, m - 1, d, 12).toISOString();
}

/* ---------- склад ---------- */
const findProduct = id => state.products.find(p => p.id === id) || null;
const findSale = id => state.sales.find(s => saleId(s) === String(id)) || null;
function stockOf(productId) {
	return state.movements.reduce((n, m) => m.product_id === productId ? n + MOVE_TYPES[m.type].sign * m.qty : n, 0);
}
function stockClass(n) { return n <= 0 ? 'out' : n <= LOW_STOCK ? 'low' : 'ok'; }
function placesList() {
	const used = [...state.sales.map(s => s.channel), ...state.movements.map(m => m.place)].filter(Boolean);
	return [...new Set([...DEFAULT_PLACES, ...state.places, ...used])];
}
function categoriesList() {
	return [...new Set([...DEFAULT_CATEGORIES, ...state.categories, ...state.expenses.map(e => e.category).filter(Boolean)])];
}
function flowFor(range) {
	const map = new Map();
	const add = (name, units, revenue = 0) => {
		const key = name || 'Не указано';
		const v = map.get(key) || {units: 0, revenue: 0};
		v.units += units; v.revenue += revenue;
		map.set(key, v);
	};
	salesIn(range).forEach(s => add(s.channel, saleQty(s), Number(s.sale_price) || 0));
	state.movements.filter(m => (m.type === 'transfer' || m.type === 'writeoff') && inRange(m.at, range))
		.forEach(m => add(m.type === 'writeoff' ? 'Списано' : m.place, m.qty));
	return [...map].map(([name, v]) => ({name, ...v})).sort((a, b) => b.units - a.units);
}
function productVisual(p, cls = 'product-photo', extra = '') {
	const name = p?.name || '';
	const img = p?.photo ? `<img src="${esc(p.photo)}" alt="" loading="lazy">` : `<span class="monogram">${esc(initials(name))}</span>`;
	return `<span class="${cls}" style="--h:${hueOf(name)}">${img}${extra}</span>`;
}

/* ---------- фото ---------- */
function resizeImage(file, max) {
	return new Promise((resolve, reject) => {
		const url = URL.createObjectURL(file);
		const image = new Image();
		image.onload = () => {
			const scale = Math.min(1, max / Math.max(image.width, image.height));
			const canvas = document.createElement('canvas');
			canvas.width = Math.round(image.width * scale);
			canvas.height = Math.round(image.height * scale);
			canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
			URL.revokeObjectURL(url);
			canvas.toBlob(blob => blob ? resolve({blob, dataUrl: canvas.toDataURL('image/jpeg', 0.82)}) : reject(new Error('Не удалось обработать фото')), 'image/jpeg', 0.82);
		};
		image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Этот формат фото не поддерживается. Попробуйте JPG или PNG.')); };
		image.src = url;
	});
}
async function getSession() {
	if (!client) return null;
	const {data} = await client.auth.getSession();
	return data.session;
}
async function storePhoto(file, max = 900) {
	const {blob, dataUrl} = await resizeImage(file, max);
	const session = await getSession();
	if (!session) return dataUrl;
	const path = `${session.user.id}/${Date.now()}.jpg`;
	const {error} = await client.storage.from('costume-photos').upload(path, blob, {contentType: 'image/jpeg'});
	if (error) throw error;
	return client.storage.from('costume-photos').getPublicUrl(path).data.publicUrl;
}
function bindPhotoPicker(pickId, inputId, key) {
	$(inputId).addEventListener('change', event => {
		const file = event.target.files?.[0];
		if (!file) return;
		if (file.size > 15 * 1024 * 1024) { toast('Фото должно быть меньше 15 МБ.'); event.target.value = ''; return; }
		state[key] = file;
		setPickerImage(pickId, URL.createObjectURL(file));
		event.target.value = '';
	});
}
function setPickerImage(pickId, src) {
	const pick = $(pickId), img = pick.querySelector('img');
	img.hidden = !src;
	img.src = src || '';
	pick.querySelector('.photo-empty').hidden = Boolean(src);
}

/* ---------- диалоги ---------- */
function openDialog(id) { const d = $(id); if (!d.open) d.showModal(); }
function closeDialog(d) {
	if (typeof d === 'string') d = $(d);
	if (!d?.open) return;
	if (reduceMotion) { d.close(); return; }
	d.classList.add('closing');
	setTimeout(() => { d.classList.remove('closing'); d.close(); }, 190);
}
function confirmBox(message, okText = 'Да') {
	return new Promise(resolve => {
		const d = $('confirmDialog');
		$('confirmText').textContent = message;
		$('confirmOk').textContent = okText;
		const finish = value => { $('confirmOk').onclick = $('confirmCancel').onclick = d.oncancel = null; closeDialog(d); resolve(value); };
		$('confirmOk').onclick = () => finish(true);
		$('confirmCancel').onclick = () => finish(false);
		d.oncancel = event => { event.preventDefault(); finish(false); };
		openDialog('confirmDialog');
	});
}
function fillSelect(select, options, value, emptyLabel) {
	const list = emptyLabel !== undefined ? [['', emptyLabel], ...options.map(o => Array.isArray(o) ? o : [o, o])] : options.map(o => Array.isArray(o) ? o : [o, o]);
	select.innerHTML = list.map(([v, label]) => `<option value="${esc(v)}">${esc(label)}</option>`).join('');
	select.value = list.some(([v]) => v === value) ? value : list[0]?.[0] ?? '';
}

/* ---------- тема и профиль ---------- */
function applyProfile() {
	const p = state.profile, root = document.documentElement;
	const dark = p.mode === 'dark' || (p.mode === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
	root.dataset.mode = dark ? 'dark' : 'light';
	root.style.setProperty('--accent', ACCENTS[p.color] || ACCENTS.coral);
	document.querySelector('meta[name="theme-color"]').content = dark ? '#121110' : '#f4f1ec';
	const mark = p.photo ? `<img src="${esc(p.photo)}" alt="">` : esc(initials(p.name).slice(0, 1));
	$$('.brand-mark').forEach(el => el.innerHTML = mark);
	$('profileAvatar').innerHTML = mark;
	$$('.brand-name').forEach(el => el.textContent = p.name);
	document.title = p.name;
	$$('[data-accent]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.accent === p.color)));
	$$('[data-theme-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.themeMode === p.mode)));
	$$('[data-toggle-mode]').forEach(b => {
		b.querySelector('use').setAttribute('href', dark ? '#i-sun' : '#i-moon');
		const label = b.querySelector('span');
		if (label) label.textContent = dark ? 'Светлая тема' : 'Тёмная тема';
	});
	$('clearProfilePhotoBtn').hidden = !p.photo;
}
const saveProfile = () => writeJSON(KEYS.profile, state.profile);

/* ---------- навигация ---------- */
const VIEWS = ['home', 'stock', 'history', 'report', 'expenses'];
function route() {
	const view = location.hash.slice(1);
	showView(VIEWS.includes(view) ? view : 'home');
}
function showView(view) {
	const changed = state.view !== view;
	state.view = view;
	$$('.view').forEach(el => {
		const active = el.dataset.page === view;
		el.hidden = !active;
		if (active && changed && !reduceMotion) { el.classList.remove('enter'); void el.offsetWidth; el.classList.add('enter'); }
	});
	$$('[data-view]').forEach(a => { a.classList.toggle('active', a.dataset.view === view); a.toggleAttribute('aria-current', a.dataset.view === view); });
	if (changed) window.scrollTo({top: 0, behavior: 'instant'});
	renderView();
}
function renderView() {
	({home: renderHome, stock: renderStock, history: renderHistory, report: renderReport, expenses: renderExpenses})[state.view]();
}
function renderAll() { renderView(); }

/* ---------- графики ---------- */
function profitSeries(period) {
	const now = new Date(), y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
	if (period === 'all') {
		return Array.from({length: 12}, (_, i) => {
			const start = new Date(y, m - 11 + i, 1), end = new Date(y, m - 10 + i, 1);
			return {label: start.toLocaleDateString('ru-RU', {month: 'short'}).replace('.', ''), full: start.toLocaleDateString('ru-RU', {month: 'long', year: 'numeric'}), value: summarize(salesIn([start, end])).profit};
		});
	}
	let start, days;
	if (period === 'today') { start = new Date(y, m, d - 6); days = 7; }
	else if (period === 'month') { start = new Date(y, m, 1); days = d; }
	else { start = new Date(y, m - 1, 1); days = new Date(y, m, 0).getDate(); }
	const totals = new Map();
	state.sales.forEach(s => { const k = dateKey(s.sold_at); totals.set(k, (totals.get(k) || 0) + (Number(s.sale_price) || 0) - (Number(s.cost_price) || 0)); });
	return Array.from({length: days}, (_, i) => {
		const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
		return {label: String(day.getDate()), full: day.toLocaleDateString('ru-RU', {weekday: 'short', day: 'numeric', month: 'long'}), value: totals.get(dateKey(day)) || 0};
	});
}
function sparkline(values) {
	if (values.length < 2) values = [values[0] || 0, values[0] || 0];
	const max = Math.max(...values, 0), min = Math.min(...values, 0), span = max - min || 1;
	const pts = values.map((v, i) => [i / (values.length - 1) * 300, 60 - (v - min) / span * 50]);
	let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
	for (let i = 0; i < pts.length - 1; i++) {
		const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
		const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
		d += ` C${c1.map(n => n.toFixed(1))} ${c2.map(n => n.toFixed(1))} ${p2.map(n => n.toFixed(1))}`;
	}
	return `<defs><linearGradient id="sparkFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".38"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs><path d="${d} L300,64 L0,64 Z" fill="url(#sparkFill)"/><path class="line" d="${d}" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke" pathLength="1200"/>`;
}
function barList(items, valueFormat, colorFn) {
	const max = Math.max(...items.map(i => Math.abs(i.value)), 1);
	return items.map((item, n) => `<div class="bar-item" style="--w:${Math.max(2, Math.abs(item.value) / max * 100)}%;--c:${colorFn ? colorFn(n) : 'var(--accent)'}"><span>${esc(item.name)}</span><b>${valueFormat(item)}</b><i></i></div>`).join('');
}
const empty = (iconName, title, text, action = '') => `<div class="empty"><span class="badge">${icon(iconName)}</span><strong>${title}</strong><p>${text}</p>${action}</div>`;

/* ---------- строки ---------- */
function saleRow(s) {
	const profit = (Number(s.sale_price) || 0) - (Number(s.cost_price) || 0);
	const product = s.product_id ? findProduct(s.product_id) : null;
	const photo = s.photo_url || product?.photo;
	const meta = [shortDate(s.sold_at), `${saleQty(s)} шт.`, s.channel].filter(Boolean).join(' · ');
	return `<button class="row" type="button" data-sale="${esc(saleId(s))}"><span class="thumb">${photo ? `<img src="${esc(photo)}" alt="" loading="lazy">` : icon('i-hanger')}</span><span class="row-main"><strong>${esc(s.title || product?.name || 'Продажа')}</strong><small>${esc(meta)}</small></span><span class="row-end"><strong class="${profit >= 0 ? 'pos' : 'neg'}">${signed(profit)}</strong><small>${money(s.sale_price)}</small></span></button>`;
}
function moveRow(m, withDelete = false, showProduct = true) {
	const t = MOVE_TYPES[m.type], product = findProduct(m.product_id);
	const arrow = t.sign > 0 ? '←' : '→';
	const where = m.type === 'writeoff' ? 'списано' : m.place ? `${arrow} ${m.place}` : '';
	const meta = [where, m.note, shortDate(m.at)].filter(Boolean).join(' · ');
	const title = showProduct ? `${t.label} · ${product?.name || 'удалённый товар'}` : t.label;
	const del = withDelete && m.type !== 'sale' ? `<button class="del" type="button" data-move-del="${esc(m.id)}" aria-label="Удалить запись">${icon('i-trash')}</button>` : '<span></span>';
	return `<div class="move"><span class="move-icon ${m.type}">${icon(t.icon)}</span><span class="move-main"><strong>${esc(title)}</strong><small>${esc(meta)}</small></span><b class="${t.sign > 0 ? 'pos' : 'neg'}">${t.sign > 0 ? '+' : '−'}${m.qty}</b>${del}</div>`;
}

/* ---------- главная ---------- */
function renderHome() {
	const range = periodRange(state.period), cur = summarize(salesIn(range));
	const prevRange = previousRange(state.period);
	countTo($('profitTotal'), cur.profit, v => (v < 0 ? '−' : '') + fmt(Math.abs(v)));
	$('profitCaption').textContent = `${PERIOD_LABELS[state.period]} · ${cur.count} ${plural(cur.count, 'продажа', 'продажи', 'продаж')}`;
	const deltaEl = $('profitDelta');
	if (prevRange) {
		const prev = summarize(salesIn(prevRange)).profit;
		const vs = {today: 'к вчера', month: 'к прошлому', last: 'к позапрошлому'}[state.period];
		if (prev !== 0) {
			const change = (cur.profit - prev) / Math.abs(prev) * 100;
			deltaEl.innerHTML = `${icon(change >= 0 ? 'i-up' : 'i-down')}${Math.abs(change).toFixed(0)}% ${vs}`;
		} else deltaEl.innerHTML = cur.profit > 0 ? `${icon('i-up')}первые продажи` : '';
	} else deltaEl.innerHTML = '';
	$('heroSpark').innerHTML = sparkline(profitSeries(state.period).map(p => p.value));
	countTo($('revenueTotal'), cur.revenue, money);
	countTo($('costTotal'), cur.cost, money);
	countTo($('unitsTotal'), cur.units, v => fmt(v) + ' шт.');
	$('salesCountLabel').textContent = `${cur.count} ${plural(cur.count, 'продажа', 'продажи', 'продаж')}`;
	countTo($('marginTotal'), cur.margin, pct);
	$('marginMeter').style.width = Math.max(0, Math.min(100, cur.margin)) + '%';

	const stock = state.products.map(p => ({p, n: stockOf(p.id)}));
	const inStock = stock.filter(x => x.n > 0);
	countTo($('homeStockUnits'), inStock.reduce((a, x) => a + x.n, 0));
	countTo($('homeStockValue'), inStock.reduce((a, x) => a + x.n * (Number(x.p.cost) || 0), 0));
	countTo($('homeStockPotential'), inStock.reduce((a, x) => a + x.n * (Number(x.p.price) || 0), 0));
	const low = stock.filter(x => x.n <= LOW_STOCK).sort((a, b) => a.n - b.n).slice(0, 6);
	$('homeLowStock').innerHTML = low.length ? low.map(x => `<button type="button" data-product="${esc(x.p.id)}"><b class="${x.n <= 0 ? 'out' : ''}">${x.n}</b>${esc(x.p.name)}</button>`).join('') : '';
	if (!state.products.length) $('homeLowStock').innerHTML = `<button type="button" data-quick="product"><b>+</b>Добавить первый товар</button>`;

	$('flowCaption').textContent = PERIOD_LABELS[state.period].toLowerCase();
	const flow = flowFor(range);
	const total = flow.reduce((a, f) => a + f.units, 0);
	$('flowBox').innerHTML = flow.length
		? `<div class="flow-bar">${flow.map((f, n) => `<i style="--w:${f.units};--c:var(--c${Math.min(n + 1, 6)});--n:${n}" title="${esc(f.name)}"></i>`).join('')}</div><ul class="flow-legend">${flow.slice(0, 6).map((f, n) => `<li style="--c:var(--c${Math.min(n + 1, 6)})"><span>${esc(f.name)}</span><b>${f.units} шт.</b><small>${Math.round(f.units / total * 100)}%</small></li>`).join('')}</ul>`
		: empty('i-truck', 'Пока ничего не ушло', 'Укажите при продаже или передаче, куда ушёл товар: Instagram, магазин, доставка.');

	const recent = [...state.sales].sort((a, b) => new Date(b.sold_at) - new Date(a.sold_at)).slice(0, 5);
	$('recentSales').innerHTML = recent.length ? recent.map(saleRow).join('') : empty('i-receipt', 'Продаж пока нет', 'Запишите первую продажу, и здесь появится прибыль.', `<button class="btn btn-primary" type="button" data-quick="sale">${icon('i-plus')}Записать продажу</button>`);
}

/* ---------- склад ---------- */
function renderStock() {
	const monthRange = periodRange('month');
	const all = state.products.map(p => ({p, n: stockOf(p.id)}));
	const inStock = all.filter(x => x.n > 0);
	countTo($('stockPositions'), state.products.length);
	countTo($('stockUnits'), inStock.reduce((a, x) => a + x.n, 0));
	countTo($('stockValue'), inStock.reduce((a, x) => a + x.n * (Number(x.p.cost) || 0), 0), money);
	countTo($('stockOutMonth'), flowFor(monthRange).reduce((a, f) => a + f.units, 0), v => fmt(v) + ' шт.');
	$$('#stockFilter button').forEach(b => b.classList.toggle('active', b.dataset.filter === state.stockFilter));

	const q = $('stockSearch').value.trim().toLowerCase();
	const list = all.filter(({p, n}) => {
		if (q && !`${p.name} ${p.sku || ''}`.toLowerCase().includes(q)) return false;
		if (state.stockFilter === 'in') return n > 0;
		if (state.stockFilter === 'low') return n > 0 && n <= LOW_STOCK;
		if (state.stockFilter === 'out') return n <= 0;
		return true;
	}).sort((a, b) => a.p.name.localeCompare(b.p.name, 'ru'));

	$('productGrid').innerHTML = list.length
		? list.map(({p, n}, i) => `<button class="product" type="button" data-product="${esc(p.id)}" style="--n:${Math.min(i, 12)}">${productVisual(p, 'product-photo', `<span class="pill ${stockClass(n)}">${n > 0 ? n + ' шт.' : 'нет'}</span>`)}<span class="product-body"><strong>${esc(p.name)}</strong><small>${esc(p.sku || '')}</small><span class="price">${money(p.price)}</span></span></button>`).join('')
		: `<div class="card" style="grid-column:1/-1">${state.products.length ? empty('i-search', 'Ничего не найдено', 'Попробуйте другой запрос или фильтр.') : empty('i-box', 'Склад пуст', 'Добавьте товар — и будет видно, сколько осталось и куда он уходит.', `<button class="btn btn-primary" type="button" data-quick="product">${icon('i-plus')}Добавить товар</button>`)}</div>`;

	const moves = [...state.movements].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 30);
	$('movementList').innerHTML = moves.length ? moves.map(m => moveRow(m, true)).join('') : empty('i-truck', 'Движений пока нет', 'Приходы, продажи и передачи товара появятся здесь.');
}

function openProductDetail(id) {
	const p = findProduct(id);
	if (!p) return;
	state.openProductId = id;
	const n = stockOf(id);
	const moves = state.movements.filter(m => m.product_id === id).sort((a, b) => new Date(b.at) - new Date(a.at));
	const sold = moves.filter(m => m.type === 'sale').reduce((a, m) => a + m.qty, 0);
	const out = moves.filter(m => m.type === 'transfer').reduce((a, m) => a + m.qty, 0);
	$('productDetail').innerHTML = `${productVisual(p, 'pd-hero')}<h3 class="pd-title">${esc(p.name)}</h3><p class="pd-sku">${esc(p.sku || 'Без артикула')}</p>
		<div class="stat-grid four"><div><small>В наличии</small><strong class="${n <= 0 ? 'neg' : ''}">${n} шт.</strong></div><div><small>Продано</small><strong>${sold} шт.</strong></div><div><small>Передано</small><strong>${out} шт.</strong></div><div><small>Прибыль за шт.</small><strong>${money((Number(p.price) || 0) - (Number(p.cost) || 0))}</strong></div></div>
		<div class="pd-actions"><button class="btn" type="button" data-pd="in">${icon('i-in')}Приход</button><button class="btn btn-primary" type="button" data-pd="sale">${icon('i-receipt')}Продать</button><button class="btn" type="button" data-pd="move">${icon('i-truck')}Передать</button></div>
		<p class="pd-section">История движения</p><div class="timeline">${moves.length ? moves.map(m => moveRow(m, true, false)).join('') : '<p class="hint">Пока пусто.</p>'}</div>`;
	openDialog('productDetailDialog');
}

/* ---------- история ---------- */
function renderHistory() {
	const q = $('historySearch').value.trim().toLowerCase();
	const list = [...state.sales].filter(s => !q || `${s.title} ${s.channel || ''} ${findProduct(s.product_id)?.name || ''}`.toLowerCase().includes(q)).sort((a, b) => new Date(b.sold_at) - new Date(a.sold_at));
	const total = summarize(list);
	$('historySub').textContent = list.length ? `${list.length} ${plural(list.length, 'продажа', 'продажи', 'продаж')} · ${signed(total.profit)} прибыли` : 'Все продажи по дням';
	if (!list.length) { $('historyList').innerHTML = `<div class="card">${q ? empty('i-search', 'Ничего не найдено', 'Попробуйте другой запрос.') : empty('i-clock', 'История пуста', 'Здесь будут все продажи, сгруппированные по дням.', `<button class="btn btn-primary" type="button" data-quick="sale">${icon('i-plus')}Записать продажу</button>`)}</div>`; return; }
	const groups = new Map();
	list.forEach(s => { const k = dateKey(s.sold_at); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(s); });
	const today = dateKey(new Date()), yesterday = dateKey(new Date(Date.now() - 864e5));
	$('historyList').innerHTML = [...groups].map(([k, items]) => {
		const d = new Date(items[0].sold_at);
		const label = k === today ? 'Сегодня' : k === yesterday ? 'Вчера' : d.toLocaleDateString('ru-RU', {weekday: 'long', day: 'numeric', month: 'long'});
		return `<section class="day-group"><h3>${label}<span>${signed(summarize(items).profit)}</span></h3><div class="card rows">${items.map(saleRow).join('')}</div></section>`;
	}).join('');
}

/* ---------- отчёт ---------- */
function renderReport() {
	const range = periodRange(state.period), cur = summarize(salesIn(range));
	$('reportSub').textContent = PERIOD_LABELS[state.period];
	const goal = readGoal(), monthProfit = summarize(salesIn(periodRange('month'))).profit;
	const progress = Math.max(0, Math.min(1, monthProfit / goal));
	if (document.activeElement !== $('goalInput')) $('goalInput').value = goal;
	requestAnimationFrame(() => $('goalRing').style.strokeDashoffset = String(326.73 * (1 - progress)));
	countTo($('goalPercent'), progress * 100, v => Math.round(v) + '%');
	$('goalText').textContent = `${fmt(monthProfit)} из ${fmt(goal)} сом`;

	const series = profitSeries(state.period);
	$('chartTitle').textContent = state.period === 'all' ? 'Прибыль по месяцам' : 'Прибыль по дням';
	const max = Math.max(...series.map(s => Math.abs(s.value)), 1);
	const every = series.length > 16 ? Math.ceil(series.length / 8) : 1;
	$('profitChart').innerHTML = `<div class="chart"><div class="bars">${series.map((s, n) => `<button type="button" class="${s.value < 0 ? 'neg' : ''}" data-bar="${n}" aria-label="${esc(s.full)}: ${money(s.value)}" style="--h:${Math.abs(s.value) / max * 100}%;--n:${n}"><i></i></button>`).join('')}</div><div class="bar-labels">${series.map((s, n) => `<span>${n % every === 0 || n === series.length - 1 ? esc(s.label) : ''}</span>`).join('')}</div></div>`;
	$('profitChart').dataset.series = JSON.stringify(series.map(s => [s.full, s.value]));
	$('chartReadout').textContent = 'Нажмите на столбик';

	const spent = state.expenses.filter(e => inRange(e.spent_at, range)).reduce((a, e) => a + (Number(e.amount) || 0), 0);
	$('periodLedger').innerHTML = [
		['Выручка', money(cur.revenue)], ['Себестоимость', '−' + money(cur.cost)], ['Прибыль с продаж', signed(cur.profit)], ['Расходы', '−' + money(spent)]
	].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('') + `<div class="total"><dt>Остаётся на руках</dt><dd class="${cur.profit - spent >= 0 ? 'pos' : 'neg'}">${signed(cur.profit - spent)}</dd></div>`;

	const now = new Date(), y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
	const pairs = [
		['Эта неделя', [new Date(y, m, d - 6), new Date(y, m, d + 1)], [new Date(y, m, d - 13), new Date(y, m, d - 6)], 'прошлой'],
		['Этот месяц', periodRange('month'), periodRange('last'), 'прошлого']
	];
	$('compareBox').innerHTML = pairs.map(([label, a, b, word]) => {
		const sa = summarize(salesIn(a)), sb = summarize(salesIn(b));
		const diff = sa.profit - sb.profit;
		return `<div class="compare-row"><span>${label}</span><strong>${money(sa.profit)}</strong><small>${sa.count} ${plural(sa.count, 'продажа', 'продажи', 'продаж')} · <b class="${diff >= 0 ? 'pos' : 'neg'}">${signed(diff)}</b> против ${word}</small></div>`;
	}).join('');

	const byProduct = new Map();
	salesIn(range).forEach(s => {
		const key = s.product_id || s.title || 'Без названия';
		const v = byProduct.get(key) || {name: findProduct(s.product_id)?.name || s.title || 'Продажа', value: 0, units: 0};
		v.value += (Number(s.sale_price) || 0) - (Number(s.cost_price) || 0); v.units += saleQty(s);
		byProduct.set(key, v);
	});
	const top = [...byProduct.values()].sort((a, b) => b.value - a.value).slice(0, 5);
	$('topProducts').innerHTML = top.length ? barList(top, i => `${money(i.value)} · ${i.units} шт.`) : '<p class="hint">Нет продаж за этот период.</p>';

	const channels = new Map();
	salesIn(range).forEach(s => { const k = s.channel || 'Не указано'; channels.set(k, (channels.get(k) || 0) + (Number(s.sale_price) || 0)); });
	const ch = [...channels].map(([name, value]) => ({name, value})).sort((a, b) => b.value - a.value);
	$('channelBox').innerHTML = ch.length ? barList(ch, i => money(i.value), n => `var(--c${Math.min(n + 1, 6)})`) : '<p class="hint">Нет продаж за этот период.</p>';
}

/* ---------- расходы ---------- */
function renderExpenses() {
	const monthRange = periodRange('month');
	const month = state.expenses.filter(e => inRange(e.spent_at, monthRange));
	const total = month.reduce((a, e) => a + (Number(e.amount) || 0), 0);
	countTo($('expenseMonthTotal'), total, money);
	const profit = summarize(salesIn(monthRange)).profit;
	$('expenseMonthNote').textContent = profit > 0 ? `Это ${Math.round(total / profit * 100)}% от прибыли с продаж за месяц` : `${month.length} ${plural(month.length, 'запись', 'записи', 'записей')} в этом месяце`;
	const cats = new Map();
	month.forEach(e => cats.set(e.category || 'Другое', (cats.get(e.category || 'Другое') || 0) + (Number(e.amount) || 0)));
	const list = [...cats].map(([name, value]) => ({name, value})).sort((a, b) => b.value - a.value);
	$('expenseBreakdown').innerHTML = list.length ? barList(list, i => money(i.value), n => `var(--c${Math.min(n + 1, 6)})`) : '<p class="hint">В этом месяце расходов нет.</p>';
	$('expenseCount').textContent = `${state.expenses.length} ${plural(state.expenses.length, 'запись', 'записи', 'записей')}`;
	const sorted = [...state.expenses].sort((a, b) => new Date(b.spent_at) - new Date(a.spent_at));
	const iconFor = c => c === 'Аренда' ? 'i-home' : c === 'Доставка' ? 'i-truck' : c === 'Материалы' ? 'i-hanger' : 'i-wallet';
	$('expenseList').innerHTML = sorted.length
		? sorted.map(e => `<div class="row expense"><span class="thumb">${icon(iconFor(e.category))}</span><span class="row-main"><strong>${esc(e.category)}</strong><small>${esc([e.note, shortDate(e.spent_at)].filter(Boolean).join(' · '))}</small></span><span class="row-end"><strong>−${money(e.amount)}</strong></span><button class="del" type="button" data-expense-del="${esc(e.id)}" aria-label="Удалить расход">${icon('i-trash')}</button></div>`).join('')
		: empty('i-wallet', 'Расходов пока нет', 'Записывайте аренду, ткань и доставку — отчёт покажет, сколько остаётся на руках.', `<button class="btn btn-primary" type="button" data-quick="expense">${icon('i-plus')}Добавить расход</button>`);
}

/* ---------- продажа: форма ---------- */
function productOptions(includeId) {
	return state.products.filter(p => stockOf(p.id) > 0 || p.id === includeId)
		.sort((a, b) => a.name.localeCompare(b.name, 'ru'))
		.map(p => [p.id, `${p.name}${p.sku ? ' · ' + p.sku : ''} — ${stockOf(p.id)} шт.`]);
}
function openSaleForm(sale = null, productId = null) {
	state.editingSaleId = sale ? saleId(sale) : null;
	state.salePhoto = null;
	$('saleForm').reset();
	$('saleDialogTitle').textContent = sale ? 'Изменить продажу' : 'Продажа';
	$('saveSaleBtn').textContent = sale ? 'Сохранить изменения' : 'Сохранить продажу';
	const pid = sale ? sale.product_id || '' : productId || '';
	fillSelect($('saleProduct'), productOptions(pid), pid, 'Без привязки к складу');
	fillSelect($('saleChannel'), placesList(), sale?.channel || '', 'Не указано');
	$('saleQty').value = sale ? saleQty(sale) : 1;
	$('saleDate').value = dateKey(sale ? sale.sold_at : new Date());
	$('costInput').value = sale ? Number(sale.cost_price) || 0 : '';
	$('priceInput').value = sale ? Number(sale.sale_price) || 0 : '';
	$('noteInput').value = sale?.title || '';
	setPickerImage('salePhotoPick', sale?.photo_url || '');
	if (!sale && productId) applyProductToSale();
	else updateSaleHints();
	updateCalc();
	openDialog('saleDialog');
}
function applyProductToSale() {
	const p = findProduct($('saleProduct').value);
	const qty = Math.max(1, Number($('saleQty').value) || 1);
	if (p) {
		$('costInput').value = (Number(p.cost) || 0) * qty;
		$('priceInput').value = (Number(p.price) || 0) * qty;
		$('noteInput').placeholder = p.name;
	} else $('noteInput').placeholder = 'Костюм зайчика на годик';
	updateSaleHints();
	updateCalc();
}
function updateSaleHints() {
	const p = findProduct($('saleProduct').value);
	$('salePhotoPick').hidden = Boolean(p);
	const hint = $('saleStockHint');
	if (!p) { hint.textContent = ''; return; }
	const editing = state.editingSaleId ? findSale(state.editingSaleId) : null;
	const available = stockOf(p.id) + (editing?.product_id === p.id ? saleQty(editing) : 0);
	const qty = Math.max(1, Number($('saleQty').value) || 1);
	hint.textContent = qty > available ? `На складе только ${available} шт.` : `После продажи останется ${available - qty} шт.`;
	hint.classList.toggle('warn', qty > available);
}
function updateCalc() {
	const c = Number($('costInput').value) || 0, p = Number($('priceInput').value) || 0, profit = p - c;
	$('liveProfit').textContent = signed(profit);
	$('liveProfit').className = profit < 0 ? 'neg' : profit > 0 ? 'pos' : '';
	$('liveMargin').textContent = pct(p ? profit / p * 100 : 0);
}
function syncSaleMovement(sale) {
	state.movements = state.movements.filter(m => m.sale_id !== saleId(sale));
	if (sale.product_id && findProduct(sale.product_id)) {
		state.movements.push({id: uid('m'), product_id: sale.product_id, type: 'sale', qty: saleQty(sale), place: sale.channel || null, note: '', at: sale.sold_at, sale_id: saleId(sale)});
	}
	saveMovements();
}
async function submitSale(event) {
	event.preventDefault();
	const cost = Number($('costInput').value), price = Number($('priceInput').value);
	if (!$('priceInput').value || !Number.isFinite(price) || price <= 0) { toast('Укажите цену продажи.'); $('priceInput').focus(); return; }
	if (!Number.isFinite(cost) || cost < 0) { toast('Проверьте себестоимость.'); $('costInput').focus(); return; }
	const product = findProduct($('saleProduct').value);
	const qty = Math.max(1, Math.round(Number($('saleQty').value) || 1));
	const editing = state.editingSaleId ? findSale(state.editingSaleId) : null;
	if (product) {
		const available = stockOf(product.id) + (editing?.product_id === product.id ? saleQty(editing) : 0);
		if (qty > available && !await confirmBox(`На складе «${product.name}» только ${available} шт. Всё равно записать продажу ${qty} шт.?`, 'Записать')) return;
	}
	const btn = $('saveSaleBtn');
	btn.disabled = true;
	try {
		let photo_url = editing?.photo_url || null;
		if (product) photo_url = null;
		else if (state.salePhoto) photo_url = await storePhoto(state.salePhoto);
		const record = {
			title: $('noteInput').value.trim() || product?.name || 'Продажа костюма',
			cost_price: cost || 0, sale_price: price, quantity: qty,
			channel: $('saleChannel').value || null, product_id: product?.id || null, photo_url,
			sold_at: dateFromInput($('saleDate').value, editing?.sold_at)
		};
		const session = await getSession();
		let saved;
		if (editing) {
			if (session && isCloudId(editing.id)) {
				const {error} = await client.from('sales').update(record).eq('id', editing.id);
				if (error) throw error;
			}
			saved = {...editing, ...record};
			state.sales = state.sales.map(s => saleId(s) === saleId(editing) ? saved : s);
		} else if (session) {
			const {data, error} = await client.from('sales').insert({...record, user_id: session.user.id}).select().single();
			if (error) throw error;
			saved = data;
			state.sales = [saved, ...state.sales];
		} else {
			saved = {id: uid('local'), ...record, user_id: 'local-user'};
			state.sales = [saved, ...state.sales];
		}
		saveSales();
		syncSaleMovement(saved);
		closeDialog('saleDialog');
		closeDialog('productDetailDialog');
		toast(editing ? 'Продажа обновлена.' : `Продажа записана: ${signed(price - (cost || 0))}`);
		renderAll();
	} catch (error) {
		toast('Не удалось сохранить: ' + (error.message || 'попробуйте ещё раз'));
	} finally { btn.disabled = false; }
}
function openSaleDetail(id) {
	const s = findSale(id);
	if (!s) return;
	state.openSaleId = id;
	const product = findProduct(s.product_id);
	const photo = s.photo_url || product?.photo;
	const profit = (Number(s.sale_price) || 0) - (Number(s.cost_price) || 0);
	$('saleDetail').innerHTML = `<div class="sale-hero">${photo ? `<img src="${esc(photo)}" alt="">` : icon('i-hanger')}</div><h3 class="pd-title">${esc(s.title || 'Продажа')}</h3><p class="pd-sku">${new Date(s.sold_at).toLocaleDateString('ru-RU', {weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'})}${product ? ' · со склада' : ''}</p>
		<div class="stat-grid"><div><small>Прибыль</small><strong class="${profit >= 0 ? 'pos' : 'neg'}">${signed(profit)}</strong></div><div><small>Маржа</small><strong>${pct(Number(s.sale_price) ? profit / Number(s.sale_price) * 100 : 0)}</strong></div><div><small>Цена продажи</small><strong>${money(s.sale_price)}</strong></div><div><small>Себестоимость</small><strong>${money(s.cost_price)}</strong></div><div><small>Количество</small><strong>${saleQty(s)} шт.</strong></div><div><small>Куда ушёл</small><strong>${esc(s.channel || 'Не указано')}</strong></div></div>`;
	openDialog('saleDetailDialog');
}
async function deleteSale(id) {
	const s = findSale(id);
	if (!s || !await confirmBox(`Удалить продажу «${s.title || 'Продажа'}»? Товар вернётся на склад.`, 'Удалить')) return;
	try {
		const session = await getSession();
		if (session && isCloudId(s.id)) {
			const {error} = await client.from('sales').delete().eq('id', s.id);
			if (error) throw error;
		}
		state.sales = state.sales.filter(x => saleId(x) !== saleId(s));
		state.movements = state.movements.filter(m => m.sale_id !== saleId(s));
		saveSales(); saveMovements();
		closeDialog('saleDetailDialog');
		toast('Продажа удалена.');
		renderAll();
	} catch (error) { toast('Не удалось удалить: ' + (error.message || 'попробуйте ещё раз')); }
}

/* ---------- товар: форма ---------- */
function openProductForm(product = null) {
	state.editingProductId = product?.id || null;
	state.productPhoto = null;
	$('productForm').reset();
	$('productDialogTitle').textContent = product ? 'Изменить товар' : 'Новый товар';
	$('saveProductBtn').textContent = product ? 'Сохранить' : 'Добавить на склад';
	$('productQtyField').hidden = Boolean(product);
	$('productName').value = product?.name || '';
	$('productSku').value = product?.sku || '';
	$('productCost').value = product ? Number(product.cost) || 0 : '';
	$('productPrice').value = product ? Number(product.price) || 0 : '';
	$('productQty').value = 1;
	setPickerImage('productPhotoPick', product?.photo || '');
	openDialog('productDialog');
}
async function submitProduct(event) {
	event.preventDefault();
	const name = $('productName').value.trim();
	if (!name) { toast('Введите название товара.'); $('productName').focus(); return; }
	const cost = Math.max(0, Number($('productCost').value) || 0), price = Math.max(0, Number($('productPrice').value) || 0);
	const btn = $('saveProductBtn');
	btn.disabled = true;
	try {
		const existing = findProduct(state.editingProductId);
		const photo = state.productPhoto ? await storePhoto(state.productPhoto) : existing?.photo || '';
		if (existing) {
			Object.assign(existing, {name, sku: $('productSku').value.trim(), cost, price, photo});
		} else {
			const p = {id: uid('p'), name, sku: $('productSku').value.trim(), cost, price, photo, created_at: new Date().toISOString()};
			state.products.push(p);
			const qty = Math.max(0, Math.round(Number($('productQty').value) || 0));
			if (qty > 0) state.movements.push({id: uid('m'), product_id: p.id, type: 'in', qty, place: null, note: 'Начальный остаток', at: new Date().toISOString()});
			saveMovements();
		}
		if (!saveProducts()) return;
		closeDialog('productDialog');
		toast(existing ? 'Товар обновлён.' : 'Товар добавлен на склад.');
		renderAll();
		if (existing && $('productDetailDialog').open) openProductDetail(existing.id);
	} catch (error) { toast(error.message || 'Не удалось сохранить товар.'); }
	finally { btn.disabled = false; }
}
async function deleteProduct(id) {
	const p = findProduct(id);
	if (!p || !await confirmBox(`Удалить «${p.name}» со склада вместе с историей движения? Продажи останутся в истории.`, 'Удалить')) return;
	state.products = state.products.filter(x => x.id !== id);
	state.movements = state.movements.filter(m => m.product_id !== id);
	saveProducts(); saveMovements();
	closeDialog('productDetailDialog');
	toast('Товар удалён.');
	renderAll();
}

/* ---------- движение ---------- */
function setMoveType(type) {
	state.moveType = type;
	$$('#moveType button').forEach(b => b.classList.toggle('active', b.dataset.type === type));
	$('movePlaceField').hidden = type === 'writeoff';
	$('movePlaceLabel').textContent = type === 'transfer' ? 'Куда передали' : 'Откуда';
	updateMoveHint();
}
function updateMoveHint() {
	const p = findProduct($('moveProduct').value), hint = $('moveStockHint');
	if (!p) { hint.textContent = ''; return; }
	const n = stockOf(p.id), qty = Math.max(1, Number($('moveQty').value) || 1), sign = MOVE_TYPES[state.moveType].sign;
	const after = n + sign * qty;
	hint.textContent = `Сейчас ${n} шт. → станет ${after} шт.`;
	hint.classList.toggle('warn', after < 0);
}
function openMoveForm(type = 'in', productId = null) {
	if (!state.products.length) { toast('Сначала добавьте товар на склад.'); openProductForm(); return; }
	$('moveForm').reset();
	const options = [...state.products].sort((a, b) => a.name.localeCompare(b.name, 'ru')).map(p => [p.id, `${p.name}${p.sku ? ' · ' + p.sku : ''} — ${stockOf(p.id)} шт.`]);
	fillSelect($('moveProduct'), options, productId || state.openProductId || options[0][0]);
	fillSelect($('movePlace'), placesList(), '', 'Не указано');
	$('moveDate').value = dateKey(new Date());
	$('moveQty').value = 1;
	setMoveType(type);
	openDialog('moveDialog');
}
async function submitMove(event) {
	event.preventDefault();
	const p = findProduct($('moveProduct').value);
	if (!p) { toast('Выберите товар.'); return; }
	const qty = Math.round(Number($('moveQty').value) || 0);
	if (qty < 1) { toast('Количество должно быть больше нуля.'); $('moveQty').focus(); return; }
	const sign = MOVE_TYPES[state.moveType].sign, n = stockOf(p.id);
	if (sign < 0 && qty > n && !await confirmBox(`На складе только ${n} шт. Остаток уйдёт в минус. Продолжить?`, 'Продолжить')) return;
	state.movements.push({id: uid('m'), product_id: p.id, type: state.moveType, qty, place: state.moveType === 'writeoff' ? null : $('movePlace').value || null, note: $('moveNote').value.trim(), at: dateFromInput($('moveDate').value)});
	if (!saveMovements()) return;
	closeDialog('moveDialog');
	toast(`${MOVE_TYPES[state.moveType].label}: ${p.name}, ${qty} шт.`);
	renderAll();
	if ($('productDetailDialog').open) openProductDetail(p.id);
}
async function deleteMove(id) {
	const m = state.movements.find(x => x.id === id);
	if (!m || !await confirmBox(`Удалить запись «${MOVE_TYPES[m.type].label}, ${m.qty} шт.»? Остаток пересчитается.`, 'Удалить')) return;
	state.movements = state.movements.filter(x => x.id !== id);
	saveMovements();
	toast('Запись удалена.');
	renderAll();
	if ($('productDetailDialog').open) openProductDetail(m.product_id);
}

/* ---------- расход ---------- */
function openExpenseForm() {
	$('expenseForm').reset();
	fillSelect($('expenseCategory'), categoriesList(), 'Материалы');
	$('expenseDate').value = dateKey(new Date());
	openDialog('expenseDialog');
}
function submitExpense(event) {
	event.preventDefault();
	const amount = Number($('expenseAmount').value);
	if (!Number.isFinite(amount) || amount <= 0) { toast('Введите сумму расхода.'); $('expenseAmount').focus(); return; }
	state.expenses.push({id: uid('expense'), amount, category: $('expenseCategory').value || 'Другое', note: $('expenseNote').value.trim(), spent_at: dateFromInput($('expenseDate').value)});
	if (!saveExpenses()) return;
	closeDialog('expenseDialog');
	toast('Расход сохранён.');
	renderAll();
}

/* ---------- новый вариант списка ---------- */
let optionTarget = null;
function openOptionForm(kind, targetId) {
	optionTarget = {kind, targetId};
	$('optionForm').reset();
	$('optionTitle').textContent = kind === 'place' ? 'Новый канал или точка' : 'Новая категория';
	$('optionLabel').textContent = kind === 'place' ? 'Например: Точка на Дордое, Wildberries' : 'Например: Упаковка';
	openDialog('optionDialog');
	setTimeout(() => $('optionName').focus(), 50);
}
function submitOption(event) {
	event.preventDefault();
	const name = $('optionName').value.trim();
	if (!name || !optionTarget) return;
	const isPlace = optionTarget.kind === 'place';
	const list = isPlace ? placesList() : categoriesList();
	const existing = list.find(x => x.toLocaleLowerCase('ru') === name.toLocaleLowerCase('ru'));
	const value = existing || name;
	if (!existing) {
		(isPlace ? state.places : state.categories).push(name);
		writeJSON(isPlace ? KEYS.places : KEYS.categories, isPlace ? state.places : state.categories);
	}
	const select = $(optionTarget.targetId);
	const hasEmpty = select.options[0]?.value === '';
	fillSelect(select, isPlace ? placesList() : categoriesList(), value, hasEmpty ? select.options[0].textContent : undefined);
	closeDialog('optionDialog');
	toast(existing ? 'Такой вариант уже есть — выбран.' : 'Добавлено.');
}

/* ---------- аккаунт ---------- */
function renderAccount(session) {
	const signedIn = Boolean(session?.user);
	$('accountForm').hidden = signedIn || !client;
	$('accountSignedIn').hidden = !signedIn;
	$('accountStatus').textContent = !client ? 'Облако ещё не подключено — все данные хранятся в этом браузере. После подключения Supabase здесь появится вход.' : signedIn ? `Вы вошли как ${session.user.email}. Продажи и фото сохраняются в облаке.` : 'Войдите, чтобы продажи и фото хранились в облаке и были доступны с телефона и компьютера.';
	$$('[data-open-account]').forEach(b => b.classList.toggle('cloud-on', signedIn));
	$$('.account-label').forEach(el => el.textContent = signedIn ? 'В облаке' : 'Аккаунт');
}
async function loadSales() {
	const session = await getSession();
	state.accountId = session?.user?.id || null;
	if (!session) { state.sales = readJSON(salesKey(), []); renderAll(); return; }
	const {data, error} = await client.from('sales').select('*').order('sold_at', {ascending: false});
	if (error) { state.sales = readJSON(salesKey(), []); toast('Не удалось загрузить продажи: ' + error.message); }
	else { state.sales = data || []; saveSales(); }
	renderAll();
}

/* ---------- Excel ---------- */
const excelDate = v => { const d = new Date(v); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('ru-RU', {day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'}); };
const publicUrl = v => typeof v === 'string' && /^https?:\/\//i.test(v.trim()) ? v.trim() : '';
const photoCell = v => publicUrl(v) ? 'Открыть фото' : v ? 'Только на этом устройстве' : '';
function sheetFrom(rows, widths) { const s = XLSX.utils.aoa_to_sheet(rows); s['!cols'] = widths.map(wch => ({wch})); return s; }
function linkPhotos(sheet, items, column, getter) {
	items.forEach((item, i) => { const url = publicUrl(getter(item)); const cell = sheet[XLSX.utils.encode_cell({r: i + 1, c: column})]; if (url && cell) cell.l = {Target: url, Tooltip: 'Открыть фото'}; });
}
function exportExcel() {
	try {
		if (!window.XLSX) throw new Error('Excel-модуль не загрузился. Проверьте интернет.');
		const wb = XLSX.utils.book_new();
		const sales = sheetFrom([['ID', 'Название', 'Затраты', 'Цена продажи', 'Кол-во', 'Канал', 'Товар ID', 'Дата', 'Фото'], ...state.sales.map(s => [saleId(s), s.title || '', Number(s.cost_price) || 0, Number(s.sale_price) || 0, saleQty(s), s.channel || '', s.product_id || '', excelDate(s.sold_at), photoCell(s.photo_url)])], [30, 30, 12, 14, 8, 16, 26, 20, 26]);
		linkPhotos(sales, state.sales, 8, s => s.photo_url);
		XLSX.utils.book_append_sheet(wb, sales, 'Продажи');
		const products = sheetFrom([['ID', 'Название', 'Артикул', 'Себестоимость', 'Цена', 'Остаток', 'Фото'], ...state.products.map(p => [p.id, p.name, p.sku || '', Number(p.cost) || 0, Number(p.price) || 0, stockOf(p.id), photoCell(p.photo)])], [26, 30, 16, 14, 12, 10, 26]);
		linkPhotos(products, state.products, 6, p => p.photo);
		XLSX.utils.book_append_sheet(wb, products, 'Товары');
		XLSX.utils.book_append_sheet(wb, sheetFrom([['ID', 'Товар ID', 'Товар', 'Тип', 'Кол-во', 'Куда / откуда', 'Комментарий', 'Дата', 'Продажа ID'], ...state.movements.map(m => [m.id, m.product_id, findProduct(m.product_id)?.name || '', MOVE_TYPES[m.type].label, m.qty, m.place || '', m.note || '', excelDate(m.at), m.sale_id || ''])], [26, 26, 26, 12, 8, 18, 28, 20, 30]), 'Движение');
		XLSX.utils.book_append_sheet(wb, sheetFrom([['ID', 'Категория', 'Описание', 'Сумма', 'Дата'], ...state.expenses.map(e => [String(e.id), e.category || 'Другое', e.note || '', Number(e.amount) || 0, excelDate(e.spent_at)])], [30, 22, 34, 12, 20]), 'Расходы');
		XLSX.utils.book_append_sheet(wb, sheetFrom([['Категория'], ...categoriesList().map(c => [c])], [32]), 'Категории');
		XLSX.utils.book_append_sheet(wb, sheetFrom([['Канал'], ...placesList().map(c => [c])], [32]), 'Каналы');
		XLSX.utils.book_append_sheet(wb, sheetFrom([['Название магазина', 'Цвет', 'Режим'], [state.profile.name, state.profile.color, state.profile.mode]], [28, 14, 14]), 'Профиль');
		XLSX.utils.book_append_sheet(wb, sheetFrom([['Цель на месяц'], [readGoal()]], [20]), 'Цель');
		XLSX.utils.book_append_sheet(wb, sheetFrom([['Как работать с файлом'], ['Меняйте строки и загружайте файл обратно через «Импорт».'], ['Удалённая строка удалит запись в приложении.'], ['Не меняйте ID существующих записей. Столбец «Остаток» считается сам по листу «Движение».']], [100]), 'Инструкция');
		XLSX.writeFile(wb, `${state.profile.name.replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase()}-${dateKey(new Date())}.xlsx`);
		toast('Файл Excel скачан.');
	} catch (error) { toast(error.message || 'Не удалось создать Excel-файл.'); }
}
function sheetRows(wb, name, required, optional = false) {
	const sheet = wb.Sheets[name];
	if (!sheet) { if (optional) return null; throw new Error(`В файле нет листа «${name}».`); }
	const rows = XLSX.utils.sheet_to_json(sheet, {header: 1, defval: '', raw: true});
	const headers = (rows.shift() || []).map(v => String(v).trim());
	const missing = required.filter(h => !headers.includes(h));
	if (missing.length) throw new Error(`На листе «${name}» нет столбцов: ${missing.join(', ')}.`);
	const photoCol = headers.indexOf('Фото');
	return rows.map((cells, i) => {
		const r = {};
		headers.forEach((h, c) => r[h] = cells[c] ?? '');
		if (photoCol >= 0) r._photo = publicUrl(sheet[XLSX.utils.encode_cell({r: i + 1, c: photoCol})]?.l?.Target);
		return r;
	}).filter(r => Object.entries(r).some(([k, v]) => k !== '_photo' && String(v).trim() !== ''));
}
function importDate(value, old) {
	if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
	if (typeof value === 'number') { const p = XLSX.SSF.parse_date_code(value); if (p) return new Date(p.y, p.m - 1, p.d, p.H, p.M, p.S).toISOString(); }
	const text = String(value ?? '').trim();
	if (!text) return old || new Date().toISOString();
	const m = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[ ,]+(\d{1,2}):(\d{2}))?/);
	const d = m ? new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0)) : new Date(text);
	if (Number.isNaN(d.getTime())) throw new Error(`Не удалось распознать дату «${text}».`);
	return d.toISOString();
}
const importedPhoto = (row, old) => row._photo || (row['Фото'] === 'Только на этом устройстве' ? old || null : null);
async function importExcel(file) {
	if (!file) return;
	try {
		if (!window.XLSX) throw new Error('Excel-модуль не загрузился. Проверьте интернет.');
		const wb = XLSX.read(await file.arrayBuffer(), {type: 'array', cellDates: true});
		const oldSales = new Map(state.sales.map(s => [saleId(s), s]));
		const sales = sheetRows(wb, 'Продажи', ['ID', 'Название', 'Затраты', 'Цена продажи', 'Дата']).map(r => {
			const id = String(r.ID || '').trim() || uid('local'), old = oldSales.get(id);
			const cost = Number(r['Затраты']), price = Number(r['Цена продажи']);
			if (!Number.isFinite(cost) || cost < 0 || !Number.isFinite(price) || price <= 0) throw new Error(`Проверьте цену и затраты продажи «${r['Название']}».`);
			return {...old, id, title: String(r['Название'] || 'Продажа костюма').trim(), cost_price: cost, sale_price: price, quantity: Math.max(1, Number(r['Кол-во']) || 1), channel: String(r['Канал'] || '').trim() || null, product_id: String(r['Товар ID'] || '').trim() || null, sold_at: importDate(r['Дата'], old?.sold_at), photo_url: importedPhoto(r, old?.photo_url), user_id: old?.user_id || 'local-user'};
		});
		const oldExpenses = new Map(state.expenses.map(e => [String(e.id), e]));
		const expenses = sheetRows(wb, 'Расходы', ['ID', 'Категория', 'Описание', 'Сумма', 'Дата']).map(r => {
			const id = String(r.ID || '').trim() || uid('expense'), amount = Number(r['Сумма']);
			if (!Number.isFinite(amount) || amount <= 0) throw new Error(`Проверьте сумму расхода «${r['Категория']}».`);
			return {id, category: String(r['Категория'] || 'Другое').trim(), note: String(r['Описание'] || '').trim(), amount, spent_at: importDate(r['Дата'], oldExpenses.get(id)?.spent_at)};
		});
		const oldProducts = new Map(state.products.map(p => [p.id, p]));
		const productRows = sheetRows(wb, 'Товары', ['ID', 'Название', 'Себестоимость', 'Цена'], true);
		const products = productRows ? productRows.map(r => {
			const id = String(r.ID || '').trim() || uid('p'), old = oldProducts.get(id);
			return {...old, id, name: String(r['Название'] || 'Товар').trim(), sku: String(r['Артикул'] || '').trim(), cost: Number(r['Себестоимость']) || 0, price: Number(r['Цена']) || 0, photo: importedPhoto(r, old?.photo) || '', created_at: old?.created_at || new Date().toISOString()};
		}) : state.products;
		const typeByLabel = Object.fromEntries(Object.entries(MOVE_TYPES).map(([k, v]) => [v.label, k]));
		const moveRows = sheetRows(wb, 'Движение', ['Товар ID', 'Тип', 'Кол-во'], true);
		let movements = moveRows ? moveRows.map(r => {
			const type = typeByLabel[String(r['Тип']).trim()];
			if (!type) throw new Error(`Неизвестный тип движения «${r['Тип']}».`);
			return {id: String(r.ID || '').trim() || uid('m'), product_id: String(r['Товар ID']).trim(), type, qty: Math.max(1, Number(r['Кол-во']) || 1), place: String(r['Куда / откуда'] || '').trim() || null, note: String(r['Комментарий'] || '').trim(), at: importDate(r['Дата']), sale_id: String(r['Продажа ID'] || '').trim() || undefined};
		}) : state.movements;
		const saleIds = new Set(sales.map(saleId));
		movements = movements.filter(m => m.type !== 'sale' || saleIds.has(m.sale_id));
		const catRows = sheetRows(wb, 'Категории', ['Категория'], true);
		const placeRows = sheetRows(wb, 'Каналы', ['Канал'], true);
		const profile = sheetRows(wb, 'Профиль', ['Название магазина'], true)?.[0];
		const goal = Number(sheetRows(wb, 'Цель', ['Цель на месяц'], true)?.[0]?.['Цель на месяц']) || readGoal();
		if (!await confirmBox('Импорт заменит данные в этом браузере данными из файла. Строки, удалённые в Excel, удалятся и здесь. Продолжить?', 'Импортировать')) return;
		Object.assign(state, {sales, expenses, products, movements});
		if (catRows) state.categories = catRows.map(r => String(r['Категория']).trim()).filter(Boolean);
		if (placeRows) state.places = placeRows.map(r => String(r['Канал']).trim()).filter(Boolean);
		if (profile) state.profile = {...state.profile, name: String(profile['Название магазина'] || state.profile.name).trim(), color: ACCENTS[profile['Цвет']] ? profile['Цвет'] : state.profile.color, mode: ['light', 'dark', 'auto'].includes(profile['Режим']) ? profile['Режим'] : state.profile.mode};
		localStorage.setItem(KEYS.goal, String(goal));
		saveSales(); saveExpenses(); saveProducts(); saveMovements(); saveProfile();
		writeJSON(KEYS.categories, state.categories); writeJSON(KEYS.places, state.places);
		applyProfile();
		renderAll();
		toast('Данные из Excel загружены.');
	} catch (error) { toast(error.message || 'Не удалось импортировать файл.'); }
}

/* ---------- события ---------- */
document.addEventListener('click', event => {
	const t = event.target.closest('[data-quick],[data-open-quick],[data-sale],[data-product],[data-close],[data-period],[data-filter],[data-expense-del],[data-move-del],[data-pd],[data-add-option],[data-open-profile],[data-open-account],[data-toggle-mode],[data-bar],[data-accent],[data-theme-mode],[data-type]');
	if (!t) return;
	const d = t.dataset;
	if (d.openQuick !== undefined) openDialog('quickDialog');
	else if (d.quick) {
		closeDialog('quickDialog');
		({sale: () => openSaleForm(), in: () => openMoveForm('in'), move: () => openMoveForm('transfer'), product: () => openProductForm(), expense: openExpenseForm})[d.quick]();
	}
	else if (d.sale) openSaleDetail(d.sale);
	else if (d.product) openProductDetail(d.product);
	else if (d.close !== undefined) closeDialog(t.closest('dialog'));
	else if (d.period) { state.period = d.period; $$('[data-period]').forEach(b => b.classList.toggle('active', b.dataset.period === state.period)); renderView(); }
	else if (d.filter) { state.stockFilter = d.filter; renderStock(); }
	else if (d.expenseDel) deleteExpense(d.expenseDel);
	else if (d.moveDel) deleteMove(d.moveDel);
	else if (d.pd) { const id = state.openProductId; if (d.pd === 'sale') openSaleForm(null, id); else openMoveForm(d.pd === 'in' ? 'in' : 'transfer', id); }
	else if (d.addOption) openOptionForm(d.addOption, d.target);
	else if (d.openProfile !== undefined) { $('profileName').value = state.profile.name; openDialog('profileDialog'); }
	else if (d.openAccount !== undefined) getSession().then(s => { renderAccount(s); openDialog('accountDialog'); });
	else if (d.toggleMode !== undefined) { state.profile.mode = document.documentElement.dataset.mode === 'dark' ? 'light' : 'dark'; saveProfile(); applyProfile(); }
	else if (d.bar) {
		const series = JSON.parse($('profitChart').dataset.series || '[]'), item = series[Number(d.bar)];
		$$('.bars button').forEach(b => b.classList.toggle('active', b === t));
		if (item) $('chartReadout').innerHTML = `${esc(item[0])}: <b class="${item[1] >= 0 ? 'pos' : 'neg'}">${signed(item[1])}</b>`;
	}
	else if (d.accent) { state.profile.color = d.accent; saveProfile(); applyProfile(); }
	else if (d.themeMode) { state.profile.mode = d.themeMode; saveProfile(); applyProfile(); }
	else if (d.type) setMoveType(d.type);
});
async function deleteExpense(id) {
	const e = state.expenses.find(x => String(x.id) === id);
	if (!e || !await confirmBox(`Удалить расход «${e.category}» на ${money(e.amount)}?`, 'Удалить')) return;
	state.expenses = state.expenses.filter(x => String(x.id) !== id);
	saveExpenses();
	toast('Расход удалён.');
	renderAll();
}
$$('dialog.sheet').forEach(d => d.addEventListener('click', event => { if (event.target === d) closeDialog(d); }));
window.addEventListener('hashchange', route);
window.addEventListener('scroll', () => document.querySelector('.topbar').classList.toggle('scrolled', scrollY > 4), {passive: true});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (state.profile.mode === 'auto') applyProfile(); });

const hero = $('hero');
hero.addEventListener('pointermove', event => {
	const r = hero.getBoundingClientRect();
	hero.style.setProperty('--mx', `${event.clientX - r.left}px`);
	hero.style.setProperty('--my', `${event.clientY - r.top}px`);
});
hero.addEventListener('pointerleave', () => { hero.style.removeProperty('--mx'); hero.style.removeProperty('--my'); });

$('saleForm').addEventListener('submit', submitSale);
$('saleProduct').addEventListener('change', applyProductToSale);
$('saleQty').addEventListener('input', () => findProduct($('saleProduct').value) ? applyProductToSale() : updateSaleHints());
['costInput', 'priceInput'].forEach(id => $(id).addEventListener('input', updateCalc));
$('deleteSaleBtn').addEventListener('click', () => deleteSale(state.openSaleId));
$('editSaleBtn').addEventListener('click', () => { const s = findSale(state.openSaleId); if (s) { closeDialog('saleDetailDialog'); openSaleForm(s); } });
$('productForm').addEventListener('submit', submitProduct);
$('editProductBtn').addEventListener('click', () => openProductForm(findProduct(state.openProductId)));
$('deleteProductBtn').addEventListener('click', () => deleteProduct(state.openProductId));
$('moveForm').addEventListener('submit', submitMove);
$('moveProduct').addEventListener('change', updateMoveHint);
$('moveQty').addEventListener('input', updateMoveHint);
$('expenseForm').addEventListener('submit', submitExpense);
$('optionForm').addEventListener('submit', submitOption);
$('stockSearch').addEventListener('input', renderStock);
$('historySearch').addEventListener('input', renderHistory);
$('goalInput').addEventListener('change', event => { const v = Number(event.target.value); if (v > 0) { localStorage.setItem(KEYS.goal, String(v)); renderReport(); toast('Цель обновлена.'); } });
$('exportExcelBtn').addEventListener('click', exportExcel);
$('importExcelBtn').addEventListener('click', () => $('excelImportFile').click());
$('excelImportFile').addEventListener('change', async event => { await importExcel(event.target.files?.[0]); event.target.value = ''; });
bindPhotoPicker('salePhotoPick', 'salePhotoInput', 'salePhoto');
bindPhotoPicker('productPhotoPick', 'productPhotoInput', 'productPhoto');

$('profileForm').addEventListener('submit', event => {
	event.preventDefault();
	state.profile.name = $('profileName').value.trim() || 'Baby Atelier';
	saveProfile(); applyProfile();
	closeDialog('profileDialog');
	toast('Сохранено.');
	renderAll();
});
$('profilePhotoInput').addEventListener('change', async event => {
	const file = event.target.files?.[0];
	event.target.value = '';
	if (!file) return;
	try {
		const previous = state.profile.photo;
		state.profile.photo = (await resizeImage(file, 256)).dataUrl;
		if (!saveProfile()) state.profile.photo = previous;
		applyProfile();
	} catch (error) { toast(error.message); }
});
$('clearProfilePhotoBtn').addEventListener('click', () => { state.profile.photo = ''; saveProfile(); applyProfile(); });

$('accountForm').addEventListener('submit', async event => {
	event.preventDefault();
	if (!client) return;
	$('accountStatus').textContent = 'Входим…';
	const {data, error} = await client.auth.signInWithPassword({email: $('accountEmail').value.trim(), password: $('accountPassword').value});
	if (error) { $('accountStatus').textContent = 'Не получилось войти: ' + error.message; return; }
	renderAccount(data.session);
	closeDialog('accountDialog');
	toast('Вы вошли в аккаунт.');
	loadSales();
});
$('signUpBtn').addEventListener('click', async () => {
	if (!client) return;
	const email = $('accountEmail').value.trim(), password = $('accountPassword').value;
	if (!email || password.length < 6) { $('accountStatus').textContent = 'Введите почту и пароль не короче 6 символов.'; return; }
	const {data, error} = await client.auth.signUp({email, password});
	if (error) { $('accountStatus').textContent = error.message; return; }
	if (data.session) { renderAccount(data.session); closeDialog('accountDialog'); loadSales(); toast('Аккаунт создан.'); }
	else $('accountStatus').textContent = 'Письмо отправлено. Подтвердите почту и войдите.';
});
$('signOutBtn').addEventListener('click', async () => {
	await client?.auth.signOut();
	renderAccount(null);
	closeDialog('accountDialog');
	toast('Вы вышли из аккаунта.');
	loadSales();
});

/* ---------- старт ---------- */
state.profile = {...state.profile, ...readJSON(KEYS.profile, {})};
state.expenses = readJSON(KEYS.expenses, []);
state.categories = readJSON(KEYS.categories, []);
state.products = readJSON(KEYS.products, []);
state.movements = readJSON(KEYS.movements, []).filter(m => MOVE_TYPES[m.type]);
state.places = readJSON(KEYS.places, []);
state.sales = readJSON(KEYS.sales, []);
$('todayLabel').textContent = new Date().toLocaleDateString('ru-RU', {weekday: 'long', day: 'numeric', month: 'long'});
$$('[data-period]').forEach(b => b.classList.toggle('active', b.dataset.period === state.period));
applyProfile();
renderAccount(null);
route();
loadSales();
if (client) client.auth.onAuthStateChange((_event, session) => { renderAccount(session); });
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
