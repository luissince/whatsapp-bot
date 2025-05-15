const OpenAI = require('openai');

class MessageImportmuneliHandler {

    static CONFIG = {
        product: {
            defaultCode: 'TOL001',
            default: {
                nombre: 'Toldo Plegable',
                precio: '100',
                descripcionLarga: 'Toldo plegable de alta resistencia',
                detalles: [{ nombre: 'Producto de alta calidad', valor: '' }],
                imagenes: []
            }
        },
        payment: {
            yape: {
                numero: '944023123',
                alias: 'María D Cosme H',
                titular: 'María Del Pilar Cosme Huaringa'
            },
            bankAccounts: {
                soles: {
                    banco: 'BCP',
                    cci: '191-06920173-0-72',
                    titular: 'María Del Pilar Cosme Huaringa'
                },
                dolares: {
                    banco: 'BCP',
                    cci: '002-19110692017307252',
                    titular: 'María Del Pilar Cosme Huaringa '
                }
            }
        },
        shipping: {
            priceRange: {
                min: 18,
                max: 25
            },
            time: '6pm',
            coverage: 'todo el Perú'
        },
        customerService: {
            phone: '999 888 777'  // This will be overridden by env var if available
        },
        ai: {
            model: 'gpt-4o',
            maxTokens: 500,
            temperature: 0.7
        },
        orders: {
            prefix: 'TOL'
        }
    };

    constructor(whatsAppService, messageHandler) {
        this.whatsAppService = whatsAppService;
        this.messageHandler = messageHandler;
        this.jsonProduct = null;
        this.loadProduct();
        this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        if (process.env.CUSTOMER_SUPPORT_NUMBER) {
            MessageImportmuneliHandler.CONFIG.customerService.phone = process.env.CUSTOMER_SUPPORT_NUMBER;
        }
    }

    async loadProduct() {
        try {
            const response = await fetch(
                `${process.env.API_REST_URL}/api/producto/filter/web/id?codigo=${MessageImportmuneliHandler.CONFIG.product.defaultCode}`
            );
            if (!response.ok) {
                throw new Error("Error al cargar producto");
            }
            this.jsonProduct = await response.json();
            console.log('Producto cargado correctamente');
        } catch (error) {
            console.error('Error al cargar producto:', error);
            this.jsonProduct = null;
        }
    }

    async handleProcess(cleanText, usuario, etapaActual, numeroSeleccionado, sender, originalMessage) {
        await this._processIAToldo(cleanText, sender, originalMessage, etapaActual);
    }

    async handleProcessPayment(sender, originalMessage) {
        const data = await this.whatsAppService.downloadMedia(originalMessage);

        if (data) {
            // Save to persistent storage
            await this.messageHandler.saveOrder(sender, {
                pagoAdelanto: data,
                estado: 'pago_recibido',
                fecha: new Date()
            });

            // Notify the customer that the receipt has been received with details
            await this.whatsAppService.sendTextMessage(
                sender,
                "✅ *¡Gracias por tu comprobante de pago!*\n\n" +
                "Tu pedido está siendo procesado. Te informaremos cuando sea enviado."
            );

            // Notify the owner about the payment
            await this._handleOrderConfirmation(sender, originalMessage);
        }
    }

    _generateOrderNumber(sender) {
        // Generate a simple order number based on date and phone number
        const phone = sender.split('@')[0];
        const lastFourDigits = phone.slice(-4);
        const date = new Date();
        const dateStr = `${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}`;
        return `TOL-${dateStr}-${lastFourDigits}`;
    }

    async _processIAToldo(cleanText, sender, originalMessage) {
        // Load any existing order data from persistent storage
        const existingOrder = await this.messageHandler.getOrder(sender);

        // Obtener historial para dar contexto a la AI
        const historialUsuario = await this.messageHandler.getHistory(sender, 10); // Increased history context
        const mensajesHistorial = historialUsuario.map(m => ({
            role: m.role,
            content: m.content
        }));

        const product = this.jsonProduct || MessageImportmuneliHandler.CONFIG.product.default;
        const config = MessageImportmuneliHandler.CONFIG;

        const systemPrompt = ` 
        Eres un asistente de ventas amigable y directo que ayuda a los clientes a comprar un *${product?.nombre || config.product.default.nombre}*. Aquí tienes toda la información que necesitas para ayudar:

        🛒 *Producto:* ${product?.nombre || config.product.default.nombre}
        💵 *Precio:* S/${product?.precio || config.product.default.precio} (envío incluido en Lima)
        📦 *Envíos:* Desde Lima por Shalom u otra agencia. Costo aprox. S/${config.shipping.priceRange.min} - S/${config.shipping.priceRange.max}. Envíos diarios. Cobertura: ${config.shipping.coverage}.
        💰 *Formas de pago:*
        - *Lima:* Contra entrega o pago adelantado
        - *Provincia:* Pago completo por adelantado
        
        ### Formas de pago:

        📱 *Yape / Plin:*  
        - Número: *${config.payment.yape.numero}* (${config.payment.yape.titular})  
        - Alias: *${config.payment.yape.alias}*

        🏦 *Transferencias:*
        ➡️ Soles - ${config.payment.bankAccounts.soles.banco}  
        CCI: ${config.payment.bankAccounts.soles.cci}  
        Titular: ${config.payment.bankAccounts.soles.titular}

        ➡️ Dólares - ${config.payment.bankAccounts.dolares.banco}  
        CCI: ${config.payment.bankAccounts.dolares.cci}  
        Titular: ${config.payment.bankAccounts.dolares.titular}

        🔍 *Detalles técnicos:*  
        ${product?.detalles?.map(d => `• ${d.nombre}: ${d.valor}`).join('\n') || "• Producto de alta calidad"}

        📝 *Descripción:* ${product?.descripcionLarga || config.product.default.descripcionLarga}


        ### Estado actual del pedido:
        - Estado: ${existingOrder?.estado || "pendiente"}
        - Color: ${existingOrder?.colorSeleccionado || "No seleccionado"}
        - Envío: ${existingOrder?.tipoEnvio || "No especificado"}
        - Dirección: ${existingOrder?.direccion || "No proporcionada"}
        - Pago adelantado: ${existingOrder?.pagoAdelanto || "No proporcionado"}

        🎯 *Tu objetivo:* Tu objetivo es ofrecer toda la información desde el inicio de conversación simpre brindar toda la información que necesitas para ayudar al cliente. Sé proactivo/a, resume si es necesario y guía hacia el siguiente paso. Siempre termina con una pregunta o indicación clara.

        ### Reglas del sistema (NO mostrar al cliente):
        1. Cuando el cliente selecciona o menciona un color, extrae esa información y devuelve al final de tu respuesta: COLOR_SELECCIONADO: [color]
        2. Cuando el cliente proporciona una dirección u ubicación de envío, extrae esa información y devuelve al final: DIRECCION_ENVIO: [dirección]
        3. Cuando el cliente indica el tipo de envío (Lima o provincia), devuelve: TIPO_ENVIO: [Lima/Provincia]
        4. Si pide fotos, agrega al final: ENVIAR_IMAGENES
        5. Si tiene un pedido incompleto, recordarle qué falta y cómo completarlo.
        6. Para finalizar con el pedido, haz recordar que debe enviar una imagene del deposito.
        7. Si todo los datos existen de la orden enviar el final: TODOS_DATOS
        8. La respueta debe ser corta y concisa, no incluir información que no sea necesaria.

        Estas etiquetas son solo para el sistema, no deben mostrarse al usuario.
        `;

        try {
            const completion = await this.client.chat.completions.create({
                model: config.ai.model,
                messages: [
                    { role: "system", content: systemPrompt.trim() },
                    ...mensajesHistorial,
                    { role: "user", content: cleanText }
                ],
                max_tokens: config.ai.maxTokens,
                temperature: config.ai.temperature,
            });

            let respuestaAI = completion.choices[0].message.content;

            const extractData = (response, regex, dataType) => {
                const match = response.match(regex);
                let data = null;
                if (match && match[1]) {
                    // Save the extracted data
                    switch (dataType) {
                        case 'color':
                            data = match[1].trim();
                            break;
                        case 'direccion':
                            data = match[1].trim();
                            break;
                        case 'tipoEnvio':
                            data = match[1].trim();
                            break;
                    }

                    // Remove the tag from the response so customer doesn't see it
                    respuestaAI = respuestaAI.replace(match[0], '');
                }
                return data;
            };

            const color = extractData(respuestaAI, /COLOR_SELECCIONADO:\s*(.+)$/im, 'color');
            const direccion = extractData(respuestaAI, /DIRECCION_ENVIO:\s*(.+)$/im, 'direccion');
            const tipoEnvio = extractData(respuestaAI, /TIPO_ENVIO:\s*(.+)$/im, 'tipoEnvio');

            if (color) {
                await this.messageHandler.saveOrder(sender, {
                    colorSeleccionado: color
                });
            }

            if (direccion) {
                await this.messageHandler.saveOrder(sender, {
                    direccion
                });
            }

            if (tipoEnvio) {
                await this.messageHandler.saveOrder(sender, {
                    tipoEnvio: tipoEnvio
                });
            }

            respuestaAI = respuestaAI
                .replace(/COLOR_SELECCIONADO/g, '')
                .replace(/DIRECCION_ENVIO/g, '')
                .replace(/TIPO_ENVIO/g, '')
                .replace(/ENVIAR_IMAGENES/g, '')
                .replace(/TODOS_DATOS/g, '')
                .trim();

            // Si el cliente pidió fotos, mándalas
            if (completion.choices[0].message.content.includes("TODOS_DATOS")) {
                await this._handleOrderConfirmation(sender, originalMessage);
            } else {
                // Guarda respuesta limpia en el historial
                await this.messageHandler.saveHistory(sender, 'assistant', respuestaAI);

                // Envía texto limpio al cliente
                await this.whatsAppService.sendTextMessage(sender, respuestaAI, originalMessage);
            }

            // Si el cliente pidió fotos, mándalas
            if (completion.choices[0].message.content.includes("ENVIAR_IMAGENES")) {
                if (this.jsonProduct?.imagenes?.length > 0) {
                    // Send a message first
                    await this.whatsAppService.sendTextMessage(
                        sender,
                        "📸 *Aquí te muestro algunas fotos del producto:*"
                    );

                    // Then send the images
                    for (const img of this.jsonProduct.imagenes.slice(0, 3)) {
                        await this.whatsAppService.sendImageMessage(
                            sender,
                            img.nombre,
                            originalMessage,
                            "Toldo Plegable - Imagen " + (this.jsonProduct.imagenes.indexOf(img) + 1)
                        );
                    }
                } else {
                    await this.whatsAppService.sendTextMessage(
                        sender,
                        "Lo siento, por el momento no tengo imágenes disponibles del producto. ¿Hay algo más en lo que pueda ayudarte?"
                    );
                }
            }


        } catch (error) {
            console.error('Error en el procesamiento de AI:', error);
            // Send a fallback message to the user
            await this.whatsAppService.sendTextMessage(
                sender,
                "Lo siento, estoy teniendo problemas técnicos en este momento. Por favor, intenta nuevamente en unos minutos o contáctanos directamente al " +
                (process.env.CUSTOMER_SUPPORT_NUMBER || "999 888 777")
            );
        }
    }

    async _handleOrderConfirmation(sender, originalMessage) {
        const order = await this.messageHandler.getOrder(sender);

        // Check if we have enough information to process the order
        if (!order.colorSeleccionado || !order.tipoEnvio || !order.direccion) {
            await this.whatsAppService.sendTextMessage(
                sender,
                "Para confirmar tu pedido, necesito algunos datos más:\n\n" +
                (!order.colorSeleccionado ? "- Color del toldo\n" : "") +
                (!order.tipoEnvio ? "- Tipo de envío (Lima o provincia)\n" : "") +
                (!order.direccion ? "- Dirección de entrega\n" : "") +
                "\n¿Podrías proporcionarme estos datos, por favor?"
            );
            return;
        }

        const orderNumber = this._generateOrderNumber(sender);

        // Save updated order
        await this.messageHandler.saveOrder(sender, {
            estado: 'pagado',
            fecha: new Date(),
            numero: orderNumber
        });

        // Send confirmation to customer
        const confirmationMsg = `
        🎉 *¡Tu pedido ha sido confirmado!*
        
        📦 *Resumen del pedido:*
        - Número de pedido: ${orderNumber}
        - Producto: ${this.jsonProduct?.nombre || "Toldo Plegable"}
        - Color: ${order.colorSeleccionado || "No disponible"}
        - Envío: ${order.tipoEnvio || "No disponible"}
        - Dirección: ${order.direccion || "No disponible"}
        - Pago adelantado: ${order.pagoAdelanto || "No disponible"}`;

        await this.whatsAppService.sendTextMessage(sender, confirmationMsg, originalMessage);

        // Create a detailed message for the owner
        const mensajeDueño = `
            💰 *PAGO RECIBIDO*
            🔢 *Orden:* ${orderNumber}
            👤 *Cliente:* ${originalMessage.pushName || "Cliente"}
            📱 *Número:* ${sender.split('@')[0]}
            🛒 *Producto:* ${this.jsonProduct?.nombre || "Toldo Plegable"}
            🎨 *Color:* ${order.colorSeleccionado || "No especificado"}
            🚚 *Envío:* ${order.tipoEnvio || "No especificado"}
            📍 *Dirección:* ${order.direccion || "No especificada"}
            ⏰ *Fecha/Hora:* ${new Date().toLocaleString()}`;

        const numeroDelDueño = `${process.env.OWNER_NUMBER}@c.us`;

        await this.whatsAppService.sendTextMessage(numeroDelDueño, mensajeDueño);

        // Eliminar la orden de MongoDB
        await this.messageHandler.deleteOrder(sender);
        await this.messageHandler.deleteHistory(sender);
        await this.messageHandler.deleteUser(sender);

        await this.whatsAppService.sendTextMessage(
            sender,
            "Gracias por tu compra 🥳. Si necesitas otro toldo o tienes alguna duda, ¡no dudes en escribirnos! 👋"
        );
    }

}

module.exports = MessageImportmuneliHandler;