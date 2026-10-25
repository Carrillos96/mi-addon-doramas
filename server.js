const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 7000;
const DOMAIN = 'https://www.doramasyt.com';

const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};

const manifest = {
    id: 'org.doramasyt.addon',
    version: '1.1.0',
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
            extra: [{ name: 'search', required: false }] // ESTO ACTIVA LA BÚSQUEDA EN STREMIO
        }
    ]
};

app.get('/manifest.json', (req, res) => res.json(manifest));

// 1. CONTROLADOR DEL CATÁLOGO + BUSCADOR INTEGRADO
app.get('/catalog/:type/:id/:extra?.json', async (req, res) => {
    const { id, extra } = req.params;
    let searchQueries = '';

    // Detectar si el usuario usó la barra de búsqueda
    if (extra) {
        const params = new URLSearchParams(extra);
        searchQueries = params.get('search');
    }

    try {
        let targetUrl = DOMAIN;
        // Si hay una búsqueda, usamos la URL de búsqueda de la web
        if (searchQueries) {
            targetUrl = `${DOMAIN}/buscar?q=${encodeURIComponent(searchQueries)}`;
        }

        const response = await axios.get(targetUrl, { headers });
        const $ = cheerio.load(response.data);
        const metas = [];

        // Scraper dinámico que lee tanto la portada como los resultados de búsqueda
        $('h3').each((i, el) => {
            const title = $(el).text().trim();
            const linkTag = $(el).prev('a').attr('href') || $(el).find('a').attr('href') || $(el).closest('a').attr('href');
            
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

        // Filtrar duplicados
        const uniqueMetas = Array.from(new Map(metas.map(item => [item.id, item])).values());
        res.json({ metas: uniqueMetas });

    } catch (error) {
        res.json({ metas: [] });
    }
});

// 2. CONTROLADOR DE METADATOS (Temporadas y Episodios)
app.get('/meta/:type/:id.json', async (req, res) => {
    const { id } = req.params;
    const cleanSlug = id.replace('dyt_', '');

    try {
        // Simulamos un listado dinámico de episodios basados en el slug.
        // En una actualización futura se puede scrapear la página interna del dorama para listar del 1 al final.
        const videos = [];
        for (let i = 1; i <= 24; i++) {
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

// 3. EXTRACTOR DE ENLACES DE VIDEO (Los streams que lee el reproductor)
app.get('/stream/:type/:id.json', async (req, res) => {
    const { id } = req.params; 
    
    // Convertimos el ID de Stremio (ej: dyt_nombre-dorama:1) en la URL real del capítulo
    const parts = id.replace('dyt_', '').split(':');
    const slug = parts[0];
    const episodeNum = parts[1] || '1';

    // Intentamos estructurar la URL estándar de reproducción del sitio
    const targetUrl = `${DOMAIN}/ver/${slug}-capitulo-${episodeNum}`;

    try {
        const response = await axios.get(targetUrl, { headers });
        const $ = cheerio.load(response.data);
        const streams = [];

        // Buscador de reproductores incrustados en el HTML (Servidores de video externos)
        $('iframe').each((i, el) => {
            let src = $(el).attr('src');
            if (src) {
                if (src.startsWith('//')) src = 'https:' + src;
                
                // Clasificamos el nombre del servidor para que el usuario sepa cuál elegir
                let serverName = "Servidor Alternativo";
                if (src.includes('ok.ru')) serverName = "OkRu (Directo)";
                if (src.includes('fembed') || src.includes('feurl')) serverName = "Fembed HD";
                if (src.includes('mega.nz')) serverName = "Mega Cloud";

                streams.push({
                    title: `DoramasYT - ${serverName}`,
                    externalUrl: src // Pasa la URL del reproductor directo a Stremio
                });
            }
        });

        // Opción de respaldo si no detecta los iframes directamente debido a scripts de protección
        if (streams.length === 0) {
            streams.push({
                title: 'Ver el capítulo en el navegador (DoramasYT)',
                externalUrl: targetUrl
            });
        }

        res.json({ streams });
    } catch (error) {
        res.json({ streams: [] });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});
