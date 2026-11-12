# TACTO TR-808 · Sampler Háptico & Sintetizador Visual

> **Plataforma web donde el teléfono móvil funciona como un control remoto táctil y gestual para una experiencia inmersiva de sonido e imagen en tiempo real mediante MQTT.**

* **Repositorio:** [https://github.com/Stmvrphy/T07_TACTO](https://github.com/Stmvrphy/T07_TACTO)
* **Experiencia en Vivo (Computador):** [https://stmvrphy.github.io/T07_TACTO/exp.html](https://stmvrphy.github.io/T07_TACTO/exp.html)
* **Control Remoto (Teléfono Móvil):** [https://stmvrphy.github.io/T07_TACTO/index.html](https://stmvrphy.github.io/T07_TACTO/index.html)
* **Video de Demostración (30–60s):** *(Enlace a video en YouTube / Vimeo / Drive)*

---

## 1. Concepto

### La resignificación táctil del sintetizador analógico
El proyecto explora el **tacto como un sentido sinestésico que se funde con el oído y la visión**. Inspirado estéticamente en la legendaria caja de ritmos **Roland TR-808** y la materialidad de los pedales de guitarra analógicos, la plataforma transforma la superficie de vidrio fría del celular en una membrana expresiva y viva.

En lugar de concebir el teléfono como un simple control remoto de botones, la interacción propone una relación simbiótica entre el cuerpo humano y la máquina:
* **La voz como chispa inicial:** El micrófono del teléfono detecta el tono de la voz humana mediante autocorrelación espectral y su volumen en decibeles. La voz es el aliento que da origen a la nota base y define el tipo de secuencia (notas sostenidas en susurros, bucles melódicos en volumen medio, arpegios caóticos al levantar la voz).
* **El tacto como modulador físico:** La mano sobre la pantalla no solo ejecuta notas, sino que moldea el timbre, la saturación y el espacio acústico. Deslizar el dedo altera el color sonoro mediante un *Phaser*; hacer vibrar el dedo genera *Vibrato* y un mapa de calor térmico localizado sobre la matriz; mantener la presión estática recalienta el circuito produciendo un efecto *Glow* y *Trémolo*.
* **El espacio y el giro como acústica de sala:** La orientación física del aparato (giroscopio) tensa los tiempos de ataque y compresión, como si inclináramos físicamente una cámara de eco o manipuláramos la tensión de una cinta magnética.

Lo que se busca que la persona descubra es la sensación de **estar tocando la imagen y esculpiendo el sonido con la fricción de sus dedos**, diluyendo la frontera entre el periférico de entrada y el medio audiovisual.

---

## 2. Funcionamiento

### 2.1 Conexión MQTT y Arquitectura
La comunicación entre el teléfono inteligente y la experiencia en el computador opera mediante el protocolo **MQTT** sobre WebSockets seguros (`wss://`):
1. **Broker central:** Se utiliza el servidor público de alto rendimiento `wss://broker.emqx.io:8084/mqtt`, garantizando compatibilidad multiplataforma sin restricciones de red local ni firewalls.
2. **Sistema de Salas efímeras:** Cada sesión genera un código único de 6 caracteres (ej. `k8m9x2`) visible en el chasis superior de la TR-808.
3. **Emparejamiento instantáneo por QR:** Al pulsar **`📱 CONECTAR`** en la pantalla del computador, se despliega un código QR que codifica el enlace exacto con sala y broker. Al escanearlo con el teléfono, ambos dispositivos quedan enlazados en milisegundos.

```
 Teléfono (iOS / Android)                               Computador (Browser)
 ┌───────────────────────────────┐     MQTT (WSS)      ┌───────────────────────────────────┐
 │ Touch: X, Y, dedos, radio     │  wss://broker.emqx.io│ Tone.js Sampler (20 Instrumentos) │
 │ Giro: alfa, beta, gamma       │ ──────────────────► │ Cadena de 7 Pedales de Efectos    │
 │ Mic: RMS (dB) + Autocorrel. Hz│    tacto/sala/#     │ Matriz LED TR-808 + Canvas FX     │
 └───────────────────────────────┘                     │ Master Tape Recorder (WAV / MP3)  │
                                                       └───────────────────────────────────┘
```

---

### 2.2 Tabla de Conexiones (Gestos, Audio e Imagen)

| Periférico / Gesto | Canal Tacto | Variable de Audio (Tone.js) | Variable de Imagen (Canvas TR-808) | Sentido / Efecto Perceptivo |
|---|---|---|---|---|
| **Eje X (Plano Cartesiano)** | `touch.x` | Define el modo armónico: **X+** activa Escala Mayor, **X-** Escala Menor. | Modula la **Saturación cromática** (0.1x a 2.8x). | La derecha es brillante y consonante; la izquierda es opaca y melancólica. |
| **Eje Y (Plano Cartesiano)** | `touch.y` | Define la alteración: **Y+** activa Escala Aumentada, **Y-** Disminuida. | Modula el **Contraste** (0.5x a 2.5x). | Arriba expande armónicos y contrasta los LEDs; abajo comprime la gama visual. |
| **Micrófono (Pitch Hz)** | `mic.hz` | Autocorrelación detecta frecuencia fundamental y asigna nota raíz temperada (C1–B7). | Sintoniza la frecuencia de barrido del visualizador. | Tu propia voz entona la afinación del instrumento. |
| **Micrófono (dB / Nivel)** | `mic.level` | **< 0.035:** Silencio absoluto.<br>**Bajo (<22%):** Nota sostenida.<br>**Medio (22–58%):** Bucle melódico de escala.<br>**Alto (>58%):** Notas aleatorias estocásticas. | Amplitud y brillo general de las lámparas de la matriz LED. | El aire alimenta la vida sonora; en el silencio la máquina reposa. |
| **Giro Beta (Inclinación)** | `ang.b` | Modula el tiempo de **Ataque** (0.01s a 0.5s). | Escala la altura del haz del visualizador. | Inclinar el teléfono abre el sonido suavemente como un arco de violín. |
| **Giro Gamma (Alabeo)** | `ang.g` | Modula el **Threshold y Ratio del Compresor maestro**. | Nivel de compresión dinámica visible en el medidor VU. | La postura física del teléfono aprieta o suelta el cuerpo sonoro. |
| **Área / Diámetro de contacto** | `touch.d` | Modula el tiempo de **Decay y Release** (0.2s a 3.5s). | Aumenta el radio del halo incandescente bajo los dedos. | Tocar con la yema suave sostiene la nota; tocar de punta genera staccatos secos. |
| **1 Dedo apoyado** | `touch.n = 1` | Activa **Overdrive analógico** proporcional a la presión (`touch.f`). | Ilumina el pedal OVERDRIVE y el halo individual `D1`. | Saturación valvular controlada por la fuerza física. |
| **2 Dedos apoyados** | `touch.n = 2` | Activa pedal **Delay** (tiempo regulado por la separación de dedos `touch.dist`). | Activa filtro de alto contraste tipo **Umbral (Threshold)**. | Imagen binaria de alto impacto y ecos rítmicos espaciados. |
| **3 Dedos apoyados** | `touch.n = 3` | Activa pedal **Chorus espacial** estéreo. | Activa **Aberración Cromática** RGB según la separación de dedos. | Desfase prismático visual y espesor coral en el audio. |
| **4 Dedos apoyados** | `touch.n = 4` | Activa pedal **Reverb Freeverb** de sala amplia. | Activa **Desenfoque gaussiano (Blur)** según `touch.dist`. | Difusión espacial: el sonido y la imagen se vuelven etéreos y flotantes. |
| **5 Dedos apoyados** | `touch.n = 5` | Activa **Compresor extremo + Distorsión** destructiva. | Inyecta **Ruido digital estocástico (Noise)** sobre el lienzo. | Caos matérico: toda la mano satura la señal visual y sonora. |
| **Hold estático (≥ 5 seg)** | `hold` | Activa pedal **Trémolo analógico** (6 Hz, 90% profundidad). | Activa efecto de resplandor continuo **Glow / Drop-shadow**. | La inmovilidad prolongada sobrecalienta el circuito simulado. |
| **Vibración rápida de dedo** | `vibration` | Dispara **Vibrato de tono** expresivo. | Genera un **Heatmap térmico localizado** en las coordenadas del contacto. | La fricción viva deja una huella de calor en la pantalla. |
| **Deslizamiento lento** | `slowSlide` | Activa modulación de fase rotatoria **Phaser**. | Aplica **Torsión/Twist localizado** en la imagen sobre el punto de arrastre. | Arrastrar lentamente retuerce el material gráfico y ondula la fase acústica. |

---

### 2.3 Banco de Sonidos y Declaración de Licencias
Para dotar a la plataforma de timbres orgánicos de alta fidelidad, se integró el motor de samples **Tonejs-Instruments**:
* **Repositorio Original:** [nbrosowsky/tonejs-instruments](https://github.com/nbrosowsky/tonejs-instruments)
* **Autor del Código:** Nicholaus P. Brosowsky (2018).
* **Licencia del Software:** **MIT License** (ver detalle abajo).
* **Licencia de los Samples:** **Creative Commons Attribution 3.0 Unported ([CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/))**.
* **Procedencia y Créditos de los Samples:**
  * **Versilian Studios (VSCO 2 Community Edition):** Piano acústico, Fagot, Contrabajo, Flauta traversa, Corno francés, Arpa, Órgano, Trombón, Trompeta, Tuba, Violín, Xilófono ([vis.versilstudios.net](http://vis.versilstudios.net/vsco-community.html)).
  * **Karoryfer Samples:** Bajo eléctrico, Guitarra eléctrica, Saxofón ([karoryfer.com](https://www.karoryfer.com/karoryfer-samples)).
  * **University of Iowa Electronic Music Studios (MIS):** Guitarra acústica ([theremin.music.uiowa.edu](http://theremin.music.uiowa.edu/)).
  * **Freesound.org:** Cello (`flcellogrl` #12408), Guitarra clásica/nylon (`quartertone` #11573), Harmonio (`donyaquick` #330410).
* **Instrumentos disponibles en la aplicación (20 voces seleccionables):**
  * *Teclados y cuerdas acústicas:* Piano de cola acústico, Piano eléctrico (Rhodes), Clavicémbalo, Órgano de tubos.
  * *Cuerdas frotadas y punteadas:* Cello, Contrabajo, Violín, Guitarra acústica de nylon, Guitarra eléctrica, Bajo eléctrico.
  * *Vientos madera y metal:* Flauta traversa, Clarinete, Fagot, Oboe, Saxofón, Trompeta, Trombón, Tuba, Corno francés.
  * *Percusión melódica:* Xilófono.
* **Grabador Maestro de Cinta:** Exportación en **`.WAV` (PCM 16-bit 44.1kHz)** y **`.MP3`** en el navegador mediante `lamejs` ([LGPL-3.0](https://github.com/zhuker/lamejs)).

#### Texto de la Licencia MIT (Tonejs-Instruments)
```text
MIT License

Copyright (c) 2018 Nicholaus P. Brosowsky

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 3. Reflexión

### 3.1 Descubrimientos al traducir el tacto en imagen y sonido
Al vincular el contacto táctil con la síntesis audiovisual se hizo evidente que **el tacto nunca es una variable estática**: tocar un objeto implica presión, vibración micro-muscular y temperatura. La sorpresa más gratificante fue comprobar cómo la introducción de micro-gestos (como el frotar un dedo para crear un mapa térmico y vibrato, o sostenerlo inmóvil para sobrecalentar el trémolo) cambia radicalmente la psicología del usuario: ya no se siente como estar navegando en una página web, sino como estar acariciando un material elástico o un instrumento electromecánico real. La sincronización sub-30ms lograda mediante WebSockets otorga una inmediatez perceptiva donde el ojo y el oído asumen que la perturbación visual y acústica proviene directamente de la fricción física de la mano.

### 3.2 Lo que queda fuera del sistema
A pesar de la riqueza expresiva lograda, existen limitantes impuestas por la tecnología actual de los smartphones comerciales:
1. **Falsa medición de presión en pantallas estándar:** La inmensa mayoría de los dispositivos modernos (tanto Android como iPhone desde la eliminación del hardware *3D Touch*) no cuentan con sensores de fuerza piezorresistivos reales. Lo que el navegador reporta como `force` suele ser una estimación basada en la deformación del área de contacto (`radiusX/radiusY`). Si el usuario presiona con la punta de una uña o con una superficie pequeña, el sistema no puede registrar la verdadera fuerza mecánica ejercida.
2. **Ausencia de retroalimentación háptica activa (Haptic Feedback bidireccional):** La relación es actualmente unidireccional: el teléfono envía tacto, pero los dedos del usuario no reciben resistencia física, textura rugosa o vibración mecánica diferenciada en respuesta al sonido generado. La pantalla de cristal continúa siendo lisa y pasiva.

### 3.3 Dos mejoras concretas para futuras versiones
1. **Retroalimentación háptica reactiva por actuador Taptic Engine / Vibration API:** Implementar pulsos hápticos modulados mediante la API `navigator.vibrate()` en el teléfono celular, sincronizados con la forma de onda del sintetizador y el nivel de distorsión del Overdrive. De este modo, al saturar la señal o deslizar el dedo por el lienzo, el teléfono vibraría físicamente con frecuencias proporcionales, cerrando el bucle háptico táctil en ambas direcciones.
2. **Polifonía multitáctil independiente y paneo binaural:** Actualmente los acordes y bucles melódicos comparten una envolvente global comandada por el gesto dominante. Una evolución natural consiste en asignar a cada dedo individual (`t1` a `t5`) una voz polifónica independiente con síntesis física por cuerda frotada, permitiendo que cada dedo rasguee una nota distinta en una posición espacial estéreo (paneo X/Y) independiente, convirtiendo la pantalla en un arpa virtual de múltiples dimensiones.

---

## 4. Tecnologías y Créditos

* **Tacto Toolkit:** Felipe Rocha ([fefeliperoar/tacto](https://github.com/fefeliperoar/tacto)).
* **Motor de Audio:** [Tone.js](https://tonejs.github.io/) (v14.8.49).
* **Banco de Instrumentos & Samples:** [Tonejs-Instruments](https://github.com/nbrosowsky/tonejs-instruments) por Nicholaus P. Brosowsky (MIT License / CC-BY 3.0).
* **Codificador MP3:** [lamejs](https://github.com/zhuker/lamejs) por Alex Zhukov (Licencia LGPL-3.0).
* **Broker MQTT:** [EMQX](https://www.emqx.com/) (Eclipse Paho / MQTT.js).
* **Diseño e Interfaz Gráfica:** Inspirado en la tipografía, botones de paso y códigos de color de la caja de ritmo vintage **Roland Rhythm Composer TR-808 (1980)**.
*  **Integrantes:**
Sebastián Urquiza
Noelia Landaburu 
