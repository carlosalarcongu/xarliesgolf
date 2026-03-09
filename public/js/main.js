console.log("🟢 [CLIENTE] Archivo main.js cargado.");

const socket = io();

socket.on('connect', () => {
    console.log(`🟢 [CLIENTE] Socket conectado al servidor! ID: ${socket.id}`);
});

const app = {
    myPlayerName: null,
    isAuthenticated: false,
    currentListType: null,
    data: { players: [], courses: [], tracks: [], records: [], feedback: [] },
    pendingPassCallback: null,
    currentPhotoBase64: null, 

    init: () => {
        console.log("🟢 [CLIENTE] Ejecutando app.init()...");
        const saved = localStorage.getItem('golf_user');
        if (saved) {
            console.log(`🟢 [CLIENTE] Usuario previo encontrado en localStorage: ${saved}`);
            app.myPlayerName = saved;
            app.isAuthenticated = true; 
            socket.emit('golf_requestData');
            app.showScreen('hubScreen');
        } else {
            console.log("🟢 [CLIENTE] No hay usuario guardado. Mostrando Login.");
            app.showScreen('loginScreen');
            document.getElementById('inp-username').focus();
        }

        socket.on('golf_data', (d) => {
            console.log("🟢 [CLIENTE] RECIBIDO 'golf_data' desde el servidor.", d);
            app.data = d;
            if (app.currentListType) app.renderList(app.currentListType);
            app.populateSelects();
        });

        socket.on('golf_error', (msg) => {
            console.log("🔴 [CLIENTE] RECIBIDO ERROR DEL SERVIDOR:", msg);
            alert("⚠️ Error del sistema: " + msg);
        });

        document.getElementById('rec-photo').addEventListener('change', app.handlePhotoUpload);
    },

    showScreen: (id) => {
        console.log(`🟢 [CLIENTE] Cambiando a pantalla: ${id}`);
        document.querySelectorAll('.screen').forEach(el => el.classList.add('hidden'));
        document.getElementById(id).classList.remove('hidden');

        const widget = document.getElementById('userWidget');
        if (id === 'loginScreen') {
            widget.classList.add('hidden');
        } else {
            widget.classList.remove('hidden');
            const isAdmin = ['xarlie', 'administrador g'].includes((app.myPlayerName||'').toLowerCase());
            let emoji = isAdmin ? '👑' : (app.isAuthenticated ? '🛡️' : '🛡️❌');
            document.getElementById('widgetName').innerHTML = `${emoji} ${app.myPlayerName}`;
        }
    },

    login: () => {
        const name = document.getElementById('inp-username').value.trim();
        console.log(`🟢 [CLIENTE] Intento de login con nombre: "${name}"`);
        if (!name) return alert("Introduce tu nombre");

        socket.emit('checkAuthRequirement', name, (res) => {
            console.log(`🟢 [CLIENTE] Respuesta checkAuthRequirement:`, res);
            const finalize = () => {
                app.myPlayerName = name;
                localStorage.setItem('golf_user', name);
                socket.emit('golf_requestData');
                app.showScreen('hubScreen');
            };

            if (res.needsPassword) {
                app.showPasswordModal(name, finalize);
            } else {
                app.isAuthenticated = false;
                finalize();
            }
        });
    },

    logout: () => {
        console.log("🟢 [CLIENTE] Cerrando sesión...");
        localStorage.removeItem('golf_user');
        app.myPlayerName = null;
        app.isAuthenticated = false;
        document.getElementById('inp-username').value = "";
        app.showScreen('loginScreen');
    },

    showPasswordModal: (name, callback) => {
        app.pendingPassCallback = callback;
        document.getElementById('passwordModal').classList.remove('hidden');
        setTimeout(() => document.getElementById('inp-password').focus(), 100);
    },

    submitPassword: () => {
        const pass = document.getElementById('inp-password').value;
        socket.emit('verifyPassword', { username: document.getElementById('inp-username').value.trim(), password: pass }, (res) => {
            if (res.success) {
                app.isAuthenticated = true;
                document.getElementById('passwordModal').classList.add('hidden');
                document.getElementById('inp-password').value = '';
                if(app.pendingPassCallback) app.pendingPassCallback();
            } else {
                alert("Clave incorrecta");
            }
        });
    },

    showRegister: () => {
        const name = document.getElementById('inp-username').value.trim();
        if(!name) return alert("Escribe un nombre primero para registrarlo.");
        document.getElementById('reg-user').value = name;
        document.getElementById('registerModal').classList.remove('hidden');
    },

    submitRegister: () => {
        const user = document.getElementById('reg-user').value;
        const pass = document.getElementById('reg-pass').value;
        if(pass.length < 4) return alert("Mínimo 4 caracteres");
        
        socket.emit('submitAuthRequest', { username: user, password: pass }, () => {
            alert("Registrado correctamente. ¡Entra al campo!");
            document.getElementById('registerModal').classList.add('hidden');
            app.login();
        });
    },

    showList: (type) => {
        console.log(`🟢 [CLIENTE] Abriendo lista de tipo: ${type}`);
        app.currentListType = type;
        app.showScreen('listScreen');
        
        const titles = { players: "👥 Jugadores", courses: "🗺️ Campos", tracks: "⛳ Pistas", top: "🏆 Mejores Actuaciones", records: "📋 Últimos Registros", streaks: "🔥 Rachas", feedback: "💬 Feedback" };
        document.getElementById('listTitle').innerText = titles[type];

        const addArea = document.getElementById('listAddArea');
        if (['top', 'records', 'streaks'].includes(type)) {
            addArea.classList.add('hidden');
        } else {
            addArea.classList.remove('hidden');
            let ph = `Nuevo ${type === 'players'?'jugador':(type==='courses'?'campo':'pista')}...`;
            if (type === 'feedback') ph = "Escribe tu idea o bug aquí...";
            
            document.getElementById('inp-basicAdd').placeholder = ph;
            document.getElementById('inp-basicAdd').value = "";
            setTimeout(() => document.getElementById('inp-basicAdd').focus(), 100);
        }
        app.renderList(type);
    },

    addBasic: () => {
        const val = document.getElementById('inp-basicAdd').value.trim();
        console.log(`🟢 [CLIENTE] Botón Añadir pulsado. Contenido: "${val}"`);
        if(!val) return;
        
        let targetType = 'player';
        if(app.currentListType === 'courses') targetType = 'course';
        if(app.currentListType === 'tracks') targetType = 'track';
        if(app.currentListType === 'feedback') targetType = 'feedback';

        console.log(`🟡 [CLIENTE] EMITIENDO 'golf_addBasic'. Type: ${targetType}, Value: ${val}`);
        socket.emit('golf_addBasic', { type: targetType, value: val, user: app.myPlayerName });
        document.getElementById('inp-basicAdd').value = "";
    },

    delBasic: (type, val) => {
        console.log(`🟢 [CLIENTE] Botón Borrar básico pulsado. Tipo: ${type}, Valor: ${val}`);
        if(confirm(`¿Borrar este elemento?`)) {
            console.log(`🟡 [CLIENTE] EMITIENDO 'golf_delBasic'`);
            socket.emit('golf_delBasic', { type, value: val });
        }
    },

    delRecord: (id) => {
        console.log(`🟢 [CLIENTE] Botón Borrar registro pulsado. ID: ${id}`);
        if(confirm("¿Eliminar este registro definitivamente?")) {
            console.log(`🟡 [CLIENTE] EMITIENDO 'golf_delRecord' para ID ${id} con usuario ${app.myPlayerName}`);
            socket.emit('golf_delRecord', { id, reqUser: app.myPlayerName });
        }
    },

    renderList: (type) => {
        const c = document.getElementById('listContainer');
        c.innerHTML = "";
        const isAdmin = ['xarlie', 'administrador g'].includes((app.myPlayerName||'').toLowerCase());

        if (['players', 'courses', 'tracks'].includes(type)) {
            let items = app.data[type] || [];
            if(items.length === 0) c.innerHTML = "<p style='color:white; text-align:center;'>Vacío</p>";
            items.forEach(val => {
                const typeMap = { players: 'player', courses: 'course', tracks: 'track' };
                let delBtn = isAdmin ? `<button class="btn-del" onclick="app.delBasic('${typeMap[type]}', '${val}')">🗑️</button>` : '';
                c.innerHTML += `<div class="list-item"><strong>${val}</strong> ${delBtn}</div>`;
            });
        } 
        else if (type === 'feedback') {
            let items = app.data.feedback || [];
            if(items.length === 0) c.innerHTML = "<p style='color:white; text-align:center;'>Sin feedback</p>";
            items.forEach(f => {
                const dateStr = new Date(f.date).toLocaleDateString('es-ES', {month:'short', day:'numeric'});
                let delBtn = isAdmin ? `<button class="btn-del" onclick="app.delBasic('feedback', ${f.id})">🗑️</button>` : '';
                c.innerHTML += `
                    <div class="list-item" style="flex-direction:column; align-items:flex-start;">
                        <div style="width:100%; display:flex; justify-content:space-between; margin-bottom:5px;">
                            <span style="font-size:0.8em; color:var(--sand-dark);">👤 ${f.user} - ${dateStr}</span>
                            ${delBtn}
                        </div>
                        <div class="feedback-text">${f.content}</div>
                    </div>`;
            });
        }
        else if (type === 'records') {
            if(!app.data.records || app.data.records.length === 0) {
                c.innerHTML = "<p style='color:white; text-align:center;'>Sin registros</p>";
                return;
            }
            app.data.records.forEach(r => {
                const dateStr = new Date(r.date).toLocaleDateString('es-ES', {month:'short', day:'numeric'});
                const isOwner = (r.addedBy||'').toLowerCase() === (app.myPlayerName||'').toLowerCase();
                
                let delBtn = (isAdmin || isOwner) ? `<button class="btn-del" onclick="app.delRecord(${r.id})">🗑️</button>` : '';
                
                const diff = r.par ? (r.strokes - r.par) : null;
                let scoreClass = diff === null ? '' : (diff < 0 ? 'r-under' : (diff === 0 ? 'r-par' : 'r-over'));
                let diffText = diff === null ? '' : (diff === 0 ? 'E' : (diff > 0 ? `+${diff}` : diff));

                let photoBtn = (r.photo && (isAdmin || isOwner)) 
                    ? `<button style="background:var(--sand); color:white; border:none; border-radius:5px; padding:3px 8px; font-size:0.8em; cursor:pointer;" onclick="app.viewPhoto('${r.id}')">📸 Foto</button>` 
                    : '';
                
                c.innerHTML += `
                    <div class="list-item" style="flex-direction:column; align-items:flex-start; gap:5px;">
                        <div style="width:100%; display:flex; justify-content:space-between; align-items:center;">
                            <div class="r-score ${scoreClass}">
                                ${r.strokes} <span style="font-size:0.5em; color:#555;">${diffText ? `(${diffText})` : ''}</span>
                            </div>
                            <div style="display:flex; gap:5px;">${photoBtn} ${delBtn}</div>
                        </div>
                        <div style="color:#555; font-size:0.9em; line-height:1.3; width:100%;">
                            <b>👤 ${r.player}</b> en <b>⛳ ${r.track}</b><br>
                            🏌️ Palo: <span style="color:var(--green-dark); font-weight:bold;">${r.club}</span> <br>
                            <span style="font-size:0.8em; color:#888;">🗓️ ${dateStr} ${r.course ? '| 🗺️ '+r.course : ''} ${r.weather ? '| '+r.weather : ''}</span>
                        </div>
                    </div>`;
            });
        }
        else if (type === 'top') {
            let sorted = [...app.data.records].sort((a,b) => a.strokes - b.strokes).slice(0, 10);
            if(sorted.length === 0) c.innerHTML = "<p style='color:white; text-align:center;'>Sin registros</p>";
            sorted.forEach((r, idx) => {
                const medals = ['🥇','🥈','🥉'];
                const rank = idx < 3 ? medals[idx] : `<b style="color:var(--green-mid)">#${idx+1}</b>`;
                c.innerHTML += `
                    <div class="list-item">
                        <div style="font-size:1.5em; min-width:40px;">${rank}</div>
                        <div style="text-align:left; flex:1; padding-left:10px;">
                            <strong>${r.player}</strong><br>
                            <span style="font-size:0.8em; color:#666;">${r.track} (${r.club})</span>
                        </div>
                        <div style="color:var(--dark-green); font-size:1.8em; font-weight:900;">${r.strokes}</div>
                    </div>`;
            });
        }
        else if (type === 'streaks') {
            const stats = {};
            app.data.records.forEach(r => {
                if (!stats[r.player]) stats[r.player] = { holes: 0, under: 0, par: 0, over: 0 };
                stats[r.player].holes++;
                if (r.par) {
                    if (r.strokes < r.par) stats[r.player].under++;
                    else if (r.strokes === r.par) stats[r.player].par++;
                    else stats[r.player].over++;
                }
            });

            const playerArr = Object.keys(stats).map(p => ({ player: p, ...stats[p] }));
            playerArr.sort((a,b) => b.holes - a.holes);
            const topHoles = playerArr.slice(0, 3);
            
            let html = `<div class="card" style="margin-bottom:15px; padding:15px;"><h3 style="color:var(--dark-green); margin-bottom:10px;">⛳ Más Hoyos Jugados</h3>`;
            topHoles.forEach((s, i) => html += `<div class="list-item" style="padding:10px; margin-bottom:5px;"><b>${i+1}. ${s.player}</b> <span style="color:var(--dark-green); font-weight:900;">${s.holes}</span></div>`);
            if(topHoles.length === 0) html += "<p style='color:#888; text-align:center;'>Aún no hay hoyos registrados.</p>";
            html += `</div>`;

            const effArr = playerArr.filter(p => p.holes >= 3).map(p => {
                const totalScored = p.under + p.par + p.over;
                const eff = totalScored > 0 ? ((p.under + p.par) / totalScored * 100) : 0;
                return { ...p, eff };
            }).sort((a,b) => b.eff - a.eff).slice(0, 3);

            html += `<div class="card" style="padding:15px;"><h3 style="color:var(--dark-green); margin-bottom:5px;">🎯 Más precisos (% Par o Mejor)</h3><p style="font-size:0.7em; color:#888; margin-top:0; margin-bottom:10px;">Mínimo 3 hoyos con Par asignado</p>`;
            effArr.forEach((s, i) => html += `<div class="list-item" style="padding:10px; margin-bottom:5px;"><b>${i+1}. ${s.player}</b> <span style="color:var(--dark-green); font-weight:900;">${s.eff.toFixed(1)}%</span></div>`);
            if(effArr.length === 0) html += "<p style='color:#888; text-align:center; margin:0;'>Faltan datos o jugadores con +3 hoyos.</p>";
            html += `</div>`;

            c.innerHTML = html;
        }
    },

    handlePhotoUpload: (event) => {
        console.log("🟢 [CLIENTE] Archivo seleccionado.");
        const file = event.target.files[0];
        if(!file) {
            app.currentPhotoBase64 = null;
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 800; 
                let scale = 1;
                if (img.width > MAX_WIDTH) scale = MAX_WIDTH / img.width;
                
                canvas.width = img.width * scale;
                canvas.height = img.height * scale;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                app.currentPhotoBase64 = canvas.toDataURL('image/jpeg', 0.6); 
                console.log("🟢 [CLIENTE] Foto procesada y lista en Base64.");
            }
            img.src = e.target.result;
        }
        reader.readAsDataURL(file);
    },

    viewPhoto: (id) => {
        const record = app.data.records.find(r => r.id == id);
        if (record && record.photo) {
            document.getElementById('expandedPhoto').src = record.photo;
            document.getElementById('photoModal').classList.remove('hidden');
        }
    },

    showAddRecordModal: () => {
        console.log("🟢 [CLIENTE] Abriendo modal de registro.");
        app.populateSelects();
        document.getElementById('rec-photo').value = ""; 
        app.currentPhotoBase64 = null;
        document.getElementById('recordModal').classList.remove('hidden');
    },

    populateSelects: () => {
        const fill = (id, list, selectedVal = null) => {
            const el = document.getElementById(id);
            if(!el) return;
            const current = selectedVal || el.value;
            el.innerHTML = `<option value="">-- Selecciona --</option>` + list.map(i => `<option value="${i}">${i}</option>`).join('');
            if(list.includes(current)) el.value = current;
        };

        let playerList = [...(app.data.players || [])];
        if (app.myPlayerName && !playerList.includes(app.myPlayerName)) {
            playerList.unshift(app.myPlayerName);
        }

        fill('rec-player', playerList, app.myPlayerName); 
        fill('rec-track', app.data.tracks || []);
        
        const courseEl = document.getElementById('rec-course');
        const currCourse = courseEl ? courseEl.value : null;
        if(courseEl) {
            courseEl.innerHTML = `<option value="">-- Ninguno --</option>` + (app.data.courses || []).map(i => `<option value="${i}">${i}</option>`).join('');
            if((app.data.courses||[]).includes(currCourse)) courseEl.value = currCourse;
        }
    },

    submitRecord: () => {
        console.log("🟢 [CLIENTE] Botón Guardar Registro pulsado.");
        const player = document.getElementById('rec-player').value;
        const track = document.getElementById('rec-track').value;
        const strokes = document.getElementById('rec-strokes').value;
        const club = document.getElementById('rec-club').value.trim();

        if (!player || !track || !strokes || !club) {
            console.log("🔴 [CLIENTE] Faltan datos obligatorios.");
            return alert("Jugador, Pista, Golpes y Palo son obligatorios.");
        }

        const payload = {
            player, track, strokes: parseInt(strokes), club,
            course: document.getElementById('rec-course').value,
            par: document.getElementById('rec-par').value ? parseInt(document.getElementById('rec-par').value) : null,
            weather: document.getElementById('rec-weather').value,
            addedBy: app.myPlayerName,
            photo: app.currentPhotoBase64 
        };

        console.log("🟡 [CLIENTE] EMITIENDO 'golf_addRecord'. Payload:", payload);
        socket.emit('golf_addRecord', payload);
        document.getElementById('recordModal').classList.add('hidden');
        
        document.getElementById('rec-strokes').value = "4";
        document.getElementById('rec-club').value = "";
        document.getElementById('rec-photo').value = "";
        app.currentPhotoBase64 = null;
    }
};

window.onload = app.init;