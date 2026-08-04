# Somewhen

Un prototipo interactivo de agenda social para encontrar los momentos en que
un grupo de amigos está libre, sin exponer el calendario privado de nadie.

La versión actual muestra:

- un resumen de disponibilidad personal;
- el grupo “Los tres de siempre” con Leo, Rodo y Fer;
- un recorrido guiado para elegir actividad, lugar y un horario en común desde un calendario mensual;
- una revisión final antes de enviar los detalles exactos;
- propuestas de planes que requieren aceptación unánime; y
- detalles inmutables después de enviar una propuesta.

## Límites del prototipo

Esta versión usa datos de ejemplo y estado temporal en memoria. Todavía **no**
incluye inicio de sesión con Google, persistencia duradera, integraciones con
calendarios ni publicación en internet.

## Desarrollo

Requiere Node.js `>=22.13.0`.

```bash
npm install
npm run dev
npm run lint
npm test
```

`npm test` compila la aplicación con Vinext y verifica la experiencia renderizada
de Somewhen junto con las reglas de consentimiento de las propuestas.

## Estructura del proyecto

- `app/page.tsx` contiene el prototipo interactivo de una sola página.
- `app/globals.css` contiene el sistema visual adaptable.
- `.openai/hosting.json` mantiene D1 y R2 desactivados hasta diseñar la persistencia.
- `tests/rendered-html.test.mjs` cubre el producto renderizado y las reglas de consentimiento.
