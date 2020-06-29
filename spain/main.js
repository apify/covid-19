// main.js
const Apify = require('apify');
const cheerio = require('cheerio')
const { log, requestAsBrowser } = Apify.utils;
const LATEST = 'LATEST';

const sourceUrl = 'https://www.mscbs.gob.es/profesionales/saludPublica/ccayes/alertasActual/nCov-China/situacionActual.htm';
const now = new Date();
const toNumber = (txt) => parseInt(txt.replace(/\D/g, ''), 10);

Apify.main(async () => {

    Apify.client.setOptions({ token: process.env.APIFY_TOKEN });

    log.info('Starting actor.');

    const kvStore = await Apify.openKeyValueStore('COVID-19-ES');
    const dataset = await Apify.openDataset('COVID-19-ES-HISTORY');

    const requestQueue = await Apify.openRequestQueue();
    await requestQueue.addRequest({
        url: sourceUrl,
        userData: {
            label: 'GET_PDF_LINK'
        }
    })
    const crawler = new Apify.BasicCrawler({
        requestQueue,
        handleRequestTimeoutSecs: 240,
        handleRequestFunction: async ({ request }) => {
            const { url, userData: { label } } = request;
            log.info('Page opened.', { label, url });

            switch (label) {
                case 'GET_PDF_LINK':

                    const { body } = await requestAsBrowser({ url });
                    const $ = cheerio.load(body)

                    const pdfLink = $('div.imagen_texto ul li:nth-child(2) a').attr('href').match(/profesionales.*/g)[0];

                    await requestQueue.addRequest({
                        url: `https://www.mscbs.gob.es/${pdfLink}`,
                        userData: {
                            label: 'EXTRACT_DATA'
                        }
                    })
                    break;
                case 'EXTRACT_DATA':
                    log.info('Converting pdf to html...')

                    const run = await Apify.call('jancurn/pdf-to-html', {
                        url,
                    });

                    log.info('Proccesing and saving data...')
                    const $$ = cheerio.load(run.output.body)

                    let totalColumn = $$('div:contains(La Rioja)').eq(3).nextAll('div:contains(ESPAÑA)');
                    let hospColumn = $$('div:contains(La Rioja)').eq(7).nextAll('div:contains(ESPAÑA)');

                    let regionsNames = ['Andalucía', 'Aragón', 'Asturias', "Baleares", "Canarias", "Cantabria", "Castilla La Mancha", "Castilla y León",
                        "Cataluña", "Ceuta", "Valenciana", "Extremadura", "Galicia", "Madrid", "Melilla", "Murcia", "Navarra", "País Vasco ", "La Rioja"]
                    let regions = []

                    regionsNames.forEach(name => {
                        const firstElem = $$(`div:contains(${name})`).eq(3);
                        let secondElem = $$(`div:contains(${name})`).eq(7);
                        if (name.includes('Castilla y León')) {
                            secondElem = $$(`div:contains(${name})`).eq(9);
                        }
                        regions.push({
                            name: $$(secondElem).text().replace(/\*/g, '').trim(),
                            infected: toNumber($$(firstElem).next().text().trim()),
                            deceased: toNumber($$(secondElem).next().next().next().next().next().text()),
                            hospitalised: toNumber($$(secondElem).next().text()),
                            ICU: toNumber($$(secondElem).next().next().next().text()),
                            dailyInfected: toNumber($$(firstElem).next().next().text().trim()),
                        })
                    })

                    const $srcDate = $$('div:contains(Actualización)').last().text();
                    const [h, rest] = $srcDate.match(/(?<=a las.*)[^\)]+(?=\))/g)[0].trim().replace(/[^:\d. ]/g, '')
                        .replace(/  /g, '').split(' ')
                    const [d, m, y] = rest.split('.')

                    const srcDate = new Date(`${h} ${m}-${d}-${y}`);

                    const data = {
                        infected: toNumber($$(totalColumn).next().text()),
                        recovered: 'N/A',
                        tested: 'N/A',
                        deceased: toNumber($$(hospColumn).next().next().next().next().next().text()),
                        hospitalised: toNumber($$(hospColumn).next().text()),
                        ICU: toNumber($$(hospColumn).next().next().next().text()),
                        dailyInfected: toNumber($$(totalColumn).next().next().text()),
                        regions,
                        country: 'Spain',
                        historyData: 'https://api.apify.com/v2/datasets/hxwow9BB75z8RV3JT/items?format=json&clean=1',
                        sourceUrl: sourceUrl,
                        lastUpdatedAtApify: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString(),
                        lastUpdatedAtSource: new Date(Date.UTC(srcDate.getFullYear(), srcDate.getMonth(), srcDate.getDate(), (srcDate.getHours()), srcDate.getMinutes())).toISOString(),
                        readMe: 'https://apify.com/zuzka/covid-es',
                    }
                    // Push the data
                    let latest = await kvStore.getValue(LATEST);
                    if (!latest) {
                        await kvStore.setValue('LATEST', data);
                        latest = Object.assign({}, data);
                    }
                    delete latest.lastUpdatedAtApify;
                    const actual = Object.assign({}, data);
                    delete actual.lastUpdatedAtApify;

                    const { itemCount } = await dataset.getInfo();
                    if (JSON.stringify(latest) !== JSON.stringify(actual) || itemCount === 0) {
                        await dataset.pushData(data);
                    }

                    await kvStore.setValue('LATEST', data);
                    await Apify.pushData(data);

                    log.info('Data saved.');
                    break;
            }
        },
    });

    // Run the crawler and wait for it to finish.
    await crawler.run();
    console.log('Crawler finished.');
});