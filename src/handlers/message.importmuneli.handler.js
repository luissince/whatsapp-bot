const OpenAI = require('openai');

class MessageImportmuneliHandler {

    constructor(whatsAppService, messageHandler) {
        this.whatsAppService = whatsAppService;
        this.messageHandler = messageHandler;
        this.jsonProduct = null;
        this.loadProduct();
    }

    async loadProduct() {
        try {
            const response = await fetch(`${process.env.API_REST_URL}/api/producto/filter/web/id?codigo=TOL001`);
            if (!response.ok) throw new Error("Error al cargar producto");
            
            this.jsonProduct = await response.json();
            console.log('Producto cargado correctamente');
            
            // Datos de respaldo en caso de error en propiedades
            this.jsonProduct = {
                ...this.jsonProduct,
                nombre: this.jsonProduct.nombre || "Toldo Plegable 3x3",
                precio: this.jsonProduct.precio || 210,
                colores: this.jsonProduct.colores || [
                    {nombre: "Rojo", hexadecimal: "#f00f0f"},
                    {nombre: "Azul", hexadecimal: "#0e4295"}
                ],
                detalles: this.jsonProduct.detalles || [
                    {nombre: "Ancho", valor: "3m"},
                    {nombre: "Alto", valor: "3m"},
                    {nombre: "Largo", valor: "3m"}
                ],
                descripcionLarga: this.jsonProduct.descripcionLarga || "Descripción genérica del producto",
                imagenes: this.jsonProduct.imagenes || []
            };
        } catch (error) {
            console.error('Error al cargar producto:', error);
            // Datos mínimos para que el bot funcione
            this.jsonProduct = {
                nombre: "Toldo Plegable 3x3",
                precio: 210,
                colores: [
                    {nombre: "Rojo", hexadecimal: "#f00f0f"},
                    {nombre: "Azul", hexadecimal: "#0e4295"}
                ],
                detalles: [
                    {nombre: "Ancho", valor: "3m"},
                    {nombre: "Alto", valor: "3m"},
                    {nombre: "Largo", valor: "3m"}
                ],
                descripcionLarga: "Toldo plegable de 3x3 metros con estructura metálica y tela resistente.",
                imagenes: []
            };
        }
    }

    async handleProcess(cleanText, usuario, etapaActual, numeroSeleccionado, sender, originalMessage) {
        // Si es la primera interacción o un saludo, mostrar mensaje inicial
        if (etapaActual === 'inicial' || this._detectarSaludo(cleanText)) {
            await this._mostrarMensajeInicialToldo(sender, originalMessage);
            return;
        }

        // Procesar selección numérica del menú principal
        if (etapaActual === 'menu_toldo' && numeroSeleccionado !== null) {
            await this._procesarOpcionMenuToldo(numeroSeleccionado, sender, originalMessage);
            return;
        }

        // Procesar consulta sobre color
        if (etapaActual === 'consulta_color' && (cleanText.toLowerCase().includes("rojo") || cleanText.toLowerCase().includes("azul"))) {
            await this._procesarSeleccionColor(cleanText, sender, originalMessage);
            return;
        }

        // Procesar consulta sobre envío
        if (etapaActual === 'consulta_envio' &&
            (cleanText.toLowerCase().includes("domicilio") || cleanText.toLowerCase().includes("agencia"))) {
            await this._procesarOpcionEnvio(cleanText, sender, originalMessage);
            return;
        }

        // Detectar palabras clave para redirigir a las opciones principales
        if (this._detectarConsultaToldo(cleanText)) {
            await this._redirigirConsultaToldo(cleanText, sender, originalMessage);
            return;
        }

        // Si llegamos a este punto, es una consulta general - usar IA
        await this._processIAToldo(cleanText, sender, etapaActual, originalMessage);
    }

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

    async _mostrarMensajeInicialToldo(sender, originalMessage) {
        const mensajeInicial = `¡Hola! 👋 ¿Interesado en nuestro *${this.jsonProduct.nombre}*? 🏕️\n\n` +
            `📦 *Precio:* S/${this.jsonProduct.precio} (envío incluido)\n` +
            `🎨 *Colores:* ${this.jsonProduct.colores.map(c => c.nombre).join(" | ")}\n` +
            `📏 *Dimensiones:* ${this._obtenerDimensiones()}\n\n` +
            `👇 *Elige una opción:*\n` +
            `>>> *1* - Ver detalles completos\n` +
            `>>> *2* - Hacer pedido\n` +
            `>>> *3* - Métodos de pago\n` +
            `>>> *4* - Envíos a provincia\n` +
            `>>> *5* - Otra consulta`;

        await this.whatsAppService.sendTextMessage(sender, mensajeInicial, originalMessage);
        await this.messageHandler.saveHistory(sender, 'assistant', mensajeInicial);
        await this.messageHandler.updateUser(sender, {
            etapaConversacion: 'menu_toldo',
            ofrecidoCatalogo: true,
            esperandoRespuestaCatalogo: false,
            esperandoSeleccionProducto: false,
            productoActual: 'toldo_plegable_3x3',
            viendoImagenes: false
        });

        // Después de 90 segundos, mostrar mensaje de cierre de venta si no ha habido respuesta
        setTimeout(async () => {
            const usuario = await this.messageHandler.getUser(sender);
            if (usuario.etapaConversacion === 'menu_toldo' && !usuario.viendoImagenes) {
                await this._mostrarCierreDeVenta(sender, originalMessage);
            }
        }, 90000);
    }

    _obtenerDimensiones() {
        const detalles = this.jsonProduct.detalles;
        const ancho = detalles.find(d => d.nombre === "Ancho").valor;
        const alto = detalles.find(d => d.nombre === "Alto").valor;
        const largo = detalles.find(d => d.nombre === "Largo").valor;
        return `${ancho} (ancho) x ${alto} (alto) x ${largo} (largo)`;
    }

    async _procesarOpcionMenuToldo(opcion, sender, originalMessage) {
        switch (opcion) {
            case 1: // Ver detalles
                await this.messageHandler.updateUser(sender, {
                    viendoImagenes: true
                });

                const detallesTecnicos = this.jsonProduct.detalles
                    .filter(d => !['Ancho', 'Alto', 'Largo'].includes(d.nombre))
                    .map(d => `✔️ *${d.nombre}:* ${d.valor}`)
                    .join("\n");

                const mensajeDetalles = `¡Claro! 😄 Nuestro *${this.jsonProduct.nombre}* tiene:\n\n` +
                    `${detallesTecnicos}\n\n` +
                    `📝 *Descripción:* ${this.jsonProduct.descripcionLarga}\n\n` +
                    `⏳ *Estoy preparando las imágenes...* Un momento por favor.`;

                await this.whatsAppService.sendTextMessage(sender, mensajeDetalles, originalMessage);
                
                // Enviar mensaje de "cargando"
                const mensajeCargando = await this._mostrarEstadoProcesamiento(
                    sender, 
                    "Cargando imágenes del producto", 
                    originalMessage
                );

                try {
                    // Enviar imágenes del producto
                    for (const [index, img] of this.jsonProduct.imagenes.slice(0, 3).entries()) {
                        await this.whatsAppService.sendImageMessage(sender, img.nombre, originalMessage);
                        if (index < 2) { // Pequeño delay entre imágenes excepto la última
                            await new Promise(resolve => setTimeout(resolve, 1500));
                        }
                    }
                    
                    // Eliminar mensaje de "cargando"
                    await this.whatsAppService.deleteMessage(sender, mensajeCargando.id);
                    
                    // Mensaje posterior a imágenes
                    await this.whatsAppService.sendTextMessage(
                        sender,
                        "¿Te gustaría más información o deseas proceder con tu pedido?",
                        originalMessage
                    );
                    
                } catch (error) {
                    console.error("Error al enviar imágenes:", error);
                    await this.whatsAppService.sendTextMessage(
                        sender,
                        "⚠️ Ocurrió un error al cargar las imágenes. ¿Deseas intentarlo de nuevo o prefieres continuar con tu pedido?",
                        originalMessage
                    );
                }

                await this.messageHandler.updateUser(sender, {
                    viendoImagenes: false,
                    etapaConversacion: 'menu_toldo'
                });
                break;

            case 2: // Hacer pedido
                const mensajePedido = `¡Súper fácil! 😎 Solo necesito que me brindes estos datos para coordinar tu envío:\n\n` +
                    `📍 Ciudad y distrito\n` +
                    `🎨 Color: ${this.jsonProduct.colores.map(c => c.nombre).join(" o ")}\n` +
                    `📦 ¿Deseas envío a domicilio o recoger en agencia?\n\n` +
                    `Una vez confirmes, coordinamos tu pedido. El proceso de pago es muy seguro 👇`;

                await this.whatsAppService.sendTextMessage(sender, mensajePedido, originalMessage);
                await this.messageHandler.saveHistory(sender, 'assistant', mensajePedido);
                await this.messageHandler.updateUser(sender, { 
                    etapaConversacion: 'consulta_color',
                    viendoImagenes: false 
                });
                break;

            case 3: // Métodos de pago
                const mensajePago = `Claro, aquí te explico según tu ubicación:\n\n` +
                    `📍 *Lima Metropolitana:*\n` +
                    `➡️ Pago *contra entrega*. Solo pagas cuando recibes el producto.\n\n` +
                    `📍 *Provincia:*\n` +
                    `➡️ Solo pedimos un adelanto mínimo de *S/10* 💰\n` +
                    `El resto lo pagas al recibirlo en tu ciudad.\n` +
                    `✅ Enviamos por *agencias como Shalom* o la que prefieras.\n` +
                    `🎥 Puedes pedir fotos, videos o videollamada como prueba del envío.\n\n` +
                    `Este método nos ayuda a evitar fraudes de ambas partes 🤝`;

                await this.whatsAppService.sendTextMessage(sender, mensajePago, originalMessage);
                await this.messageHandler.saveHistory(sender, 'assistant', mensajePago);

                // Mostrar cierre de venta después de explicar los métodos de pago
                setTimeout(async () => {
                    const usuario = await this.messageHandler.getUser(sender);
                    if (usuario.etapaConversacion === 'menu_toldo') {
                        await this._mostrarCierreDeVenta(sender, originalMessage);
                    }
                }, 5000);
                break;

            case 4: // Envíos a provincia
                const mensajeEnvio = `¡Sí, claro! 🚛 Enviamos a TODO el Perú desde Lima.\n\n` +
                    `📦 Por lo general usamos *Shalom*, pero podemos enviar por otra agencia si lo prefieres.\n` +
                    `💸 El costo del envío lo cobra directamente la agencia (aprox. *S/18 a S/25*).\n` +
                    `📆 Los envíos se hacen todos los días a las *6:00 p.m.*\n\n` +
                    `✨ Al enviar, te compartimos la guía y pruebas del despacho.`;

                await this.whatsAppService.sendTextMessage(sender, mensajeEnvio, originalMessage);
                await this.messageHandler.saveHistory(sender, 'assistant', mensajeEnvio);

                setTimeout(async () => {
                    const usuario = await this.messageHandler.getUser(sender);
                    if (usuario.etapaConversacion === 'menu_toldo') {
                        await this._mostrarCierreDeVenta(sender, originalMessage);
                    }
                }, 5000);
                break;

            case 5: // Otra consulta
                const mensajeOtraConsulta = `Estoy aquí para ayudarte 🤗 Escríbeme tu duda y te responderé en un momento. ¡Nuestro equipo está activo de Lunes a Domingo! 💬`;
                await this.whatsAppService.sendTextMessage(sender, mensajeOtraConsulta, originalMessage);
                await this.messageHandler.saveHistory(sender, 'assistant', mensajeOtraConsulta);
                break;

            default:
                // Si no es una opción válida, mostrar el mensaje inicial nuevamente
                await this._mostrarMensajeInicialToldo(sender, originalMessage);
        }
    }

    async _procesarSeleccionColor(texto, sender, originalMessage) {
        const coloresDisponibles = this.jsonProduct.colores;
        let colorSeleccionado = null;

        for (const color of coloresDisponibles) {
            if (texto.toLowerCase().includes(color.nombre.toLowerCase())) {
                colorSeleccionado = color;
                break;
            }
        }

        if (colorSeleccionado) {
            const mensajeConfirmacion = `¡Excelente elección! Has seleccionado el color *${colorSeleccionado.nombre}* 🎨\n\n` +
                `🔹 *Código hexadecimal:* ${colorSeleccionado.hexadecimal}\n\n` +
                `Ahora necesito saber:\n` +
                `📍 ¿En qué ciudad y distrito te encuentras?\n` +
                `📦 ¿Prefieres envío a domicilio o recoger en agencia?`;

            // Enviar imagen del color seleccionado si está disponible
            const imagenColor = this.jsonProduct.imagenes.find(img =>
                img.nombre.toLowerCase().includes(colorSeleccionado.nombre.toLowerCase()));

            if (imagenColor) {
                await this.whatsAppService.sendImageMessage(sender, imagenColor.nombre, originalMessage);
            }

            await this.whatsAppService.sendTextMessage(sender, mensajeConfirmacion, originalMessage);
            await this.messageHandler.updateUser(sender, {
                etapaConversacion: 'consulta_envio',
                colorSeleccionado: colorSeleccionado.nombre,
                viendoImagenes: false
            });
        } else {
            const opcionesColores = coloresDisponibles.map(c => `🔘 *${c.nombre}* (${c.hexadecimal})`).join("\n");
            await this.whatsAppService.sendTextMessage(
                sender,
                `Por favor, elige uno de nuestros colores disponibles:\n\n${opcionesColores}`,
                originalMessage
            );
        }
    }

    async _procesarOpcionEnvio(texto, sender, originalMessage) {
        let tipoEnvio = "";
        if (texto.toLowerCase().includes("domicilio")) {
            tipoEnvio = "Envío a domicilio";
        } else if (texto.toLowerCase().includes("agencia")) {
            tipoEnvio = "Recojo en agencia";
        }

        const usuario = await this.messageHandler.getUser(sender);
        const colorSeleccionado = usuario.colorSeleccionado || "No especificado";

        const mensajeConfirmacionPedido = `¡Perfecto! Resumen de tu pedido:\n\n` +
            `🛒 *Producto:* ${this.jsonProduct.nombre}\n` +
            `🎨 *Color:* ${colorSeleccionado}\n` +
            `🚚 *Entrega:* ${tipoEnvio}\n\n` +
            `Para finalizar tu pedido, por favor indícame:\n` +
            `📍 Tu dirección exacta con referencias (o la agencia de tu preferencia)\n` +
            `📱 Un número de contacto adicional (opcional)\n\n` +
            `Una vez confirmes estos datos, coordinaremos el pago y envío inmediato. 🚀`;

        await this.whatsAppService.sendTextMessage(sender, mensajeConfirmacionPedido, originalMessage);
        await this.messageHandler.saveHistory(sender, 'assistant', mensajeConfirmacionPedido);
        await this.messageHandler.updateUser(sender, {
            etapaConversacion: 'confirmacion_pedido',
            tipoEnvio: tipoEnvio,
            viendoImagenes: false
        });

        // Notificar al dueño del interés confirmado
        const mensajeDueño = `
📢 *PEDIDO DE ${this.jsonProduct.nombre.toUpperCase()}*
👤 *Cliente:* ${originalMessage.pushName || "Cliente"}
📱 *Número:* ${sender.split('@')[0]}
🛒 *Producto:* ${this.jsonProduct.nombre}
🎨 *Color seleccionado:* ${colorSeleccionado}
🚚 *Tipo de entrega:* ${tipoEnvio}
⏰ *Fecha/Hora:* ${new Date().toLocaleString()}
`;
        const numeroDelDueño = `${process.env.OWNER_NUMBER}@c.us`;
        await this.whatsAppService.sendTextMessage(numeroDelDueño, mensajeDueño);
    }

    async _redirigirConsultaToldo(texto, sender, originalMessage) {
        // Analizar el texto para determinar qué opción del menú mostrar
        if (texto.toLowerCase().includes("precio") ||
            texto.toLowerCase().includes("costo") ||
            texto.toLowerCase().includes("vale")) {
            await this._mostrarMensajeInicialToldo(sender, originalMessage);
        }
        else if (texto.toLowerCase().includes("característica") ||
            texto.toLowerCase().includes("detalle") ||
            texto.toLowerCase().includes("material")) {
            await this._procesarOpcionMenuToldo(1, sender, originalMessage);
        }
        else if (texto.toLowerCase().includes("pedido") ||
            texto.toLowerCase().includes("comprar") ||
            texto.toLowerCase().includes("adquirir")) {
            await this._procesarOpcionMenuToldo(2, sender, originalMessage);
        }
        else if (texto.toLowerCase().includes("pago") ||
            texto.toLowerCase().includes("pagar") ||
            texto.toLowerCase().includes("transferencia")) {
            await this._procesarOpcionMenuToldo(3, sender, originalMessage);
        }
        else if (texto.toLowerCase().includes("envío") ||
            texto.toLowerCase().includes("envio") ||
            texto.toLowerCase().includes("provincia") ||
            texto.toLowerCase().includes("despacho")) {
            await this._procesarOpcionMenuToldo(4, sender, originalMessage);
        }
        else {
            // Si no detectamos una intención clara, mostrar el menú inicial
            await this._mostrarMensajeInicialToldo(sender, originalMessage);
        }
    }

    async _processIAToldo(cleanText, sender, etapaActual, originalMessage) {
        const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        // Obtener historial para dar contexto a la AI
        const historialUsuario = await this.messageHandler.getHistory(sender, 6);
        const mensajesHistorial = historialUsuario.map(m => ({
            role: m.role,
            content: m.content
        }));

        const systemPrompt = `
Eres un vendedor experto de ${this.jsonProduct.nombre}. Usa esta información para responder:

*Características principales:*
${this.jsonProduct.descripcionCorta}

*Detalles técnicos:*
${this.jsonProduct.detalles.map(d => `- ${d.nombre}: ${d.valor}`).join('\n')}

*Colores disponibles:*
${this.jsonProduct.colores.map(c => `- ${c.nombre} (${c.hexadecimal})`).join('\n')}

*Precio:* S/${this.jsonProduct.precio} (envío incluido)

Reglas importantes:
1. Si el cliente está en medio de un pedido (etapa 'consulta_color' o 'consulta_envio'), NO muestres el menú
2. Mantén el foco en la conversación actual
3. Solo muestra el menú si es claramente una nueva consulta
4. Sé conciso (máximo 3 frases)
5. Si preguntan por algo no relacionado, redirige amablemente al producto`;

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
        await this.messageHandler.saveHistory(sender, 'assistant', respuestaAI);
        await this.whatsAppService.sendTextMessage(sender, respuestaAI, originalMessage);

        // Solo mostrar menú si no está en proceso de pedido y es una consulta general
        if (!['consulta_color', 'consulta_envio', 'confirmacion_pedido'].includes(etapaActual)) {
            setTimeout(async () => {
                const usuarioActualizado = await this.messageHandler.getUser(sender);
                if (usuarioActualizado.etapaConversacion === etapaActual) {
                    await this._mostrarMensajeInicialToldo(sender, originalMessage);
                }
            }, 5000);
        }
    }

    _obtenerBeneficios() {
        // Extrae los 3 beneficios principales de la descripción larga
        const desc = this.jsonProduct.descripcionLarga;
        const beneficios = [];

        if (desc.includes("protección")) beneficios.push("Excelente protección contra el sol y la lluvia");
        if (desc.includes("fácil") || desc.includes("facil")) beneficios.push("Fácil de montar y transportar");
        if (desc.includes("resistente")) beneficios.push("Estructura robusta y materiales duraderos");

        // Completa con beneficios por defecto si no se encontraron suficientes
        while (beneficios.length < 3) {
            beneficios.push("Producto de alta calidad con garantía");
        }

        return beneficios.slice(0, 3);
    }

    async _mostrarCierreDeVenta(sender, originalMessage) {
        const mensajeCierre = `📢 *Oferta especial por tiempo limitado!* 🕒\n\n` +
            `🏆 *Producto:* ${this.jsonProduct.nombre}\n` +
            `💰 *Precio:* S/${this.jsonProduct.precio} (normal: S/${this.jsonProduct.precio * 1.2})\n` +
            `🚚 *Envío GRATIS* a todo Perú\n\n` +
            `⚠️ *Stock limitado* - Solo ${Math.floor(Math.random() * 5) + 2} unidades disponibles\n\n` +
            `¿Quieres apartar el tuyo ahora mismo? (Responde *SI* o *NO*)`;

        await this.whatsAppService.sendTextMessage(sender, mensajeCierre, originalMessage);

        // Enviar imagen destacada del producto
        if (this.jsonProduct.imagenes.length > 0) {
            await this.whatsAppService.sendImageMessage(
                sender,
                this.jsonProduct.imagenes[0].nombre,
                originalMessage
            );
        }
    }

    async _mostrarEstadoProcesamiento(sender, mensaje, originalMessage) {
        const mensajeEstado = await this.whatsAppService.sendTextMessage(
            sender, 
            `⏳ ${mensaje}...`, 
            originalMessage
        );
        return mensajeEstado; // Para poder eliminarlo después
    }

    _detectarConsultaToldo(texto) {
        const patrones = [
            /toldo/i,
            /plegable/i,
            /3x3/i,
            /precio/i,
            /color/i,
            /rojo/i,
            /azul/i,
            /pedido/i,
            /comprar/i,
            /pago/i,
            /contra entrega/i,
            /envío/i,
            /envio/i,
            /provincia/i,
            /lima/i,
            /fotos/i,
            /videos/i,
            /características/i,
            /caracteristicas/i,
            /estructura/i,
            /tela/i,
            /oxford/i,
            /metálica/i,
            /metalica/i,
            /reforzada/i,
            /armar/i,
            /impermeable/i,
            /agua/i
        ];

        return patrones.some((p) => p.test(texto));
    }
}

module.exports = MessageImportmuneliHandler;