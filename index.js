// server.js
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();

let productos;
// Middleware
app.use(cors());
app.use(express.json());

// Función para obtener todos los productos
async function getAllProducts(config) {

    const baseUrl = `https://api.mercadolibre.com/users/${config.userId}/items/search`;
    const headers = { 'Authorization': `Bearer ${config.accessToken}` };

    let scrollId = null;
    let allProductIDs = [];
    let seenProductIDs = new Set();

    while (true) {
        const url = scrollId
            ? `${baseUrl}?search_type=scan&status=${config.status}&limit=${config.limit}&scroll_id=${scrollId}`
            : `${baseUrl}?search_type=scan&status=${config.status}&limit=${config.limit}`;

        try {
            const response = await axios.get(url, { headers });
            const data = response.data;
            productos = `Obtenidos ${data.results.length} productos, scroll_id: ${data.scroll_id}`
            console.log(productos);
            if (!data.results || data.results.length === 0) break;

            const newIds = data.results.filter(id => !seenProductIDs.has(id));
            newIds.forEach(id => seenProductIDs.add(id));
            allProductIDs = allProductIDs.concat(newIds);

            scrollId = data.scroll_id;
            await sleep(400);
        } catch (error) {
            console.error('Error fetching products:', error);
            break;
        }
    }

    return allProductIDs;
}

// Función para obtener detalles de productos
async function getProductDetails(productIds, config) {
    console.log(`Obteniendo detalles de productos...`);
    const headers = { 'Authorization': `Bearer ${config.accessToken}` };
    const batchSize = 20;
    const allProducts = [];
    const categoryNames = {};

    for (let i = 0; i < productIds.length; i += batchSize) {
        const batch = productIds.slice(i, i + batchSize);
        const idsParam = batch.join(',');
        const itemsUrl = `https://api.mercadolibre.com/items?ids=${idsParam}`;

        try {
            const response = await axios.get(itemsUrl, { headers });
            const itemsData = response.data;

            for (const itemWrapper of itemsData) {
                const item = itemWrapper.body;

                console.log(`Procesando producto: ${item.id} - ${item.title}`);
                allProducts.push(item);

                // Obtener nombre de categoría si no lo tenemos
                if (!categoryNames[item.category_id]) {
                    try {
                        const catResponse = await axios.get(`https://api.mercadolibre.com/categories/${item.category_id}`, { headers });
                        categoryNames[item.category_id] = catResponse.data.name;
                    } catch {
                        categoryNames[item.category_id] = "Categoría Desconocida";
                    }
                }
            }

            await sleep(500);
        } catch (error) {
            console.error('Error fetching product details:', error);
        }
    }

    return { products: allProducts, categoryNames };
}

// Endpoint principal
app.post('/api/extract-products', async (req, res) => {
    try {
        const config = req.body;

        // Validar datos requeridos
        if (!config.accessToken || !config.userId) {
            return res.status(400).json({ error: 'Token de acceso y ID de usuario son requeridos' });
        }

        // Obtener productos
        const productIds = await getAllProducts(config);

        // Obtener detalles
        const { products, categoryNames } = await getProductDetails(productIds, config);

        console.log(`Total de productos obtenidos: ${products.length}`);
        // Agrupar por categoría
        const categoryGroups = {};
        products.forEach(product => {
            const catId = product.category_id;
            if (!categoryGroups[catId]) {
                categoryGroups[catId] = [];
            }
            categoryGroups[catId].push(product);
        });

        // Ordenar productos dentro de cada categoría
        Object.keys(categoryGroups).forEach(catId => {
            categoryGroups[catId].sort((a, b) => {
                if (config.sortBy === 'price') {
                    return a.price - b.price;
                } else if (config.sortBy === 'available_quantity') {
                    return b.available_quantity - a.available_quantity;
                } else {
                    return a.title.localeCompare(b.title);
                }
            });
        });
        console.log(`Agrupados productos por categoría: ${Object.keys(categoryGroups).length} categorías`);
        res.json({
            success: true,
            products,
            categoryGroups,
            categoryNames,
            stats: {
                totalProducts: products.length,
                totalCategories: Object.keys(categoryGroups).length,
                totalValue: products.reduce((sum, p) => sum + p.price, 0),
                totalStock: products.reduce((sum, p) => sum + p.available_quantity, 0)
            }
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Servir archivos estáticos
app.use(express.static('public'));

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});

// package.json
/*
{
  "name": "mercadolibre-extractor",
  "version": "1.0.0",
  "description": "Extractor de productos MercadoLibre",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "axios": "^1.4.0"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  }
}
*/