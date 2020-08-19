// main.js
const Apify = require('apify');
const cheerio = require('cheerio')
const { log, requestAsBrowser } = Apify.utils;
const LATEST = 'LATEST';

const sourceUrl = 'https://data.public.lu/fr/datasets/covid-19-rapports-journaliers/';
const now = new Date();
const toNumber = (txt) => parseInt(txt.replace(/\D+/g, ''), 10);

Apify.main(async () => {

    Apify.client.setOptions({ token: process.env.APIFY_TOKEN });

    log.info('Starting actor.');
    const kvStore = await Apify.openKeyValueStore('COVID-19-LUXEMBOURG');
    const dataset = await Apify.openDataset('COVID-19-LUXEMBOURG-HISTORY');

    const requestQueue = await Apify.openRequestQueue();
    await requestQueue.addRequest({
        url: 'https://data.public.lu/fr/datasets/covid-19-rapports-journaliers/',
        userData: {
            label: 'GET_PDF_LINK'
        }
    })
    const crawler = new Apify.BasicCrawler({
        requestQueue,
        handleRequestTimeoutSecs: 240,
        handleRequestFunction: async ({ request }) => {
            const { url, userData: { label, dateModified } } = request;
            log.info('Page opened.', { label, url });

            switch (label) {
                case 'GET_PDF_LINK':
                    const { body } = await requestAsBrowser({ url });

                    const $ = cheerio.load(body);
                    const { contentUrl, dateModified: fileDateModified } = JSON.parse($('script#json_ld').html().replace(/\\|/g, '')).distribution[0];

                    await requestQueue.addRequest({
                        url: contentUrl,
                        userData: {
                            label: 'EXTRACT_DATA',
                            dateModified: fileDateModified,
                        }
                    })
                    break;

                case 'EXTRACT_DATA':
                    log.info('Converting pdf to html...')

                    const run = await Apify.call('jancurn/pdf-to-html', {
                        url,
                    });
                    log.info('Proccesing and saving data...')
                    const $$ = cheerio.load(run.output.body.replace(/\\/g, ''))

                    // // Extract date
                    // const [m, d, y] = $$('span:contains(Date de publication)').text().match(/[0-9\/]+/g)[0].split('/');
                    // const srcDate = new Date(`${d}-${m}-${y}`);

                    // Extract date
                    const srcDate = new Date(dateModified);


                    const data = {
                        tested: toNumber($$('div:contains(Nombre de tests)').nextAll().eq(12).text()),
                        infected: toNumber($$('div:contains(Personnes testées)').nextAll().eq(12).text()),
                        deceased: toNumber($$('div:contains(Nombre de décès)').parent().last().nextAll().eq(1).text()),
                        recovered: toNumber($$('div:contains(Nombre de personnes guéries)').parent().last().nextAll().eq(0).text()),
                        active: toNumber($$('div:contains(Nombre d’infections actives)').parent().last().nextAll().eq(0).text()),
                        hospitalized: toNumber($$('div:contains(Hospitalisations en soins normaux)').parent().last().nextAll().eq(0).text()),
                        intensiveCare: toNumber($$('div:contains(Hospitalisations en soins intensifs)').parent().last().nextAll().eq(0).text()),
                        sourceUrl,
                        country: ' Luxembourg',
                        historyData: 'https://api.apify.com/v2/datasets/oZH6thpQSdIyo3ky2/items?format=json&clean=1',
                        lastUpdatedAtSource: new Date(Date.UTC(srcDate.getFullYear(), srcDate.getMonth(), srcDate.getDate(), srcDate.getHours(), srcDate.getMinutes())).toISOString(),
                        lastUpdatedAtApify: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString(),
                        readMe: 'https://apify.com/tugkan/covid-lu',
                    }
                    console.log(data)

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
        // This function is called if the page processing failed more than maxRequestRetries+1 times.	
        handleFailedRequestFunction: async ({ request }) => {
            console.log(`Request ${request.url} failed twice.`);
        },
    });

    // Run the crawler and wait for it to finish.
    await crawler.run();
    console.log('Crawler finished.');
});