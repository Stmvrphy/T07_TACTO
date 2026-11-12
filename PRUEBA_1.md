# Prueba 1 · el teléfono como control remoto

Objetivo: comprobar con teléfonos reales lo que no se puede saber desde el computador: **presión**, **diámetro** y **giro** en iPhone y Android, y si la conexión local funciona en iPhone.

## Preparación

1. Laptop y teléfono en la misma red (hotspot del teléfono o WiFi de casa).
2. En la carpeta del proyecto: `node server.js`.
3. En el laptop abre `https://localhost:8443/exp` y acepta el aviso del certificado.
4. Si tu laptop está en el hotspot del iPhone, la dirección será `172.20.10.x`. Si el servidor imprime varias direcciones, fuerza la correcta: `$env:HOST_IP="172.20.10.2"; node server.js`.

## En el teléfono

1. Escanea el QR de la experiencia (o abre la dirección que muestra bajo "Conectar el teléfono").
2. Acepta el aviso del certificado: iPhone *Mostrar detalles → visitar este sitio web*; Android *Avanzado → Continuar*.
3. Pon tu nombre, **Conectar**, acepta el permiso de movimiento.
4. Deberías ver "● conectado · broker local". Si en el laptop el teléfono aparece en la lista, la conexión funciona.

## Qué anotar

| # | Prueba | Cómo | Anotar |
|---|---|---|---|
| 1 | Conexión | ¿Carga la página y llega a "● conectado"? | Sí o no, iPhone o Android |
| 2 | Presión | Apoya un dedo suave y luego fuerte | En la parte baja de la pantalla del teléfono: *variable*, *constante* o *sin dato* |
| 3 | Diámetro | Apoya la yema y luego el dedo plano | Igual: *variable*, *constante* o *sin dato*; valor en px |
| 4 | Varios dedos | 2, 3, 4 y 5 dedos | Máximo de dedos que cuenta |
| 5 | Giro | Inclina adelante/atrás y a los lados; gira sobre la mesa | En la experiencia: `ang.b`, `ang.g`, `ang.a` y `rot.*`: ¿signos y rangos esperados? |
| 6 | Latencia | Mira "latencia … ms" en la cabecera de la experiencia, 1 minuto | Valor típico |
| 7 | Pantalla bloqueada | Bloquea 10 s | ¿Siguió llegando? (lo normal es que no) |
| 8 | Micrófono y cámara | Actívalos desde los botones de la página del teléfono | ¿Piden permiso? ¿cambian `mic.level` y `cam.motion`? |

## Resultados (una fila por teléfono)

| Teléfono y sistema | 1 Conexión | 2 Presión | 3 Diámetro | 4 Dedos máx. | 5 Giro (signos) | 6 Latencia | 7 Bloqueada | 8 Mic / Cámara |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |  |

## Qué decide esto

- **Presión *sin dato* o *constante* en iPhone:** se usa el diámetro como sustituto, y se avisa a los estudiantes.
- **Conexión fallida solo en iPhone con broker local:** el WebSocket seguro con certificado autofirmado no pasa en Safari; el camino para iPhone pasa a ser GitHub Pages + broker público.
- **Latencia alta:** se compara con la del broker público antes de decidir el modo por defecto.
