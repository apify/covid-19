// main.js
const Apify = require('apify');
const pdf = require('pdf-parse');
const { log } = Apify.utils;


const LATEST = "LATEST";
const now = new Date();
const sourceUrl = 'https://www.mscbs.gob.es/profesionales/saludPublica/ccayes/alertasActual/nCov-China/situacionActual.htm';

const toNumber = (txt) => parseInt(txt.replace(/\D/g, ''), 10);

Apify.main(async () => {

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

    log.debug('Setting up crawler.');
    const cheerioCrawler = new Apify.CheerioCrawler({
        requestQueue,
        maxRequestRetries: 5,
        requestTimeoutSecs: 90,
        useApifyProxy: true,
        additionalMimeTypes: ['application/pdf'],
        handleRequestTimeoutSecs: 90,
        prepareRequestFunction: async ({ request }) => {
            if (request.url.endsWith('.pdf')) {
                log.info(`Proccecing ${request.url}`)
                log.info(`Downloading PDF file ...`)
            };
        },
        handlePageFunction: async ({ request, $, body }) => {
            const { label } = request.userData;
            switch (label) {
                case 'GET_PDF_LINK':
                    log.info(`Proccecing ${request.url}`)
                    log.info(`Getting PDF download link...`)
                    const PDFLink = $('div.imagen_texto ul li:nth-child(2) a').attr('href').match(/profesionales.*/g)[0];

                    await requestQueue.addRequest({
                        url: `https://www.mscbs.gob.es/${PDFLink}`,
                        userData: {
                            label: 'EXTRACT_DATA'
                        }
                    })
                    break;
                case 'EXTRACT_DATA':

                    log.info(`File had downloaded.`);
                    log.info(`Processing and saving data.`);

                    let PDFText = await pdf(body).then(async (data) => {
                        return data.text;
                    }).catch(function (error) {
                        throw new Error(`${error}`)
                    })

                    PDFText = PDFText.replace(/\n/g, '#')

                    // use data
                    const total = PDFText.match(/(?<=confirmados totales.*ESPAÑA.*#)[^#]+(?=#)/g)[0]
                        .trim()
                        .split(' ');
                    const hospitalization = PDFText.match(/(?<=precisado hospitalización.*ESPAÑA.*#)[^#]+(?=#)/g)[0]
                        .trim()
                        .split(' ');

                    const [h, rest] = PDFText.match(/(?<=a las.*)[^\)]+(?=\))/g)[0].trim().replace(/[^:\d. ]/g, '')
                        .replace(/  /g, '').split(' ')
                    const [d, m, y] = rest.split('.')

                    const srcDate = new Date(`${h} ${m}-${d}-${y}`);

                    const data = {
                        infected: toNumber(total[0]),
                        recovered: 'N/A',
                        tested: 'N/A',
                        deceased: toNumber(hospitalization[4]),
                        hospitalised: toNumber(hospitalization[0]),
                        ICU: toNumber(hospitalization[2]),
                        dailyInfected: toNumber(total[1]),
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
                default:
                    break;
            }
        },
        handleFailedRequestFunction: async ({ request }) => {
            console.log(`Request ${request.url} failed many times.`);
            console.dir(request)
        },
    });
    // Run the crawler and wait for it to finish.
    log.info('Starting the crawl.');
    await cheerioCrawler.run();
    log.info('Actor finished.');
});