const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 7000;
const DOMAIN = 'https://doramasyt.com';

// 1. Manifiesto Obligatorio para Stremio y Kino TV
const manifest = {
    id: 'org.doramasyt.addon',
    version: '1.0.0',
    name: 'DoramasYT Addon',
    description: 'Ver Doramas online gratis en HD con subtítulos en español.',
    resources: ['catalog', 'meta', 'stream'],
    types: ['series', 'movie'],
    idPrefixes: ['dyt_'],
    catalogs: [
        {
            type: 'series',
            id: 'doramas_recientes',
            name: 'Doramas Recientes'
        }
    ]
};

app.get('/manifest.json', (req, res) => {
    res.json(manifest);
});

// 2. Endpoint del Catálogo (Muestra los últimos doramas de la web)
app.get('/catalog/:type/:id.json', async (req, res) => {
    const { type, id } = req.params;
    
    if (id !== 'doramas_recientes') return res.json({ metas: [] });

    try {
        const response = await axios.get(DOMAIN, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const $ = cheerio.load(response.data);
        const metas = [];

        // Extraemos las series recientes según el HTML de DoramasYT
        $('h3').each((i, el) => {
            const title = $(el).text().trim();
            const linkTag = $(el).prev('a').attr('href') || $(el).find('a').attr('href');
            
            if (linkTag && linkTag.includes('capitulo')) {
                // Generamos un ID único simulado basado en la URL limpia
                const cleanId = linkTag.replace('/ver/', '').split('-capitulo')[0];
                
                metas.push({
                    id: `dyt_${cleanId}`,
                    type: 'series',
                    name: title,
                    poster: 'https://placeholder.com', // URL del poster si está disponible en el HTML
                    description: 'Capítulo reciente en DoramasYT'
                });
            }
        });

        // Eliminar duplicados de series por ID
        const uniqueMetas = Array.from(new Map(metas.map(item => [item.id, item])).values());
        res.json({ metas: uniqueMetas });

    } catch (error) {
        console.error(error);
        res.json({ metas: [] });
    }
});

// 3. Endpoint de Meta (Detalles del dorama y lista de capítulos)
app.get('/meta/:type/:id.json', async (req, res) => {
    const { id } = req.params;
    const cleanSlug = id.replace('dyt_', '');

    // Simulación de la estructura de temporadas/episodios para el reproductor
    res.json({
        meta: {
            id: id,
            type: 'series',
            name: cleanSlug.replace(/-/g, ' '),
            genres: ['Romance', 'Drama'],
            videos: [
                {
                    id: `${id}:1`,
                    season: 1,
                    episode: 1,
                    title: "Capítulo 1",
                    released: new Date().toISOString()
                }
            ]
        }
    });
});

// 4. Endpoint de Streams (Los enlaces directos de video)
app.get('/stream/:type/:id.json', async (req, res) => {
    const { id } = req.params; // Ejemplo: dyt_nombre-dorama:1
    const cleanSlug = id.split(':')[0].replace('dyt_', '');
    const episodeNum = id.split(':')[1] || '1';

    // Generamos la URL real del capítulo en DoramasYT
    const targetUrl = `${DOMAIN}/ver/${cleanSlug}-capitulo-${episodeNum}`;

    try {
        const response = await axios.get(targetUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const $ = cheerio.load(response.data);
        
        const streams = [];

        // BUSCAR REPRODUCTORES INTEGRADOS (IFRAMES)
        // Buscamos las etiquetas iframe de servidores como Fembed, Mega, Okru, etc.
        $('iframe').each((i, el) => {
            let src = $(el).attr('src');
            if (src) {
                if (src.startsWith('//')) src = 'https:' + src;
                streams.push({
                    title: `Servidor Alternativo ${i + 1}`,
                    externalUrl: src // Abre el video externamente o a través de la interfaz del addon
                });
            }
        });

        // En caso de que no haya streams directos extraídos por falta de un desincrustador avanzado (URL Resolver):
        if (streams.length === 0) {
            streams.push({
                title: 'Ver directamente en DoramasYT',
                externalUrl: targetUrl
            });
        }

        res.json({ streams });
    } catch (error) {
        res.json({ streams: [] });
    }
});

app.listen(PORT, () => {
    console.log(`Plugin activo en: http://localhost:${PORT}/manifest.json`);
});
