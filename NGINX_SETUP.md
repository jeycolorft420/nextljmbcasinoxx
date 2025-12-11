# Configuración Nginx para WebSockets (WSS)

El error "Mixed Content" ocurre porque tu sitio carga con HTTPS pero el juego intenta conectar por HTTP/WS inseguro al puerto 4000.

Para arreglarlo, debes configurar Nginx para que reciba las conexiones en `https://777galaxy.online/socket.io/` y las pase internamente a tu Game Server (puerto 4000).

## Pasos:

1.  Edita tu archivo de configuración de Nginx (usualmente en `/etc/nginx/sites-available/default` o similar).
2.  Agrega este bloque `location` DENTRO del bloque `server { ... }` que maneja el SSL (puerto 443):

```nginx
    # Proxy para Socket.io (Game Server)
    location /socket.io/ {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;

        # Timeouts largos para evitar desconexiones
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
```

3.  Guarda y reinicia Nginx:
    ```bash
    sudo systemctl restart nginx
    ```

4.  **IMPORTANTE**: Actualiza el Frontend.
    Una vez hecho esto, tu Frontend ya no necesita conectar al puerto :4000 directamente. Puede conectar al dominio principal.
    
    Te voy a actualizar `DiceBoard.tsx` para que detecte esto automáticamente.
