# Tacto · el teléfono como control remoto de una experiencia web

Tacto convierte el teléfono (iPhone o Android, solo con el navegador, sin instalar nada) en un **control remoto táctil** para una experiencia web con audio e imagen. El teléfono mide qué hace tu mano: dónde toca, con cuántos dedos, con qué presión y diámetro, y cómo gira el aparato. Esos datos viajan por **MQTT** hasta una página en el computador, donde un **panel de conexiones** los enlaza con variables de sonido e imagen.

Está pensado como herramienta de curso: cada estudiante levanta su propio sistema en su computador, sin hosting especial, y puede después copiar la librería `tacto.js` a sus propias plataformas.

## Contenido

1. [Cómo funciona](#1-cómo-funciona)
2. [Puesta en marcha](#2-puesta-en-marcha)
3. [Archivos del proyecto](#3-archivos-del-proyecto)
4. [La página del teléfono](#4-la-página-del-teléfono)
5. [Mensajes MQTT](#5-mensajes-mqtt)
6. [Canales: lo que ve la experiencia](#6-canales-lo-que-ve-la-experiencia)
7. [La experiencia y el panel de conexiones](#7-la-experiencia-y-el-panel-de-conexiones)
8. [Variables de salida](#8-variables-de-salida)
9. [Dos formas de montarlo](#9-dos-formas-de-montarlo)
10. [Usar Tacto en tus propias experiencias](#10-usar-tacto-en-tus-propias-experiencias)
11. [Otras herramientas MQTT](#11-otras-herramientas-mqtt)
12. [Variables de entorno del servidor](#12-variables-de-entorno-del-servidor)
13. [Limitaciones conocidas](#13-limitaciones-conocidas)
14. [Solución de problemas](#14-solución-de-problemas)

---

## 1. Cómo funciona

```
 Teléfono (iOS / Android, solo navegador)            Computador
 ┌───────────────────────────────┐    MQTT     ┌────────────────────────────────────────────┐
 │ tacto: X, Y, dedos, presión,  │  sobre      │ Broker MQTT  ──►  Experiencia web (/exp)   │
 │ diámetro · giro 3 ejes ·      │ ─────────►  │ (embebido)         audio + imagen +        │
 │ micrófono · cámara (opcional) │  WebSocket  │      │             panel de conexiones     │
 └───────────────────────────────┘             │      └──► otras herramientas (TCP 1883)    │
                                               └────────────────────────────────────────────┘
```

Tres piezas:

| Pieza | Qué es | Dónde vive |
|---|---|---|
| **Página del teléfono** | Lee el tacto y los sensores y los publica por MQTT. | `public/index.html` |
| **Broker MQTT** | El "cartero": recibe lo que publica el teléfono y se lo entrega a quien esté suscrito. | Dentro de `server.js` (Aedes) |
| **Experiencia** | Se suscribe a los datos, los convierte en canales y los lleva a audio e imagen según el panel. | `public/exp.html` + `exp.js` |

Por qué MQTT: es un protocolo ligero de publicar/suscribir, pensado para flujos de datos pequeños y frecuentes. El teléfono no necesita saber quién escucha, y varias herramientas pueden escuchar a la vez (la experiencia, un Arduino, Node-RED, un script de Python). Además queda como herramienta nueva en el repertorio de los estudiantes.

**Salas.** Cada conexión usa un código de sala (por ejemplo `k7m2xq`). Todos los temas MQTT cuelgan de `tacto/<sala>/…`, así que varios estudiantes pueden compartir un broker sin mezclarse. La experiencia genera la sala y la muestra con un QR.

**Recorrido de un toque**, de punta a punta:

1. El dedo toca la superficie del teléfono. El navegador entrega un `TouchEvent` con posición, `force` (presión) y `radiusX/radiusY` (tamaño del contacto).
2. `index.html` lo normaliza (X e Y entre 0 y 1) y lo publica en `tacto/<sala>/<dispositivo>/touch`, como mucho una vez por cuadro de pantalla (~60 por segundo).
3. El broker lo reenvía a la experiencia.
4. `tacto.js` lo descompone en **canales** planos (`touch.x`, `touch.f`, `t2.y`…).
5. Cada **conexión** del panel toma un canal, lo reescala (rango, curva, inversión, suavizado) y lo escribe en una **variable de salida** (filtro, volumen, zoom, tono de color…).
6. La variable cambia el audio (Web Audio) o la imagen (filtros y transformaciones CSS) en ese mismo cuadro.

---

## 2. Puesta en marcha

Requisitos: [Node.js](https://nodejs.org) 18 o superior, y que computador y teléfono estén en la **misma red** (el hotspot del teléfono, conexión USB compartida o el WiFi de la casa). La red de la universidad suele bloquear la conexión entre dispositivos; usa el hotspot.

```bash
npm install        # solo la primera vez
node server.js
```

> En PowerShell, `npm start` puede fallar por la política de ejecución de scripts. Usa `node server.js` (o `npm.cmd start`); no hace falta cambiar ninguna política.

El servidor imprime algo así:

```
  Tacto
  Experiencia (computador):  https://localhost:8443/exp
  Teléfonos entran a:        https://172.20.10.2:8443
  Broker MQTT:  wss://localhost:8443/mqtt   ·   tcp :1883
```

**En el computador**

1. Abre `https://localhost:8443/exp`. El navegador avisa que el certificado no es de confianza: es normal, lo generó tu propio computador. Acepta continuar.
2. Pulsa **Activar audio** (los navegadores exigen un gesto del usuario para sonar).

**En el teléfono**

1. Escanea el QR de la experiencia (o escribe la dirección que aparece bajo "Conectar el teléfono").
2. Acepta el aviso del certificado: iPhone, *Mostrar detalles → visitar este sitio web*; Android, *Avanzado → Continuar*.
3. Escribe tu nombre y pulsa **Conectar**. Acepta el permiso de movimiento cuando lo pida.
4. Arriba debe decir **● conectado**. En el computador, el teléfono aparece en el selector "Teléfono".
5. Toca la pantalla: el panel de la derecha ya trae conexiones de ejemplo (el tono, el filtro y el zoom responden).

**Sin teléfono:** arrastra el ratón sobre la imagen de la experiencia. Actúa como un teléfono virtual llamado "ratón" (casilla "Ratón como teléfono").

Para una prueba guiada con teléfonos reales, mira [PRUEBA_1.md](PRUEBA_1.md).

**Por qué HTTPS.** Los sensores de movimiento y el micrófono solo funcionan en "contexto seguro". El servidor crea un certificado autofirmado (carpeta `.cert/`) y lo regenera solo si cambian las direcciones IP del computador. El tacto funciona igual sin HTTPS, pero el giro no.

---

## 3. Archivos del proyecto

```
05_TACTO/
├─ server.js            Servidor: sirve las páginas, el broker MQTT, el QR y /info
├─ package.json         Dependencias: express, aedes, mqtt, ws, qrcode, selfsigned
├─ README.md            Este documento
├─ .github/workflows/pages.yml   Publica public/ en GitHub Pages
├─ .gitignore           Excluye node_modules, .cert y el prototipo _v1
├─ PRUEBA_1.md          Guía de prueba con teléfonos reales y tabla de resultados
├─ .cert/               Certificado autofirmado (se crea solo)
├─ _v1/                 Prototipo anterior (WebSocket + instrumento sonoro), archivado
└─ public/
   ├─ index.html        Página del teléfono
   ├─ exp.html          Estructura de la experiencia
   ├─ exp.js            Lógica de la experiencia: salidas de audio/imagen, panel de conexiones
   ├─ fisica.js         Física de materiales (tela, agua, squishy, remolino) y dibujo WebGL
   ├─ tacto.js          Librería compartida: conexión MQTT, salas, catálogo de canales
   ├─ ui.css            Estilos compartidos (variables de color, controles, foco)
   ├─ config.js         Configuración opcional (broker propio, dirección de la página del teléfono)
   ├─ vendor/mqtt.min.js   Cliente MQTT local (sin depender de CDN)
   ├─ .nojekyll         Evita que Pages procese los archivos con Jekyll
   ├─ manifest.webmanifest, icon.svg   Para "Añadir a pantalla de inicio"
```

**`server.js`** hace cuatro cosas:

- Sirve `public/` con Express (`/exp` entrega `exp.html`).
- Sirve `mqtt.min.js` desde `node_modules` en `/vendor`, para que funcione sin internet.
- Corre un broker Aedes: MQTT sobre WebSocket en `/mqtt` (navegadores) y MQTT sobre TCP en el puerto 1883 (herramientas externas).
- Responde `/info` (dirección base, estado del broker) y `/qr.svg?u=…` (genera el QR).

En el terminal registra `+ mqtt <id>` y `- mqtt <id>` cada vez que un cliente entra o sale: sirve para comprobar que el teléfono llegó.

---

## 4. La página del teléfono

`public/index.html` tiene dos estados: formulario de entrada (nombre y sala) y vista de control.

### Tacto

Se leen con **Touch Events** (`targetTouches`), que son los que traen presión y radio de contacto. Para probar desde un computador cae a **Pointer Events** (ratón o lápiz).

| Dato | Origen en el navegador | Resultado |
|---|---|---|
| Posición X, Y | `clientX/Y` relativo a la superficie | 0–1 |
| Cantidad de dedos | `targetTouches.length` | 0–5 |
| Presión | `Touch.force` | 0–1 |
| Diámetro del contacto | `radiusX + radiusY` (el diámetro medio de la elipse) | píxeles |

Cada dedo apoyado recibe una **casilla estable de 1 a 5** que conserva mientras siga tocando. Así `t1` es siempre el primer dedo que apoyaste, aunque levantes otro.

**Envío:** el movimiento se publica una vez por cuadro (≈60/s, calidad de servicio 0). Cuando **cambia la cantidad de dedos** se publica de inmediato con entrega garantizada (QoS 1), para no perder nunca un "apoyó" o un "soltó".

**Presión y diámetro dependen del teléfono.** El navegador solo los entrega si el hardware los mide. Muchos teléfonos Android dan ambos; algunos iPhone no entregan presión útil. Por eso la página mide, en vivo, la calidad de cada dato y la muestra abajo de la superficie:

- *variable*: cambia al apretar; sirve como control.
- *constante*: el teléfono entrega un valor fijo; no sirve.
- *sin dato*: siempre cero.

Si la presión no sirve en tu teléfono, el diámetro del contacto (que crece al apretar más) es el sustituto más cercano. Esta información viaja también en el estado del dispositivo (`caps`).

### Giro

Con el botón **Giro** (se activa solo al conectar si das permiso):

- `deviceorientation`: ángulos alfa, beta y gamma en grados.
- `devicemotion`: velocidad de giro (°/s) y aceleración con gravedad (m/s²).

iOS exige un permiso explícito, pedido desde un toque del usuario. Si lo negaste, cierra Safari por completo y vuelve a entrar. Se publica cada 33 ms (≈30/s).

### Micrófono y cámara (opcionales)

- **Micrófono:** se mide el nivel (RMS) y tres bandas de frecuencia (graves 40–250 Hz, medios 250–2000 Hz, agudos 2–8 kHz) cada 50 ms. El audio no sale del teléfono: solo viajan los números.
- **Cámara:** se reduce la imagen a 64×36, se compara con el cuadro anterior y se calcula la fracción de píxeles que cambió, el centro de ese movimiento y el brillo medio, cada 80 ms. **El video no sale del teléfono.**

### Otras cosas que hace

- Mantiene la pantalla encendida (Wake Lock). Si bloqueas la pantalla, el navegador suspende los sensores y el envío se detiene.
- Publica su estado como mensaje *retained* con **último testamento** (ver sección 5): si el teléfono se cae, la experiencia se entera y no deja nada "apretado".
- Responde a los *ping* de la experiencia para medir la latencia.
- Guarda nombre, sala e identificador de dispositivo en el navegador, para no repetirlos.
- En iPhone, "Añadir a pantalla de inicio" evita los gestos de borde de Safari.

---

## 5. Mensajes MQTT

Todos los mensajes son JSON, bajo `tacto/<sala>/<dispositivo>/…`. `<dispositivo>` es un identificador aleatorio de 6 caracteres que cada teléfono guarda.

| Tema | Retenido | Contenido |
|---|---|---|
| `…/status` | sí | `{ online, name, caps }`. `caps` indica la calidad de presión y diámetro y qué módulos están activos. |
| `…/touch` | no | `{ t, n, ar, p:[{ i, x, y, f, d }] }` |
| `…/motion` | no | `{ t, a:[alfa,beta,gamma], r:[x,y,z], c:[x,y,z] }` |
| `…/mic` | no | `{ t, l, b:[graves,medios,agudos] }` |
| `…/cam` | no | `{ t, m, x, y, b }` |
| `…/cmd` | no | Lo publica la experiencia: `{ ping }` |
| `…/pong` | no | Respuesta del teléfono: `{ t }` |

Campos de `touch`: `t` marca de tiempo en ms; `n` cantidad de dedos; `ar` proporción ancho/alto de la superficie (se usa para medir distancias entre dedos sin deformarlas); `p` lista de dedos con `i` casilla 1–5, `x`/`y` posición 0–1, `f` presión 0–1 y `d` diámetro en px.

Campos de `motion`: `a` orientación en grados; `r` velocidad de giro en °/s, en orden [X, Y, Z]; `c` aceleración en m/s².

**Último testamento (LWT).** Al conectarse, el teléfono le deja al broker un mensaje de despedida: "publica `status {online:false}` si me caigo". Si la conexión se corta sin aviso (batería, túnel, pantalla bloqueada), el broker lo publica por él. La experiencia, al ver `online:false`, pone en cero dedos, presión y diámetro, así que ningún sonido queda sonando por un teléfono que ya no está.

**Latencia.** Cada 2 segundos la experiencia manda un `ping` con su reloj; el teléfono lo devuelve en `pong`. La diferencia es el tiempo de ida y vuelta pasando por el broker. La cabecera muestra la mediana de las últimas 40 mediciones. En red local típicamente son pocos milisegundos.

---

## 6. Canales: lo que ve la experiencia

`tacto.js` toma cada mensaje y lo aplana en **canales**, números con nombre fijo y un rango habitual. Son las "entradas" del panel.

| Canal | Qué es | Rango |
|---|---|---|
| `touch.n` | dedos apoyados | 0–5 |
| `touch.down` | hay al menos un dedo (0/1) | 0–1 |
| `touch.x`, `touch.y` | promedio de la posición de todos los dedos | 0–1 |
| `touch.f` | presión máxima entre los dedos | 0–1 |
| `touch.d` | diámetro medio entre los dedos | 0–120 px |
| `touch.dist` | distancia entre los dedos 1 y 2 (en la unidad del ancho; corregida por proporción) | 0–1.5 |
| `touch.ang` | ángulo de la línea dedo 1 → dedo 2 | −180–180° |
| `t1.x` … `t5.x`, `.y`, `.f`, `.d` | cada dedo por separado | 0–1, px |
| `ang.a`, `ang.b`, `ang.g` | orientación alfa, beta, gamma | 0–360°, ±180°, ±90° |
| `rot.x`, `rot.y`, `rot.z` | velocidad de giro | ±360 °/s |
| `acc.x`, `acc.y`, `acc.z` | aceleración con gravedad | ±20 m/s² |
| `mic.level`, `mic.low`, `mic.mid`, `mic.high` | nivel y bandas | 0–1 |
| `cam.motion`, `cam.x`, `cam.y`, `cam.bright` | movimiento, su centro y brillo | 0–1 |

Detalles útiles:

- Un canal vale `null` hasta que llega su primer dato. El panel muestra "sin datos".
- Al soltar un dedo, su presión y diámetro vuelven a 0, pero su X e Y **conservan la última posición**, para que un sonido no salte al soltar.
- Con dos dedos o más, `touch.x/y` son el punto medio, útil como "centro de la mano".
- Hay ejes y signos que dependen del teléfono; por eso `PRUEBA_1.md` pide anotar cómo se comportan `ang.*` y `rot.*` en iPhone y en Android.

---

## 7. La experiencia y el panel de conexiones

`exp.html` + `exp.js`, en `/exp`. Tres columnas:

- **Entradas (izquierda):** monitor en vivo de todos los canales, agrupados, con barra de valor. Sirve para ver qué entrega tu teléfono.
- **Escenario (centro):** la imagen, con los toques del teléfono dibujados encima; las fuentes de audio e imagen; el QR para conectar.
- **Conexiones (derecha):** el panel de mapeo.

### Cabecera

Estado de la conexión, broker usado, selector de teléfono (*automático* usa el que más recientemente envió datos), latencia, sala (editable; **Nueva** crea otra) y **Activar audio**.

### Fuentes

- **Audio:** oscilador (onda a elección: sierra, triángulo, seno, cuadrada) o un **archivo de audio** que se repite en bucle. Un osciloscopio muestra la salida.
- **Imagen:** una animación generada, o un **archivo de video**. Casilla para mostrar u ocultar los toques del teléfono.

### Física del material

La imagen (animación, video o cámara web) se dibuja en WebGL sobre una grilla de 96×54 puntos que los dedos deforman, como si tocaras la imagen. La deformación es temporal: se apaga sola en unos segundos ("recuperación", 2,5 s por defecto).

| Material | Qué hace | Cómo responde al tacto |
|---|---|---|
| **Tela** | Se arrastra y se estira, ondula y vuelve. | El dedo arrastra la tela; la presión la hunde (sombra). Con varios dedos se estira entre ellos. |
| **Agua** | Ondas que se expanden y se reflejan en los bordes. | Cada apoyo es una gota; al presionar emite anillos; al mover deja estela. |
| **Squishy** | Gelatina: se abulta bajo el dedo y rebota. | Cuanto más presión, más se hunde; al soltar oscila y se asienta. |
| **Remolino** | La imagen gira alrededor del dedo. | Mantener el toque aumenta el giro; mover arrastra el remolino. |

Se elige con los botones de la tarjeta "Física del material" o con las teclas **1–5** (también en pantalla completa). Cuatro deslizadores ajustan el efecto: **intensidad**, **recuperación** (segundos), **tamaño del toque** y **relieve** (luz y sombra). Los cuatro aparecen como variables de salida en el grupo **Física** del panel de conexiones, así que se pueden controlar con un sensor (por ejemplo, `touch.f` → `fisica.intensidad`, o `ang.g` → `fisica.tamano`).

La física usa por dedo: posición, desplazamiento y velocidad, presión (si el teléfono no la entrega, se asume 0,5) y diámetro del contacto (define el tamaño de la zona afectada). Si el navegador no permite WebGL, la imagen se muestra sin deformar.

Para crear un material nuevo, edita `public/fisica.js`: agrega su apariencia en `MATERIALES` y su física en `step()`, y un botón en `exp.html`.

### Conexiones

Cada fila lleva una **entrada** a una **variable de salida**:

| Control | Qué hace |
|---|---|
| Casilla | Activa o desactiva la conexión. |
| Entrada → Salida | Qué canal controla qué variable. |
| **Aprender** | Pulsa y mueve el teléfono (u opera el control): elige la entrada que más cambie durante 8 segundos. |
| Rango de entrada | Qué parte del canal cuenta. Por ejemplo, `touch.d` de 10 a 90 px. |
| Rango de salida | Entre qué valores se mueve la variable. |
| Curva | *lineal*, *suave* (en S), *acelerada* (cuadrática) o *rápida* (raíz). |
| Invertir | Da vuelta la relación (arriba = poco). |
| Suavizado | Promedio con el valor anterior; 0 = instantáneo, cerca de 1 = muy lento. Quita el temblor. |
| Medidor | Barra violeta (entrada normalizada), barra lima (salida), y los valores `entrada → salida`. |
| ✕ | Elimina la conexión. |

**Cómo se calcula** (en cada cuadro de pantalla, para cada conexión activa):

1. Lee el canal. Si no hay dato, la conexión no actúa.
2. Normaliza: `(valor − mínimo de entrada) / (máximo − mínimo)`, limitado a 0–1.
3. Invierte si corresponde y aplica la curva.
4. Suaviza con el valor del cuadro anterior.
5. Escala al rango de salida. Las variables marcadas como logarítmicas (frecuencias) se escalan en proporción geométrica, que suena más natural.
6. Escribe el resultado en la variable.

**Reglas de comportamiento:**

- Si dos conexiones apuntan a la misma variable, **gana la última de la lista**.
- Cuando una variable deja de recibir control (se desactiva la conexión o se suelta el control), **vuelve a su valor base**.
- Las variables tipo **disparador** (`audio.gate`) se comportan como interruptor: la entrada normalizada ≥ 0,5 las abre. Si el teléfono desaparece, el disparador se cierra.

**Ejemplo incluido** (botón **Ejemplo**; se carga la primera vez):

| Entrada | Salida | Efecto |
|---|---|---|
| `touch.down` | `audio.gate` | Suena solo mientras hay un dedo apoyado |
| `touch.x` | `audio.tono` (−12…24 semitonos) | Izquierda–derecha cambia la nota |
| `touch.y` | `audio.filtro` (200…9000 Hz, invertido) | Arriba abre el filtro |
| `touch.n` | `audio.delay.mezcla` | Más dedos, más eco |
| `touch.d` | `video.zoom` (1…2,2) | Un contacto más grande acerca la imagen |
| `ang.g` | `video.tono` (0…360°) | Inclinar el teléfono rota el color |
| `touch.f` | `video.brillo` (1…2) | Apretar ilumina |

### Guardado

Las conexiones se guardan solas en el navegador (`localStorage`), así que al volver siguen ahí. **Exportar** descarga un archivo `tacto-conexiones.json`; **Importar** lo carga en otro computador o navegador. El audio y el video que cargas **no** se guardan: hay que volver a elegirlos.

---

## 8. Variables de salida

Todas aparecen en el panel de forma automática.

**Audio** (Web Audio). Cadena: fuente → envolvente (disparador) → filtro pasa-bajos → [directo | delay | reverb] → paneo → volumen → compresor → salida.

| Variable | Rango | Notas |
|---|---|---|
| `audio.volumen` | 0–1 | |
| `audio.frecuencia` | 60–2000 Hz | Solo con oscilador; logarítmica |
| `audio.tono` | −24 a 24 semitonos | Afecta oscilador y archivo |
| `audio.filtro` | 80–12000 Hz | Frecuencia de corte; logarítmica |
| `audio.resonancia` | 0,1–20 | |
| `audio.delay.mezcla` | 0–1 | Cantidad de eco |
| `audio.delay.tiempo` | 0,02–1 s | |
| `audio.delay.feedback` | 0–0,9 | Repeticiones del eco |
| `audio.reverb.mezcla` | 0–1 | Reverberación sintética de 2,4 s |
| `audio.pan` | −1 a 1 | Izquierda–derecha |
| `audio.gate` | 0/1 | Suena / calla |

**Imagen** (filtros y transformaciones CSS sobre el escenario).

| Variable | Rango |
|---|---|
| `video.brillo`, `video.contraste` | 0,2–3 |
| `video.saturacion` | 0–4 |
| `video.tono` | 0–360° |
| `video.desenfoque` | 0–20 px |
| `video.invertir` | 0–1 |
| `video.zoom` | 0,5–4 |
| `video.rotacion` | ±180° |
| `video.posx`, `video.posy` | ±50 % |
| `video.opacidad` | 0–1 |
| `video.velocidad` | 0,1–4 (animación y video) |
| `video.posicion` | 0–1 (punto del video; solo con video) |

**Agregar una variable propia:** en `exp.js`, sección SALIDAS, una línea basta:

```js
tgt('audio.mi.variable', 'Audio', 'etiqueta visible', min, max, valorBase, { apply: v => /* lo que haga */ });
```

Aparece sola en el panel. Para imagen existe el atajo `vt(id, etiqueta, min, max, base)`.

---

## 9. Dos formas de montarlo

| | **Local** (por defecto) | **Público** (GitHub Pages) |
|---|---|---|
| Quién sirve las páginas | `node server.js` | Las publicas en GitHub Pages |
| Broker | El embebido (`/mqtt`) | Uno público de prueba (`wss://broker.emqx.io:8084/mqtt`) o uno tuyo |
| Latencia | Baja (misma red) | La del servidor del broker |
| Aviso de certificado | Sí (autofirmado) | No |
| iPhone | Por verificar el WebSocket seguro con certificado autofirmado | Sin avisos |
| Requiere | Node.js | Nada que ejecutar |

**Cómo elige el broker `tacto.js`**, en este orden:

1. Parámetro `?broker=wss://…` en la dirección.
2. `TACTO_CONFIG.broker` en `config.js`.
3. Si la página la sirve el servidor de Tacto (`/info` responde), su propio `/mqtt`.
4. El broker público de prueba.

**Con GitHub Pages** no hace falta configurar nada (usa el broker público). Para usar tu propio broker, o si la página del teléfono vive en otro sitio, edita `public/config.js`:

```js
window.TACTO_CONFIG = {
  broker: 'wss://mi-broker.example.com:8884/mqtt',     // opcional
  phoneUrl: 'https://tu-usuario.github.io/tacto/',     // opcional: por defecto, la carpeta donde está exp.html
};
```

En este modo la experiencia genera el QR en el navegador y muestra la dirección completa, con la sala y el broker incluidos.

**Ojo con el broker público:** cualquiera que conozca (o adivine) tu sala puede leer y publicar en ella. Usa una sala larga y no mandes nada sensible. Si el curso lo necesita, un broker propio (Mosquitto, EMQX, HiveMQ Cloud) elimina el problema.

---

### Velocidad: cuándo usar cada modo

El modo público es más lento porque cada mensaje viaja hasta el servidor del broker y vuelve. Medido desde Chile (ida y vuelta de un mensaje, mediana de 20):

| Broker | Ida y vuelta |
|---|---|
| Local (`node server.js`, misma red) | ~7 ms |
| `broker.emqx.io` (público, usado por Pages) | ~210 ms |
| `broker.hivemq.com` (público) | ~240 ms |

Esa diferencia se nota al tocar y oír el sonido, y no se corrige con código: depende de la distancia al servidor.

- **Para trabajar, ensayar y presentar en vivo: modo local.** Es unas 30 veces más rápido. Usa `node server.js` con el teléfono en el hotspot.
- **Para compartir, mostrar el proyecto o probar desde cualquier lugar: GitHub Pages.** Funciona sin instalar nada, pero con ~200 ms de retraso.
- **Si necesitas Pages y menos retraso:** crea un broker propio en la región más cercana (HiveMQ Cloud, EMQX Cloud…) y ponlo en `config.js`. Mide el resultado con la latencia que muestra la cabecera de la experiencia.

Pages y el broker local no se pueden mezclar para el teléfono: Pages usa HTTPS, y el navegador bloquea las conexiones inseguras desde una página HTTPS; un broker local con certificado autofirmado genera avisos y puede fallar en iPhone.

### Publicar en GitHub Pages, paso a paso

El repositorio ya trae todo lo necesario: la carpeta `public/` es el sitio completo (incluye `vendor/mqtt.min.js`, así que no depende de internet para cargar MQTT), y `.github/workflows/pages.yml` lo publica solo.

1. Crea un repositorio en GitHub y sube el proyecto (la rama debe llamarse `main`).
2. En el repositorio: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Cada vez que subas cambios a `main`, la acción **Publicar en GitHub Pages** publica `public/`. Su estado se ve en la pestaña **Actions**.
4. El sitio queda en `https://<usuario>.github.io/<repositorio>/`:
   - **Teléfono:** `https://<usuario>.github.io/<repositorio>/` (es `index.html`).
   - **Experiencia (computador):** `https://<usuario>.github.io/<repositorio>/exp.html`.
5. Abre la experiencia en el computador. Muestra la sala, el QR y la dirección para el teléfono (con la sala y el broker ya incluidos). Escanea el QR y listo: no hay avisos de certificado, porque GitHub Pages tiene HTTPS válido.

En este modo no corre `node server.js`; el intermediario es el **broker público** (`broker.emqx.io`) o el que pongas en `config.js`. El QR se genera en el navegador (carga una pequeña librería desde internet; sin internet queda la dirección escrita). Cada estudiante puede hacer un *fork* del repositorio y publicar el suyo.

Diferencias con el modo local:

- No hay QR por `/qr.svg` ni puerto TCP 1883; las otras herramientas MQTT deben conectarse al broker público (por WebSocket o por el puerto que ese broker ofrezca).
- Cualquiera que adivine tu sala puede leer y escribir en ella. Evítalo con salas largas, o usando un broker propio.
- Si el sitio estuviera en un subdirectorio distinto, todas las rutas son relativas y siguen funcionando.

## 10. Usar Tacto en tus propias experiencias

Copia `public/tacto.js` (y `config.js` si usas broker propio) a tu proyecto. Funciona en cualquier página, sin librerías extra (carga `mqtt.js` por sí sola).

```html
<script src="config.js"></script>
<script src="tacto.js"></script>
<script>
  const t = new Tacto();            // sala guardada, o la de ?sala=abc123
  t.on('estado', s => console.log('conexión:', s));
  t.connect().then(() => {
    (function loop() {
      const x = t.get('touch.x');   // último valor del canal, o null si aún no hay datos
      const d = t.get('touch.d');
      if (x != null) miSonido.frecuencia = 200 + x * 800;
      requestAnimationFrame(loop);
    })();
  });
</script>
```

API de la clase `Tacto`:

| Miembro | Descripción |
|---|---|
| `new Tacto({ sala })` | Crea el cliente. Sin `sala`, usa `?sala=`, la guardada o una nueva. |
| `connect()` | Se conecta al broker y se suscribe a la sala. Devuelve una promesa. |
| `get(canal, [dispositivo])` | Último valor del canal (del teléfono elegido, o el más activo). |
| `on(evento, fn)` | Eventos: `datos` (cada mensaje), `estado`, `dispositivo`, `rtt`, `error`. |
| `cambiarSala(código)` | Cambia de sala sin recargar. |
| `devices` | Diccionario de teléfonos vistos: nombre, conexión, canales, capacidades, latencias. |
| `sel`, `pick()` | Teléfono elegido (`'auto'` por defecto) y el dispositivo resultante. |
| `Tacto.CHANNELS` | Catálogo de canales (nombre, etiqueta, rango, grupo). |

`exp.html` + `exp.js` son un ejemplo completo y legible: puedes partir de ahí.

---

## 11. Otras herramientas MQTT

El broker embebido también escucha por TCP en el puerto **1883**, así que cualquier cliente MQTT puede leer (o publicar) los mismos temas:

```bash
mosquitto_sub -h <ip-del-computador> -t "tacto/#" -v
```

También sirven **MQTT Explorer** (interfaz gráfica para ver los temas en vivo), **Node-RED**, scripts en Python (`paho-mqtt`), o un **ESP32/Arduino** suscrito a `tacto/<sala>/+/touch`: el teléfono puede mover un motor o una luz. Es una buena forma de mostrar a los estudiantes que el tacto es solo datos que cualquiera puede consumir.

---

## 12. Variables de entorno del servidor

| Variable | Por defecto | Para qué |
|---|---|---|
| `PORT` | `8443` | Puerto de las páginas y del WebSocket MQTT |
| `HOST_IP` | primera IP de la red | Fuerza qué IP se muestra en el QR (útil con varios adaptadores) |
| `MQTT_TCP` | `1883` | Puerto TCP del broker; `0` lo desactiva |
| `HTTP` | — | `HTTP=1` sirve sin HTTPS (para túneles o hosting que ya ponen el certificado) |
| `PUBLIC_URL` | — | Dirección pública que se usa en el QR (túneles) |

En PowerShell: `$env:HOST_IP="172.20.10.2"; node server.js`. En bash: `HOST_IP=172.20.10.2 node server.js`.

---

## 13. Limitaciones conocidas

- **Presión y diámetro dependen del hardware.** Algunos iPhone no entregan presión útil; ver sección 4.
- **Pantalla bloqueada = sin datos.** Los navegadores móviles suspenden los sensores y los eventos de la página en segundo plano.
- **iOS:** el permiso de movimiento se pide una sola vez por sesión de Safari y debe venir de un toque del usuario. Hay que usar HTTPS para el giro.
- **Certificado autofirmado:** genera un aviso en cada dispositivo la primera vez. Si Safari en iPhone rechaza el WebSocket seguro con ese certificado, el camino alternativo es GitHub Pages con broker público (sección 9). Esto está por confirmar con teléfonos reales.
- **No se graba ni reproduce la señal.** Encaja bien como un cliente MQTT más (grabar los temas y volver a publicarlos); no está en esta versión.
- **Lo que la web no entrega en iOS:** LiDAR, AirPods y Apple Watch no son accesibles desde el navegador.
- **Cámara:** solo movimiento y brillo; no hay visión de manos ni cuerpo en esta versión.

---

## 14. Solución de problemas

| Síntoma | Causa probable y solución |
|---|---|
| El teléfono no carga la página | No está en la misma red que el computador, o el cortafuegos bloquea Node. Prueba con el hotspot del teléfono; la regla de Windows para Node.js debe permitir redes privadas/públicas. |
| La página carga pero dice "Reconectando" | Safari rechaza el WebSocket con certificado autofirmado. Abre primero `https://<ip>:8443` y acepta el aviso; si persiste, usa el modo GitHub Pages con broker público. |
| Conecta pero la experiencia no ve el teléfono | Las salas no coinciden. Escanea el QR otra vez, o copia el código de la cabecera de la experiencia. |
| No suena | Falta **Activar audio**, o ninguna conexión abre `audio.gate`: toca la pantalla del teléfono (el ejemplo solo suena con un dedo apoyado). |
| El giro no cambia | No se aceptó el permiso de movimiento, o la página no está en HTTPS. En iPhone, cierra Safari por completo y entra de nuevo. |
| La presión dice "sin dato" o "constante" | El teléfono no la mide. Usa `touch.d` (diámetro) como sustituto. |
| `npm start` falla en PowerShell | Política de ejecución de scripts. Usa `node server.js`. |
| Varias IP en la lista y el QR apunta a la equivocada | Fuerza la correcta con `HOST_IP`. |
| El puerto 8443 o 1883 está ocupado | Hay otra copia del servidor corriendo. Ciérrala, o cambia `PORT` / `MQTT_TCP`. |
| Mucha latencia | Revisa la cifra en la cabecera. Con el broker público son ~200 ms; en modo local, ~7 ms. Ver "Velocidad: cuándo usar cada modo". |
