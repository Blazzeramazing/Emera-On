const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3000;

// Pastas do servidor
const MUSIC_DIR = path.join(__dirname, 'music');
const PUBLIC_DIR = path.join(__dirname, 'public');

// Criar a pasta 'music' se ela não existir
if (!fs.existsSync(MUSIC_DIR)) {
    fs.mkdirSync(MUSIC_DIR);
    console.log("Pasta 'music' criada. Coloque as suas músicas lá dentro!");
}

app.use(cors());

// Servir a interface (o seu HTML ficará na pasta public)
app.use(express.static(PUBLIC_DIR));

// Servir os ficheiros de áudio
app.use('/music', express.static(MUSIC_DIR));

// API que lista as músicas para o seu HTML ler
app.get('/api/tracks', (req, res) => {
    fs.readdir(MUSIC_DIR, (err, files) => {
        if (err) {
            console.error("Erro ao ler a pasta de música:", err);
            return res.status(500).json({ error: 'Erro no servidor' });
        }

        // Filtrar apenas ficheiros de áudio suportados
        const audioFiles = files.filter(f => 
            f.toLowerCase().endsWith('.mp3') || 
            f.toLowerCase().endsWith('.wav') || 
            f.toLowerCase().endsWith('.ogg') ||
            f.toLowerCase().endsWith('.m4a')
        );

        // Mapear ficheiros para o formato que o Emera Player espera
        const tracks = audioFiles.map((file, index) => {
            // Usa o nome do ficheiro como título base
            const title = file.replace(/\.[^/.]+$/, ""); 

            return {
                id: `server_${index}`, // ID único baseado no servidor
                title: title,
                artist: "Servidor", // Pode separar "Artista - Titulo" via código no futuro
                genre: "Desconhecido",
                src: `/music/${encodeURIComponent(file)}`, // URL de acesso
                cover: null,
                lyrics: "",
                isLocal: false, // isLocal false evita que grave na IndexedDB do navegador e poupe cache
                needsMetadata: false, // Evita que o client tente extrair ID3 via rede (muito pesado para 2000 musicas)
                addedAt: fs.statSync(path.join(MUSIC_DIR, file)).birthtimeMs // Ordena por data de criação do ficheiro
            };
        });

        res.json(tracks);
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`===========================================`);
    console.log(`🎧 Emera Server a correr!`);
    console.log(`🌐 Aceda em: http://localhost:${PORT}`);
    console.log(`📁 Coloque os seus MP3s na pasta: ${MUSIC_DIR}`);
    console.log(`===========================================`);
});
