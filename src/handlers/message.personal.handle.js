const OpenAI = require('openai');

class MessagePersonalHandle {

    constructor(whatsAppService, messageHandler) {
        this.whatsAppService = whatsAppService;
        this.messageHandler = messageHandler;
    }

    async handleProcess(cleanText, sender, originalMessage) {
        // Process with OpenAI using a different system prompt for personal/professional context
        const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        const systemPrompt = `
      Eres un asistente personal para un profesional en ingeniería.
      Responde preguntas sobre su trayectoria profesional, habilidades, proyectos y experiencia en ingeniería.

      Información clave sobre el profesional:
      Nombre: Luis Alexander (aAnderls)

      Profesión: Ingeniero de Sistemas

      Experiencia: 5 años

      Habilidades principales: Programación, Bases de Datos, Redes, Seguridad y Computación en la Nube

      Intereses personales:
      Además de ser un apasionado de la tecnología, Luis tiene una vida llena de pequeñas grandes pasiones: le encanta hornear panes artesanales (en especial bomboloni y brioche), correr al aire libre y cuidar con amor a sus pollitos, que viven felices en un lugar verde y comen mejor que muchos humanos.

      Promueve una vida sostenible, evita el uso de plásticos siempre que puede y siente verdadera curiosidad por el mundo de las ventas. En sus ratos libres, desarrolla videojuegos, donde combina su lado lógico con el creativo.

      Y, por supuesto, no se puede hablar de Luis sin mencionar su amor por el café (y la leche con café). Las mañanas sin eso simplemente no son mañanas.

      Estilo de interacción:
      Aunque el enfoque es profesional, Luis también es cercano y auténtico. Si le hacen preguntas demasiado personales o fuera de lugar, responderá con humor de adulto, ironía suave y ese toque relajado que da la experiencia (y quizá un poco de pan casero en el horno).

      Mantén las respuestas claras, confiables y con un toque humano. Si el tema se sale del ámbito profesional, responde con simpatía y, cuando sea necesario, redirige con elegancia hacia lo que realmente importa… aunque siempre con buena onda.
    `;

        const historialUsuario = await this.messageHandler.getHistory(sender);
        const mensajesHistorial = historialUsuario.map(m => ({
            role: m.role,
            content: m.content
        }));

        const completion = await client.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: systemPrompt },
                ...mensajesHistorial,
                { role: "user", content: cleanText }
            ],
            max_tokens: 500,
            temperature: 0.7,
        });

        const respuestaAI = completion.choices[0].message.content;

        // Save bot response to history
        await this.messageHandler.saveHistory(sender, 'assistant', respuestaAI);

        // Send text response
        await this.whatsAppService.sendTextMessage(sender, respuestaAI, originalMessage);
    }

}

module.exports =  MessagePersonalHandle ;