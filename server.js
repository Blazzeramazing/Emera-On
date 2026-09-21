```javascript:server.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const mm = require('music-metadata'); // Nova biblioteca para ler metadados

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

// Servir a interface (se aplicável)
app.use(express.static(PUBLIC_DIR));

// Servir os ficheiros de áudio
app.use('/music', express.static(MUSIC_DIR));

// Cache global para não processar 200 músicas a cada pedido
let trackCache = [];
let isCacheReady = false;

// Função para construir a cache de metadados
async function buildMetadataCache() {
    console.log("A processar metadados das músicas. Aguarde...");
    try {
        const files = fs.readdirSync(MUSIC_DIR);
        
        // Filtrar apenas ficheiros de áudio suportados
        const audioFiles = files.filter(f => 
            f.toLowerCase().endsWith('.mp3') || 
            f.toLowerCase().endsWith('.wav') || 
            f.toLowerCase().endsWith('.ogg') ||
            f.toLowerCase().endsWith('.m4a')
        );

        let tempCache = [];
        for (let i = 0; i < audioFiles.length; i++) {
            const file = audioFiles[i];
            const filePath = path.join(MUSIC_DIR, file);
            
            try {
                // Ler os metadados do ficheiro (ID3, MP4 tags, etc.)
                const metadata = await mm.parseFile(filePath);
                
                const title = metadata.common.title || file.replace(/\.[^/.]+$/, "");
                const artist = metadata.common.artist || "Desconhecido";
                
                let genre = "Desconhecido";
                if (metadata.common.genre && metadata.common.genre.length > 0) {
                    genre = metadata.common.genre[0];
                }
                
                let lyrics = "";
                if (metadata.common.lyrics && metadata.common.lyrics.length > 0) {
                    lyrics = metadata.common.lyrics[0];
                }
                
                // Verificar se a música tem capa (sem guardar a imagem pesada na memória RAM)
                const hasCover = metadata.common.picture && metadata.common.picture.length > 0;

                tempCache.push({
                    id: `server_${i}`,
                    title: title,
                    artist: artist,
                    genre: genre,
                    srcPath: `/music/${encodeURIComponent(file)}`, // Caminho interno
                    coverPath: hasCover ? `/api/cover/${encodeURIComponent(file)}` : null, // Caminho interno
                    lyrics: lyrics,
                    isLocal: false, 
                    needsMetadata: false, 
                    addedAt: fs.statSync(filePath).birthtimeMs 
                });
            } catch (err) {
                console.warn(`Aviso: Sem tags suportadas em ${file}`);
                // Fallback caso não seja possível ler (ficheiro corrompido ou formato não padronizado)
                tempCache.push({
                    id: `server_${i}`,
                    title: file.replace(/\.[^/.]+$/, ""),
                    artist: "Desconhecido",
                    genre: "Desconhecido",
                    srcPath: `/music/${encodeURIComponent(file)}`,
                    coverPath: null,
                    lyrics: "",
                    isLocal: false,
                    needsMetadata: false,
                    addedAt: fs.statSync(filePath).birthtimeMs
                });
            }
        }
        
        trackCache = tempCache;
        isCacheReady = true;
        console.log(`Metadados de ${trackCache.length} músicas carregados com sucesso!`);
    } catch (err) {
        console.error("Erro fatal ao construir cache:", err);
    }
}

// Iniciar a leitura imediatamente ao ligar o servidor
buildMetadataCache();

// API que lista as músicas para o seu HTML ler
app.get('/api/tracks', async (req, res) => {
    
    // Se a cache ainda estiver a carregar (cold start no Render), aguardamos para evitar erros no frontend
    while (!isCacheReady) {
        await new Promise(r => setTimeout(r, 500));
    }
    
    // Constrói o URL absoluto dinamicamente
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.get('host');
    const baseUrl = `${protocol}://${host}`;
    
    // Mapear ficheiros para incluir o link absoluto com metadados reais
    const responseData = trackCache.map(track => {
        return {
            ...track,
            src: `${baseUrl}${track.srcPath}`,
            cover: track.coverPath ? `${baseUrl}${track.coverPath}` : null
        };
    });

    res.json(responseData);
});

// NOVO ENDPOINT: Serve a imagem da capa da música apenas quando é solicitada
app.get('/api/cover/:filename', async (req, res) => {
    const filePath = path.join(MUSIC_DIR, req.params.filename);
    if (!fs.existsSync(filePath)) return res.status(404).end();
    
    try {
        const metadata = await mm.parseFile(filePath);
        if (metadata.common.picture && metadata.common.picture.length > 0) {
            const picture = metadata.common.picture[0];
            res.set('Content-Type', picture.format);
            res.send(picture.data);
        } else {
            res.status(404).end();
        }
    } catch (err) {
        res.status(404).end();
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`===========================================`);
    console.log(`🎧 Emera Server a correr!`);
    console.log(`🌐 Aceda em: http://localhost:${PORT}`);
    console.log(`📁 Coloque os seus MP3s na pasta: ${MUSIC_DIR}`);
    console.log(`===========================================`);
});
