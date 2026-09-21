const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const mm = require('music-metadata'); // Essencial para ler as capas e artistas

const app = express();
const PORT = 3000;

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

// Servir os ficheiros de áudio diretamente
app.use('/music', express.static(MUSIC_DIR));

let trackCache = [];
let isCacheReady = false;

// 1. Constrói uma cache básica INSTANTÂNEA para o servidor arrancar logo
function buildBasicCache() {
    try {
        const files = fs.readdirSync(MUSIC_DIR);
        // Filtra os arquivos de áudio
        const audioFiles = files.filter(f => /\.(mp3|wav|ogg|m4a)$/i.test(f));
        
        trackCache = audioFiles.map((file, i) => ({
            id: `server_${i}`,
            title: file.replace(/\.[^/.]+$/, ""), // Usa o nome do arquivo provisoriamente
            artist: "A processar metadados...", // Mostra ao utilizador que está a ler
            genre: "Desconhecido",
            srcPath: `/music/${encodeURIComponent(file)}`,
            coverPath: null,
            lyrics: "",
            isLocal: false,
            needsMetadata: false,
            addedAt: fs.statSync(path.join(MUSIC_DIR, file)).birthtimeMs
        }));
        console.log(`Cache básico criado. ${audioFiles.length} músicas encontradas.`);
    } catch (e) {
        console.error("Erro ao ler diretoria de músicas:", e);
    }
}

// 2. Processa os metadados LENTAMENTE em segundo plano (Proteção de CPU/RAM para o Render)
async function buildMetadataCache() {
    console.log("Iniciando o processamento avançado de metadados (capas e artistas)...");
    
    try {
        const files = fs.readdirSync(MUSIC_DIR);
        const audioFiles = files.filter(f => /\.(mp3|wav|ogg|m4a)$/i.test(f));

        for (let i = 0; i < audioFiles.length; i++) {
            const file = audioFiles[i];
            const filePath = path.join(MUSIC_DIR, file);
            
            try {
                // TRUQUE DE MESTRE: Pausa de 50ms entre cada música para o Event Loop do Node.js respirar.
                // Isto impede que o Render aborte o servidor por falta de resposta (timeout).
                await new Promise(r => setTimeout(r, 50)); 
                
                const metadata = await mm.parseFile(filePath);
                
                const title = metadata.common.title || file.replace(/\.[^/.]+$/, "");
                const artist = metadata.common.artist || "Desconhecido";
                const genre = (metadata.common.genre && metadata.common.genre.length > 0) ? metadata.common.genre[0] : "Desconhecido";
                const lyrics = (metadata.common.lyrics && metadata.common.lyrics.length > 0) ? metadata.common.lyrics[0] : "";
                
                // Verificar se a música tem capa (sem guardar a imagem gigante na memória RAM)
                const hasCover = metadata.common.picture && metadata.common.picture.length > 0;

                // Atualizar o cache com os dados reais
                trackCache[i] = {
                    ...trackCache[i],
                    title: title,
                    artist: artist,
                    genre: genre,
                    coverPath: hasCover ? `/api/cover/${encodeURIComponent(file)}` : null,
                    lyrics: lyrics
                };
            } catch (err) {
                // Se falhar a leitura de uma música (arquivo corrompido), muda o status
                if (trackCache[i]) {
                    trackCache[i].artist = "Desconhecido"; 
                }
            }
        }
        
        isCacheReady = true;
        console.log("✅ Todos os metadados foram lidos e armazenados na cache com sucesso!");
    } catch (err) {
        console.error("Erro ao construir cache de metadados:", err);
    }
}

// Executa o cache básico de forma síncrona, e o avançado em modo Assíncrono (sem await)
buildBasicCache();
buildMetadataCache(); 

// API principal para o frontend obter a lista de músicas
app.get('/api/tracks', (req, res) => {
    // Constrói o URL base corretamente baseado no servidor atual
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.get('host');
    const baseUrl = `${protocol}://${host}`;
    
    // Anexa a base URL aos caminhos relativos
    const responseData = trackCache.map(track => {
        return {
            ...track,
            src: `${baseUrl}${track.srcPath}`,
            cover: track.coverPath ? `${baseUrl}${track.coverPath}` : null
        };
    });

    res.json(responseData);
});

// Rota para extrair e servir a imagem da capa de uma música específica a pedido
app.get('/api/cover/:filename', async (req, res) => {
    const filePath = path.join(MUSIC_DIR, req.params.filename);
    
    if (!fs.existsSync(filePath)) {
        return res.status(404).end();
    }
    
    try {
        const metadata = await mm.parseFile(fi

                                        
