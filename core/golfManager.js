let dbInstance;

module.exports = {
    init: (db) => {
        console.log("🔵 [GOLF-DB] Inicializando tablas de Golf...");
        dbInstance = db;
        try {
            dbInstance.prepare('CREATE TABLE IF NOT EXISTS golf_players (name TEXT PRIMARY KEY)').run();
            dbInstance.prepare('CREATE TABLE IF NOT EXISTS golf_courses (name TEXT PRIMARY KEY)').run();
            dbInstance.prepare('CREATE TABLE IF NOT EXISTS golf_tracks (name TEXT PRIMARY KEY)').run();
            dbInstance.prepare('CREATE TABLE IF NOT EXISTS golf_feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, user TEXT, date TEXT, content TEXT)').run();
            dbInstance.prepare(`
                CREATE TABLE IF NOT EXISTS golf_records (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    player TEXT, track TEXT, strokes INTEGER, club TEXT,
                    course TEXT, par INTEGER, weather TEXT,
                    date TEXT, addedBy TEXT, photo TEXT
                )
            `).run();

            try { dbInstance.prepare('ALTER TABLE golf_records ADD COLUMN photo TEXT').run(); } catch(e) {}
            console.log("🔵 [GOLF-DB] Tablas inicializadas correctamente. ✅");
        } catch (err) {
            console.error("🔴 [GOLF-DB] ERROR FATAL al crear tablas:", err);
        }
    },

    handleSocket: (io, socket) => {
        const sendData = () => {
            console.log("🔵 [GOLF-IO] Enviando paquete de datos completo a los clientes...");
            try {
                const data = {
                    players: dbInstance.prepare('SELECT * FROM golf_players').all().map(p => p.name),
                    courses: dbInstance.prepare('SELECT * FROM golf_courses').all().map(c => c.name),
                    tracks: dbInstance.prepare('SELECT * FROM golf_tracks').all().map(t => t.name),
                    records: dbInstance.prepare('SELECT * FROM golf_records ORDER BY id DESC LIMIT 200').all(),
                    feedback: dbInstance.prepare('SELECT * FROM golf_feedback ORDER BY id DESC').all()
                };
                io.emit('golf_data', data);
                console.log("🔵 [GOLF-IO] Paquete emitido correctamente. ✅");
            } catch (err) {
                console.error("🔴 [GOLF-IO] Error enviando datos:", err);
            }
        };

        socket.on('golf_requestData', () => {
            console.log(`🔵 [GOLF-IO] Cliente ${socket.id} ha pedido refrescar datos.`);
            sendData();
        });

        // Añadir Datos Básicos
        socket.on('golf_addBasic', (data) => {
            console.log(`\n🔵 [GOLF-IO] RECIBIDO EVENTO 'golf_addBasic'. Datos:`, data);
            try {
                if (data.type === 'player') dbInstance.prepare('INSERT OR IGNORE INTO golf_players (name) VALUES (?)').run(data.value);
                if (data.type === 'course') dbInstance.prepare('INSERT OR IGNORE INTO golf_courses (name) VALUES (?)').run(data.value);
                if (data.type === 'track') dbInstance.prepare('INSERT OR IGNORE INTO golf_tracks (name) VALUES (?)').run(data.value);
                if (data.type === 'feedback') {
                    dbInstance.prepare('INSERT INTO golf_feedback (user, date, content) VALUES (?, ?, ?)').run(data.user, new Date().toISOString(), data.value);
                }
                console.log(`🔵 [GOLF-IO] Guardado en BD completado. Refrescando clientes...`);
                sendData();
            } catch (err) {
                console.error(`🔴 [GOLF-IO] Error BBDD en golf_addBasic:`, err);
                socket.emit('golf_error', `Error al añadir ${data.type}: ${err.message}`);
            }
        });

        // Eliminar Datos Básicos
        socket.on('golf_delBasic', (data) => {
            console.log(`\n🔵 [GOLF-IO] RECIBIDO EVENTO 'golf_delBasic'. Datos:`, data);
            try {
                if (data.type === 'player') dbInstance.prepare('DELETE FROM golf_players WHERE name = ?').run(data.value);
                if (data.type === 'course') dbInstance.prepare('DELETE FROM golf_courses WHERE name = ?').run(data.value);
                if (data.type === 'track') dbInstance.prepare('DELETE FROM golf_tracks WHERE name = ?').run(data.value);
                if (data.type === 'feedback') dbInstance.prepare('DELETE FROM golf_feedback WHERE id = ?').run(parseInt(data.value, 10));
                console.log(`🔵 [GOLF-IO] Borrado completado. Refrescando clientes...`);
                sendData();
            } catch(err) {
                console.error(`🔴 [GOLF-IO] Error al borrar ${data.type}:`, err);
            }
        });

        // Añadir Registro
        socket.on('golf_addRecord', (r) => {
            console.log(`\n🔵 [GOLF-IO] RECIBIDO EVENTO 'golf_addRecord'. Jugador: ${r.player}, Pista: ${r.track}, Golpes: ${r.strokes}`);
            try {
                dbInstance.prepare('INSERT OR IGNORE INTO golf_players (name) VALUES (?)').run(r.player);
                dbInstance.prepare(`INSERT INTO golf_records (player, track, strokes, club, course, par, weather, date, addedBy, photo) 
                                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
                    r.player, r.track, r.strokes, r.club, r.course || '', r.par || null, r.weather || '', new Date().toISOString(), r.addedBy, r.photo || null
                );
                console.log(`🔵 [GOLF-IO] Registro insertado en BD correctamente. Refrescando...`);
                sendData();
            } catch (err) {
                console.error(`🔴 [GOLF-IO] Error guardando registro:`, err);
                socket.emit('golf_error', 'Fallo servidor: ' + err.message);
            }
        });

        // Eliminar Registro
        socket.on('golf_delRecord', (data) => {
            console.log(`\n🔵 [GOLF-IO] RECIBIDO EVENTO 'golf_delRecord'. Datos:`, data);
            try {
                const numericId = parseInt(data.id, 10);
                const safeUser = (data.reqUser || '').trim().toLowerCase();
                const isAdmin = ['xarlie', 'administrador g'].includes(safeUser);
                
                const record = dbInstance.prepare('SELECT addedBy FROM golf_records WHERE id = ?').get(numericId);
                
                if (record) {
                    const recordOwner = (record.addedBy || '').trim().toLowerCase();
                    console.log(`🔵 [GOLF-IO] Comparando permisos. Solicitante: "${safeUser}", Dueño: "${recordOwner}", Admin: ${isAdmin}`);
                    
                    if (isAdmin || recordOwner === safeUser) {
                        const result = dbInstance.prepare('DELETE FROM golf_records WHERE id = ?').run(numericId);
                        console.log(`🔵 [GOLF-IO] Borrado ejecutado. Filas afectadas:`, result.changes);
                        sendData();
                    } else {
                        console.log(`🔴 [GOLF-IO] Permiso DENEGADO.`);
                        socket.emit('golf_error', 'No tienes permisos para borrar esto.');
                    }
                } else {
                    console.log(`🔴 [GOLF-IO] Registro ID ${numericId} no encontrado en BD.`);
                }
            } catch (err) {
                console.error(`🔴 [GOLF-IO] Error en borrado de registro:`, err);
            }
        });
    }
};