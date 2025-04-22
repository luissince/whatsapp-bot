// src/config/config.service.js
class ConfigService {
    constructor() {
      this.PORT = process.env.PORT || 80;
      this.SESSION_PATH = process.env.SESSION_PATH || "session_auth_info";
      this.STATIC_DIR = process.env.STATIC_DIR || "/client/assets";
    }
    
    getPort() {
      return this.PORT;
    }
    
    getSessionPath() {
      return this.SESSION_PATH;
    }
    
    getStaticDir() {
      return this.STATIC_DIR;
    }
  }
  
  module.exports = { ConfigService };