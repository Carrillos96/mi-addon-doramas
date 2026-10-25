const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 7000;
const DOMAIN = 'https://doramasyt.com';

const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'es-ES,es;q=0.8,en-US;q=0.5,en;q=0.3'
};

const manifest = {
    id: 'org.doramasyt.addon',
    version: '1.2.0',
    name: 'DoramasYT Completo',
    description: 'Buscador y reproductor integrado de DoramasYT.',
    resources: ['catalog', 'meta', 'stream'],
    types: ['series', 'movie'],
    idPrefixes: ['dyt_'],
    catalogs: [
        {
            type: 'series',
            id: 'doramas_recientes',
            name: 'Doramas Recientes',
            extra: [{ name: 'search', required: false }]
        }
    ]
};

app.get('/manifest.json', (req, res) => res.json(manifest));

// 1. CONTROLADOR DEL CATÁLOGO + BUSCADOR
app.get('/catalog/:type/:id/:extra?.json', async (req, res) => {
    const { id, extra } = req.params;
    let searchQueries = '';

    if (extra) {
        const params = new URLSearchParams(extra);
        searchQueries = params.get('search');
    }

    try {
        let targetUrl = DOMAIN;
        if (searchQueries) {
            targetUrl = `${DOMAIN}/buscar?q=${encodeURIComponent(searchQueries)}`;
        }

        const response = await axios.get(targetUrl, { headers, timeout: 8000 });
        const $ = cheerio.load(response.data);
        const metas = [];

        $('h3').each((i, el) => {
            const title = $(el).text().trim();
            let linkTag = $(el).prev('a').attr('href') || $(el).find('a').attr('href') || $(el).closest('a').attr('href');
            
            if (!linkTag) {
                linkTag = $(el).parent().find('a').attr('href');
            }
            
            if (linkTag && (linkTag.includes('/ver/') || linkTag.includes('/dorama/'))) {
                const cleanSlug = linkTag.replace('/ver/', '').replace('/dorama/', '');
                metas.push({
                    id: `dyt_${cleanSlug}`,
                    type: 'series',
                    name: title,
                    poster: 'https://placeholders.dev',
                    description: `Contenido disponible en DoramasYT`
                });
            }
        });

        const uniqueMetas = Array.from(new Map(metas.map(item => [item.id, item])).values());
        res.json({ metas: uniqueMetas });

    } catch (error) {
        res.json({ metas: [] });
    }
});

// 2. CONTROLADOR DE METADATOS (Episodios)
app.get('/meta/:type/:id.json', async (req, res) => {
    const { id } = req.params;
    const cleanSlug = id.replace('dyt_', '');

    try {
        const videos = [];
        // Generamos un listado estándar de capítulos para que Stremio los muestre en el menú lateral
        for (let i = 1; i <= 30; i++) {
            videos.push({
                id: `${id}:${i}`,
                season: 1,
                episode: i,
                title: `Capítulo ${i}`
            });
        }

        res.json({
            meta: {
                id: id,
                type: 'series',
                name: cleanSlug.replace(/-/g, ' ').toUpperCase(),
                genres: ['K-Drama', 'Romance'],
                videos: videos
            }
        });
    } catch (e) {
        res.json({ meta: {} });
    }
});

// 3. EXTRACTOR DE ENLACES DE VIDEO MEJORADO
app.get('/stream/:type/:id.json', async (req, res) => {
    const { id } = req.params; 
    
    const parts = id.replace('dyt_', '').split(':');
    const slug = parts[0];
    const episodeNum = parts[1] || '1';

    // Formateamos la URL real del capítulo en DoramasYT
    // Si el slug ya contiene la palabra "capitulo", evitamos duplicarla
    let targetUrl = `${DOMAIN}/ver/${slug}-capitulo-${episodeNum}`;
    if (slug.includes('capitulo')) {
        targetUrl = `${DOMAIN}/ver/${slug}`;
    }

    try {
        const response = await axios.get(targetUrl, { headers, timeout: 8000 });
        const $ = cheerio.load(response.data);
        const streams = [];

        // Buscador de reproductores tradicionales en el HTML
        $('iframe').each((i, el) => {
            let src = $(el).attr('src');
            if (src) {
                if (src.startsWith('//')) src = 'https:' + src;
                
                let serverName = "Reproductor Integrado";
                if (src.includes('ok.ru')) serverName = "OkRu HD";
                if (src.includes('fembed') || src.includes('feurl')) serverName = "Fembed";
                if (src.includes('mega.nz')) serverName = "Mega";

                streams.push({
                    title: `DoramasYT - ${serverName}`,
                    externalUrl: src
                });
            }
        });

        // RECURSO DE EMERGENCIA INALTRABLE:
        // Si el sitio web esconde los iframes dinámicamente, le enviamos a Stremio un enlace directo forzado.
        // Stremio creará un botón azul que abrirá el reproductor web optimizado sin anuncios molestos.
        streams.push({
            name: "DoramasYT",
            title: `Reproducir Capítulo ${episodeNum} en la Web`,
            externalUrl: targetUrl
        });

        res.json({ streams });
    } catch (error) {
        // En caso de caída de conexión, enviamos la opción de contingencia externa
        res.json({ 
            streams: [{
                name: "DoramasYT Enlace Alternativo",
                title: `Abrir reproductor oficial externo`,
                externalUrl: `${DOMAIN}/ver/${slug}-capitulo-${episodeNum}`
            }] 
        });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor activo`);
});
