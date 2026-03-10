#!/bin/bash

# 1. Cargar las variables del archivo .env de forma segura
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

echo "⛳ Iniciando servidor de Golf..."
pm2 start server.js --name "xarliesgolf" 2>/dev/null || pm2 restart xarliesgolf

echo "☁️ Levantando túnel de Cloudflare..."
# Matamos cualquier túnel previo que se haya quedado colgado
pkill cloudflared

# Arrancamos cloudflared en segundo plano y guardamos el texto en un log
cloudflared tunnel --url http://localhost:2312 > tunnel.log 2>&1 &

echo "⏳ Esperando a que Cloudflare genere el enlace (6s)..."
sleep 6

# Usamos grep -a para forzar a leerlo como texto aunque tenga códigos de color
URL=$(grep -aoE "https://[a-zA-Z0-9.-]+\.trycloudflare\.com" tunnel.log | head -n 1)

if [ -n "$URL" ]; then
    echo ""
    echo "========================================================"
    echo " ⛳ XARLIE'S GOLF CLUB ESTÁ EN LÍNEA"
    echo " 🔗 ENLACE: $URL"
    echo "========================================================"
    echo ""
    
    # 2. Actualizar la URL en GitHub
    if [ -n "$GITHUB_TOKEN" ]; then
        echo "🔄 Actualizando URL en el repositorio de GitHub..."
        
        # Hacemos la petición a la API de GitHub
        HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
          -X PATCH \
          -H "Accept: application/vnd.github+json" \
          -H "Authorization: Bearer $GITHUB_TOKEN" \
          -H "X-GitHub-Api-Version: 2022-11-28" \
          https://api.github.com/repos/carlosalarcongu/xarliesgolf \
          -d "{\"homepage\":\"$URL\"}")
          
        if [ "$HTTP_STATUS" -eq 200 ]; then
            echo "✅ GitHub actualizado con éxito. Cualquiera puede entrar desde el repo."
        else
            echo "⚠️ No se pudo actualizar GitHub (Código de error: $HTTP_STATUS). Verifica tu GITHUB_TOKEN."
        fi
    else
        echo "⚠️ No se ha encontrado GITHUB_TOKEN en el archivo .env. Saltando actualización de GitHub."
    fi

else
    echo "❌ Cloudflare no devolvió enlace. Revisa el log de errores:"
    grep -aE "ERR|Error" tunnel.log | head -n 5
fi