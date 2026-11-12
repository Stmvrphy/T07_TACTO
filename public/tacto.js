/* tacto.js · cliente MQTT del toolkit Tacto (lo usan el teléfono y la experiencia).
 *
 * Temas MQTT (JSON):
 *   tacto/<sala>/<dispositivo>/status   retained  {online, name, caps}     (con "último testamento": online:false si se cae)
 *   tacto/<sala>/<dispositivo>/touch              {t, n, ar, p:[{i,x,y,f,d}]}   x,y 0–1 · f presión 0–1 · d diámetro en px
 *   tacto/<sala>/<dispositivo>/motion             {t, a:[alfa,beta,gamma]°, r:[x,y,z]°/s, c:[x,y,z] m/s²}
 *   tacto/<sala>/<dispositivo>/mic                {t, l, b:[graves,medios,agudos]}
 *   tacto/<sala>/<dispositivo>/cam                {t, m, x, y, b}
 *   tacto/<sala>/<dispositivo>/cmd | pong         medición de latencia
 *
 * Uso en una experiencia propia:
 *   const t = new Tacto();           // sala guardada o ?sala=abc123
 *   await t.connect();
 *   t.get('touch.x')                 // último valor del canal (null si aún no hay datos)
 *   t.on('datos', (dev, tipo) => {}) // cada mensaje recibido
 */
(function (g) {
  'use strict';
  // Broker público de prueba (sin cuenta): cualquiera puede leer los temas, por eso la sala es un código largo.
  const PUBLIC_BROKER = 'wss://broker.emqx.io:8084/mqtt';
  const CDN = 'https://cdn.jsdelivr.net/npm/mqtt@5.10.1/dist/mqtt.min.js';
  const Q = new URLSearchParams(location.search);
  const CFG = g.TACTO_CONFIG || {};
  const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch {} return null; };
  const ABC = 'abcdefghjkmnpqrstuvwxyz23456789';
  const rand = n => { let s = ''; for (const x of crypto.getRandomValues(new Uint8Array(n))) s += ABC[x % ABC.length]; return s; };
  const clean = s => String(s || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24);

  // ---------- sala ----------
  const room = () => { let s = clean(Q.get('sala')) || clean(ls('tacto.sala')); if (s.length < 4) s = rand(6); ls('tacto.sala', s); return s; };
  const nuevaSala = () => { const s = rand(6); ls('tacto.sala', s); return s; };

  // ---------- broker ----------
  async function resolveBroker() {
    if (Q.get('broker')) return Q.get('broker');
    if (CFG.broker) return CFG.broker;
    try { // servido por el servidor de Tacto: usa su broker embebido
      const i = await (await fetch(new URL('info', document.baseURI), { cache: 'no-store' })).json();
      if (i && i.mqtt) return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/mqtt`;
    } catch {}
    return PUBLIC_BROKER;
  }
  // usuario y contraseña (brokers en la nube): solo se usan con el broker definido en config.js
  const auth = broker => (CFG.username && broker === CFG.broker ? { username: CFG.username, password: CFG.password || '' } : {});
  function loadMqtt() {
    if (g.mqtt) return Promise.resolve();
    const add = src => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
    return add(new URL('vendor/mqtt.min.js', document.baseURI).href).catch(() => add(CDN));
  }
  async function open({ clientId, will } = {}) {
    await loadMqtt();
    const broker = await resolveBroker();
    const client = g.mqtt.connect(broker, { clientId: clientId || 'c-' + rand(8), keepalive: 20, reconnectPeriod: 1000, connectTimeout: 8000, clean: true, will, ...auth(broker) });
    return { client, broker };
  }

  // ---------- catálogo de canales (nombre, etiqueta, rango habitual) ----------
  const CH = [];
  const add = (name, label, min, max, group) => CH.push({ name, label, min, max, group });
  add('touch.n', 'dedos apoyados', 0, 5, 'Tacto');
  add('touch.down', 'tocando (0/1)', 0, 1, 'Tacto');
  add('touch.x', 'posición X', 0, 1, 'Tacto');
  add('touch.y', 'posición Y', 0, 1, 'Tacto');
  add('touch.f', 'presión', 0, 1, 'Tacto');
  add('touch.d', 'diámetro (px)', 0, 120, 'Tacto');
  add('touch.dist', 'distancia entre 2 dedos', 0, 1.5, 'Tacto');
  add('touch.ang', 'ángulo entre 2 dedos (°)', -180, 180, 'Tacto');
  add('ang.a', 'giro alfa (°)', 0, 360, 'Giro del teléfono');
  add('ang.b', 'giro beta (°)', -180, 180, 'Giro del teléfono');
  add('ang.g', 'giro gamma (°)', -90, 90, 'Giro del teléfono');
  add('rot.x', 'velocidad de giro X (°/s)', -360, 360, 'Giro del teléfono');
  add('rot.y', 'velocidad de giro Y (°/s)', -360, 360, 'Giro del teléfono');
  add('rot.z', 'velocidad de giro Z (°/s)', -360, 360, 'Giro del teléfono');
  add('acc.x', 'aceleración X (m/s²)', -20, 20, 'Aceleración');
  add('acc.y', 'aceleración Y (m/s²)', -20, 20, 'Aceleración');
  add('acc.z', 'aceleración Z (m/s²)', -20, 20, 'Aceleración');
  add('mic.level', 'nivel', 0, 1, 'Micrófono');
  add('mic.low', 'graves', 0, 1, 'Micrófono');
  add('mic.mid', 'medios', 0, 1, 'Micrófono');
  add('mic.high', 'agudos', 0, 1, 'Micrófono');
  add('mic.hz', 'frecuencia fundamental (Hz)', 0, 2000, 'Micrófono');
  add('cam.motion', 'movimiento', 0, 1, 'Cámara');
  add('cam.x', 'centro del movimiento X', 0, 1, 'Cámara');
  add('cam.y', 'centro del movimiento Y', 0, 1, 'Cámara');
  add('cam.bright', 'brillo', 0, 1, 'Cámara');
  for (let i = 1; i <= 5; i++) {
    add(`t${i}.x`, `dedo ${i} · X`, 0, 1, `Dedo ${i}`); add(`t${i}.y`, `dedo ${i} · Y`, 0, 1, `Dedo ${i}`);
    add(`t${i}.f`, `dedo ${i} · presión`, 0, 1, `Dedo ${i}`); add(`t${i}.d`, `dedo ${i} · diámetro (px)`, 0, 120, `Dedo ${i}`);
  }

  // mensaje -> canales planos
  function flatten(kind, m, ch) {
    const num = v => (typeof v === 'number' && isFinite(v) ? v : 0);
    if (kind === 'touch') {
      const p = Array.isArray(m.p) ? m.p : [], n = m.n ?? p.length;
      ch['touch.n'] = n; ch['touch.down'] = n > 0 ? 1 : 0;
      for (let i = 1; i <= 5; i++) {
        const q = p.find(z => z.i === i);
        if (q) { ch[`t${i}.x`] = num(q.x); ch[`t${i}.y`] = num(q.y); ch[`t${i}.f`] = num(q.f); ch[`t${i}.d`] = num(q.d); }
        else { ch[`t${i}.f`] = 0; ch[`t${i}.d`] = 0; } // al soltar, X e Y se quedan en el último valor
      }
      if (p.length) {
        const mean = k => p.reduce((s, z) => s + num(z[k]), 0) / p.length;
        ch['touch.x'] = mean('x'); ch['touch.y'] = mean('y'); ch['touch.f'] = Math.max(...p.map(z => num(z.f))); ch['touch.d'] = mean('d');
      } else { ch['touch.f'] = 0; ch['touch.d'] = 0; }
      if (p.length >= 2) {
        const dx = (num(p[1].x) - num(p[0].x)) * (m.ar || 1), dy = num(p[1].y) - num(p[0].y);
        ch['touch.dist'] = Math.hypot(dx, dy); ch['touch.ang'] = (Math.atan2(dy, dx) * 180) / Math.PI;
      }
    } else if (kind === 'motion') {
      if (m.a) { ch['ang.a'] = num(m.a[0]); ch['ang.b'] = num(m.a[1]); ch['ang.g'] = num(m.a[2]); }
      if (m.r) { ch['rot.x'] = num(m.r[0]); ch['rot.y'] = num(m.r[1]); ch['rot.z'] = num(m.r[2]); }
      if (m.c) { ch['acc.x'] = num(m.c[0]); ch['acc.y'] = num(m.c[1]); ch['acc.z'] = num(m.c[2]); }
    } else if (kind === 'mic') {
      ch['mic.level'] = num(m.l); if (m.b) { ch['mic.low'] = num(m.b[0]); ch['mic.mid'] = num(m.b[1]); ch['mic.high'] = num(m.b[2]); }
      ch['mic.hz'] = num(m.hz);
    } else if (kind === 'cam') {
      ch['cam.motion'] = num(m.m); ch['cam.x'] = num(m.x); ch['cam.y'] = num(m.y); ch['cam.bright'] = num(m.b);
    }
  }

  // ---------- cliente de la experiencia ----------
  class Tacto {
    constructor(o = {}) { this.sala = clean(o.sala) || room(); this.devices = {}; this.sel = 'auto'; this.estado = 'desconectado'; this.broker = null; this._h = {}; }
    on(ev, fn) { (this._h[ev] ||= []).push(fn); return this; }
    emit(ev, ...a) { (this._h[ev] || []).forEach(f => { try { f(...a); } catch (e) { console.error(e); } }); }
    setEstado(s) { if (s !== this.estado) { this.estado = s; this.emit('estado', s); } }

    async connect() {
      await loadMqtt();
      this.broker = await resolveBroker();
      const c = (this.client = g.mqtt.connect(this.broker, { clientId: 'exp-' + rand(8), keepalive: 20, reconnectPeriod: 1000, connectTimeout: 8000, clean: true, ...auth(this.broker) }));
      c.on('connect', () => { this.setEstado('conectado'); c.subscribe(`tacto/${this.sala}/#`); });
      c.on('reconnect', () => this.setEstado('reconectando'));
      c.on('offline', () => this.setEstado('desconectado'));
      c.on('error', e => this.emit('error', e));
      c.on('message', (t, p) => this._msg(t, p));
      setInterval(() => this._ping(), 2000);
      return this;
    }
    cambiarSala(s) { // la experiencia puede cambiar de sala sin recargar
      if (this.client && this.client.connected) this.client.unsubscribe(`tacto/${this.sala}/#`);
      this.sala = clean(s) || nuevaSala(); ls('tacto.sala', this.sala); this.devices = {};
      if (this.client && this.client.connected) this.client.subscribe(`tacto/${this.sala}/#`);
      this.emit('dispositivo'); return this.sala;
    }
    _msg(topic, payload) {
      const [, sala, dev, kind] = topic.split('/');
      if (sala !== this.sala || !dev || !kind) return;
      let m; try { m = JSON.parse(payload.toString()); } catch { return; }
      const d = (this.devices[dev] ||= { id: dev, name: dev, online: false, last: 0, ch: {}, rtt: [], caps: {} });
      if (kind === 'status') {
        d.online = !!m.online; d.name = m.name || dev; d.caps = m.caps || d.caps;
        if (!d.online) { d.ch['touch.n'] = 0; d.ch['touch.down'] = 0; d.ch['touch.f'] = 0; d.ch['touch.d'] = 0; } // sin teléfono no queda nada "apretado"
        this.emit('dispositivo', d); return;
      }
      if (kind === 'pong') { d.rtt.push(performance.now() - m.t); if (d.rtt.length > 40) d.rtt.shift(); this.emit('rtt', d); return; }
      if (kind === 'cmd') return;
      d.last = performance.now(); d.online = true;
      flatten(kind, m, d.ch);
      this.emit('datos', d, kind, m);
    }
    _ping() {
      if (!this.client || !this.client.connected) return;
      for (const d of Object.values(this.devices)) if (d.online) this.client.publish(`tacto/${this.sala}/${d.id}/cmd`, JSON.stringify({ ping: performance.now() }));
    }
    pick() {
      if (this.sel !== 'auto') return this.devices[this.sel] || null;
      let best = null;
      for (const d of Object.values(this.devices)) if (d.online && (!best || d.last > best.last)) best = d;
      return best || Object.values(this.devices)[0] || null;
    }
    get(name, dev) { const d = dev ? this.devices[dev] : this.pick(); return d && name in d.ch ? d.ch[name] : null; }
  }

  Object.assign(Tacto, { CHANNELS: CH, sala: room, nuevaSala, open, resolveBroker, rand, clean, PUBLIC_BROKER });
  g.Tacto = Tacto;
})(window);
