// src/server/routes/auth.routes.js
const express = require("express");

class AuthRoutes {
  constructor(whatsAppService) {
    this.whatsAppService = whatsAppService;
    this.router = express.Router();
    this._configureRoutes();
  }
  
  _configureRoutes() {
    this.router.get("/status", this.getStatus.bind(this));
    this.router.post("/logout", this.logout.bind(this));
  }
  
  async getStatus(req, res) {
    try {
      const isConnected = this.whatsAppService.isConnected();
      const userInfo = this.whatsAppService.getUserInfo();
      
      return res.status(200).json({
        status: true,
        connected: isConnected,
        user: isConnected ? userInfo : null
      });
    } catch (error) {
      return res.status(500).json({
        status: false,
        response: "Error getting status",
        error: error.message
      });
    }
  }
  
  async logout(req, res) {
    try {
      await this.whatsAppService.logout();
      
      return res.status(200).json({
        status: true,
        response: "Logged out successfully"
      });
    } catch (error) {
      return res.status(500).json({
        status: false,
        response: "Error logging out",
        error: error.message
      });
    }
  }
  
  getRouter() {
    return this.router;
  }
}

module.exports = { AuthRoutes };