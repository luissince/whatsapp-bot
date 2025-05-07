const OpenAI = require('openai');
const axios = require("axios");
const { Product, User } = require("../db/mongodb");

class MessageBusinessHandle {

    constructor(whatsAppService, messageHandler) {
        this.whatsAppService = whatsAppService;
        this.messageHandler = messageHandler;
        this.catalogoPDFUrl = `${process.env.API_REST_URL}/api/catalogo/documents/pdf/CT0001`;
    }

    async handleProcess(cleanText, usuario, etapaActual, numeroSeleccionado, sender, originalMessage) {
        // CASO ESPECIAL: Si está esperando selección de un producto por número
        if (usuario.esperandoSeleccionProducto && numeroSeleccionado !== null) {
            const ok = await this._processSpecialCase(numeroSeleccionado, sender, originalMessage);
            if (ok) return;
        }

        // CASO INICIAL: Si es un nuevo usuario o es un saludo
        if (etapaActual === 'inicial' || this._detectarSaludo(cleanText)) {
            await this._processInitialCase(sender, originalMessage, originalMessage);
            return;
        }

        // CASO MENU: Si el usuario responde al menú inicial con una opción numérica
        if (etapaActual === 'menu_inicial' && numeroSeleccionado !== null) {
            await this._processSelectMenuCase(numeroSeleccionado, sender, originalMessage);
            return;
        }

        // CASO OPCIONES DESPUÉS DE PRODUCTO: Si el usuario responde después de ver un producto
        if (etapaActual === 'mostrando_producto' && numeroSeleccionado !== null) {
            this._processSelectProductCase(numeroSeleccionado, sender, originalMessage);
            return;
        }

        // CASO PETICIÓN DE CATÁLOGO: El usuario pide o acepta ver el catálogo
        const pideCatalogo = this._detectarPeticionCatalogo(cleanText);
        const aceptaCatalogo = this._detectarAceptacionCatalogo(cleanText);
        const esperandoRespuestaCatalogo = usuario.esperandoRespuestaCatalogo;

        if (pideCatalogo || (esperandoRespuestaCatalogo && aceptaCatalogo)) {
            await this._enviarCatalogo(sender, originalMessage);
            return;
        }

        // CASO ESPERANDO BÚSQUEDA: El usuario está buscando un producto específico
        if (etapaActual === 'esperando_busqueda' || this._detectarIntencionCompra(cleanText)) {
            this._processSearchProductCase(cleanText, sender, originalMessage);
            return;
        }

        // CASO NUEVA BÚSQUEDA: El usuario quiere buscar algo nuevo
        if (this._detectarBusquedaNueva(cleanText)) {
            await this.whatsAppService.sendTextMessage(
                sender,
                "¡Claro! ¿Qué producto te gustaría buscar ahora? Por favor, indícame el nombre o tipo de producto que te interesa.",
                originalMessage
            );
            await this.messageHandler.saveHistory(sender, 'assistant', "¡Claro! ¿Qué producto te gustaría buscar ahora? Por favor, indícame el nombre o tipo de producto que te interesa.");
            await this.messageHandler.updateUser(sender, { etapaConversacion: 'esperando_busqueda' });
            return;
        }

        // CASO MOSTRAR MENÚ: El usuario quiere ver opciones o menú
        if (cleanText.toLowerCase().includes("menu") ||
            cleanText.toLowerCase().includes("menú") ||
            cleanText.toLowerCase().includes("opciones") ||
            cleanText.toLowerCase().includes("ayuda")) {
            await this._mostrarMenuInicial(sender, originalMessage);
            return;
        }

        // CASO DEFAULT: Procesamiento con AI para otros mensajes
        // Verificar primero si el tema está relacionado con el negocio
        const esTemaNegocio = this._detectarTemaNegocio(cleanText);

        if (!esTemaNegocio) {
            const mensajeFueraContexto = "Disculpa, solo puedo ayudarte con temas relacionados a nuestros productos y servicios. ¿Hay algo específico sobre nuestros productos que te gustaría saber? Puedo mostrarte el catálogo o buscar un producto específico para ti.";
            await this.whatsAppService.sendTextMessage(sender, mensajeFueraContexto, originalMessage);
            await this.messageHandler.saveHistory(sender, 'assistant', mensajeFueraContexto);

            // Mostrar menú para redirigir la conversación
            setTimeout(async () => {
                await this._mostrarMenuInicial(sender, originalMessage);
            }, 1000);
            return;
        }

        // Procesar con IA para casos no cubiertos, pero relacionados con el negocio
        await this._processIA(cleanText, sender, etapaActual, originalMessage);
    }

    async _processSpecialCase(numeroSeleccionado, sender, originalMessage) {
        // Verificar que hay resultados guardados y que el número es válido
        const products = await Product.find({ whatsappId: sender });
        const resultadosActuales = products || [];

        if (resultadosActuales.length >= numeroSeleccionado && numeroSeleccionado > 0) {
            const productoSeleccionado = resultadosActuales[numeroSeleccionado - 1];
            await this.messageHandler.updateUser(sender, { esperandoSeleccionProducto: false });

            if (productoSeleccionado && productoSeleccionado.idProducto) {
                // Buscar detalles completos del producto
                await this.messageHandler._obtenerDetallesProducto(productoSeleccionado.idProducto, sender, originalMessage);
                return true;
            }
        } else {
            await this.whatsAppService.sendTextMessage(
                sender,
                `Por favor selecciona un número válido entre 1 y ${resultadosActuales.length}, o busca otro producto.`,
                originalMessage
            );
            await this.messageHandler.saveHistory(sender, 'assistant', `Por favor selecciona un número válido entre 1 y ${resultadosActuales.length}, o busca otro producto.`);
            return true;
        }

        return false;
    }

    async _processInitialCase(sender, originalMessage) {
        await this._mostrarMenuInicial(sender, originalMessage);
    }

    // Reconoce saludos
    _detectarSaludo(texto) {
        const saludos = [
            /hola/i,
            /buenos días/i,
            /buenas tardes/i,
            /buenas noches/i,
            /qué tal/i,
            /saludos/i,
            /hey/i,
            /ola/i,
            /hi/i,
            /hello/i
        ];
        return saludos.some(s => s.test(texto));
    }

    async _processSelectMenuCase(numeroSeleccionado, sender, originalMessage) {
        switch (numeroSeleccionado) {
            case 1: // Ver catálogo completo
                await this._enviarCatalogo(sender, originalMessage);
                break;
            case 2: // Buscar producto específico
                await this.whatsAppService.sendTextMessage(
                    sender,
                    "¡Perfecto! ¿Qué producto estás buscando? Por favor, indícame el nombre o tipo de producto que te interesa.",
                    originalMessage
                );
                await this.messageHandler.saveHistory(sender, 'assistant', "¡Perfecto! ¿Qué producto estás buscando? Por favor, indícame el nombre o tipo de producto que te interesa.");
                await this.messageHandler.updateUser(sender, { etapaConversacion: 'esperando_busqueda' });
                break;
            case 3: // Consultar disponibilidad
                await this.whatsAppService.sendTextMessage(
                    sender,
                    "Para consultar disponibilidad, necesito saber qué producto te interesa. ¿Podrías indicarme cuál es el producto que buscas?",
                    originalMessage
                );
                await this.messageHandler.saveHistory(sender, 'assistant', "Para consultar disponibilidad, necesito saber qué producto te interesa. ¿Podrías indicarme cuál es el producto que buscas?");
                await this.messageHandler.updateUser(sender, { etapaConversacion: 'esperando_busqueda' });
                break;
            case 4: // Info de envíos
                const mensajeEnvios = `*Información sobre envíos* 🚚

        Realizamos envíos a nivel nacional:

        ✅ Lima Metropolitana: Entrega en 24-48 horas (S/15)
        ✅ Provincias: Entrega en 3-5 días hábiles (varía según destino)
        ✅ Envío gratis: En compras mayores a S/200 en Lima

        Para coordinar un envío, necesitamos:
        - Nombre completo
        - Dirección exacta
        - Teléfono de contacto
        - Referencia del domicilio

        ¿Necesitas cotizar el envío para algún producto específico?`;
                await this.whatsAppService.sendTextMessage(sender, mensajeEnvios, originalMessage);
                await this.messageHandler.saveHistory(sender, 'assistant', mensajeEnvios);
                await this.messageHandler.updateUser(sender, { etapaConversacion: 'informacion_envios' });
                break;
            case 5: // Contactar vendedor
                const mensajeContacto = `
        En breve uno de nuestros vendedores se pondrá en contacto contigo. 

        Mientras tanto, ¿hay algún producto específico que te interese? Puedo mostrarte detalles para que tengas más información.`;
                await this.whatsAppService.sendTextMessage(sender, mensajeContacto, originalMessage);
                await this.messageHandler.saveHistory(sender, 'assistant', mensajeContacto);

                // Notificar al dueño/vendedor
                const numeroDelDueño = `${process.env.OWNER_NUMBER}@c.us`;
                const mensajeDueño = `
        📢 *Cliente solicitó contacto con vendedor*
        👤 *Nombre:* ${originalMessage.pushName || "Cliente"}
        📱 *Número:* ${sender.split('@')[0]}
        ⏰ *Fecha/Hora:* ${new Date().toLocaleString()}
        `;
                await this.whatsAppService.sendTextMessage(numeroDelDueño, mensajeDueño);

                await this.messageHandler.updateUser(sender, { etapaConversacion: 'esperando_vendedor' });
                break;
            default:
                await this._mostrarMenuInicial(sender, originalMessage);
        }
    }

    async _processSelectProductCase(numeroSeleccionado, sender, originalMessage) {
        switch (numeroSeleccionado) {
            case 1: // Ver más detalles del producto actual
                if (usuario.productoActual) {
                    await this._obtenerDetallesProducto(usuario.productoActual, sender, originalMessage);
                } else {
                    await this.whatsAppService.sendTextMessage(
                        sender,
                        "Lo siento, parece que no tengo el registro del producto que estabas viendo. ¿Podrías buscar nuevamente?",
                        originalMessage
                    );
                    await this.messageHandler.saveHistory(sender, 'assistant', "Lo siento, parece que no tengo el registro del producto que estabas viendo. ¿Podrías buscar nuevamente?");
                    await this.messageHandler.updateUser(sender, { etapaConversacion: 'esperando_busqueda' });
                }
                break;
            case 2: // Buscar otro producto
                await this.whatsAppService.sendTextMessage(
                    sender,
                    "¡Perfecto! ¿Qué otro producto te gustaría buscar? Por favor, indícame el nombre o tipo de producto.",
                    originalMessage
                );
                await this.messageHandler.saveHistory(sender, 'assistant', "¡Perfecto! ¿Qué otro producto te gustaría buscar? Por favor, indícame el nombre o tipo de producto.");
                await this.messageHandler.updateUser(sender, { etapaConversacion: 'esperando_busqueda' });
                break;
            case 3: // Ver catálogo completo
                await this._enviarCatalogo(sender, originalMessage);
                break;
            case 4: // Contactar vendedor para comprar
                const mensajeCompraNuevo = `
            ¡Excelente elección! En breve uno de nuestros vendedores se pondrá en contacto para ayudarte con la compra del producto. Mientras tanto, ¿hay algo más en lo que pueda ayudarte?`;
                await this.whatsAppService.sendTextMessage(sender, mensajeCompraNuevo, originalMessage);
                await this.messageHandler.saveHistory(sender, 'assistant', mensajeCompraNuevo);

                // Notificar al dueño/vendedor sobre interés de compra
                const numDueño = process.env.OWNER_NUMBER || "51931341082@c.us";
                const productoId = usuario.productoActual;
                let nombreProducto = "producto consultado";

                // Intentar obtener nombre del producto
                const productos = await Product.find({ whatsappId: sender });
                if (productos) {
                    const productoEncontrado = productos.find(p => p.idProducto === productoId);
                    if (productoEncontrado) {
                        nombreProducto = productoEncontrado.nombre;
                    }
                }

                const mensajeInteresCompra = `
            🔔 *INTERÉS DE COMPRA* 🔔
            👤 *Cliente:* ${originalMessage.pushName || "Cliente"}
            📱 *Número:* ${sender.split('@')[0]}
            🛒 *Producto:* ${nombreProducto}
            🆔 *ID Producto:* ${productoId || "No disponible"}
            ⏰ *Fecha/Hora:* ${new Date().toLocaleString()}
            
            ✅ El cliente está interesado en comprar y espera ser contactado. Por favor, comunícate a la brevedad.
            `;
                await this.whatsAppService.sendTextMessage(numDueño, mensajeInteresCompra);

                await this.messageHandler.updateUser(sender, { etapaConversacion: 'esperando_vendedor' });
                break;
            default:
                await this.messageHandler._mostrarOpcionesDespuesDeProducto(sender, originalMessage);
        }
    }

    // Identifica si el usuario pide un catálogo
    _detectarPeticionCatalogo(texto) {
        const patrones = [
            /catálogo/i,
            /catalogo/i,
            /productos/i,
            /listado/i,
            /tienen más/i,
            /qué más tienen/i,
            /qué tienen/i,
            /lista/i,
            /mostrar/i,
            /ver más/i,
            /ver todo/i,
            /ver opciones/i
        ];
        return patrones.some((p) => p.test(texto));
    }

    _detectarAceptacionCatalogo(texto) {
        const patrones = [
            /si\b/i,
            /claro/i,
            /por supuesto/i,
            /sí/i,
            /ok/i,
            /okay/i,
            /dale/i,
            /adelante/i,
            /envía/i,
            /envia/i,
            /manda/i,
            /bueno/i,
            /bien/i,
            /quiero/i,
            /me gustaría/i,
            /envíame/i,
            /enviame/i,
            /^1$/i,      // Solo el número 1 (asumiendo que 1 = catálogo)
            /^catálogo$/i,
            /^catalogo$/i
        ];
        return patrones.some((p) => p.test(texto));
    }

    async _enviarCatalogo(sender, originalMessage) {
        try {
            // Actualizar estado del usuario
            await this.messageHandler.updateUser(sender, {
                esperandoRespuestaCatalogo: false,
                ofrecidoCatalogo: true
            });

            // Enviar mensaje sobre el catálogo
            const mensajeCatalogo = "¡Excelente! Aquí te comparto nuestro catálogo completo de productos. Puedes revisarlo y si necesitas información sobre algún producto específico, no dudes en preguntarme. 📚";
            await this.whatsAppService.sendTextMessage(sender, mensajeCatalogo, originalMessage);

            // Enviar el PDF del catálogo
            try {
                await this.whatsAppService.sendDocumentMessage(
                    sender,
                    this.catalogoPDFUrl,
                    originalMessage,
                    "Catálogo_Productos.pdf",
                    "Catálogo completo de productos"
                );
                await this.messageHandler.saveHistory(sender, 'assistant', mensajeCatalogo + " [Se envió el catálogo PDF]");
            } catch (pdfError) {
                console.error("Error al enviar el catálogo PDF:", pdfError);
                await this.whatsAppService.sendTextMessage(
                    sender,
                    "Lo siento, tuve problemas para enviar el catálogo. Puedes descargarlo directamente desde este enlace: " + this.catalogoPDFUrl,
                    originalMessage
                );
                await this.messageHandler.saveHistory(sender, 'assistant', "Lo siento, tuve problemas para enviar el catálogo. Puedes descargarlo directamente desde este enlace: " + this.catalogoPDFUrl);
            }
        } catch (error) {
            console.error("Error al enviar catálogo:", error);
        }
    }

    // Detecta si el usuario quiere comprar algo
    _detectarIntencionCompra(texto) {
        const patrones = [
            /cuánto cuesta/i,
            /precio/i,
            /cotización/i,
            /quiero comprar/i,
            /puedo pagar/i,
            /tienes/i,
            /cuánto vale/i,
            /disponible/i,
            /venden/i,
            /tienen/i,
            /comprar/i,
            /adquirir/i,
            /buscar/i,
            /busco/i,
            /necesito/i,
            /productos/i,
            /ver producto/i,
            /mostrar productos/i
        ];
        return patrones.some((p) => p.test(texto));
    }

    async _processSearchProductCase(cleanText, sender, originalMessage) {
        // 1. Extraemos el nombre del producto desde el mensaje
        const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const extractPrompt = `
        Extrae solamente el nombre del producto del siguiente mensaje. Devuélvelo sin ninguna palabra adicional. Si no hay producto, responde "ninguno".
        Mensaje: "${cleanText}"
        `;

        const extractCompletion = await client.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: "Eres un extractor de nombres de producto desde mensajes de clientes." },
                { role: "user", content: extractPrompt }
            ],
            temperature: 0,
            max_tokens: 50,
        });

        const productoBuscado = extractCompletion.choices[0].message.content.trim();

        if (productoBuscado.toLowerCase() === "ninguno") {
            // No se identificó un producto específico
            await this.whatsAppService.sendTextMessage(
                sender,
                "Parece que estás buscando un producto, pero no logro identificar cuál. ¿Podrías detallar más qué producto estás buscando?",
                originalMessage
            );
            await this.messageHandler.saveHistory(sender, 'assistant', "Parece que estás buscando un producto, pero no logro identificar cuál. ¿Podrías detallar más qué producto estás buscando?");
            await this.messageHandler.updateUser(sender, { etapaConversacion: 'esperando_busqueda' });
        } else {
            // Se identificó un producto, buscar y mostrar lista
            await this._buscarProductosYMostrarLista(productoBuscado, sender, originalMessage);
        }
    }

    _detectarBusquedaNueva(texto) {
        const patrones = [
            /otros productos/i,
            /buscar otro/i,
            /otra cosa/i,
            /otro producto/i,
            /buscar más/i,
            /buscar mas/i,
            /buscar de nuevo/i,
            /nueva búsqueda/i,
            /nueva busqueda/i,
            /otro artículo/i,
            /otro articulo/i,
            /regresar/i,
            /volver/i,
            /menú/i,
            /menu/i,
            /buscar algo más/i,
            /buscar algo mas/i,
            /cambiar producto/i
        ];
        return patrones.some((p) => p.test(texto));
    }

    async _mostrarMenuInicial(sender, originalMessage) {
        const mensajeMenu = `
    ¡Hola! 👋 Soy el asistente de la tienda. ¿En qué puedo ayudarte hoy?

    1️⃣ - Ver catálogo completo 📚
    2️⃣ - Buscar un producto específico 🔍
    3️⃣ - Consultar disponibilidad 📦
    4️⃣ - Información de envíos 🚚
    5️⃣ - Contactar con un vendedor 👨‍💼

    Puedes elegir una opción escribiendo el número o hacerme cualquier pregunta directamente.`;

        await this.whatsAppService.sendTextMessage(sender, mensajeMenu.trim(), originalMessage);
        await this.messageHandler.saveHistory(sender, 'assistant', mensajeMenu.trim());
        await this.messageHandler.updateUser(sender, { etapaConversacion: 'menu_inicial' });
    }

    // Verifica si el mensaje está relacionado con el negocio
    _detectarTemaNegocio(texto) {
        // Patrones que indican que el tema está relacionado con el negocio
        const patrones = [
            // Términos de productos/servicios
            /producto/i, /servicio/i, /artículo/i, /articulo/i, /item/i,
            /catálogo/i, /catalogo/i, /inventario/i, /stock/i, /disponibilidad/i,

            // Términos de compra
            /comprar/i, /adquirir/i, /precio/i, /costo/i, /valor/i,
            /cotización/i, /cotizacion/i, /oferta/i, /promoción/i, /promocion/i,
            /descuento/i, /pago/i, /efectivo/i, /tarjeta/i, /transferencia/i,

            // Términos de entrega/logística
            /envío/i, /envio/i, /entrega/i, /despacho/i, /recojo/i, /delivery/i,
            /tiempo/i, /plazo/i, /dirección/i, /direccion/i, /ubicación/i, /ubicacion/i,

            // Términos de atención/consulta
            /atender/i, /atención/i, /atencion/i, /consulta/i, /duda/i,
            /preguntar/i, /informar/i, /información/i, /informacion/i,
            /horario/i, /tienda/i, /local/i, /tiendas/i,

            // Términos de negocios
            /negocio/i, /empresa/i, /venta/i, /comercio/i, /tienda/i,
            /vendedor/i, /cliente/i, /comprador/i, /proveedor/i,

            // Categorías específicas (personalizar según el negocio)
            /ropa/i, /tecnología/i, /tecnologia/i, /electrónico/i, /electronico/i,
            /computadora/i, /laptop/i, /celular/i, /teléfono/i, /telefono/i
        ];

        return patrones.some((p) => p.test(texto));
    }


    async _processIA(cleanText, sender, etapaActual, originalMessage) {
        const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        // Obtener historial para dar contexto a la AI
        const historialUsuario = await this.getHistory(sender, 6);
        const mensajesHistorial = historialUsuario.map(m => ({
            role: m.role,
            content: m.content
        }));

        const systemPrompt = `
      Eres un asistente virtual amable para una tienda online. Da respuestas breves, amables y claras, enfocadas en el negocio.
      
      Tienes las siguientes funciones principales:
      1. Ayudar a buscar productos
      2. Informar sobre precios y disponibilidad
      3. Compartir catálogos
      4. Informar sobre envíos y formas de pago
      
      Tu objetivo es mantener al cliente interesado y eventualmente guiarlo hacia ver productos específicos, solicitar el catálogo o contactar con un vendedor.
      
      No respondas a temas personales o no relacionados con la tienda.
      
      El cliente debe ser guiado a seguir las opciones del menú:
      - Ver catálogo completo
      - Buscar un producto específico
      - Consultar disponibilidad
      - Información de envíos
      - Contactar con un vendedor
      `;

        const completion = await client.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: systemPrompt },
                ...mensajesHistorial,
                { role: "user", content: cleanText }
            ],
            max_tokens: 250,
            temperature: 0.7,
        });

        const respuestaAI = completion.choices[0].message.content;

        // Guardar respuesta del bot en el historial
        await this.messageHandler.saveHistory(sender, 'assistant', respuestaAI);

        // Enviar respuesta de texto
        await this.whatsAppService.sendTextMessage(sender, respuestaAI, originalMessage);

        // Si llevamos varias interacciones y no estamos en un flujo específico, mostrar menú de nuevo
        const interaccionesTotal = historialUsuario.length;
        if (interaccionesTotal > 10 && etapaActual === 'conversando') {
            setTimeout(async () => {
                await this._mostrarMenuInicial(sender, originalMessage);
            }, 2000);
        }

    }

    async _obtenerDetallesProducto(idProducto, sender, originalMessage) {
        try {
            const url = `${process.env.API_REST_URL}/api/producto/id?idProducto=${idProducto}`;
            const response = await axios.get(url);
            const producto = response.data;

            if (!producto) {
                await this.whatsAppService.sendTextMessage(
                    sender,
                    "Lo siento, no pude obtener detalles de este producto. ¿Quieres ver otros productos?",
                    originalMessage
                );
                return null;
            }

            // Registrar el producto consultado
            await this._registrarProductoConsultado(sender, producto);

            // Construir mensaje detallado del producto
            let mensajeDetalle = `*${producto.nombre}*\n\n`;
            mensajeDetalle += `💰 *Precio:* S/ ${producto.precio}\n`;
            mensajeDetalle += `📋 *Código:* ${producto.codigo}\n`;
            mensajeDetalle += `📋 *Sku:* ${producto.sku}\n`;
            // mensajeDetalle += `🏷️ *Categoría:* ${producto.categoria}\n`;

            // if (producto.marca) {
            //   mensajeDetalle += `🔖 *Marca:* ${producto.marca}\n`;
            // }

            // if (producto.descripcion) {
            //   mensajeDetalle += `\n📝 *Descripción:*\n${producto.descripcion}\n`;
            // }

            // mensajeDetalle += `\n📦 *Stock disponible:* ${producto.stock} unidades\n`;

            // if (producto.observacion) {
            //   mensajeDetalle += `\n📌 *Observaciones:*\n${producto.observacion}\n`;
            // }

            mensajeDetalle += `\nSi estás interesado en comprar este producto, puedo contactarte con un vendedor inmediatamente.`;

            await this.whatsAppService.sendTextMessage(sender, mensajeDetalle, originalMessage);
            await this.messageHandler.saveHistory(sender, 'assistant', mensajeDetalle);

            // Enviar imagen si está disponible
            if (producto.imagen) {
                try {
                    await this.whatsAppService.sendImageMessage(sender, producto.imagen.url, originalMessage);
                } catch (imgError) {
                    console.error("Error al enviar imagen:", imgError.message);
                }
            }

            // Mostrar opciones después de mostrar el producto
            await this._mostrarOpcionesDespuesDeProducto(sender, originalMessage);

            // Actualizar etapa
            await this.messageHandler.updateUser(sender, {
                etapaConversacion: 'mostrando_producto',
                productoActual: idProducto
            });

            // Notificar al dueño del interés en este producto
            const mensajeDueño = `
          📢 *Cliente interesado en producto*
          👤 *Cliente:* ${originalMessage.pushName || "Cliente"}
          📱 *Número:* ${sender.split('@')[0]}
          🛍️ *Producto:* ${producto.nombre}
          💰 *Precio:* S/ ${producto.precio}
          📋 *Código:* ${producto.codigo}
          `;
            const numeroDelDueño = `${process.env.OWNER_NUMBER}@c.us`;
            await this.whatsAppService.sendTextMessage(numeroDelDueño, mensajeDueño);

            return producto;
        } catch (error) {
            console.error("Error al obtener detalles del producto:", error);
            await this.whatsAppService.sendTextMessage(
                sender,
                "Lo siento, no pude obtener los detalles de este producto en este momento. ¿Quieres ver otros productos?",
                originalMessage
            );
            await this.messageHandler.saveHistory(sender, 'assistant', "Lo siento, no pude obtener los detalles de este producto en este momento. ¿Quieres ver otros productos?");
            return null;
        }
    }


    async _buscarProductosYMostrarLista(termino, sender, originalMessage) {
        try {
            const url = `${process.env.API_REST_URL}/api/producto/list?opcion=1&buscar=${encodeURIComponent(termino)}&posicionPagina=0&filasPorPagina=10`;
            const response = await axios.get(url);
            const productos = response.data.result || [];

            if (productos.length === 0) {
                await this.whatsAppService.sendTextMessage(
                    sender,
                    `No encontré productos que coincidan con "${termino}". ¿Podrías intentar con otra búsqueda o ver nuestro catálogo completo?`,
                    originalMessage
                );
                await this.saveHistory(sender, 'assistant', `No encontré productos que coincidan con "${termino}". ¿Podrías intentar con otra búsqueda o ver nuestro catálogo completo?`);
                return [];
            }

            // Guardar resultados para uso futuro cuando seleccionen por número
            const newProducts = productos.map(p => {
                return {
                    whatsappId: sender,
                    ...p
                }
            });

            await Product.deleteMany({ whatsappId: sender });
            await Product.insertMany(newProducts);

            // Crear lista numerada de productos
            let mensajeLista = `Encontré ${productos.length} producto${productos.length > 1 ? 's' : ''} que coinciden con tu búsqueda:\n\n`;

            productos.forEach((producto, index) => {
                mensajeLista += `${index + 1}️⃣ *${producto.nombre}*\n`;
                mensajeLista += `   💰 Precio: S/ ${producto.precio}\n`;
                mensajeLista += `   📋 Código: ${producto.codigo}\n\n`;
            });

            mensajeLista += "Para ver más detalles de un producto, escribe el número correspondiente. O si prefieres, puedes hacer una nueva búsqueda.";

            await this.whatsAppService.sendTextMessage(sender, mensajeLista, originalMessage);
            await this.messageHandler.saveHistory(sender, 'assistant', mensajeLista);

            // Actualizar estado del usuario
            await this.messageHandler.updateUser(sender, {
                etapaConversacion: 'mostrando_resultados',
                esperandoSeleccionProducto: true
            });

            return productos;
        } catch (error) {
            console.error("Error al buscar productos:", error);
            await this.whatsAppService.sendTextMessage(
                sender,
                "Lo siento, tuve un problema al buscar productos. ¿Podrías intentarlo nuevamente?",
                originalMessage
            );
            await this.saveHistory(sender, 'assistant', "Lo siento, tuve un problema al buscar productos. ¿Podrías intentarlo nuevamente?");
            return [];
        }
    }

    async _registrarProductoConsultado(sender, producto) {
        try {
            await User.findOneAndUpdate(
                { whatsappId: sender },
                {
                    $push: {
                        productosConsultados: {
                            productoId: producto.idProducto,
                            nombre: producto.nombre,
                            fecha: new Date()
                        }
                    }
                }
            );
            console.log(`✅ Producto registrado para usuario ${sender}: ${producto.nombre}`);
        } catch (error) {
            console.error('❌ Error al registrar producto consultado:', error);
        }
    }

    async _mostrarOpcionesDespuesDeProducto(sender, originalMessage) {
        const mensajeOpciones = `¿Qué te gustaría hacer ahora?

    1️⃣ Ver más detalles de este producto
    2️⃣ Buscar otro producto 
    3️⃣ Ver catálogo completo
    4️⃣ Contactar con un vendedor para comprar

    Por favor, indica el número de la opción que prefieres o escribe tu consulta.`;

        await this.whatsAppService.sendTextMessage(sender, mensajeOpciones, originalMessage);
        await this.messageHandler.saveHistory(sender, 'assistant', mensajeOpciones);
    }

}

module.exports = MessageBusinessHandle;