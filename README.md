# 📚 English Learning Journal CLI

¡Bienvenido a tu **English Learning Journal CLI**! Esta es una aplicación de línea de comandos diseñada para ayudarte a mejorar tu inglés de una manera interactiva y efectiva. Combina varias herramientas de aprendizaje en una sola interfaz.

## ✨ Características

Esta aplicación te ofrece las siguientes funcionalidades:

-   **🧠 Sistema de Repetición Espaciada (SRS) para Vocabulario:** Repasa palabras de tu vocabulario personal en intervalos óptimos para una memorización a largo plazo. La aplicación te avisará cuando tengas palabras pendientes de repaso.
-   **📝 Análisis de Texto:** Pega cualquier texto (noticias, artículos, etc.) y la aplicación resaltará las palabras que no son comunes, ayudándote a identificar y aprender nuevo vocabulario. Puedes guardar estas palabras en tu vocabulario personal.
-   **🎵 Aprende con Música (Modo Interactivo):** Busca canciones por artista y título en Genius, obtén las letras y juega a "Completa la Letra" línea por línea. Recibe retroalimentación instantánea y guarda las palabras que te cuesten en tu vocabulario.
-   **🎧 Diario de Escucha (Podcasts/Audios):** Registra los podcasts o audios que escuchas, incluyendo el nombre, episodio y una descripción de lo que entendiste. Incluye un corrector ortográfico y gramatical avanzado para mejorar tu escritura.
-   **📖 Gestión de Vocabulario:** Visualiza tu vocabulario personal. Al seleccionar una palabra, la aplicación buscará y mostrará su pronunciación, definición y ejemplos de uso (requiere conexión a internet).
-   **✅ Corrector Gramatical Avanzado:** Al añadir entradas al diario, la aplicación revisará tu texto en busca de errores gramaticales y de estilo, ofreciéndote sugerencias para mejorar tu escritura.

## 🚀 Instalación

Para poner en marcha la aplicación, sigue estos sencillos pasos:

1.  **Clona o descarga el repositorio:**
    ```bash
    git clone <URL_DEL_REPOSITORIO> # Si tienes un repositorio
    # O descarga el ZIP y descomprímelo
    ```

2.  **Navega al directorio del proyecto:**
    ```bash
    cd journal
    ```

3.  **Instala las dependencias:**
    ```bash
    npm install
    ```

4.  **Configura la API de Genius (Opcional, pero recomendado para la música):**
    -   Visita la [página de gestión de clientes de la API de Genius](https://genius.com/api-clients) y crea un nuevo cliente API.
    -   Una vez creado, genera un **Client Access Token**.
    -   Crea un archivo llamado `.env` en la raíz del directorio `journal` (al mismo nivel que `package.json`).
    -   Añade la siguiente línea a tu archivo `.env`, reemplazando `<TU_GENIUS_API_TOKEN>` con tu token real:
        ```
        GENIUS_API_TOKEN=<TU_GENIUS_API_TOKEN>
        ```
    -   **¡Importante!** Este archivo `.env` ya está incluido en `.gitignore` para que tu token no se suba accidentalmente a repositorios públicos.

## 🎮 Uso

Una vez instalado, puedes iniciar la aplicación con:

```bash
npm start
```

La aplicación te presentará un menú principal donde podrás elegir la funcionalidad que deseas utilizar.

## 🛠️ Tecnologías Utilizadas

-   **Node.js**
-   **npm** (Node Package Manager)
-   **inquirer**: Para interfaces de línea de comandos interactivas.
-   **chalk**: Para dar color y estilo a la salida de la consola.
-   **axios**: Para realizar peticiones HTTP a APIs externas (Genius, Diccionario).
-   **cheerio**: Para el web scraping de letras de Genius.
-   **dotenv**: Para cargar variables de entorno de forma segura.
-   **spellchecker**: Para la corrección ortográfica básica.
-   **languagetool-api**: Para la corrección gramatical y de estilo avanzada.

## 💡 Próximas Mejoras (Ideas)

-   **Acceso Offline a Definiciones:** Almacenar en caché las definiciones de las palabras consultadas para acceso sin conexión.
-   **Guía de Pronunciación:** Integrar una función de texto a voz para escuchar la pronunciación de palabras individuales.
-   **Estadísticas Detalladas:** Mostrar un seguimiento más completo de tu progreso de aprendizaje.
-   **Modo "Focus" para Análisis de Texto:** Interacción más fluida para obtener definiciones de palabras resaltadas.

¡Esperamos que disfrutes usando esta herramienta para potenciar tu aprendizaje de inglés!