// src/server/express.server.js
const express = require("express");
const fileUpload = require("express-fileupload");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");
const http = require("http");
const { MessageRoutes } = require('./routes/message.routes');
const { AuthRoutes } = require('./routes/auth.routes');

class ExpressServer {
  constructor({ port, whatsAppService, staticDir }) {
    this.port = port;
    this.whatsAppService = whatsAppService;
    this.staticDir = staticDir;
    
    this.app = express();
    this.server = http.createServer(this.app);
    
    this._configureMiddleware();
    this._configureRoutes();
  }
  
  _configureMiddleware() {
    this.app.use(cors());
    this.app.use(bodyParser.json());
    this.app.use(bodyParser.urlencoded({ extended: true }));
    this.app.use(fileUpload({
      createParentPath: true
    }));
    this.app.use("/assets", express.static(path.join(__dirname, "..", "..", this.staticDir)));
  }
  
  _configureRoutes() {
    // API Routes
    this.app.use("/api/messages", new MessageRoutes(this.whatsAppService).getRouter());
    this.app.use("/api/auth", new AuthRoutes(this.whatsAppService).getRouter());
    
    // Basic routes
    this.app.get("/", (req, res) => {
      res.send("Server working");
    });
    
    this.app.get("/scan", (req, res) => {
      res.sendFile(path.join(__dirname, "..", "..", "./client/index.html"));
    });
  }
  
  getHttpServer() {
    return this.server;
  }
  
  start() {
    this.server.listen(this.port, () => {
      console.log(`Server running on port ${this.port}`);
    });
  }
}

module.exports = { ExpressServer };