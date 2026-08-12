# Progetto Audio Processing and Mastering

## Avvio dell'applicazione

### Prerequisiti
- Browser moderno (Chrome, Firefox, Opera, Safari)
- VS Code + Live Server oppure Python 3

### Metodo 1 — VS Code + Live Server (consigliato)

1. Aprire il progetto con VS Code.
2. Installare l'estensione Live Server.
3. Aprire il file `index.html`.
4. Cliccare su "Go Live" nella barra inferiore di VS Code.
5. Il browser predefinito verrà aperto automaticamente all'indirizzo: http://localhost:5500

Se la porta 5500 è già utilizzata, è possibile modificarla dalle impostazioni dell'estensione Live Server.

### Metodo 2 — Python HTTP Server

È possibile utilizzare il server HTTP integrato in Python, senza installare software aggiuntivo (ovviamente serve avere python installato nel sistema).

Aprire un terminale nella directory principale del progetto ed eseguire:

    python3 -m http.server 8000

Successivamente aprire il browser e visitare:

    http://localhost:8000

È possibile sostituire `8000` con una porta diversa se necessario.

