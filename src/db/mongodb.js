// db/mongodb.js
const mongoose = require('mongoose');
const { string } = require('sharp/lib/is');

// URL de conexión
const MONGO_URL = process.env.MONGO_URL;

// Esquema para los mensajes
const messageSchema = new mongoose.Schema({
  whatsappId: {
    type: String,
    required: true,
    index: true
  },
  role: {
    type: String,
    enum: ['user', 'assistant'],
    required: true
  },
  content: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

// Esquema para usuarios
const userSchema = new mongoose.Schema({
  whatsappId: {
    type: String,
    required: true,
    unique: true
  },
  name: String,
  lastInteraction: {
    type: Date,
    default: Date.now
  },
  productosConsultados: [{
    productoId: String,
    nombre: String,
    fecha: {
      type: Date,
      default: Date.now
    }
  }],
  etapaConversacion: {
    type: String,
    enum: [
      'inicial',
      'saludo',
      'menu_inicial',
      'esperando_busqueda',
      'mostrando_resultados',
      'mostrando_producto',
      'informacion_envios',
      'esperando_vendedor',
      'conversando',

      'menu_toldo',
      'consulta_color',
      'consulta_envio',
      'confirmacion_pedido',
      'confirmacion_pago',
    ],
    default: 'inicial'
  },
  ofrecidoCatalogo: {
    type: Boolean,
    default: false
  },
  esperandoRespuestaCatalogo: {
    type: Boolean,
    default: false
  },
  esperandoSeleccionProducto: {
    type: Boolean,
    default: false
  },
  productoActual: {
    type: String,
    default: null
  },
  colorSeleccionado: {
    type: String,
    default: null
  },
  ultimaBusqueda: {
    termino: String,
    timestamp: {
      type: Date,
      default: null
    }
  },
});

// Esquema para productos
const productSchema = new mongoose.Schema({
  whatsappId: {
    type: String,
    required: true,
    index: true
  },
  id: {
    type: Number,
  },
  idProducto: {
    type: String,
    required: true,
    unique: true
  },
  tipo: {
    type: String,
  },
  venta: {
    type: String,
  },
  codigo: {
    type: String,
    required: true
  },
  nombre: {
    type: String,
    required: true
  },
  precio: {
    type: Number,
    required: true
  },
  preferido: {
    type: Number,
    default: 0
  },
  imagen: {
    type: String,
    default: null
  },
  estado: {
    type: Number,
    required: true
  },
  categoria: {
    type: String,
    required: true
  },
  medida: {
    type: String,
    required: true
  }
});

// Esquema para pedido
const pedidoSchema = new mongoose.Schema({
  whatsappId: { type: String, required: true, index: true },
  colorSeleccionado: string,
  tipoEnvio: string,
  direccion: string,
  pagoAdelanto: {
    type: Object,
  },
  estado: {
    type: String,
    enum: ['pendiente', 'pagado', 'pago_recibido'],
    default: 'pendiente'
  },
  fecha: {
    type: Date,
    default: Date.now
  },
  numero: string
});

// Crear modelos
const Message = mongoose.model('Message', messageSchema);
const User = mongoose.model('User', userSchema);
const Product = mongoose.model('Product', productSchema);
const Order = mongoose.model('Pedido', pedidoSchema);

// Función para conectar a MongoDB
async function connectToMongoDB() {
  try {
    await mongoose.connect(MONGO_URL);
    console.log('✅ Conectado a MongoDB correctamente');
    return true;
  } catch (error) {
    console.error('❌ Error al conectar a MongoDB:', error);
    return false;
  }
}

module.exports = {
  connectToMongoDB,
  Message,
  User,
  Product,
  Order,
  mongoose
};