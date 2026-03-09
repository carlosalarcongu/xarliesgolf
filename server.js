require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const Database = require('better-sqlite3');

console.log("🔵 [SERVER] Iniciando servidor Express y Socket.io...");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// Base de datos compartida
console.log("🔵 [SERVER] Conectando a la base de datos SQLite...");
const db = new Database(path.join(__dirname, 'golf_data.db'));
db.prepare('CREATE TABLE IF NOT EXISTS users (username TEXT PRIMARY KEY, password TEXT, email TEXT)').run();
console.log("🔵 [SERVER] Tabla 'users' verificada.");

// Inicializar el módulo de Golf
const golfManager = require('./core/golfManager');
golfManager.init(db);

io.on('connection', (socket) => {
    console.log(`🔵 [SERVER] ⛳ Nuevo cliente conectado. ID de Socket: ${socket.id}`);

    // --- AUTENTICACIÓN ---
    socket.on('checkAuthRequirement', (name, callback) => {
        console.log(`🔵 [SERVER] Petición checkAuthRequirement para usuario: "${name}"`);
        const username = name.toLowerCase();
        if (['xarlie', 'administrador g'].includes(username)) {
            console.log(`🔵 [SERVER] Es admin, requiere clave.`);
            return callback({ needsPassword: true });
        }
        
        try {
            const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
            if (user) {
                console.log(`🔵 [SERVER] Usuario registrado encontrado, requiere clave.`);
                return callback({ needsPassword: true });
            }
            console.log(`🔵 [SERVER] Usuario nuevo o libre, NO requiere clave.`);
            callback({ needsPassword: false });
        } catch(err) {
            console.error(`🔴 [SERVER] Error en checkAuthRequirement:`, err);
        }
    });

    socket.on('verifyPassword', (data, callback) => {
        console.log(`🔵 [SERVER] Verificando password para: "${data.username}"`);
        const lowerName = data.username.toLowerCase();
        const ADMIN_PASS = process.env.ADMIN_PASSWORD || '1234'; 
        
        if (['xarlie', 'administrador g'].includes(lowerName) && data.password === ADMIN_PASS) {
            console.log(`🔵 [SERVER] Login de ADMIN correcto.`);
            return callback({ success: true });
        }
        
        try {
            const user = db.prepare('SELECT * FROM users WHERE username = ?').get(lowerName);
            if (user && user.password === data.password) {
                console.log(`🔵 [SERVER] Login de usuario correcto.`);
                return callback({ success: true });
            }
            console.log(`🔴 [SERVER] Contraseña incorrecta.`);
            callback({ success: false });
        } catch(err) {
            console.error(`🔴 [SERVER] Error verificando pass:`, err);
        }
    });

    socket.on('submitAuthRequest', (data, callback) => {
        console.log(`🔵 [SERVER] Registrando nuevo usuario: "${data.username}"`);
        try {
            const lowerName = data.username.toLowerCase();
            db.prepare('INSERT OR REPLACE INTO users (username, password, email) VALUES (?, ?, ?)').run(lowerName, data.password, data.email || '');
            if (callback) callback({ success: true });
        } catch(err) {
            console.error(`🔴 [SERVER] Error al registrar usuario:`, err);
        }
    });

    // --- CONECTAR MÓDULO GOLF ---
    golfManager.handleSocket(io, socket);
});

const PORT = 2312;
server.listen(PORT, () => {
    console.log(`🔵 [SERVER] 🏌️‍♂️ XARLIE'S GOLF CLUB CORRIENDO EN PUERTO ${PORT} ✅`);
});