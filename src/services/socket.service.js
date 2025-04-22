// src/services/socket.service.js
const socketIo = require("socket.io");
const qrcode = require("qrcode");

class SocketManager {
  constructor() {
    this.io = null;
    this.activeSocket = null;
    this.whatsAppService = null;
    this.qrData = null;
  }

  initialize(httpServer, whatsAppService) {
    this.io = socketIo(httpServer, {
      pingTimeout: 30000,
      pingInterval: 5000,
      transports: ['websocket', 'polling'], // Forzar websocket primero
      cors: {
        origin: '*',
        methods: ['GET', 'POST']
      }
    });
    this.whatsAppService = whatsAppService;

    this.io.on("connection", (socket) => {
      this.activeSocket = socket;

      // Enviar estado actual inmediatamente al conectarse
      this._sendLoginStatus(socket);

      socket.on("disconnect", () => {
        if (this.activeSocket === socket) {
          this.activeSocket = null;
        }
      });
    });

    return this.io;
  }

  // Método dedicado para enviar el estado de login
  _sendLoginStatus(socket = null) {
    // Si no se especifica un socket, usar el activo
    const targetSocket = socket || this.activeSocket;

    if (!targetSocket) return;

    if (this.whatsAppService) {
      if (this.whatsAppService.isConnected()) {

        const { id, name } = this.whatsAppService.getUserInfo();
        const userInfoStr = id ? `${id} ${name || ''}` : "Unknown user";

        targetSocket.emit("login_status", {
          isLoggedIn: true,
          userInfo: userInfoStr,
          src: "./assets/check.svg"
        });

        return;
      }
    }

    targetSocket.emit("login_status", {
      qrData: this.qrData,
      isLoggedIn: false,
      userInfo: null,
      src: "./assets/loader.gif"
    });
  }

  // Tu método original, modificado para actualizar el estado
  updateQrStatus(status, data = null) {
    if (!this.activeSocket) return;

    switch (status) {
      case "qr":
        this._handleQrCode(data);
        console.log("QR received, please scan");
        break;

      case "connected":
        this._handleConnected(data);
        break;

      case "loading":
        this._handleLoading();
        break;

      case "disconnected":
        this._handleDisconnected(data);
        break;

      default:
        console.log(`Unknown QR status: ${status}`);
        break;
    }
  }

  _handleQrCode(qrData) {
    qrcode.toDataURL(qrData, (err, url) => {
      if (err) {
        console.error("QR code generation error:", err);
        return;
      }
      this.qrData = qrData;
      this.activeSocket.emit("qr-data", qrData);
      this.activeSocket.emit("log", "QR received, please scan");
    });
  }

  _handleConnected(userInfo) {
    this.activeSocket.emit("qrstatus", "./assets/check.svg");
    this.activeSocket.emit("log", "User connected");

    if (userInfo) {
      const { id, name } = userInfo;
      const userInfoStr = id ? `${id} ${name || ''}` : "Unknown user";
      this.activeSocket.emit("user", userInfoStr);
    }
  }

  _handleDisconnected(data) {
    this.activeSocket.emit("qrstatus", "./assets/loader.gif");
    this.activeSocket.emit("user", "Desconectado");
    this.activeSocket.emit("log", data.reason);
  }

  _handleLoading() {
    this.activeSocket.emit("qrstatus", "./assets/loader.gif");
    this.activeSocket.emit("log", "Loading...");
  }
}

module.exports = { SocketManager };