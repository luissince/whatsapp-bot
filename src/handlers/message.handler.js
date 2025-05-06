const { Message, User } = require('../db/mongodb');

class MessageHandler {
  constructor(whatsAppService) {
    this.whatsAppService = whatsAppService;
  }

  async handleMessageBusiness(messageHandlerBusiness) {
    this.messageHandlerBusiness = messageHandlerBusiness;
  }

  async handleMessageImportmuneli(messageHandlerImportmuneli) {
    this.messageHandlerImportmuneli = messageHandlerImportmuneli;
  }

  async handleMessagePersonal(messageHandlerPersonal) {
    this.messageHandlerPersonal = messageHandlerPersonal;
  }

  async handleIncomingMessage({ messages, type }) {
    try {
      if (type !== "notify" || !messages || !messages[0] || messages[0].key.fromMe) {
        return;
      }

      const message = messages[0];
      const numberWa = message?.key?.remoteJid;
      if (!numberWa) return;

      let captureMessage = null;

      // Procesar texto simple
      if (message.message?.conversation) {
        captureMessage = message.message.conversation;
      } else if (message.message?.extendedTextMessage?.text) {
        captureMessage = message.message.extendedTextMessage.text;
      }
      // Procesar texto de imágenes o videos
      else if (message.message?.imageMessage?.caption) {
        captureMessage = message.message.imageMessage.caption;
      } else if (message.message?.videoMessage?.caption) {
        captureMessage = message.message.videoMessage.caption;
      }

      // Si el mensaje es un sticker
      if (message.message?.stickerMessage) {
        await this.whatsAppService.sendTextMessage(numberWa, "¡Bonito sticker! 😄 ¿En qué puedo ayudarte hoy? Puedo mostrarte nuestros productos o enviarte nuestro catálogo completo.", message);
        return;
      }
      // Si el mensaje es un audio
      else if (message.message?.audioMessage) {
        await this.whatsAppService.sendTextMessage(numberWa, "Recibí tu audio. Aún no puedo escucharlos, pero ¡gracias por enviarlo! 🎧 ¿Quieres ver nuestro catálogo o buscar algún producto específico?", message);
        return;
      }
      // Si el mensaje es una imagen o video, procesar con su texto si existe
      else if (message.message?.imageMessage || message.message?.videoMessage) {
        const mediaType = message.message?.imageMessage ? "imagen" : "video";
        const caption = message.message?.imageMessage?.caption || message.message?.videoMessage?.caption || `¡Gracias por tu ${mediaType}!`;

        if (caption && caption.trim() !== "") {
          captureMessage = caption;
        } else {
          await this.whatsAppService.sendTextMessage(numberWa, `¡Gracias por tu ${mediaType}! ${mediaType === "imagen" ? "📸" : "🎥"} ¿Te gustaría ver nuestro catálogo o buscar algún producto en particular?`, message);
          return;
        }
      }

      if (!captureMessage || typeof captureMessage !== "string" || captureMessage.trim() === "") {
        console.log("No se encontró texto procesable en el mensaje. Ignorando...");
        return;
      }

      // Si es un texto válido, lo procesamos
      await this._processMessage(captureMessage, numberWa, message);
    } catch (error) {
      console.error("Error handling message:", error);
    }
  }

  async _processMessage(text, sender, originalMessage) {
    try {
      const cleanText = text.trim().replace(/\s+/g, ' ');

      // 1. Guardar mensaje del cliente en el historial
      await this.saveHistory(sender, 'user', cleanText);

      // 2. Obtener información del usuario desde MongoDB
      const usuario = await this.getUser(sender);

      // 3. Verificar si el mensaje es una selección numérica de un producto
      const numeroSeleccionado = this._detectarSeleccionNumerica(cleanText);
      const etapaActual = usuario.etapaConversacion || 'inicial';

      if (process.env.TYPE === "business") {
        await this.messageHandlerBusiness.handleProcess(cleanText, usuario, etapaActual, numeroSeleccionado, sender, originalMessage);
      } else if (process.env.TYPE === "only") {
        console.log("Ejecutando mensaje de importmuneli");
        await this.messageHandlerImportmuneli.handleProcess(cleanText, usuario, etapaActual, numeroSeleccionado, sender, originalMessage);
      } else {
        await this.messageHandlerPersonal.handleProcess(cleanText, sender, originalMessage);
      }

    } catch (error) {
      console.error("Error en processMessage:", error);
      await this.whatsAppService.sendTextMessage(sender, "Lo siento, tuve un problema técnico. ¿Podrías intentarlo nuevamente?", originalMessage);
    }
  }

  async saveHistory(sender, role, content) {
    try {
      // 1. Guardar el mensaje en la colección de mensajes
      await Message.create({
        whatsappId: sender,
        role: role,
        content: content
      });

      // 2. Actualizar información del usuario
      const userData = {
        lastInteraction: new Date()
      };

      if (role === 'user') {
        // Solo actualizar estos campos cuando es un mensaje del usuario
        await User.findOneAndUpdate(
          { whatsappId: sender },
          {
            $set: userData
          },
          { upsert: true, new: true }
        );
      }

      console.log(`✅ Mensaje guardado en MongoDB: ${sender} (${role})`);
    } catch (error) {
      console.error('❌ Error al guardar mensaje en MongoDB:', error);
    }
  }

  async getHistory(sender, limit = 10) {
    try {
      // Buscar los últimos 'limit' mensajes del usuario
      const mensajes = await Message.find({ whatsappId: sender })
        .sort({ timestamp: -1 })
        .limit(limit)
        .lean();

      // Invertir orden para tener cronología correcta
      return mensajes.reverse();
    } catch (error) {
      console.error('❌ Error al obtener historial de MongoDB:', error);
      return [];
    }
  }

  async getUser(sender) {
    try {
      let usuario = await User.findOne({ whatsappId: sender });

      if (!usuario) {
        usuario = await User.create({
          whatsappId: sender,
          etapaConversacion: 'inicial',
          ofrecidoCatalogo: false,
          esperandoRespuestaCatalogo: false,
          esperandoSeleccionProducto: false
        });
        console.log(`✅ Nuevo usuario creado en MongoDB: ${sender}`);
      }

      return usuario;
    } catch (error) {
      console.error('❌ Error al obtener/crear usuario en MongoDB:', error);
      // Devolver un objeto por defecto para no romper el flujo
      return {
        whatsappId: sender,
        etapaConversacion: 'inicial',
        ofrecidoCatalogo: false,
        esperandoRespuestaCatalogo: false,
        esperandoSeleccionProducto: false,
        productosConsultados: []
      };
    }
  }

  async updateUser(sender, datos) {
    try {
      await User.findOneAndUpdate(
        { whatsappId: sender },
        { $set: datos },
        { upsert: true }
      );
      console.log(`✅ Usuario actualizado en MongoDB: ${sender}`);
    } catch (error) {
      console.error('❌ Error al actualizar usuario en MongoDB:', error);
    }
  }

  // Identifica cuando el usuario selecciona una opción numérica
  _detectarSeleccionNumerica(texto) {
    // Buscar patrones como "1", "2.", "opción 3", "elegir 4", etc.
    const patrones = [
      /^(\d+)$/i,                   // Solo un número
      /^(\d+)[.)]/i,                // Número seguido de punto o paréntesis
      /^(opción|opcion|elegir|seleccionar|selección|seleccion|quiero|me interesa|ver|número|numero)\s+(\d+)/i, // Palabra clave + número
      /^(el|la|el producto|la opción|opción|opcion)\s+(\d+)/i,  // Artículo + número
    ];

    for (const patron of patrones) {
      const match = texto.trim().match(patron);
      if (match) {
        // Extraer el número, que puede estar en diferentes grupos según el patrón
        const numero = parseInt(match[1].match(/\d+/) ? match[1] : match[2]);
        if (!isNaN(numero)) return numero;
      }
    }

    return null;
  }

}

module.exports = MessageHandler;