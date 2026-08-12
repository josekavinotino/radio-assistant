# Radio Assistant

## Objetivo del proyecto

Desarrollar una aplicación web para asistir a un concurso de radio en el que se realizan 10 preguntas en aproximadamente 1 minuto. La herramienta debe ayudar al usuario a:

- escuchar el audio del concurso mediante el micrófono del dispositivo;
- transcribir las preguntas en español en tiempo real;
- detectar el inicio y el fin de cada pregunta;
- buscar información relevante en Internet de forma rápida;
- mostrar una respuesta breve y clara por escrito;
- procesar transcripción, búsqueda y generación de respuesta de forma paralela siempre que sea posible;
- priorizar la precisión frente a la velocidad cuando exista conflicto entre ambas.

## Reglas funcionales del concurso

La aplicación debe respetar dos reglas fundamentales:

1. Si el usuario responde una pregunta, esa pregunta queda cerrada definitivamente, aunque la respuesta sea correcta o incorrecta.
2. Si el usuario dice "PASO", la pregunta queda pendiente para la segunda vuelta.

Además:

- La interfaz debe incluir 10 filas, una por pregunta.
- Cada fila debe poder marcarse manualmente como "PASO" mediante un botón.
- Cuando una fila se marca como "PASO", debe cambiar visualmente de estado y quedar claramente diferenciada de las preguntas ya respondidas.
- Las preguntas marcadas como "PASO" deben recuperarse en la segunda vuelta.
- La aplicación no debe decidir por sí sola si el usuario ha dicho "PASO": esa acción debe ser marcada manualmente por el usuario.

## Arquitectura prevista

### Frontend
- Next.js
- React
- TypeScript
- Tailwind CSS

### Transcripción
- Se prevé probar Deepgram Nova-3 mediante streaming.

### Búsqueda e IA
- Todavía no está decidido de forma definitiva.
- Son candidatos Perplexity Sonar y Tavily junto con un modelo de lenguaje.

### Base de conocimiento de programas anteriores
- Pendiente de diseñar.
- Se contempla usar Supabase/PostgreSQL con pgvector como opción técnica.

### Hosting
- Se prevé Vercel como plataforma de despliegue.

## Estado actual del proyecto

El proyecto ya existe y funciona de forma local en:

- http://localhost:3000

La interfaz inicial ya incluye:

- título "Radio Assistant";
- estado de escucha / detenido;
- botón para iniciar o detener la escucha;
- 10 filas de preguntas;
- botón "PASO" en cada fila.

También se ha implementado el acceso al micrófono mediante:

- navigator.mediaDevices.getUserMedia({ audio: true })

Y la interfaz muestra "MICRÓFONO ACTIVO" cuando el navegador concede permiso.

## Decisiones tomadas

- Se ha optado por una base de frontend en Next.js con App Router y TypeScript.
- Se ha elegido Tailwind CSS para la maquetación visual.
- Se ha priorizado una interfaz simple y funcional para la fase inicial.
- Se ha empezado a trabajar con acceso al micrófono del navegador como punto de partida para la escucha en tiempo real.
- Se ha definido una estructura visual con 10 preguntas y un control manual de "PASO".

## Funcionalidades pendientes

Aún no están implementadas las siguientes capacidades:

- transcripción en tiempo real del audio en español;
- detección automática de inicio y fin de cada pregunta;
- búsqueda automática de respuestas en Internet;
- generación de respuestas breves y claras;
- procesamiento paralelo de transcripción, búsqueda y generación;
- gestión completa del flujo de preguntas respondidas y marcadas como "PASO";
- segunda vuelta de preguntas pendientes;
- integración con fuentes externas de búsqueda y modelo de IA.

## Cuestiones técnicas todavía por investigar

Quedan abiertos varios puntos técnicos y de producto:

- cómo capturar y procesar el audio de forma continua desde el navegador;
- cómo segmentar correctamente la transcripción en preguntas individuales;
- cómo detectar con fiabilidad el comienzo y el final de cada pregunta;
- qué proveedor de búsqueda/IA proporcionará mejor calidad y rendimiento;
- cómo estructurar la arquitectura de procesamiento para mantener precisión por encima de velocidad;
- cómo implementar la fuente especial de programas anteriores;
- cómo automatizar la descarga de programas históricos de emisoras como Kiss FM;
- cómo extraer audio, transcribirlo y conservar metadatos como fecha, programa, hora y timestamps;
- cómo indexar y buscar dentro de esas transcripciones para responder preguntas de contenido archivado.

## Fuente especial del programa

Existe un segundo tipo de pregunta que puede hacer referencia a contenidos de programas anteriores de la propia emisora. Se prevé construir más adelante un sistema que:

- descargue automáticamente programas anteriores;
- obtenga el audio;
- lo transcriba;
- conserve fecha, programa, hora y timestamps;
- permita buscar dentro de esas transcripciones;
- utilice esa información para responder preguntas relacionadas con programas anteriores.

Como fuentes de ejemplo se están investigando:

- https://www.kissfm.es/programas-completos-lmk/
- https://www.kissfm.es/2026/07/17/17-07-2026/

En esas páginas los programas aparecen divididos por tramos horarios y enlazados a Omny.fm, aunque todavía no se ha determinado cómo automatizar la descarga de esos audios.
