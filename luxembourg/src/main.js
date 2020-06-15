const Apify = require('apify');

const { log } = Apify.utils;
const sourceUrl = 'https://gouvernement.lu/fr/dossiers.gouv_msan+fr+dossiers+2020+corona-virus.html';
const LATEST = 'LATEST';

const toNumber = (text => parseInt(text.replace(/\D/g, ''), 10));

Apify.main(async () => {
    const requestQueue = await Apify.openRequestQueue();
    const kvStore = await Apify.openKeyValueStore('COVID-19-LUXEMBOURG');
    const dataset = await Apify.openDataset('COVID-19-LUXEMBOURG-HISTORY');

    await requestQueue.addRequest({ url: sourceUrl });
    const crawler = new Apify.CheerioCrawler({
        requestQueue,
        handlePageTimeoutSecs: 60 * 2,
        handlePageFunction: async ({ $ }) => {

            log.info('Page loaded.');
            log.info('Processing and saving data.');
            const now = new Date();

            const accordion = $('div.page-text section div.accordion').find('details')

            const infected = toNumber($(accordion).eq(0).find('span').first().text());
            const tested = toNumber($(accordion).eq(1).find('span').first().text());
            const deceased = toNumber($(accordion).eq(2).find('span').first().text());

            const [day, month, year] = $('.page-text .box-content .date').text().replace(/\(|\)/g, '').split('.');
            let srcDate = new Date(`${month}.${day}.${year}`);

            const data = {
                infected,
                deceased,
                tested,
                sourceUrl,
                lastUpdatedAtSource: new Date(Date.UTC(srcDate.getFullYear(), srcDate.getMonth(), srcDate.getDate(), srcDate.getHours(), srcDate.getMinutes())).toISOString(),
                lastUpdatedAtApify: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString(),
                readMe: 'https://apify.com/tugkan/covid-lu',
            };

            // Compare and save to history
            const latest = await kvStore.getValue(LATEST) || {};
            delete latest.lastUpdatedAtApify;
            const actual = Object.assign({}, data);
            delete actual.lastUpdatedAtApify;

            await Apify.pushData({ ...data });

            if (JSON.stringify(latest) !== JSON.stringify(actual)) {
                log.info('Data did change :( storing new to dataset.');
                await dataset.pushData(data);
            }

            await kvStore.setValue(LATEST, data);
            log.info('Data stored, finished.');
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