'use strict';
/**
 * =====================================================================
 * ROLAND TR-808 · TACTO SAMPLER & FX CONTROLLER
 * Mapeo en tiempo real entre sensores de teléfono y audio/imagen
 * =====================================================================
 */

const $ = s => document.querySelector(s);
const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));
const fmt = (v, d = 2) => (typeof v === 'number' && isFinite(v) ? v.toFixed(d) : '0');

// =====================================================================
// 1. INICIALIZACIÓN DE TACTO (MQTT Y SALA)
// =====================================================================
const tacto = new Tacto();
const roomDisplay = $('#roomCodeDisplay');
const ledStatus = $('#ledStatus');
const connStatusText = $('#connStatusText');
const touchCoords = $('#touchCoords');

roomDisplay.textContent = tacto.sala;

function updateConnectionUI() {
  const dev = tacto.pick();
  const isRecent = dev && dev.last > 0 && (performance.now() - dev.last < 4500);
  const isOnline = dev && (dev.online || isRecent);
  const isBroker = tacto.client && tacto.client.connected;

  if (isBroker && isOnline) {
    ledStatus.className = 'led connected';
    connStatusText.textContent = `ONLINE: ${dev.name || 'PHONE'}`;
  } else if (isBroker) {
    ledStatus.className = 'led waiting';
    connStatusText.textContent = 'BROKER OK · ESPERANDO TELÉFONO';
  } else {
    ledStatus.className = 'led';
    connStatusText.textContent = 'DESCONECTADO';
  }
}

tacto.on('estado', () => updateConnectionUI());
tacto.on('dispositivo', () => updateConnectionUI());
tacto.on('datos', () => updateConnectionUI());
setInterval(updateConnectionUI, 1000);

// Modal QR
const qrModal = $('#qrModal');
const qrImage = $('#qrImage');
const phoneUrlText = $('#phoneUrlText');

async function setupQR() {
  const CFG = window.TACTO_CONFIG || {};
  let base = CFG.phoneUrl || new URL('./', location.href).href;
  if (!base.endsWith('/')) base += '/';
  
  let u = `${base}?sala=${tacto.sala}`;
  if (tacto.broker) {
    u += `&broker=${encodeURIComponent(tacto.broker)}`;
  }
  
  phoneUrlText.textContent = u;

  if (window.qrcode) {
    try {
      const qr = window.qrcode(0, 'M');
      qr.addData(u);
      qr.make();
      qrImage.src = qr.createDataURL(4, 6);
    } catch (e) {
      console.warn('Error generando QR:', e);
    }
  }
}

$('#btnOpenQR').onclick = () => { setupQR(); qrModal.classList.add('open'); };
$('#btnCloseQR').onclick = () => qrModal.classList.remove('open');
qrModal.onclick = (e) => { if (e.target === qrModal) qrModal.classList.remove('open'); };

// =====================================================================
// 2. CADENA DE AUDIO CON TONE.JS & PEDALES
// =====================================================================
let audioStarted = false;
let currentInstrumentName = 'piano';
let currentSampler = null;

// Pedales de Efectos de Guitarra
let overdrive, phaser, chorus, tremolo, vibrato, delay, reverb, compressor, masterVol, analyser;

function buildAudioChain() {
  if (overdrive) return;
  // Overdrive
  overdrive = new Tone.Distortion({ distortion: 0.1, wet: 0 });

  // Phaser
  phaser = new Tone.Phaser({ frequency: 2, octaves: 3, baseFrequency: 350, wet: 0 });

  // Chorus
  chorus = new Tone.Chorus({ frequency: 1.5, delayTime: 3.5, depth: 0.7, wet: 0 }).start();

  // Tremolo
  tremolo = new Tone.Tremolo({ frequency: 6, depth: 0.9, wet: 0 }).start();

  // Vibrato
  vibrato = new Tone.Vibrato({ frequency: 5, depth: 0.3, wet: 0 });

  // Delay
  delay = new Tone.FeedbackDelay({ delayTime: 0.25, feedback: 0.3, wet: 0 });

  // Reverb
  reverb = new Tone.Freeverb({ roomSize: 0.8, dampening: 3000, wet: 0 });

  // Compresor de salida
  compressor = new Tone.Compressor({ threshold: -20, ratio: 4, attack: 0.03, release: 0.25 });

  // Volumen maestro y Analizador
  masterVol = new Tone.Volume(0);
  analyser = new Tone.Analyser('waveform', 256);

  // Cadena en serie: Sampler -> Overdrive -> Phaser -> Chorus -> Tremolo -> Vibrato -> Delay -> Reverb -> Compressor -> Vol -> Analyser -> Dest
  overdrive.chain(phaser, chorus, tremolo, vibrato, delay, reverb, compressor, masterVol, analyser, Tone.Destination);

  try { setupMasterRecorder(); } catch (e) { console.warn('Recorder init:', e); }
  try { loadInstrument(currentInstrumentName); } catch (e) { console.warn('Load inst:', e); }
}

function initAudioEngine() {
  buildAudioChain();
  Tone.start().then(() => {
    audioStarted = true;
    const btn = $('#btnAudioStart');
    if (btn) {
      btn.textContent = '✓ AUDIO ACTIVO';
      btn.classList.remove('btn-tr-cream');
      btn.style.background = 'var(--tr-orange)';
      btn.style.color = '#fff';
      btn.disabled = true;
    }
  }).catch(e => console.warn('Error al iniciar Tone:', e));
}

$('#btnAudioStart').onclick = initAudioEngine;
window.addEventListener('click', () => { if (!audioStarted) initAudioEngine(); }, { once: false });
window.addEventListener('touchstart', () => { if (!audioStarted) initAudioEngine(); }, { once: false });

// =====================================================================
// 3. CARGADOR DE SAMPLES ("tonejs-instruments-master")
// =====================================================================
const instStatus = $('#instrumentStatus');
const selInstrument = $('#selInstrument');

async function loadInstrument(instName) {
  instStatus.textContent = `⌛ CARGANDO ${instName.toUpperCase()}...`;
  instStatus.style.color = 'var(--tr-amber)';
  if (selInstrument) selInstrument.disabled = true;

  // 1. Liberar y desconectar el instrumento anterior para evitar fugas de memoria
  if (currentSampler) {
    try {
      currentSampler.releaseAll();
      currentSampler.disconnect();
      currentSampler.dispose();
    } catch (e) {
      console.warn('Limpiando sampler anterior:', e);
    }
    currentSampler = null;
  }

  // 2. Obtener mapa de notas desde SampleLibrary (tonejs-instruments-master)
  let rawMap = null;
  if (window.SampleLibrary && window.SampleLibrary[instName]) {
    rawMap = window.SampleLibrary[instName];
  }

  const sampleMap = {};
  if (rawMap) {
    const keys = Object.keys(rawMap);
    // Minificación inteligente (según README.md): reduce carga sin pérdida apreciable de calidad
    const minBy = keys.length >= 48 ? 4 : (keys.length >= 24 ? 2 : 1);
    keys.forEach((note, idx) => {
      if (idx % minBy === 0) {
        sampleMap[note] = rawMap[note].replace('.[mp3|ogg]', '.mp3');
      }
    });
  } else {
    // Fallback estándar en caso de que no estuviera cargado Tonejs-Instruments.js
    const notes = ['A1', 'A2', 'A3', 'A4', 'C2', 'C3', 'C4', 'C5', 'Ds2', 'Ds3', 'Ds4', 'Fs2', 'Fs3', 'Fs4'];
    notes.forEach(n => { sampleMap[n] = `${n}.mp3`; });
  }

  // 3. Ruta base relativa: funciona en localhost y en GitHub Pages
  const basePath = `tonejs-instruments-master/samples/${instName}/`;

  // 4. Instanciar nuevo Tone.Sampler conectado directamente a la cadena de efectos
  currentSampler = new Tone.Sampler({
    urls: sampleMap,
    baseUrl: basePath,
    attack: 0.05,
    release: 1.2
  });

  if (overdrive) {
    currentSampler.connect(overdrive);
  }

  // 5. Esperar a que todos los búferes de audio del instrumento terminen de descargarse
  Tone.loaded().then(() => {
    instStatus.textContent = `✓ ${instName.toUpperCase()} LISTO PARA TOCAR`;
    instStatus.style.color = 'var(--tr-orange)';
    if (selInstrument) selInstrument.disabled = false;
  }).catch(err => {
    console.warn(`Error al cargar ${instName}:`, err);
    instStatus.textContent = `⚠ ERROR EN ${instName.toUpperCase()} (Verifica archivos)`;
    instStatus.style.color = 'var(--tr-red)';
    if (selInstrument) selInstrument.disabled = false;
  });
}

$('#selInstrument').onchange = (e) => {
  currentInstrumentName = e.target.value;
  if (audioStarted) {
    loadInstrument(currentInstrumentName);
  } else {
    // Si aún no se activó el audio, iniciar AudioContext primero
    initAudioEngine();
  }
};

// =====================================================================
// 4. TEORÍA MUSICAL: HZ A NOTA TEMPERADA Y ESCALAS CARTESIANAS
// =====================================================================
// Intervalos de escalas (en semitonos desde la tónica)
const SCALES = {
  // Eje X+: Mayor (Jónica)
  'Mayor': [0, 2, 4, 5, 7, 9, 11, 12],
  // Eje X-: Menor natural (Eólica)
  'Menor': [0, 2, 3, 5, 7, 8, 10, 12],
  // Eje Y+: Aumentada (Escala aumentada / hexatónica)
  'Aumentada': [0, 3, 4, 7, 8, 11, 12],
  // Eje Y-: Disminuida (Octatónica semitono-tono)
  'Disminuida': [0, 1, 3, 4, 6, 7, 9, 10, 12]
};

// Convierte frecuencia en Hz a la nota temperada exacta más cercana (A4 = 440Hz)
function hzToClosestNote(hz) {
  if (!hz || hz < 40 || hz > 2200) return null;
  const midi = Math.round(69 + 12 * Math.log2(hz / 440));
  return Tone.Frequency(midi, 'midi').toNote();
}

// Determina escala según plano cartesiano (centro 0.5, 0.5 como 0, 0)
function getScaleTypeFromCartesian(tx, ty) {
  const dx = (tx ?? 0.5) - 0.5;
  const dy = 0.5 - (ty ?? 0.5); // Arriba es positivo

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? 'Mayor' : 'Menor';
  } else {
    return dy >= 0 ? 'Aumentada' : 'Disminuida';
  }
}

// Construye la secuencia ascendente y descendente (1-2-3-4-5-6-7-8-7-6-5-4-3-2)
function buildScaleSequence(rootNote, scaleName) {
  const intervals = SCALES[scaleName] || SCALES['Mayor'];
  const rootMidi = Tone.Frequency(rootNote).toMidi();
  const notes = intervals.map(semitones => Tone.Frequency(rootMidi + semitones, 'midi').toNote());
  
  // Secuencia ascendente y descendente
  const seq = [...notes];
  for (let i = notes.length - 2; i >= 1; i--) {
    seq.push(notes[i]);
  }
  return seq;
}

// =====================================================================
// 5. VARIABLES DE ESTADO Y GESTOS TÁCTILES
// =====================================================================
const MIC_THRESHOLD = 0.035; // Umbral de silencio
let lastDetectedNote = 'C3';

// Control de secuencias y bucles de audio
let isSounding = false;
let currentPlayingNote = null;
let scaleSequenceIndex = 0;
let lastStepTime = 0;

// Detección de mantener presionado (Hold time)
let touchHoldStartTime = 0;
let holdDurationSeconds = 0;

// Detección de vibración (Vibrato) y deslizamiento lento (Phaser)
const touchHistory = [];
let vibrationIntensity = 0;
let isSlowSliding = false;
let lastTouchPos = { x: 0.5, y: 0.5, time: performance.now() };
let currentTwistSpeed = { vx: 0, vy: 0 };

function trackTouchGestures(tx, ty, isDown, now) {
  if (!isDown) {
    touchHoldStartTime = 0;
    holdDurationSeconds = 0;
    touchHistory.length = 0;
    vibrationIntensity = 0;
    isSlowSliding = false;
    currentTwistSpeed = { vx: 0, vy: 0 };
    return;
  }

  if (touchHoldStartTime === 0) {
    touchHoldStartTime = now;
  }
  holdDurationSeconds = (now - touchHoldStartTime) / 1000;

  // Registrar trayectoria reciente (últimos 400ms)
  touchHistory.push({ x: tx, y: ty, t: now });
  while (touchHistory.length > 0 && now - touchHistory[0].t > 400) {
    touchHistory.shift();
  }

  // Medir velocidad instantánea y vibración
  const dt = Math.max(0.001, (now - lastTouchPos.time) / 1000);
  const dx = tx - lastTouchPos.x;
  const dy = ty - lastTouchPos.y;
  const speed = Math.hypot(dx, dy) / dt;
  currentTwistSpeed = { vx: dx / dt, vy: dy / dt };

  lastTouchPos = { x: tx, y: ty, time: now };

  if (touchHistory.length >= 4) {
    let totalPath = 0;
    for (let i = 1; i < touchHistory.length; i++) {
      totalPath += Math.hypot(touchHistory[i].x - touchHistory[i - 1].x, touchHistory[i].y - touchHistory[i - 1].y);
    }
    const netDisp = Math.hypot(
      touchHistory[touchHistory.length - 1].x - touchHistory[0].x,
      touchHistory[touchHistory.length - 1].y - touchHistory[0].y
    );

    // Oscilación repetida sobre zona reducida = alta distancia total con poco desplazamiento neto
    if (totalPath > 0.08 && netDisp < 0.05) {
      vibrationIntensity = clamp(vibrationIntensity + 0.15, 0, 1);
    } else {
      vibrationIntensity = clamp(vibrationIntensity - 0.08, 0, 1);
    }

    // Deslizar lentamente (velocidad suave sostenida)
    if (speed >= 0.03 && speed <= 0.35 && vibrationIntensity < 0.2) {
      isSlowSliding = true;
    } else {
      isSlowSliding = false;
    }
  }
}

// =====================================================================
// 6. MOTOR DE AUDIO Y REGLAS DE MAPEADO EN TIEMPO REAL
// =====================================================================
function updateAudioAndEffects() {
  const now = performance.now();

  // Sensores del teléfono
  const micLvl = tacto.get('mic.level') ?? 0;
  const micHz = tacto.get('mic.hz') ?? 0;

  const tn = tacto.get('touch.n') || 0;
  const tDown = (tacto.get('touch.down') || 0) > 0 || tn > 0;
  const tx = tacto.get('touch.x') ?? 0.5;
  const ty = tacto.get('touch.y') ?? 0.5;
  const tf = tacto.get('touch.f') ?? 0;
  const tdist = tacto.get('touch.dist') ?? 0;

  const anga = tacto.get('ang.a') ?? 0;
  const angb = tacto.get('ang.b') ?? 0;
  const angg = tacto.get('ang.g') ?? 0;

  // Seguimiento de gestos táctiles (hold, vibración, deslizamiento)
  trackTouchGestures(tx, ty, tDown, now);

  // A.5 Presión (touch.f) regula el ATTACK del sonido
  const calculatedAttack = 0.01 + clamp(tf * 0.95, 0, 0.99);
  $('#dispAttack').textContent = `${calculatedAttack.toFixed(2)} s`;
  $('#barAttack').style.width = `${Math.max(8, clamp(tf * 100))}%`;

  // A.6 Plano cartesiano táctil: escala dominante (Mayor, Menor, Aumentada, Disminuida)
  const activeScaleName = getScaleTypeFromCartesian(tx, ty);
  $('#dispChordType').textContent = activeScaleName;
  $('#chordBadgeMajor').classList.toggle('active', activeScaleName === 'Mayor');
  $('#chordBadgeMinor').classList.toggle('active', activeScaleName === 'Menor');
  $('#chordBadgeAug').classList.toggle('active', activeScaleName === 'Aumentada');
  $('#chordBadgeDim').classList.toggle('active', activeScaleName === 'Disminuida');

  // A.7 Giroscopio del celular:
  // Eje X (ang.b): Compresión (+ aumenta compresión, - reduce)
  const normX = clamp(angb / 60, -1, 1);
  const compThreshold = -20 - (normX * 20); // -40dB a 0dB
  const compRatio = clamp(4 + normX * 8, 1.2, 16);
  $('#dispCompressor').textContent = `${Math.round(compThreshold)} dB (${compRatio.toFixed(1)}:1)`;
  $('#barCompressor').style.width = `${clamp(((normX + 1) / 2) * 100)}%`;

  // Eje Y (ang.g): Release (+ aumenta, - reduce)
  const normY = clamp(angg / 45, -1, 1);
  const calculatedRelease = clamp(1.2 + normY * 1.1, 0.1, 3.5);
  $('#dispSustainRelease').textContent = `Rel: ${calculatedRelease.toFixed(2)}s`;
  $('#barRelease').style.width = `${clamp(((normY + 1) / 2) * 100)}%`;

  // Eje Z (ang.a): Sustain (+ aumenta, - reduce)
  const normZ = clamp((anga - 180) / 180, -1, 1);
  const calculatedSustain = clamp(0.7 + normZ * 0.5, 0.05, 1);

  // --- REGLAS DE PEDALES DE EFECTOS ---
  let revWet = 0, choWet = 0, dlyWet = 0, ovdWet = 0, ovdDist = 0.1;

  // Overdrive: controlado por presión (touch.f) o por 5 dedos
  if (tn >= 5) {
    ovdDist = clamp(0.3 + tdist * 1.5, 0.3, 0.95);
    ovdWet = 0.85;
  } else if (tf > 0.05) {
    ovdDist = clamp(tf * 1.4, 0.1, 0.9);
    ovdWet = clamp(tf * 1.2, 0.1, 0.85);
  }

  // Reverb: 4 dedos o giro beta
  if (tn === 4) {
    revWet = clamp(0.35 + tdist * 1.5, 0.2, 0.95);
  } else if (Math.abs(normX) > 0.35) {
    revWet = clamp((Math.abs(normX) - 0.35) * 1.3, 0, 0.75);
  }

  // Chorus: 3 dedos o rotación
  if (tn === 3) {
    choWet = 0.8;
  } else if (Math.abs(normZ) > 0.35) {
    choWet = clamp((Math.abs(normZ) - 0.35) * 1.2, 0, 0.7);
  }

  // Delay: 2 dedos con separación de dedos (tdist)
  if (tn === 2) {
    dlyWet = clamp(0.25 + tdist * 1.5, 0.2, 0.88);
  }

  // Tremolo: mantener dedos presionados (hold >= 2 segundos)
  let trmWet = 0;
  if (holdDurationSeconds >= 2) {
    trmWet = clamp((holdDurationSeconds - 2) / 4, 0, 0.95);
  }

  // Vibrato: gesto de vibrar dedos
  const vibWet = vibrationIntensity > 0.05 ? clamp(vibrationIntensity * 2.5, 0, 0.95) : 0;

  // Phaser: deslizar lentamente o giro gamma
  let phsWet = 0;
  if (isSlowSliding) {
    phsWet = 0.85;
  } else if (Math.abs(normY) > 0.4) {
    phsWet = clamp((Math.abs(normY) - 0.4) * 1.3, 0, 0.8);
  }

  // Actualizar indicadores visuales de los pedales en la UI (SIEMPRE VISIBLE)
  $('#dispValDrive').textContent = `${Math.round(ovdWet * 100)}%`;
  $('#barDrive').style.width = `${ovdWet * 100}%`;
  $('#pedalOverdrive').classList.toggle('active', ovdWet > 0.05);

  $('#dispValPhaser').textContent = `${Math.round(phsWet * 100)}%`;
  $('#barPhaser').style.width = `${phsWet * 100}%`;
  $('#pedalPhaser').classList.toggle('active', phsWet > 0.05);

  $('#dispValChorus').textContent = `${Math.round(choWet * 100)}%`;
  $('#barChorus').style.width = `${choWet * 100}%`;
  $('#pedalChorus').classList.toggle('active', choWet > 0.05);

  $('#dispValTremolo').textContent = `${Math.round(trmWet * 100)}%`;
  $('#barTremolo').style.width = `${trmWet * 100}%`;
  $('#pedalTremolo').classList.toggle('active', trmWet > 0.05);

  $('#dispValVibrato').textContent = `${Math.round(vibWet * 100)}%`;
  $('#barVibrato').style.width = `${vibWet * 100}%`;
  $('#pedalVibrato').classList.toggle('active', vibWet > 0.05);

  $('#dispValDelay').textContent = `${Math.round(dlyWet * 100)}%`;
  $('#barDelay').style.width = `${dlyWet * 100}%`;
  $('#pedalDelay').classList.toggle('active', dlyWet > 0.05);

  $('#dispValReverb').textContent = `${Math.round(revWet * 100)}%`;
  $('#barReverb').style.width = `${revWet * 100}%`;
  $('#pedalReverb').classList.toggle('active', revWet > 0.05);

  // Si el audio aún no está inicializado o no hay sampler, solo actualizamos coordenadas visuales
  if (!audioStarted || !currentSampler) {
    if (tDown) {
      touchCoords.textContent = `TACTO: ${tn} DEDO(S) · X: ${fmt(tx, 2)} · Y: ${fmt(ty, 2)} (HAZ CLIC EN POWER AUDIO)`;
    } else {
      touchCoords.textContent = 'TACTO: REPOSO (HAZ CLIC EN POWER AUDIO)';
    }
    return;
  }

  // Aplicar parámetros dinámicos a los nodos de Tone.js
  currentSampler.attack = calculatedAttack;
  currentSampler.release = calculatedRelease;
  currentSampler.sustain = calculatedSustain;

  compressor.threshold.value = compThreshold;
  compressor.ratio.value = compRatio;

  reverb.wet.value = revWet;
  if (revWet > 0.05) reverb.roomSize.value = 0.5 + revWet * 0.45;

  chorus.wet.value = choWet;
  tremolo.wet.value = trmWet;

  vibrato.wet.value = vibWet;
  vibrato.depth.value = vibWet * 0.8;

  delay.wet.value = dlyWet;
  if (dlyWet > 0.05) delay.feedback.value = clamp(0.2 + tdist * 0.8, 0.1, 0.85);

  phaser.wet.value = phsWet;

  overdrive.wet.value = ovdWet;
  overdrive.distortion = ovdDist;

  // --- GENERACIÓN MUSICAL: TACTO + MICRÓFONO ---
  // A.3: Si hay micrófono, detectar nota raíz por tono vocal (autocorrelación)
  if (micHz > 0) {
    const note = hzToClosestNote(micHz);
    if (note) lastDetectedNote = note;
  }

  const rootNote = lastDetectedNote || 'C3';
  const scaleNotes = buildScaleSequence(rootNote, activeScaleName);

  // A.4: Si el micrófono tiene volumen suficiente (> 0.22), reproduce secuencias rítmicas
  if (micLvl >= 0.22 && micLvl < 0.58) {
    // Loop melódico conducido por la voz
    const stepInterval = 170;
    if (now - lastStepTime > stepInterval) {
      scaleSequenceIndex = (scaleSequenceIndex + 1) % scaleNotes.length;
      const stepNote = scaleNotes[scaleSequenceIndex];
      currentSampler.releaseAll();
      currentSampler.triggerAttack(stepNote, undefined, 0.85);
      currentPlayingNote = stepNote;
      lastStepTime = now;
      isSounding = true;
    }
    touchCoords.textContent = `VOZ + TACTO · ESCALA: ${currentPlayingNote} (${activeScaleName})`;

  } else if (micLvl >= 0.58) {
    // Voz alta: arpegios rápidos
    const stepInterval = 130;
    if (now - lastStepTime > stepInterval) {
      const randIdx = Math.floor(Math.random() * scaleNotes.length);
      const randNote = scaleNotes[randIdx];
      currentSampler.releaseAll();
      currentSampler.triggerAttack(randNote, undefined, 0.95);
      currentPlayingNote = randNote;
      lastStepTime = now;
      isSounding = true;
    }
    touchCoords.textContent = `VOZ FUERTE · NOTAS: ${currentPlayingNote} (${activeScaleName})`;

  } else if (tDown) {
    // EL USUARIO ESTÁ TOCANDO LA PANTALLA:
    // El eje X selecciona la nota a lo largo de la escala activa (Mayor, Menor, etc.)
    const noteIdx = Math.floor(clamp(tx, 0, 0.999) * scaleNotes.length);
    const targetNote = scaleNotes[noteIdx];

    if (!isSounding || currentPlayingNote !== targetNote) {
      currentSampler.releaseAll();
      const vel = clamp(0.6 + tf * 0.4, 0.5, 1);
      currentSampler.triggerAttack(targetNote, undefined, vel);
      currentPlayingNote = targetNote;
      isSounding = true;
    }
    touchCoords.textContent = `TACTO SONANDO: ${targetNote} (${activeScaleName}) · ${tn} DEDO(S)`;

  } else {
    // Dedos levantados y micrófono en silencio
    if (isSounding) {
      currentSampler.releaseAll();
      isSounding = false;
      currentPlayingNote = null;
    }
    touchCoords.textContent = 'TACTO: REPOSO (TOCA LA PANTALLA PARA SONAR)';
  }
}

// =====================================================================
// 7. GRABADOR DE AUDIO MAESTRO (WAV & MP3)
// =====================================================================
let isRecording = false;
let recordStartTime = 0;
let recTimerInterval = null;
let recordNode = null;
let recordedBuffersL = [];
let recordedBuffersR = [];
let recordedWavBlob = null;
let recordedMp3Blob = null;

function setupMasterRecorder() {
  const ctx = Tone.context.rawContext;
  recordNode = ctx.createScriptProcessor(4096, 2, 2);
  
  recordNode.onaudioprocess = (e) => {
    if (!isRecording) return;
    const left = e.inputBuffer.getChannelData(0);
    const right = e.inputBuffer.getChannelData(1);
    recordedBuffersL.push(new Float32Array(left));
    recordedBuffersR.push(new Float32Array(right));
  };

  Tone.Destination.connect(recordNode);
  recordNode.connect(ctx.destination);
}

function encodeWAV(buffersL, buffersR, sampleRate) {
  let totalLength = 0;
  for (const b of buffersL) totalLength += b.length;

  const wavBuffer = new ArrayBuffer(44 + totalLength * 2);
  const view = new DataView(wavBuffer);

  const writeString = (offset, string) => {
    for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + totalLength * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, totalLength * 2, true);

  let offset = 44;
  for (let i = 0; i < buffersL.length; i++) {
    const l = buffersL[i], r = buffersR[i];
    for (let j = 0; j < l.length; j++) {
      const s = Math.max(-1, Math.min(1, (l[j] + r[j]) * 0.5));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      offset += 2;
    }
  }

  return new Blob([view], { type: 'audio/wav' });
}

function encodeMP3(buffersL, buffersR, sampleRate) {
  if (!window.lamejs) return null;
  const mp3encoder = new window.lamejs.Mp3Encoder(1, sampleRate, 128);
  const mp3Data = [];

  for (let i = 0; i < buffersL.length; i++) {
    const l = buffersL[i], r = buffersR[i];
    const samples = new Int16Array(l.length);
    for (let j = 0; j < l.length; j++) {
      const s = Math.max(-1, Math.min(1, (l[j] + r[j]) * 0.5));
      samples[j] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    const mp3buf = mp3encoder.encodeBuffer(samples);
    if (mp3buf.length > 0) mp3Data.push(mp3buf);
  }

  const end = mp3encoder.flush();
  if (end.length > 0) mp3Data.push(end);

  return new Blob(mp3Data, { type: 'audio/mp3' });
}

const btnRecord = $('#btnRecord');
const btnRecordText = $('#btnRecordText');
const recTimer = $('#recTimer');
const btnDownloadWAV = $('#btnDownloadWAV');
const btnDownloadMP3 = $('#btnDownloadMP3');

btnRecord.onclick = () => {
  if (!audioStarted) initAudioEngine();

  if (!isRecording) {
    recordedBuffersL = [];
    recordedBuffersR = [];
    recordedWavBlob = null;
    recordedMp3Blob = null;
    btnDownloadWAV.disabled = true;
    btnDownloadMP3.disabled = true;

    isRecording = true;
    recordStartTime = Date.now();
    btnRecord.classList.add('recording');
    btnRecordText.textContent = 'STOP / TAPE';
    recTimer.style.display = 'inline';

    recTimerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - recordStartTime) / 1000);
      const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
      const s = String(elapsed % 60).padStart(2, '0');
      recTimer.textContent = `${m}:${s}`;
    }, 500);

  } else {
    isRecording = false;
    clearInterval(recTimerInterval);
    btnRecord.classList.remove('recording');
    btnRecordText.textContent = 'REC / TAPE';
    recTimer.style.display = 'none';

    const sampleRate = Tone.context.rawContext.sampleRate || 44100;
    recordedWavBlob = encodeWAV(recordedBuffersL, recordedBuffersR, sampleRate);
    recordedMp3Blob = encodeMP3(recordedBuffersL, recordedBuffersR, sampleRate);

    if (recordedWavBlob) btnDownloadWAV.disabled = false;
    if (recordedMp3Blob) btnDownloadMP3.disabled = false;
  }
};

btnDownloadWAV.onclick = () => {
  if (!recordedWavBlob) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(recordedWavBlob);
  a.download = `roland-tr808-session-${Date.now()}.wav`;
  a.click();
};

btnDownloadMP3.onclick = () => {
  if (!recordedMp3Blob) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(recordedMp3Blob);
  a.download = `roland-tr808-session-${Date.now()}.mp3`;
  a.click();
};

// =====================================================================
// 8. LIENZO CENTRAL & REGLAS DE POST-PROCESADO VISUAL
// =====================================================================
const canvas = $('#canvas-visualizer');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const videoWebcam = $('#webcam-video');
const videoUploaded = $('#uploaded-video');
const selVisualSource = $('#selVisualSource');
const fileVideoInput = $('#fileVideoInput');

// Canvas auxiliar para procesamiento de efectos
const offCanvas = document.createElement('canvas');
const offCtx = offCanvas.getContext('2d', { willReadFrequently: true });

let webcamStream = null;
let visualMode = 'gen';

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.floor(rect.width * (window.devicePixelRatio || 1));
  canvas.height = Math.floor(rect.height * (window.devicePixelRatio || 1));
  offCanvas.width = canvas.width;
  offCanvas.height = canvas.height;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

selVisualSource.onchange = async (e) => {
  visualMode = e.target.value;
  if (webcamStream) {
    webcamStream.getTracks().forEach(t => t.stop());
    webcamStream = null;
  }
  videoWebcam.style.display = 'none';
  videoUploaded.style.display = 'none';

  if (visualMode === 'cam') {
    try {
      webcamStream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false });
      videoWebcam.srcObject = webcamStream;
      videoWebcam.style.display = 'block';
    } catch (err) {
      alert('Error en cámara web: ' + err.message);
      selVisualSource.value = 'gen';
      visualMode = 'gen';
    }
  } else if (visualMode === 'file') {
    fileVideoInput.click();
  }
};

fileVideoInput.onchange = (e) => {
  const file = e.target.files[0];
  if (file) {
    videoUploaded.src = URL.createObjectURL(file);
    videoUploaded.style.display = 'block';
    videoUploaded.play().catch(() => {});
  } else {
    selVisualSource.value = 'gen';
    visualMode = 'gen';
  }
};

// Nombres de los 12 canales TR-808
const TR808_TRACKS = ['CH', 'OH', 'CY', 'CB', 'CP', 'RS', 'HT', 'MT', 'LT', 'SD', 'BD', 'AC'];

function getTR808StepColor(c, alpha = 1) {
  if (c < 4) return `rgba(255, 59, 0, ${alpha})`;
  if (c < 8) return `rgba(255, 120, 0, ${alpha})`;
  if (c < 12) return `rgba(255, 235, 150, ${alpha})`;
  return `rgba(255, 255, 255, ${alpha})`;
}

let trStepTicker = 0;

// Renderizado de la matriz base TR-808
function drawBaseTR808Matrix(tCtx, w, h) {
  tCtx.fillStyle = '#09080c';
  tCtx.fillRect(0, 0, w, h);

  let audioEnergy = 0;
  if (analyser) {
    const vals = analyser.getValue();
    let sum = 0;
    for (let i = 0; i < vals.length; i++) sum += vals[i] * vals[i];
    audioEnergy = Math.min(1, Math.sqrt(sum / vals.length) * 3);
  }

  const numRows = 12;
  const numCols = 16;
  const labelWidth = Math.max(34, w * 0.05);
  const startX = labelWidth + 18;
  const availWidth = w - startX - 20;
  const stepX = availWidth / (numCols - 1);
  const topMargin = 24;
  const availHeight = h - topMargin * 2;
  const stepY = availHeight / (numRows - 1);

  const tx = tacto.get('touch.x');
  const ty = tacto.get('touch.y');
  const tf = tacto.get('touch.f') || 0;
  const activeCol = tx != null ? Math.round(tx * 15) : -1;
  const activeRow = ty != null ? Math.round(ty * 11) : -1;

  trStepTicker = (trStepTicker + 0.18) % 16;

  // 1. Etiquetas de pistas TR-808
  tCtx.font = 'bold 11px sans-serif';
  tCtx.textAlign = 'center';
  tCtx.textBaseline = 'middle';

  for (let r = 0; r < numRows; r++) {
    const cy = topMargin + r * stepY;
    const trackName = TR808_TRACKS[r];
    const isRowLit = (r === activeRow && isSounding) || (audioEnergy > 0.15 && (r % 3 === Math.floor(trStepTicker % 3)));

    tCtx.fillStyle = isRowLit ? '#ff5500' : '#f5edd9';
    tCtx.strokeStyle = '#111';
    tCtx.lineWidth = 1;
    const bw = labelWidth - 6;
    const bh = Math.min(18, stepY * 0.75);
    const bx = 8;
    const by = cy - bh / 2;

    tCtx.beginPath();
    tCtx.roundRect ? tCtx.roundRect(bx, by, bw, bh, 3) : tCtx.rect(bx, by, bw, bh);
    tCtx.fill();
    tCtx.stroke();

    tCtx.fillStyle = isRowLit ? '#ffffff' : '#111116';
    tCtx.fillText(trackName, bx + bw / 2, cy);
  }

  // 2. Cuadrícula de LEDs
  for (let r = 0; r < numRows; r++) {
    const cy = topMargin + r * stepY;
    for (let c = 0; c < numCols; c++) {
      const cx = startX + c * stepX;
      const color = getTR808StepColor(c, 1);

      let isLit = false;
      let ledRadius = 2.5;

      if (isSounding) {
        const distCol = Math.abs(c - activeCol);
        const distRow = Math.abs(r - activeRow);
        if (distCol <= 1 && distRow <= 1) {
          isLit = true;
          ledRadius = 8 + (tf * 6);
        } else if (c === activeCol || r === activeRow) {
          isLit = Math.random() > 0.35;
          ledRadius = 4.5;
        }
      }

      if (audioEnergy > 0.05 && Math.abs(c - Math.floor(trStepTicker)) <= 1) {
        if ((r * 3 + c * 2) % 5 === 0) {
          isLit = true;
          ledRadius = Math.max(ledRadius, 4 + audioEnergy * 8);
        }
      }

      tCtx.beginPath();
      tCtx.arc(cx, cy, ledRadius, 0, Math.PI * 2);

      if (isLit) {
        tCtx.fillStyle = color;
        tCtx.shadowColor = color;
        tCtx.shadowBlur = 12;
        tCtx.fill();
        tCtx.shadowBlur = 0;
      } else {
        tCtx.fillStyle = 'rgba(255, 255, 255, 0.12)';
        tCtx.fill();
      }
    }
  }
}

// B.8: Torsión localizada (Twist/Swirl) desde el punto exacto de contacto
function applyLocalizedTwist(targetCtx, cx, cy, radius, strength) {
  if (Math.abs(strength) < 0.05) return;
  const x0 = Math.max(0, Math.floor(cx - radius));
  const y0 = Math.max(0, Math.floor(cy - radius));
  const w = Math.min(targetCtx.canvas.width - x0, Math.ceil(radius * 2));
  const h = Math.min(targetCtx.canvas.height - y0, Math.ceil(radius * 2));
  if (w <= 0 || h <= 0) return;

  const imgData = targetCtx.getImageData(x0, y0, w, h);
  const src = new Uint32Array(imgData.data.buffer);
  const out = new Uint32Array(w * h);

  const r2 = radius * radius;

  for (let y = 0; y < h; y++) {
    const dy = y0 + y - cy;
    for (let x = 0; x < w; x++) {
      const dx = x0 + x - cx;
      const d2 = dx * dx + dy * dy;

      if (d2 < r2) {
        const d = Math.sqrt(d2);
        const theta = Math.atan2(dy, dx);
        const twistAngle = strength * Math.pow(1 - d / radius, 2);
        const newTheta = theta + twistAngle;

        const srcX = Math.round(cx - x0 + d * Math.cos(newTheta));
        const srcY = Math.round(cy - y0 + d * Math.sin(newTheta));

        if (srcX >= 0 && srcX < w && srcY >= 0 && srcY < h) {
          out[y * w + x] = src[srcY * w + srcX];
        } else {
          out[y * w + x] = src[y * w + x];
        }
      } else {
        out[y * w + x] = src[y * w + x];
      }
    }
  }

  imgData.data.set(new Uint8ClampedArray(out.buffer));
  targetCtx.putImageData(imgData, x0, y0);
}

// B.7: Efecto térmico (Heatmap) localizado únicamente en el área de vibración
function applyLocalizedThermal(targetCtx, cx, cy, radius, intensity) {
  if (intensity <= 0.05) return;
  const x0 = Math.max(0, Math.floor(cx - radius));
  const y0 = Math.max(0, Math.floor(cy - radius));
  const w = Math.min(targetCtx.canvas.width - x0, Math.ceil(radius * 2));
  const h = Math.min(targetCtx.canvas.height - y0, Math.ceil(radius * 2));
  if (w <= 0 || h <= 0) return;

  const imgData = targetCtx.getImageData(x0, y0, w, h);
  const data = imgData.data;
  const r2 = radius * radius;

  for (let y = 0; y < h; y++) {
    const dy = y0 + y - cy;
    for (let x = 0; x < w; x++) {
      const dx = x0 + x - cx;
      const d2 = dx * dx + dy * dy;

      if (d2 < r2) {
        const falloff = (1 - Math.sqrt(d2) / radius) * intensity;
        const idx = (y * w + x) * 4;
        const gray = (data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114) / 255;
        
        // Gradiente térmico falso: Azul -> Magenta -> Rojo -> Amarillo -> Blanco
        let tr = 0, tg = 0, tb = 0;
        if (gray < 0.25) {
          tb = 255; tr = gray * 4 * 255;
        } else if (gray < 0.5) {
          tr = 255; tb = (1 - (gray - 0.25) * 4) * 255;
        } else if (gray < 0.75) {
          tr = 255; tg = (gray - 0.5) * 4 * 255;
        } else {
          tr = 255; tg = 255; tb = (gray - 0.75) * 4 * 255;
        }

        data[idx] = data[idx] * (1 - falloff) + tr * falloff;
        data[idx + 1] = data[idx + 1] * (1 - falloff) + tg * falloff;
        data[idx + 2] = data[idx + 2] * (1 - falloff) + tb * falloff;
      }
    }
  }

  targetCtx.putImageData(imgData, x0, y0);
}

// B.2: Umbral (Threshold)
function applyThreshold(targetCtx, w, h, tdist) {
  const imgData = targetCtx.getImageData(0, 0, w, h);
  const data = imgData.data;
  const thresh = clamp(100 + tdist * 120, 60, 220);

  for (let i = 0; i < data.length; i += 4) {
    const v = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) >= thresh ? 255 : 0;
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
  }
  targetCtx.putImageData(imgData, 0, 0);
}

// B.5: Ruido (Noise)
function applyNoise(targetCtx, w, h, tdist) {
  const imgData = targetCtx.getImageData(0, 0, w, h);
  const data = imgData.data;
  const amount = clamp(tdist * 90, 20, 140);

  for (let i = 0; i < data.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    data[i] = clamp(data[i] + n, 0, 255);
    data[i + 1] = clamp(data[i + 1] + n, 0, 255);
    data[i + 2] = clamp(data[i + 2] + n, 0, 255);
  }
  targetCtx.putImageData(imgData, 0, 0);
}

// B.3: Aberración cromática
function applyChromaticAberration(targetCtx, offCanvasSource, w, h, offset) {
  targetCtx.clearRect(0, 0, w, h);
  targetCtx.globalCompositeOperation = 'source-over';
  targetCtx.drawImage(offCanvasSource, -offset, 0);
  targetCtx.globalCompositeOperation = 'screen';
  targetCtx.drawImage(offCanvasSource, offset, 0);
  targetCtx.globalCompositeOperation = 'source-over';
}

// =====================================================================
// LOOP PRINCIPAL DE RENDERIZADO VISUAL A 60 FPS
// =====================================================================
function renderVisualizer() {
  requestAnimationFrame(renderVisualizer);

  // 1. Actualizar audio y efectos en cada cuadro
  updateAudioAndEffects();

  const w = canvas.width;
  const h = canvas.height;
  if (!w || !h) return;

  const tn = tacto.get('touch.n') || 0;
  const tx = tacto.get('touch.x') ?? 0.5;
  const ty = tacto.get('touch.y') ?? 0.5;
  const tdist = tacto.get('touch.dist') ?? 0;
  const isDown = (tacto.get('touch.down') || 0) > 0 || tn > 0;

  // B.1: Posición de los dedos regula Saturación (X) y Contraste (Y)
  const satValue = clamp(tx * 2.5, 0.1, 2.8);
  const conValue = clamp((1 - ty) * 2.5, 0.5, 2.5);

  // B.6: Hold >= 5s activa efecto GLOW
  let glowPx = 0;
  if (holdDurationSeconds >= 5) {
    glowPx = clamp((holdDurationSeconds - 5) * 2.5, 0, 25);
  }

  // B.4: 4 dedos = Desenfoque (Blur)
  let blurPx = 0;
  if (tn === 4) {
    blurPx = clamp(tdist * 28, 2, 25);
  }

  // Componer filtros CSS para el pase intermedio
  let filterStr = `saturate(${satValue.toFixed(2)}) contrast(${conValue.toFixed(2)})`;
  if (blurPx > 0) filterStr += ` blur(${blurPx.toFixed(1)}px)`;
  if (glowPx > 0) filterStr += ` drop-shadow(0 0 ${glowPx.toFixed(1)}px #ff5500)`;

  offCtx.filter = filterStr;

  // 2. Dibujar fuente visual base en offCanvas
  if (visualMode === 'gen') {
    drawBaseTR808Matrix(offCtx, w, h);
  } else if (visualMode === 'cam' && videoWebcam.readyState >= 2) {
    offCtx.drawImage(videoWebcam, 0, 0, w, h);
  } else if (visualMode === 'file' && videoUploaded.readyState >= 2) {
    offCtx.drawImage(videoUploaded, 0, 0, w, h);
  } else {
    drawBaseTR808Matrix(offCtx, w, h);
  }

  offCtx.filter = 'none';

  // 3. Post-procesado específico según cantidad de dedos y gestos
  ctx.clearRect(0, 0, w, h);

  if (tn === 3) {
    // B.3: 3 dedos = Aberración Cromática (proporcional a touch.dist)
    const offset = Math.max(2, Math.round(tdist * 32));
    applyChromaticAberration(ctx, offCanvas, w, h, offset);
  } else {
    ctx.drawImage(offCanvas, 0, 0);
  }

  if (tn === 2) {
    // B.2: 2 dedos = Efecto Umbral (Threshold)
    applyThreshold(ctx, w, h, tdist);
  } else if (tn >= 5) {
    // B.5: 5 dedos = Ruido de imagen
    applyNoise(ctx, w, h, tdist);
  }

  // B.7: Vibrar dedos activa Efecto Térmico localizado
  if (isDown && vibrationIntensity > 0.1) {
    const touchRadius = Math.max(50, Math.round(w * 0.12));
    applyLocalizedThermal(ctx, tx * w, ty * h, touchRadius, vibrationIntensity);
  }

  // B.8: Deslizar dedos (Torsión/Twist localizada únicamente en el punto de contacto)
  if (isDown && (Math.abs(currentTwistSpeed.vx) > 0.05 || Math.abs(currentTwistSpeed.vy) > 0.05)) {
    const twistStrength = (currentTwistSpeed.vx + currentTwistSpeed.vy) * 2.8;
    const twistRadius = Math.max(60, Math.round(w * 0.14));
    applyLocalizedTwist(ctx, tx * w, ty * h, twistRadius, clamp(twistStrength, -3.5, 3.5));
  }

  // 4. Dibujar halos de dedos estilo Roland TR-808
  for (let i = 1; i <= Math.min(5, tn); i++) {
    const fx = tacto.get(`t${i}.x`);
    const fy = tacto.get(`t${i}.y`);
    const fd = tacto.get(`t${i}.d`) || 40;

    if (fx != null && fy != null) {
      const cx = fx * w;
      const cy = fy * h;
      const rad = Math.max(16, (fd / 2) * (w / 800));

      ctx.beginPath();
      ctx.arc(cx, cy, rad + 4, 0, Math.PI * 2);
      ctx.strokeStyle = '#ff5500';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = '#ff5500';
      ctx.shadowBlur = 12;
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 85, 0, 0.25)';
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`D${i}`, cx, cy - rad - 8);
    }
  }
}

// =====================================================================
// 9. ARRANQUE
// =====================================================================
try {
  buildAudioChain();
} catch (e) {
  console.warn('Error al iniciar cadena de audio:', e);
}

tacto.connect().then(() => {
  updateConnectionUI();
  setupQR();
}).catch(err => {
  console.error('Error conectando Tacto:', err);
});

renderVisualizer();
