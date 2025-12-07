# Reporte Forense de Incidente de Malware (XMRig)

**Fecha:** 07 de Diciembre de 2025
**Incidente:** Infección confirmada con Troyanos de Minería (XMRig) y Persistencia (SystemHelper).
**Veredicto Final:** Código Fuente Limpio. **Vulnerabilidad de Software Explotada.**

## 🚨 Hallazgo Crítico: La Puerta de Entrada

Durante la auditoría forense, se detectó que el proyecto utilizaba **Next.js v15.5.4**.
Esta versión específica sufre de una **Vulnerabilidad Crítica de Ejecución Remota de Código (RCE)**.

- **CVE/Advisory:** GHSA-9qr9-h5gf-34mp
- **Severidad:** Crítica
- **Descripción:** Un atacante puede enviar una solicitud web especialmente diseñada que obliga al servidor a ejecutar comandos de sistema arbitrarios.

### 🔍 Reconstrucción del Ataque
1.  **Estado Inicial:** El VPS corría el sitio web con una versión vulnerable de Next.js.
2.  **Explotación:** Un bot o atacante detectó la vulnerabilidad y envió el exploit.
3.  **Infección:** El comando inyectado descargó `xmrig` (minero) y `systemhelper` (persistencia) en carpetas temporales (`/tmp`, `/root/.cache`), evitando dejar rastros en el código fuente del proyecto (`/var/www/...`).
4.  **Consecuencia:** El servidor comenzó a minar criptomonedas y el malware se ejecutó con permisos elevados.

## 🛡️ Acciones Realizadas

1.  **Auditoría de Código Fuente:** Se exploraron todos los archivos del proyecto, incluyendo scripts ocultos en `node_modules` y `package.json`. **Resultado: LIMPIO**. El malware no estaba "escrito" en tu código, fue inyectado en vivo.
2.  **Mitigación:** Se ha actualizado `next` a la última versión segura.
    - Se ejecutó: `npm install next@latest`
    - Esto cierra la vulnerabilidad RCE.

## ⚠️ Recomendaciones para el Nuevo VPS

Ya has reinstalado el VPS (lo cual fue la acción correcta). Para evitar reinfección:

1.  **Despliega la Versión Actualizada:** Asegúrate de subir el archivo `package.json` actualizado con la nueva versión de Next.js.
2.  **No ejecutar como Root:** Evita correr la aplicación con el usuario `root`. Crea un usuario limitado (ej: `nextjs`).
3.  **Firewall:** Mantén cerrados todos los puertos excepto 80, 443 y 22 (SSH).

**Conclusión:** Tu código es seguro. La infección fue causada por una falla de seguridad en la librería `next`, que ya ha sido parcheada.
