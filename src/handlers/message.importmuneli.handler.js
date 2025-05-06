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
            if (!response.ok){
                throw new Error("Error al cargar producto");
            }
            this.jsonProduct = await response.json();
            console.log('Producto cargado correctamente');
        } catch (error) {
            console.error('Error al cargar producto:', error);
            // Puedes cargar un JSON por defecto en caso de error
            this.jsonProduct = null;
        }
    }

    async handleProcess(cleanText, usuario, etapaActual, numeroSeleccionado, sender, originalMessage) {
        // // CASO ESPECIAL: Si está esperando selección de un producto por número
        // if (usuario.esperandoSeleccionProducto && numeroSeleccionado !== null) {
        //     const ok = await this._processSpecialCase(numeroSeleccionado, sender, originalMessage);
        //     if (ok) return;
        // }

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
        console.log("inicial")
        console.log(this.jsonProduct)
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

        // const mensajeInicial = `¡Hola! 👋 ¿Interesado en nuestro *Toldo Plegable 3x3*? 🏕️\n\n` +
        //     `📦 *Precio:* S/210 (envío incluido)\n` +
        //     `🔴 *Colores:* Rojo | 🔵 Azul\n\n` +
        //     `👇 *Elige una opción:*\n` +
        //     `>>> *1* - Ver detalles\n` +
        //     `>>> *2* - Hacer pedido\n` +
        //     `>>> *3* - Métodos de pago\n` +
        //     `>>> *4* - Envíos a provincia\n` +
        //     `>>> *5* - Otra consulta`;

        await this.whatsAppService.sendTextMessage(sender, mensajeInicial, originalMessage);
        await this.messageHandler.saveHistory(sender, 'assistant', mensajeInicial);
        await this.messageHandler.updateUser(sender, {
            etapaConversacion: 'menu_toldo',
            ofrecidoCatalogo: true,
            esperandoRespuestaCatalogo: false,
            esperandoSeleccionProducto: false,
            productoActual: 'toldo_plegable_3x3'
        });

        // Después de 60 segundos, mostrar mensaje de cierre de venta si no ha habido respuesta
        setTimeout(async () => {
            const usuario = await this.messageHandler.getUser(sender);
            if (usuario.etapaConversacion === 'menu_toldo') {
                await this._mostrarCierreDeVenta(sender, originalMessage);
            }
        }, 60000);
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
            case 1: // Quiero saber más
                const detallesTecnicos = this.jsonProduct.detalles
                    .filter(d => !['Ancho', 'Alto', 'Largo'].includes(d.nombre))
                    .map(d => `✔️ *${d.nombre}:* ${d.valor}`)
                    .join("\n");

                const mensajeDetalles = `¡Claro! 😄 Nuestro *${this.jsonProduct.nombre}* tiene:\n\n` +
                    `${detallesTecnicos}\n\n` +
                    `📝 *Descripción:* ${this.jsonProduct.descripcionLarga}\n\n` +
                    `¿Te gustaría ver fotos del producto? 📸 (Escribe "fotos")`;

                await this.whatsAppService.sendTextMessage(sender, mensajeDetalles, originalMessage);

                // Enviar imágenes del producto desde el JSON
                for (const img of this.jsonProduct.imagenes.slice(0, 3)) {
                    await this.whatsAppService.sendImageMessage(sender, img.nombre, originalMessage);
                    await new Promise(resolve => setTimeout(resolve, 1000)); // Pequeño delay entre imágenes
                }

            //             const mensajeDetalles = `¡Claro! 😄 Nuestro *Toldo Plegable 3x3* tiene las siguientes características:

            //   ✔️ Estructura metálica reforzada
            //   ✔️ Tela Oxford impermeable, ¡mucho más resistente que el poliéster!
            //   ✔️ Fácil de armar y desarmar
            //   ✔️ Ideal para ferias, jardines, terrazas o eventos
            //   ✔️ Incluye su funda para transporte

            //   ¿Te gustaría ver fotos o videos del producto real? 📸`;

            //             await this.whatsAppService.sendTextMessage(sender, mensajeDetalles, originalMessage);
            //             await this.messageHandler.saveHistory(sender, 'assistant', mensajeDetalles);

            //             // Enviar algunas imágenes del producto
            //             try {
            //                 // Aquí se enviarían las imágenes del producto usando URLs predefinidas
            //                 const imageUrl = `${process.env.API_REST_URL}/images/toldo_plegable.jpg`;
            //                 await this.whatsAppService.sendImageMessage(sender, imageUrl, originalMessage);
            //             } catch (imgError) {
            //                 console.error("Error al enviar imagen:", imgError.message);
            //             }

            //             // Después de enviar detalles, mostrar el cierre de venta
            //             setTimeout(async () => {
            //                 await this._mostrarCierreDeVenta(sender, originalMessage);
            //             }, 5000);
            //             break;

            case 2: // Cómo hacer pedido
                const mensajePedido = `¡Súper fácil! 😎 Solo necesito que me brindes estos datos para coordinar tu envío:
      
      📍 Ciudad y distrito
      🎨 Color: 🔴 Rojo o 🔵 Azul
      📦 ¿Deseas envío a domicilio o recoger en agencia?
      
      Una vez confirmes, coordinamos tu pedido. El proceso de pago es muy seguro 👇`;

                await this.whatsAppService.sendTextMessage(sender, mensajePedido, originalMessage);
                await this.messageHandler.saveHistory(sender, 'assistant', mensajePedido);
                await this.messageHandler.updateUser(sender, { etapaConversacion: 'consulta_color' });
                break;

            case 3: // Métodos de pago
                const mensajePago = `Claro, aquí te explico según tu ubicación:
      
      📍 *Lima Metropolitana:*
      ➡️ Pago *contra entrega*. Solo pagas cuando recibes el producto.
      
      📍 *Provincia:*
      ➡️ Solo pedimos un adelanto mínimo de *S/10* 💰
      El resto lo pagas al recibirlo en tu ciudad.
      ✅ Enviamos por *agencias como Shalom* o la que prefieras.
      🎥 Puedes pedir fotos, videos o videollamada como prueba del envío.
      
      Este método nos ayuda a evitar fraudes de ambas partes 🤝`;

                await this.whatsAppService.sendTextMessage(sender, mensajePago, originalMessage);
                await this.messageHandler.saveHistory(sender, 'assistant', mensajePago);

                // Mostrar cierre de venta después de explicar los métodos de pago
                setTimeout(async () => {
                    await this._mostrarCierreDeVenta(sender, originalMessage);
                }, 5000);
                break;

            case 4: // Envíos a provincia
                const mensajeEnvio = `¡Sí, claro! 🚛 Enviamos a TODO el Perú desde Lima.
      
      📦 Por lo general usamos *Shalom*, pero podemos enviar por otra agencia si lo prefieres.
      💸 El costo del envío lo cobra directamente la agencia (aprox. *S/18 a S/25*).
      📆 Los envíos se hacen todos los días a las *6:00 p.m.*
      
      ✨ Al enviar, te compartimos la guía y pruebas del despacho.`;

                await this.whatsAppService.sendTextMessage(sender, mensajeEnvio, originalMessage);
                await this.messageHandler.saveHistory(sender, 'assistant', mensajeEnvio);

                setTimeout(async () => {
                    await this._mostrarCierreDeVenta(sender, originalMessage);
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
                colorSeleccionado: colorSeleccionado.nombre
            });
        } else {
            const opcionesColores = coloresDisponibles.map(c => `🔘 *${c.nombre}* (${c.hexadecimal})`).join("\n");
            await this.whatsAppService.sendTextMessage(
                sender,
                `Por favor, elige uno de nuestros colores disponibles:\n\n${opcionesColores}`,
                originalMessage
            );
        }

        //         let colorSeleccionado = "";
        //         if (texto.toLowerCase().includes("rojo")) {
        //             colorSeleccionado = "Rojo";
        //         } else if (texto.toLowerCase().includes("azul")) {
        //             colorSeleccionado = "Azul";
        //         }

        //         if (colorSeleccionado) {
        //             const mensajeConfirmacion = `¡Excelente elección! Has seleccionado el color *${colorSeleccionado}* para tu toldo plegable.

        //   Ahora necesito saber:
        //   📍 ¿En qué ciudad y distrito te encuentras?
        //   📦 ¿Prefieres envío a domicilio o recoger en agencia?`;

        //             await this.whatsAppService.sendTextMessage(sender, mensajeConfirmacion, originalMessage);
        //             await this.messageHandler.saveHistory(sender, 'assistant', mensajeConfirmacion);
        //             await this.messageHandler.updateUser(sender, {
        //                 etapaConversacion: 'consulta_envio',
        //                 colorSeleccionado: colorSeleccionado
        //             });
        //         } else {
        //             await this.whatsAppService.sendTextMessage(
        //                 sender,
        //                 "Por favor, indícame si prefieres el toldo en color 🔴 *Rojo* o 🔵 *Azul*.",
        //                 originalMessage
        //             );
        //             await this.messageHandler.saveHistory(sender, 'assistant', "Por favor, indícame si prefieres el toldo en color 🔴 *Rojo* o 🔵 *Azul*.");
        //         }
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

        const mensajeConfirmacionPedido = `¡Perfecto! Resumen de tu pedido:
      
      🛒 *Producto:* Toldo Plegable 3x3
      🎨 *Color:* ${colorSeleccionado}
      🚚 *Entrega:* ${tipoEnvio}
      
      Para finalizar tu pedido, por favor indícame:
      📍 Tu dirección exacta con referencias (o la agencia de tu preferencia)
      📱 Un número de contacto adicional (opcional)
      
      Una vez confirmes estos datos, coordinaremos el pago y envío inmediato. 🚀`;

        await this.whatsAppService.sendTextMessage(sender, mensajeConfirmacionPedido, originalMessage);
        await this.messageHandler.saveHistory(sender, 'assistant', mensajeConfirmacionPedido);
        await this.messageHandler.updateUser(sender, {
            etapaConversacion: 'confirmacion_pedido',
            tipoEnvio: tipoEnvio
        });

        // Notificar al dueño del interés confirmado
        const mensajeDueño = `
        📢 *PEDIDO DE TOLDO PLEGABLE*
        👤 *Cliente:* ${originalMessage.pushName || "Cliente"}
        📱 *Número:* ${sender.split('@')[0]}
        🛒 *Producto:* Toldo Plegable 3x3
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

        Enfócate en estos beneficios:
        1. ${this._obtenerBeneficios()[0]}
        2. ${this._obtenerBeneficios()[1]}
        3. ${this._obtenerBeneficios()[2]}

        Sé persuasivo pero no agresivo. Responde de manera concisa (máximo 3 frases).
        Si preguntan por algo no relacionado, redirige amablemente al producto.
        `;

        // const systemPrompt = `
        //       Eres un vendedor entusiasta de Toldos Plegables 3x3. Tu objetivo es vender toldos plegables enfocándote en sus características:
        //       - Precio: S/210 con envío incluido
        //       - Colores disponibles: Rojo y Azul
        //       - Estructura metálica reforzada
        //       - Tela Oxford impermeable resistente
        //       - Fácil de armar y desarmar
        //       - Ideal para ferias, jardines, terrazas o eventos
        //       - Incluye funda para transporte

        //       Debes ser amable pero también persuasivo y cerrar la venta. Para cualquier consulta que no sea sobre toldos plegables,
        //       intenta redirigir la conversación hacia el producto. Si el cliente muestra interés, enfatiza:
        //       1. Stock limitado
        //       2. Alta demanda
        //       3. Envío GRATIS con pago contra entrega (en Lima)

        //       Debes mantener respuestas cortas, emotivas y convincentes. No escribas más de 3-4 párrafos.
        //       `;

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

        // Si es una consulta general no específica, mostrar el menú después de 3 segundos
        if (!etapaActual.includes('confirmacion')) {
            setTimeout(async () => {
                await this._mostrarMensajeInicialToldo(sender, originalMessage);
            }, 3000);
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
        //     const mensajeCierre = `📢 ¡Aprovecha HOY! 🕐

        //   *Stock limitado y alta demanda*
        //   🚛 ¡Envío GRATIS con pago contra entrega en Lima!

        //   📲 ¿Te gustaría apartar el tuyo ahora mismo?`;

        //     await this.whatsAppService.sendTextMessage(sender, mensajeCierre, originalMessage);
        //     await this.messageHandler.saveHistory(sender, 'assistant', mensajeCierre);
    }

    // Método para detectar palabras clave relacionadas con el toldo
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