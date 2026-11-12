/* fisica.js · deforma la imagen como si fuera un material que se toca.
 *
 * Una grilla pequeña (96×54) guarda cuánto está desplazada la imagen en cada punto. En cada cuadro:
 *   1. los dedos empujan, arrastran o presionan esa grilla (según el material),
 *   2. la grilla se simula (ondas, resortes, rozamiento) y vuelve sola al reposo,
 *   3. la tarjeta gráfica (WebGL) dibuja la imagen leyendo esa grilla para desplazar cada píxel.
 *
 * Uso:  const fx = Fisica.create(canvas);  fx.setMaterial('tela');
 *       cada cuadro: fx.step(dt, dedos, aspecto, tiempo);  fx.render(fuente, anchoFuente, altoFuente, espejo, ancho, alto);
 *   dedo = { id, x, y, dx, dy, vx, vy, f, r, nuevo }   (x,y,r en 0–1 de la pantalla; dx,dy = desplazamiento en este cuadro)
 *
 * Para crear un material nuevo: agrega una entrada en MATERIALES (apariencia) y un caso en step() (física).
 */
(function (g) {
  'use strict';
  const GW = 96, GH = 54, N = GW * GH;
  const MAXD = 0.2; // desplazamiento máximo guardado (fracción de la pantalla)
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const mk = () => new Float32Array(N);

  // apariencia: aberración cromática, relieve (luz y sombra) y brillo especular
  const MATERIALES = {
    ninguno: { nombre: 'Sin efecto', desc: 'La imagen sin deformar.' },
    tela: { nombre: 'Tela', desc: 'Se arrastra y se estira con el dedo, ondula y vuelve sola a su sitio.', chroma: 0.12, sombra: 0.8, brillo: 0.06 },
    agua: { nombre: 'Agua', desc: 'Cada toque crea ondas que se expanden y se apagan.', chroma: 0.3, sombra: 0.45, brillo: 0.5 },
    squishy: { nombre: 'Squishy', desc: 'Gelatina: se hunde bajo el dedo y rebota al soltar.', chroma: 0.1, sombra: 0.6, brillo: 0.12 },
    remolino: { nombre: 'Remolino', desc: 'La imagen gira alrededor del dedo como un líquido espeso.', chroma: 0.15, sombra: 0, brillo: 0 },
  };

  const VS = 'attribute vec2 a; varying vec2 vUv; void main(){ vUv = vec2(a.x*.5+.5, .5-a.y*.5); gl_Position = vec4(a, 0., 1.); }';
  const FS = `precision mediump float;
varying vec2 vUv;
uniform sampler2D uSrc, uFld;
uniform vec2 uCover;
uniform float uMirror, uMaxD, uChroma, uShade, uSpec;
vec2 cover(vec2 uv){ uv = (uv - .5) * uCover + .5; if (uMirror > .5) uv.x = 1. - uv.x; return uv; }
void main(){
  vec4 f = texture2D(uFld, vUv);
  vec2 d = (f.rg * 2. - 1.) * uMaxD;
  float sh = f.b * 2. - 1.;
  vec2 uv = vUv - d, ca = d * uChroma;
  vec3 c = vec3(texture2D(uSrc, cover(uv + ca)).r, texture2D(uSrc, cover(uv)).g, texture2D(uSrc, cover(uv - ca)).b);
  c *= 1. + sh * uShade;
  c += pow(max(sh, 0.), 2.) * uSpec;
  gl_FragColor = vec4(c, 1.);
}`;

  function create(canvas) {
    const api = { ok: false, material: 'ninguno', p: { intensidad: 1, recuperacion: 2.5, tamano: 1, relieve: 1 }, MATERIALES };
    api.set = o => Object.assign(api.p, o);
    const gl = canvas.getContext('webgl', { alpha: false, antialias: false }) || canvas.getContext('experimental-webgl');
    if (!gl) return api;

    // ---------- programa gráfico ----------
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; };
    const vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS);
    if (!vs || !fs) return api;
    const prog = gl.createProgram(); gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return api;
    gl.useProgram(prog);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = n => gl.getUniformLocation(prog, n);
    const uni = { src: U('uSrc'), fld: U('uFld'), cover: U('uCover'), mirror: U('uMirror'), maxd: U('uMaxD'), chroma: U('uChroma'), shade: U('uShade'), spec: U('uSpec') };
    const tex = unit => {
      const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
      for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
      return t;
    };
    tex(0); tex(1);
    gl.uniform1i(uni.src, 0); gl.uniform1i(uni.fld, 1); gl.uniform1f(uni.maxd, MAXD);

    // ---------- estado físico ----------
    const P = { dx: mk(), dy: mk(), z: mk() }, V = { dx: mk(), dy: mk(), z: mk() }, T = { dx: mk(), dy: mk(), z: mk() };
    const out = new Uint8Array(N * 4);
    let A = 16 / 9, RS = 1;
    const reset = () => { for (const o of [P, V, T]) for (const k in o) o[k].fill(0); };

    // recorre las celdas cercanas a un dedo: fn(índice, peso 0–1, rx, ry); rx,ry con la proporción de pantalla corregida
    function splat(f, reach, fn) {
      const R = f.r * RS * reach, r0 = f.r * RS;
      const i0 = Math.max(0, Math.floor((f.x - R / A) * GW)), i1 = Math.min(GW - 1, Math.ceil((f.x + R / A) * GW));
      const j0 = Math.max(0, Math.floor((f.y - R) * GH)), j1 = Math.min(GH - 1, Math.ceil((f.y + R) * GH));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const rx = ((i + 0.5) / GW - f.x) * A, ry = (j + 0.5) / GH - f.y, q = (rx * rx + ry * ry) / (r0 * r0);
        if (q <= reach * reach) fn(j * GW + i, Math.exp(-q), rx, ry, r0);
      }
    }

    // ecuación de onda con resorte, rozamiento y "fuga" (el desplazamiento se va apagando solo)
    function onda(p, v, Cw, k, rozamiento, fuga, h) {
      const ed = Math.exp(-rozamiento * h), el = Math.exp(-fuga * h);
      for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
        const x = j * GW + i, c = p[x];
        const l = i > 0 ? p[x - 1] : c, r = i < GW - 1 ? p[x + 1] : c, u = j > 0 ? p[x - GW] : c, d = j < GH - 1 ? p[x + GW] : c;
        v[x] = (v[x] + h * (Cw * (l + r + u + d - 4 * c) - k * c)) * ed;
      }
      for (let x = 0; x < N; x++) p[x] = (p[x] + v[x] * h) * el;
    }
    // resorte puro hacia un objetivo (gelatina)
    function resorte(p, v, tgt, K, gam, h) {
      for (let x = 0; x < N; x++) { v[x] += h * (K * (tgt[x] - p[x]) - gam * v[x]); p[x] += v[x] * h; }
    }

    function step(dt, dedos, aspecto, t) {
      const mat = api.material; if (mat === 'ninguno') return;
      A = aspecto || 16 / 9; const p = api.p, I = p.intensidad; RS = p.tamano;
      const s = 3 / Math.max(0.3, p.recuperacion); // ritmo de apagado: ~5 % de lo que quede tras "recuperación" segundos
      const pasos = clamp(Math.ceil(dt * 180), 1, 8), h = dt / pasos;

      if (mat === 'tela') {
        for (const f of dedos) splat(f, 2.4, (x, w, rx, ry) => {
          const k = w * I * (0.5 + f.f);
          P.dx[x] += f.dx * k * 0.7 - (rx / A) * w * 0.8 * f.f * dt * I;   // la tela sigue al dedo y se hunde hacia él
          P.dy[x] += f.dy * k * 0.7 - ry * w * 0.8 * f.f * dt * I;
          P.z[x] += w * f.f * I * 0.6 * s * dt;                            // hundimiento (sombra) mientras presionas
        });
        for (let n = 0; n < pasos; n++) { onda(P.dx, V.dx, 1800, 3, 1.4 * s, 0.9 * s, h); onda(P.dy, V.dy, 1800, 3, 1.4 * s, 0.9 * s, h); onda(P.z, V.z, 1800, 0, 2 * s, s, h); }
      } else if (mat === 'agua') {
        for (const f of dedos) splat(f, 2.2, (x, w) => {
          const v = Math.hypot(f.vx, f.vy);
          P.z[x] += w * dt * I * (f.f * 1.2 * Math.sin(t * 18) + Math.min(v * 1.2, 2.5) * 0.8) * 6; // anillos mientras presionas, estela al moverte
          if (f.nuevo) P.z[x] -= w * f.f * 0.6 * I;                                                  // gota al apoyar
        });
        for (let n = 0; n < pasos; n++) onda(P.z, V.z, 4500, 0, 0.9 * s, 0.1 * s, h);
      } else if (mat === 'squishy') {
        T.dx.fill(0); T.dy.fill(0); T.z.fill(0);
        for (const f of dedos) splat(f, 2.6, (x, w, rx, ry) => {
          const k = w * I * (0.4 + f.f);
          T.dx[x] += (rx / A) * 2 * k + f.vx * 0.1 * k; T.dy[x] += ry * 2 * k + f.vy * 0.1 * k; T.z[x] += k * 0.8; // la masa se abulta alrededor y acompaña al dedo
        });
        const om = 20 / Math.max(0.3, p.recuperacion), K = om * om, gam = 2 * 0.15 * om; // rebote suave: ζ = 0,15
        for (let n = 0; n < pasos; n++) { resorte(P.dx, V.dx, T.dx, K, gam, h); resorte(P.dy, V.dy, T.dy, K, gam, h); resorte(P.z, V.z, T.z, K, gam, h); }
      } else if (mat === 'remolino') {
        for (const f of dedos) splat(f, 2.6, (x, w, rx, ry, r0) => {
          const k = w * I * (0.3 + f.f);
          V.dx[x] += (-ry / r0 / A) * k * 0.2 * dt * 60; V.dy[x] += (rx / r0) * k * 0.2 * dt * 60; // empuje tangencial: gira
          P.dx[x] += f.dx * w * 0.6 * I; P.dy[x] += f.dy * w * 0.6 * I;
        });
        for (let n = 0; n < pasos; n++) { onda(P.dx, V.dx, 500, 0, 1.5 * s, 0.6 * s, h); onda(P.dy, V.dy, 500, 0, 1.5 * s, 0.6 * s, h); }
      }

      // ---------- codifica la grilla en una textura: R,G = desplazamiento · B = luz y sombra ----------
      const enc = v => ((clamp(v, -1, 1) * 0.5 + 0.5) * 255 + 0.5) | 0;
      for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
        const x = j * GW + i, c = P.z[x];
        const zl = i > 0 ? P.z[x - 1] : c, zr = i < GW - 1 ? P.z[x + 1] : c, zu = j > 0 ? P.z[x - GW] : c, zd = j < GH - 1 ? P.z[x + GW] : c;
        let dx, dy, luz;
        if (mat === 'agua') { const gx = (zr - zl) * 0.5, gy = (zd - zu) * 0.5; dx = -gx * 0.9; dy = -gy * 0.9; luz = (-gx - gy) * 3; }
        else { dx = P.dx[x]; dy = P.dy[x]; luz = mat === 'remolino' ? 0 : (zl - zr + zu - zd) * (mat === 'tela' ? 5 : 4); }
        const o = x * 4; out[o] = enc(dx / MAXD); out[o + 1] = enc(dy / MAXD); out[o + 2] = enc(luz); out[o + 3] = 255;
      }
    }

    function render(src, sw, sh, espejo, W, H) {
      const m = MATERIALES[api.material]; if (!m || api.material === 'ninguno' || !sw || !sh) return;
      const dpr = Math.min(devicePixelRatio || 1, 2), cw = Math.min(1920, Math.round(W * dpr)), ch = Math.round(cw * H / W);
      if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; gl.viewport(0, 0, cw, ch); }
      try {
        gl.activeTexture(gl.TEXTURE0); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      } catch { return; } // el video aún no tiene cuadro
      gl.activeTexture(gl.TEXTURE1); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, GW, GH, 0, gl.RGBA, gl.UNSIGNED_BYTE, out);
      const sa = sw / sh, wa = W / H, rel = api.p.relieve;
      gl.uniform2f(uni.cover, sa > wa ? wa / sa : 1, sa > wa ? 1 : sa / wa); // imagen "cubrir" la pantalla, igual que object-fit: cover
      gl.uniform1f(uni.mirror, espejo ? 1 : 0); gl.uniform1f(uni.chroma, m.chroma); gl.uniform1f(uni.shade, m.sombra * rel); gl.uniform1f(uni.spec, m.brillo * rel);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    api.setMaterial = m => { if (!MATERIALES[m]) return; api.material = m; reset(); };
    api.step = step; api.render = render; api.ok = true;
    return api;
  }

  g.Fisica = { create, MATERIALES };
})(window);
