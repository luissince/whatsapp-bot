// src/services/whatsapp.service.js
const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  downloadMediaMessage
} = require("@whiskeysockets/baileys");
const { session } = { session: "session_auth_info" };
const { Boom } = require("@hapi/boom");
const pino = require("pino");
const fs = require('fs');
const path = require('path');
const { default: axios } = require("axios");
const { writeFile, readFile, unlink } = require("fs/promises");
const Tesseract = require("tesseract.js");
const sharp = require('sharp');
const OpenAI = require('openai');
const FirebaseService = require("./firase-base.service");
const firebaseService = new FirebaseService();


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
        } else if (reason === 503) {
          console.log("La conexión se perdió porque el servidor no está disponible, reconectando...");
          this.connect();
        }
        else {
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

  async preprocessImage(inputPath, outputPath) {
    await sharp(inputPath)
      .grayscale()
      .normalize({ upper: 90 })  // Aumenta contraste para texto oscuro
      .linear(1.1, -10)          // Ajuste fino de brillo/contraste
      .resize({ width: 1200 })   // Más resolución para texto pequeño
      .sharpen()                 // Enfoca bordes del texto
      .toFile(outputPath);
  }

  async analyzeImageWithOCR(filePath) {
    try {
      const result = await Tesseract.recognize(filePath, 'spa', {
        logger: info => console.log(info.status),
        tessedit_char_whitelist: '0123456789', // Solo detecta números
        tessedit_pageseg_mode: '6',           // Modo "detectar una única línea"
      });

      const fullText = result.data.text;
      console.log("Texto detectado:", fullText);

      // Patrón para montos en formato Yape (ej: "300" en líneas separadas)
      const patronYape = /(?:\*\*)?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)(?:\*\*)?/g;
      const lineas = fullText.split('\n');

      // Busca líneas que contengan solo números (posible monto)
      const montos = [];
      for (const linea of lineas) {
        const limpia = linea.trim().replace(/\*/g, '');
        if (/^\d+$/.test(limpia)) {
          montos.push(limpia);
        }
      }

      if (montos.length) {
        console.log("🔍 Monto(s) detectado(s):", montos);
        return montos;
      } else {
        console.log("❌ No se detectó ningún monto.");
        return [];
      }
    } catch (err) {
      console.error("Error analizando imagen:", err);
      return [];
    }
  }

  async downloadMedia(message) {
    try {
      // 1. Descargar la imagen desde WhatsApp
      const buffer = await downloadMediaMessage(
        message,
        "buffer",
        {},
        { logger: pino({ level: "silent" }), reuploadRequest: this.sock?.reuploadRequest }
      );

      // 2. Determinar nombre y tipo
      const mime = message.message?.imageMessage?.mimetype || 'image/jpeg';
      const extension = mime.split("/")[1] || 'jpg';
      const filename = `whatsapp_img_${Date.now()}.${extension}`;
      const rawPath = path.join(__dirname, "../../debug_media/", filename);

      // 3. Guardar temporalmente en disco
      await writeFile(rawPath, buffer);
      console.log("Imagen guardada en:", rawPath);

      // 4. Procesar imagen si es necesario
      const processedPath = path.join(__dirname, "../../debug_media/", `processed_${filename}`);
      await this.preprocessImage(rawPath, processedPath);

      // 5. Subir a Firebase
      const bucket = firebaseService.getBucket();
      const file = bucket.file(filename);
      await file.save(await readFile(processedPath), {
        metadata: {
          contentType: mime,
        },
      });


      // 6. Hacer pública la imagen (opcional, si tu bucket lo necesita)
      await file.makePublic();

      // 7. Generar URL pública
      const image_url = `https://storage.googleapis.com/${bucket.name}/${filename}`;

      // 8. Llamar a OpenAI para detectar monto y moneda
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const response = await client.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Quiero que detectes los montos en una imagen ya que es un pago y regrese un detalle de pago en un formato tipo text. En caso no se pueda detectar, regresar un valor boolean false."
              },
              {
                type: "image_url",
                image_url: {
                  url: image_url,
                },
              },
            ],
          },
        ],
      });

      // 9. Limpiar: borrar archivo local y en Firebase si no lo necesitas
      await unlink(rawPath);
      await unlink(processedPath);
      await file.delete();

      return response.choices[0].message.content;
    } catch (error) {
      console.error("Error descargando media:", error);
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