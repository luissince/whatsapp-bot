// src/services/whatsapp.service.js
const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState
} = require("@whiskeysockets/baileys");
const { session } = { session: "session_auth_info" };
const { Boom } = require("@hapi/boom");
const pino = require("pino");
const fs = require('fs');
const path = require('path');
const { default: axios } = require("axios");

class WhatsAppService {
  constructor({ sessionPath, onQrGenerated, onConnected, onDisconnected, onLoading }) {
    this.sessionPath = sessionPath;
    this.sock = null;
    this.onQrGenerated = onQrGenerated;
    this.onConnected = onConnected;
    this.onDisconnected = onDisconnected;
    this.onLoading = onLoading;
    this.messageHandler = null;
  }

  setMessageHandler(handler) {
    this.messageHandler = handler;
  }

  isConnected() {
    return this.sock?.user ? true : false;
  }

  getUserInfo() {
    if (!this.isConnected()) return null;
    return this.sock.user;
  }

  async connect() {
    try {
      const { state, saveCreds } = await useMultiFileAuthState(this.sessionPath);

      this.sock = makeWASocket({
        printQRInTerminal: false,
        auth: state,
        logger: pino({ level: "silent" })
      });

      this._setupConnectionHandlers(saveCreds);
      this._setupMessageHandlers();

      this.sock.ev.on('messaging-history.set', ({
        chats: newChats,
        contacts: newContacts,
        messages: newMessages,
        syncType
      }) => {
        console.log('New messages:', newMessages);
        // handle the chats, contacts and messages
      })

      return true;
    } catch (error) {
      console.error("Error connecting to WhatsApp:", error);
      throw error;
    }
  }

  _setupConnectionHandlers(saveCreds) {
    this.sock.ev.on("connection.update", async (update) => {
      console.log("Connection update", update);
      const { connection, lastDisconnect, qr } = update;

      if (qr && this.onQrGenerated) {
        this.onQrGenerated(qr);
      }

      if (connection === "close") {
        console.log("Connection closed");
        const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
        if (reason === DisconnectReason.badSession) {
          console.log(
            `Bad Session File, Please Delete ${session} and Scan Again`
          );
          this.sock.logout();
        } else if (reason === DisconnectReason.connectionClosed) {
          console.log("Conexión cerrada, reconectando....");
          this.connect();
        } else if (reason === DisconnectReason.connectionLost) {
          console.log("Conexión perdida del servidor, reconectando...");
          this.connect();
        } else if (reason === DisconnectReason.connectionReplaced) {
          console.log(
            "Conexión reemplazada, otra nueva sesión abierta, cierre la sesión actual primero"
          );
          this.sock.logout();
        } else if (reason === DisconnectReason.loggedOut) {
          console.log(
            `Dispositivo cerrado, elimínelo ${session} y escanear de nuevo.`
          );
          this.sock.logout();
        } else if (reason === DisconnectReason.restartRequired) {
          console.log("Se requiere reinicio, reiniciando...");
          this.connect();
        } else if (reason === DisconnectReason.timedOut) {
          console.log("Se agotó el tiempo de conexión, conectando...");
          this.connect();
        } else {
          this.sock.end(
            `Motivo de desconexión desconocido: ${reason}|${lastDisconnect.error}`
          );
        }
        if (this.onDisconnected) {
          this.onDisconnected(reason);
        }

      } else if (connection === "open") {
        console.log("Connection open");
        if (this.onConnected) {
          this.onConnected(this.getUserInfo());
        }
      }
    });

    this.sock.ev.on("creds.update", saveCreds);
  }

  _setupMessageHandlers() {
    this.sock.ev.on("messages.upsert", async (data) => {
      if (this.messageHandler) {
        this.messageHandler(data, this.sock);
      }
    });
  }

  async sendTextMessage(to, text, quoted = null) {
    try {
      if (!this.isConnected()) {
        throw new Error("WhatsApp is not connected");
      }

      const options = quoted ? { quoted } : {};
      return await this.sock.sendMessage(to, { text }, options);
    } catch (error) {
      console.error("Error sending message:", error);
      throw error;
    }
  }

  async sendImageMessage(to, url, quoted = null) {
    try {
      if (!this.isConnected()) {
        throw new Error("WhatsApp is not connected");
      }

      const options = quoted ? { quoted } : {};
      return await this.sock.sendMessage(to, {
        image: {
          url: url,
        },
        viewOnce: false,
      }, options);
    } catch (error) {
      console.error("Error sending image:", error);
      throw error;
    }
  }

  // Añade esta función a tu clase WhatsAppService existente

async sendDocumentMessage(to, url, quoted = null, filename = "documento.pdf", caption = "") {
  try {
    // Descarga el documento desde la URL
    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'arraybuffer',
    });
    
    const buffer = Buffer.from(response.data, "utf-8");
    
    // Envía el documento
    await this.sock.sendMessage(
      to,
      {
        document: buffer,
        mimetype: 'application/pdf',
        fileName: filename,
        caption: caption
      },
      {
        quoted: quoted ? quoted : undefined
      }
    );
    
    console.log(`Documento enviado a ${to}`);
    return true;
  } catch (error) {
    console.error(`Error al enviar documento: ${error.message}`);
    throw error;
  }
}

  async checkNumberExists(number) {
    try {
      if (!this.isConnected()) {
        throw new Error("WhatsApp is not connected");
      }

      return await this.sock.onWhatsApp(number);
    } catch (error) {
      console.error("Error checking number:", error);
      throw error;
    }
  }

  async cleanSession() {
    try {
      console.log("Limpiando archivos de sesión...");

      // Eliminar archivos de sesión
      const sessionDir = path.resolve(this.sessionPath);
      if (fs.existsSync(sessionDir)) {
        const files = fs.readdirSync(sessionDir);
        for (const file of files) {
          fs.unlinkSync(path.join(sessionDir, file));
        }
        console.log('Archivos de sesión eliminados correctamente');
      }

      return true;
    } catch (error) {
      console.error("Error al limpiar la sesión:", error);
      return false;
    }
  }

  async logout() {
    try {
      console.log("Iniciando logout de WhatsApp...");
      // Llamamos directamente a cleanSession que ahora maneja todo
      return await this.cleanSession();
    } catch (error) {
      console.error("Error logging out:", error);
      throw error;
    }
  }
}

module.exports = { WhatsAppService };