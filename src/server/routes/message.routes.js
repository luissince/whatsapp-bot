// src/server/routes/message.routes.js
const express = require("express");

class MessageRoutes {
  constructor(whatsAppService) {
    this.whatsAppService = whatsAppService;
    this.router = express.Router();
    this._configureRoutes();
  }
  
  _configureRoutes() {
    this.router.get("/send", this.sendMessage.bind(this));
  }
  
  async sendMessage(req, res) {
    try {
      const { message, number } = req.query;
      
      if (!number) {
        return res.status(400).json({
          status: false,
          response: "Number is required"
        });
      }
      
      if (!this.whatsAppService.isConnected()) {
        return res.status(503).json({
          status: false,
          response: "WhatsApp is not connected yet"
        });
      }
      
      const numberWA = "51" + number + "@s.whatsapp.net";
      const exist = await this.whatsAppService.checkNumberExists(numberWA);
      
      if (!exist || (!exist.jid && !(exist[0]?.jid))) {
        return res.status(404).json({
          status: false,
          response: "Number not found on WhatsApp"
        });
      }
      
      const jid = exist.jid || exist[0].jid;
      
      const result = await this.whatsAppService.sendTextMessage(jid, message || "Hello from API");
      
      return res.status(200).json({
        status: true,
        response: result
      });
      
    } catch (error) {
      console.error("Error sending message:", error);
      return res.status(500).json({
        status: false,
        response: "Error sending message",
        error: error.message
      });
    }
  }
  
  getRouter() {
    return this.router;
  }
}

module.exports = { MessageRoutes };
