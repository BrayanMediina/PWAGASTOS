# Control de Gastos PWA

Aplicación web progresiva para registrar gastos diarios por categorías, definir presupuesto mensual y visualizar un resumen financiero con gráfico. Guardando en local storage
## Autor
Brayan Julián Barrantes Medina

## Endurecimiento de seguridad aplicado

### 1) Validación y saneamiento de formularios

Se implementó validación y saneamiento defensivo en la capa de JavaScript para prevenir problemas de operación y riesgos de inyección:

- Normalización estricta de fecha, mes, categoría y montos.
- Allowlist de categorías válidas.
- Límite de montos máximos para detectar valores atípicos.
- Saneamiento de descripción con normalización Unicode, limpieza de caracteres de control y truncamiento seguro.
- Sanitización de datos recuperados desde localStorage antes de usarlos.
- Renderizado de tabla usando nodos del DOM en lugar de inyección HTML.

### 2) Políticas CSP implementadas

En [index.html](index.html) se aplicó una política CSP estricta que cubre:

- Control de carga para prevenir XSS con default-src 'none'.
- Control de recursos por tipo: script-src, style-src, img-src, font-src, connect-src, worker-src y manifest-src.
- Bloqueo de objetos con object-src 'none'.
- Script de confianza protegido por hash sha256 en script-src.
- Política basada en esquema y ubicación con img-src 'self' data: https: y connect-src 'self' https:.
- Control estricto con base-uri 'none', frame-ancestors 'none', form-action 'self', block-all-mixed-content.
- Uso de strict-dynamic para confiar únicamente en scripts encadenados desde un script raíz autorizado.

### 3) HTTPS obligatorio

Se aplicó doble control para asegurar acceso seguro a recursos:

- Redirección automática de http a https en entornos no locales desde el script de arranque.
- Directiva CSP upgrade-insecure-requests para forzar actualización de recursos inseguros.

## Evidencias de actividades (capturas)

Capturas generadas en el proyecto:

- [01-validacion-invalida.png](docs/evidencias/01-validacion-invalida.png)
- [02-saneamiento-nota.png](docs/evidencias/02-saneamiento-nota.png)
- [03-csp-estricta.png](docs/evidencias/03-csp-estricta.png)

Escenarios usados para generar evidencia:

- Validación de monto inválido.
- Registro con nota potencialmente maliciosa saneada.
- Confirmación visual de escenario CSP endurecida.
