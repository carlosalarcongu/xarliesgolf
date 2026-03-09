#!/bin/bash

echo "⛳ Iniciando servidor de Golf..."
pm2 start server.js --name "xarliesgolf" 2>/dev/null || pm2 restart xarliesgolf

echo "☁️ Levantando túnel de Cloudflare..."
# Matamos cualquier túnel previo que se haya quedado colgado
pkill cloudflared

# Arrancamos cloudflared en segundo plano y guardamos el texto en un log
cloudflared tunnel --url http://localhost:2312 > tunnel.log 2>&1 &

echo "⏳ Esperando a que Cloudflare genere el enlace (5s)..."
sleep 5

# Usamos grep para extraer exactamente el enlace de trycloudflare
URL=$(grep -oE "https://[a-zA-Z0-9.-]+\.trycloudflare\.com" tunnel.log | head -n 1)

if [ -n "$URL" ]; then
    echo ""
    echo "========================================================"
    echo " ⛳ XARLIE'S GOLF CLUB ESTÁ EN LÍNEA"
    echo " 🔗 ENLACE: $URL"
    echo "========================================================"
    echo ""
else
    echo "❌ Cloudflare falló (probablemente Error 500). Revisa el log:"
    grep -E "ERR|Error" tunnel.log | head -n 3
fi
