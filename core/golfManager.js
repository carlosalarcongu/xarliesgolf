let dbInstance;

// Función Mágica: Comprueba si una columna existe. Si no existe, la crea al instante.
function ensureColumn(tableName, columnName, type = 'TEXT') {
    try {
        const columns = dbInstance.prepare(`PRAGMA table_info(${tableName})`).all();
        if (!columns.find(c => c.name === columnName)) {
            console.log(`🔵 [GOLF-DB] 🛠️ AUTO-ESCALADO: Añadiendo nueva columna '${columnName}' a la tabla '${tableName}'`);
            dbInstance.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${type}`).run();
        }
    } catch (e) {
        console.error(`🔴 [GOLF-DB] Error verificando columna ${columnName}:`, e);
    }
}

module.exports = {
    init: (db) => {
        dbInstance = db;
        console.log("🔵 [GOLF-DB] Inicializando base de datos ULTRA-ESCALABLE...");
        try {
            dbInstance.prepare('CREATE TABLE IF NOT EXISTS golf_players (name TEXT PRIMARY KEY)').run();
            dbInstance.prepare('CREATE TABLE IF NOT EXISTS golf_courses (name TEXT PRIMARY KEY)').run();
            dbInstance.prepare('CREATE TABLE IF NOT EXISTS golf_tracks (name TEXT PRIMARY KEY)').run();
            dbInstance.prepare('CREATE TABLE IF NOT EXISTS golf_feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, user TEXT, date TEXT, content TEXT)').run();
            
            // Creamos la tabla solo con el ID. El resto se inyectará dinámicamente si no existe.
            dbInstance.prepare(`
                CREATE TABLE IF NOT EXISTS golf_records (
                    id INTEGER PRIMARY KEY AUTOINCREMENT
                )
            `).run();

            console.log("✅ [GOLF-DB] Tablas base inicializadas.");
        } catch (err) {
            console.error("🔴 [GOLF-DB] ERROR FATAL al crear tablas:", err);
        }
    },

    handleSocket: (io, socket) => {
        const sendData = () => {
            try {
                // Aseguramos que estas columnas existan para evitar errores al leer
                ['player', 'track', 'strokes', 'club', 'course', 'par', 'weather', 'date', 'addedBy', 'photo'].forEach(col => ensureColumn('golf_records', col));

                const data = {
                    players: dbInstance.prepare('SELECT * FROM golf_players').all().map(p => p.name),
                    courses: dbInstance.prepare('SELECT * FROM golf_courses').all().map(c => c.name),
                    tracks: dbInstance.prepare('SELECT * FROM golf_tracks').all().map(t => t.name),
                    records: dbInstance.prepare('SELECT * FROM golf_records ORDER BY id DESC LIMIT 200').all(),
                    feedback: dbInstance.prepare('SELECT * FROM golf_feedback ORDER BY id DESC').all()
                };
                io.emit('golf_data', data);
            } catch (err) {
                console.error("🔴 [GOLF-IO] Error enviando datos:", err);
            }
        };

        socket.on('golf_requestData', sendData);

        // Añadir Datos Básicos
        socket.on('golf_addBasic', (data) => {
            try {
                if (data.type === 'player') dbInstance.prepare('INSERT OR IGNORE INTO golf_players (name) VALUES (?)').run(data.value);
                else if (data.type === 'course') dbInstance.prepare('INSERT OR IGNORE INTO golf_courses (name) VALUES (?)').run(data.value);
                else if (data.type === 'track') dbInstance.prepare('INSERT OR IGNORE INTO golf_tracks (name) VALUES (?)').run(data.value);
                else if (data.type === 'feedback') dbInstance.prepare('INSERT INTO golf_feedback (user, date, content) VALUES (?, ?, ?)').run(data.user || 'Anon', new Date().toISOString(), data.value);
                sendData();
            } catch (err) {
                console.error(`🔴 [GOLF-IO] Error en golf_addBasic:`, err);
            }
        });

        // Eliminar Datos Básicos
        socket.on('golf_delBasic', (data) => {
            try {
                if (data.type === 'player') dbInstance.prepare('DELETE FROM golf_players WHERE name = ?').run(data.value);
                else if (data.type === 'course') dbInstance.prepare('DELETE FROM golf_courses WHERE name = ?').run(data.value);
                else if (data.type === 'track') dbInstance.prepare('DELETE FROM golf_tracks WHERE name = ?').run(data.value);
                else if (data.type === 'feedback') dbInstance.prepare('DELETE FROM golf_feedback WHERE id = ?').run(parseInt(data.value, 10));
                sendData();
            } catch(err) {
                console.error(`🔴 [GOLF-IO] Error en golf_delBasic:`, err);
            }
        });

        // ==========================================
        // AÑADIR REGISTRO (CONSTRUCTOR DINÁMICO)
        // ==========================================
        socket.on('golf_addRecord', (payload) => {
            console.log(`\n🔵 [GOLF-IO] Petición para guardar nuevo registro:`, payload);
            try {
                // Guardamos al jugador en la lista general si es nuevo
                if (payload.player) dbInstance.prepare('INSERT OR IGNORE INTO golf_players (name) VALUES (?)').run(payload.player);

                // 1. Limpiamos los datos nulos/vacíos y auto-creamos columnas necesarias
                const cleanPayload = {};
                for (let key in payload) {
                    if (payload[key] !== undefined && payload[key] !== null && payload[key] !== '') {
                        cleanPayload[key] = payload[key];
                        // Detectamos si es número o texto
                        const type = (typeof payload[key] === 'number') ? 'INTEGER' : 'TEXT';
                        ensureColumn('golf_records', key, type); // Magia: crea la columna si no existe
                    }
                }
                
                // 2. Añadimos la fecha exacta de servidor
                cleanPayload.date = new Date().toISOString();
                ensureColumn('golf_records', 'date', 'TEXT');

                // 3. Construimos la Query SQL de forma dinámica basada en los datos recibidos
                const keys = Object.keys(cleanPayload);
                const placeholders = keys.map(() => '?').join(', ');
                const values = Object.values(cleanPayload);

                const query = `INSERT INTO golf_records (${keys.join(', ')}) VALUES (${placeholders})`;
                console.log(`🔵 [GOLF-IO] Ejecutando SQL: ${query}`);
                
                // 4. Ejecutar
                const result = dbInstance.prepare(query).run(...values);
                console.log(`✅ [GOLF-IO] ÉXITO. Registro creado con el ID interno: ${result.lastInsertRowid}`);
                
                sendData();
            } catch (err) {
                console.error(`🔴 [GOLF-IO] Error crítico guardando registro:`, err);
                socket.emit('golf_error', 'Fallo al guardar: ' + err.message);
            }
        });

        // Eliminar Registro
        socket.on('golf_delRecord', (data) => {
            try {
                const numericId = parseInt(data.id, 10);
                const safeUser = (data.reqUser || '').trim().toLowerCase();
                const isAdmin = ['xarlie', 'administrador g'].includes(safeUser);
                
                // Nos aseguramos de que addedBy existe antes de consultar
                ensureColumn('golf_records', 'addedBy', 'TEXT');
                
                const record = dbInstance.prepare('SELECT addedBy FROM golf_records WHERE id = ?').get(numericId);
                
                if (record) {
                    const recordOwner = (record.addedBy || '').trim().toLowerCase();
                    if (isAdmin || recordOwner === safeUser) {
                        dbInstance.prepare('DELETE FROM golf_records WHERE id = ?').run(numericId);
                        console.log(`✅ [GOLF-IO] Registro ${numericId} eliminado por ${safeUser}`);
                        sendData();
                    } else {
                        socket.emit('golf_error', 'No tienes permisos para borrar este registro.');
                    }
                }
            } catch (err) {
                console.error(`🔴 [GOLF-IO] Error en borrado:`, err);
            }
        });
    }
};