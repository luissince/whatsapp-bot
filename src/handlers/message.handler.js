const OpenAI = require('openai');
const { Message, User, Order } = require('../db/mongodb');

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
      else if (message.message?.imageMessage) {
        await this._processMessagePayment(message, numberWa);
        return;
      }

      else if ( message.message?.videoMessage) {
        const mediaType = "video";
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
      const numeroSeleccionado = await this._detectarSeleccionNumerica(cleanText);
      const etapaActual = usuario.etapaConversacion || 'inicial';

      if (process.env.TYPE === "business") {
        await this.messageHandlerBusiness.handleProcess(cleanText, usuario, etapaActual, numeroSeleccionado, sender, originalMessage);
      } else if (process.env.TYPE === "only") {
        await this.messageHandlerImportmuneli.handleProcess(cleanText, usuario, etapaActual, numeroSeleccionado, sender, originalMessage);
      } else {
        await this.messageHandlerPersonal.handleProcess(cleanText, sender, originalMessage);
      }

    } catch (error) {
      console.error("Error en processMessage:", error);
      await this.whatsAppService.sendTextMessage(sender, "Lo siento, tuve un problema técnico. ¿Podrías intentarlo nuevamente?", originalMessage);
    }
  }

  async _processMessagePayment(message, sender) {
    try {

      if (process.env.TYPE === "business") {
        await this.whatsAppService.sendTextMessage(sender, "En estos momentos no procesar imagenes", message);
      } else if (process.env.TYPE === "only") {

        const captureMessage = "Danos unos segundos para procesar tu imagen...";

        await this.saveHistory(sender, 'assistant', captureMessage);

        await this.whatsAppService.sendTextMessage(sender, captureMessage, message);

        await this.messageHandlerImportmuneli.handleProcessPayment(sender, message);

      } else {
        await this.whatsAppService.sendTextMessage(sender, "En estos momentos no procesar imagenes", message);
      }

    } catch (error) {
      console.error("Error en _processMessagePayment:", error);
      await this.whatsAppService.sendTextMessage(sender, "Lo siento, tuve un problema técnico. ¿Podrías intentarlo nuevamente?", message);
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

  async deleteHistory(sender) {
    try {
      const result = await Message.deleteMany({ whatsappId: sender });
      console.log(`✅ Historial eliminado: ${result.deletedCount} mensajes`);
      return true;
    } catch (error) {
      console.error('❌ Error al eliminar historial de MongoDB:', error);
      return false;
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

  async deleteUser(sender) {
    try {
      const result = await User.deleteOne({ whatsappId: sender });
      console.log(`✅ Usuario eliminado: ${result.deletedCount}`);
      return true;
    } catch (error) {
      console.error('❌ Error al eliminar la orden de MongoDB:', error);
      return false;
    }
  }

  async saveOrder(sender, datos) {
    try {
      await Order.findOneAndUpdate(
        { whatsappId: sender },
        { $set: datos },
        { upsert: true }
      );
      console.log(`✅ Orden guardado en MongoDB: ${sender}`);
    } catch (error) {
      console.error('❌ Error al guardar la orden en MongoDB:', error);
    }
  }

  async getOrder(sender) {
    try {
      let order = await Order.findOne({ whatsappId: sender });

      return order;
    } catch (error) {
      console.error('❌ Error al obtener la orden de MongoDB:', error);
      return {};
    }
  }

  async deleteOrder(sender) {
    try {
      const result = await Order.deleteOne({ whatsappId: sender });
      console.log(`✅ Orden eliminada: ${result.deletedCount} documento`);
      return true;
    } catch (error) {
      console.error('❌ Error al eliminar la orden de MongoDB:', error);
      return false;
    }
  }

  // Identifica cuando el usuario selecciona una opción numérica
  async _detectarSeleccionNumerica(texto) {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const systemPrompt = `
  Eres un asistente que solo debe identificar si el texto del usuario contiene una selección numérica.
  Puede estar escrita como número (por ejemplo: 1, 2) o como palabra (por ejemplo: uno, dos).
  Devuelve únicamente el número como entero (sin texto adicional). 
  Si no hay ningún número que indique una elección clara, devuelve "null" (como cadena exacta).
  No expliques tu razonamiento ni devuelvas otra cosa que el número o "null".
  `;

    try {
      const completion = await client.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: texto }
        ],
        max_tokens: 10,
        temperature: 0,
      });

      const respuesta = completion.choices[0].message.content?.trim();

      if (respuesta === 'null') return null;

      const numero = parseInt(respuesta, 10);
      if (!isNaN(numero)) return numero;
    } catch (error) {
      console.error('Error al llamar a la API de OpenAI:', error);
    }

    // Fallback local si la API falla o la respuesta es inválida
    const textoLimpio = texto.trim().toLowerCase();

    const palabrasANumeros = {
      uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
      seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
    };

    for (const [palabra, valor] of Object.entries(palabrasANumeros)) {
      if (textoLimpio.includes(palabra)) return valor;
    }

    const patrones = [
      /^(\d+)$/,
      /^(\d+)[.)]/,
      /(opción|elegir|seleccionar|ver|número|numero)\s+(\d+)/i,
      /(producto|opción)\s+(\d+)/i,
    ];

    for (const patron of patrones) {
      const match = texto.match(patron);
      if (match) {
        const numero = parseInt(match[1] || match[2]);
        if (!isNaN(numero)) return numero;
      }
    }

    return null;
  }

}

module.exports = MessageHandler;