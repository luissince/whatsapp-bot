// src/index.js - Punto de entrada principal
require('dotenv').config();

const { WhatsAppService } = require('./src/services/whatsapp.service.js');
const { ExpressServer } = require('./src/server/express.server.js');
const { SocketManager } = require('./src/services/socket.service.js');
const { MessageHandler } = require('./src/handlers/message.handler.js');
const { ConfigService } = require('./src/config/config.service.js');
const { connectToMongoDB } = require('./src/db/mongodb');


async function bootstrap() {
  try {
    // Conectar a MongoDB
    const databaseConnected = await connectToMongoDB();
    if (!databaseConnected) {
      console.error('No se pudo conectar a la base de datos. Revisa tu configuración.');
      process.exit(1);
    }

    // Inicializar servicios
    const config = new ConfigService();
    const socketManager = new SocketManager();

    // Inicializar servicio de WhatsApp
    const whatsAppService = new WhatsAppService({
      sessionPath: config.getSessionPath(),
      onQrGenerated: (qr) => socketManager.updateQrStatus('qr', qr),
      onConnected: (userInfo) => socketManager.updateQrStatus('connected', userInfo),
      onDisconnected: async (reason) => { console.log(`Disconnected: ${reason}`); },
      onLoading: () => socketManager.updateQrStatus('loading')
    });

    // Inicializar manejador de mensajes
    const messageHandler = new MessageHandler(whatsAppService);

    // Configurar manejadores de eventos
    whatsAppService.setMessageHandler(messageHandler.handleIncomingMessage.bind(messageHandler));

    // Iniciar servidor Express
    const server = new ExpressServer({
      port: config.getPort(),
      whatsAppService,
      staticDir: config.getStaticDir()
    });

    // Iniciar socket.io con el servidor HTTP
    socketManager.initialize(server.getHttpServer(), whatsAppService);

    // Conectar a WhatsApp
    await whatsAppService.connect();

    // Iniciar servidor
    server.start();

  } catch (error) {
    console.error('Error starting application:', error);
    process.exit(1);
  }
}

// Manejar cierre gracioso
process.on('SIGINT', async () => {
  console.log('Cerrando aplicación...');
  process.exit(0);
});


// Iniciar la aplicación
bootstrap().catch(error => {
  console.error('Error al iniciar la aplicación:', error);
  process.exit(1);
});
