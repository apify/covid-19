const Apify = require('apify');

const { log } = Apify.utils;
const sourceUrl = 'https://koronavirus.gov.hu';
const LATEST = 'LATEST';

Apify.main(async () => {
    const requestQueue = await Apify.openRequestQueue();
    const kvStore = await Apify.openKeyValueStore('COVID-19-HUNGARY');
    const dataset = await Apify.openDataset('COVID-19-HUNGARY-HISTORY');

    await requestQueue.addRequest({ url: sourceUrl });
    const crawler = new Apify.CheerioCrawler({
        requestQueue,
        useApifyProxy: true,
        apifyProxyGroups: ['SHADER'],
        handlePageTimeoutSecs: 60 * 2,
        handlePageFunction: async ({ $ }) => {
            log.info('Page loaded.');
            const now = new Date();

            const infected = parseInt($($('.view-diagrams .view-content').get(0)).find('.views-row-1 .number').text().trim()
                .replace(/\s/g, ''), 10);
            const recovered = parseInt($($('.view-diagrams .view-content').get(0)).find('.views-row-2 .number').text().trim()
                .replace(/\s/g, ''), 10);
            const deceased = parseInt($($('.view-diagrams .view-content').get(0)).find('.views-row-3 .number').text().trim()
                .replace(/\s/g, ''), 10) || 0;
            const quarantined = parseInt($($('.view-diagrams .view-content').get(0)).find('.views-row-4 .number').text().trim()
                .replace(/\s/g, ''), 10);
            const tested = parseInt($($('.view-diagrams .view-content').get(0)).find('.views-row-5 .number').text().trim()
                .replace(/\s/g, ''), 10);

            const date = new Date($($('.view-diagrams .well-lg p').get(0)).text().replace('Legutolsó frissítés dátuma: ',''));

            const data = {
                infected,
                deceased,
                recovered,
                quarantined,
                tested,
                sourceUrl,
                lastUpdatedAtSource: date.toISOString(),
                lastUpdatedAtApify: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString(),
                readMe: 'https://apify.com/tugkan/covid-hu',
            };

            // Compare and save to history
            const latest = await kvStore.getValue(LATEST) || {};
            delete latest.lastUpdatedAtApify;
            const actual = Object.assign({}, data);
            delete actual.lastUpdatedAtApify;

            await Apify.pushData({...data});

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
