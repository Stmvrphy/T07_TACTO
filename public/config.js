// Configuración opcional. Déjala vacía para usar el broker del propio servidor de Tacto
// (o el broker público de prueba si la página se publica en GitHub Pages).
//
// Para usar tu propio broker (HiveMQ Cloud, EMQX, Mosquitto con WebSocket seguro…):
//   window.TACTO_CONFIG = { broker: 'wss://mi-broker.example.com:8884/mqtt' };
//
// Brokers en la nube (EMQX Cloud, HiveMQ Cloud…) piden usuario y contraseña:
//   window.TACTO_CONFIG = { broker: 'wss://xxxx.emqxsl.com:8084/mqtt', username: 'tacto', password: '…' };
// OJO: en GitHub Pages este archivo es público. Crea un usuario solo para esto, con permiso limitado a tacto/#.
//
// Si la página del teléfono vive en otro sitio (por ejemplo, la del profesor), indica su dirección para el QR:
//   window.TACTO_CONFIG = { phoneUrl: 'https://profesor.github.io/tacto/' };
window.TACTO_CONFIG = {
  broker: 'wss://q8a141b9.ala.us-east-1.emqxsl.com:8084/mqtt',
  username: 'tacto_app',
  password: 'blablablabla',
};
