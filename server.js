const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

// Importação dinâmica (necessária porque o music-metadata mais recente usa ESM)
let parseFile;
(async () => {
    const mm = await import('music-metadata');
    parseFile = mm.parseFile;
})();

const app = express();
const PORT = 3000;

// Pastas do servidor
const MUSIC_DIR = path.join(__dirname, 'music');
const PUBLIC_DIR = path.join(__dirname, 'public');
const COVERS_DIR = path.join(PUBLIC_DIR, 'covers'); // Pasta para gravar as capas

// Criar a pasta 'music' se ela não existir
if (!fs.existsSync(MUSIC_DIR)) {
    fs.mkdirSync(MUSIC_DIR);
    console.log("Pasta 'music' criada. Coloque as suas músicas lá dentro!");
}

// Criar a pasta 'covers' dentro de public se não existir
if (!fs.existsSync(COVERS_DIR)) {
    fs.mkdirSync(COVERS_DIR, { recursive: true });
}

app.use(cors());

// Servir a interface e capas
app.use(express.static(PUBLIC_DIR));

// Servir os ficheiros de áudio
app.use('/music', express.static(MUSIC_DIR));

// API que lê as músicas e extrai os metadados REAIS (Artista, Título e Capa)
app.get('/api/tracks', async (req, res) => {
    // Verifica se a biblioteca de metadados já carregou
    if (!parseFile) {
        return res.status(503).json({ error: 'Servidor a inicializar, tente de novo em 1 segundo.' });
    }

    fs.readdir(MUSIC_DIR, async (err, files) => {
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

        const tracks = [];

        // Loop asincrono para ler metadados de CADA música
        for (let index = 0; index < audioFiles.length; index++) {
            const file = audioFiles[index];
            const filePath = path.join(MUSIC_DIR, file);
            const fileStat = fs.statSync(filePath);
            
            // Dados por defeito (caso a música não tenha tags)
            let title = file.replace(/\.[^/.]+$/, "");
            let artist = "Desconhecido";
            let genre = "Desconhecido";
            let coverUrl = null;
            let lyrics = "";

            try {
                // Tenta extrair os metadados reais do ficheiro
                const metadata = await parseFile(filePath);
                
                if (metadata.common.title) title = metadata.common.title;
                if (metadata.common.artist) artist = metadata.common.artist;
                if (metadata.common.genre && metadata.common.genre.length > 0) genre = metadata.common.genre[0];

                // Extração da Letra (USLT)
                if (metadata.common.lyrics && metadata.common.lyrics.length > 0) {
                     lyrics = metadata.common.lyrics[0];
                }

                // Extração da Capa (Cover Art)
                if (metadata.common.picture && metadata.common.picture.length > 0) {
                    const picture = metadata.common.picture[0];
                    const extension = picture.format.split('/')[1] || 'jpg';
                    // Criar um nome único para a capa baseado no nome do ficheiro de áudio
                    const coverFileName = `${encodeURIComponent(title.replace(/[^a-zA-Z0-9]/g, ''))}_cover.${extension}`;
                    const coverPath = path.join(COVERS_DIR, coverFileName);
                    
                    // Só grava a imagem se ela ainda não existir (poupa tempo nos próximos loadings)
                    if (!fs.existsSync(coverPath)) {
                        fs.writeFileSync(coverPath, picture.data);
                    }
                    
                    // O link que o frontend vai usar para mostrar a imagem
                    coverUrl = `/covers/${coverFileName}`;
                }

            } catch (metaErr) {
                console.warn(`Aviso: Não foi possível ler as tags de ${file}. Usando o nome do ficheiro.`);
            }

            tracks.push({
                id: `server_${index}_${fileStat.size}`, 
                title: title,
                artist: artist,
                genre: genre,
                src: `/music/${encodeURIComponent(file)}`,
                cover: coverUrl, 
                lyrics: lyrics,
                isLocal: false, 
                needsMetadata: false, // Como o backend já tratou disso, o frontend já não precisa tentar
                addedAt: fileStat.birthtimeMs 
            });
        }

        res.json(tracks);
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`===========================================`);
    console.log(`🎧 Emera Server a correr!`);
    console.log(`🌐 Aceda em: http://localhost:${PORT}`);
    console.log(`🎵 Lendo metadados e capas automaticamente!`);
    console.log(`📁 Coloque os seus MP3s na pasta: ${MUSIC_DIR}`);
    console.log(`===========================================`);
});
