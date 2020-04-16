const Apify = require('apify');

const { log } = Apify.utils;
const sourceUrl = 'https://www.ssi.dk/aktuelt/sygdomsudbrud/coronavirus';
const LATEST = 'LATEST';

Apify.main(async () => {
    const requestQueue = await Apify.openRequestQueue();
    const kvStore = await Apify.openKeyValueStore('COVID-19-DENMARK');
    const dataset = await Apify.openDataset('COVID-19-DENMARK-HISTORY');

    await requestQueue.addRequest({ url: sourceUrl });
    const crawler = new Apify.CheerioCrawler({
        requestQueue,
        useApifyProxy: true,
        apifyProxyGroups: ['SHADER'],
        handlePageTimeoutSecs: 60 * 2,
        handlePageFunction: async ({ $ }) => {
            log.info('Page loaded.');
            const now = new Date();

            const tested = parseInt($($($($(".rte table tbody tr")).get(0)).find("td").get(1)).text().replace(',','').replace('.','').match(/\d+/), 10)
            const infected = parseInt($($($($(".rte table tbody tr")).get(0)).find("td").get(2)).text().replace(',','').replace('.','').match(/\d+/), 10)
            const recovered = parseInt($($($($(".rte table tbody tr")).get(0)).find("td").get(3)).text().replace(',','').replace('.','').match(/\d+/), 10)
            const deceased = parseInt($($($($(".rte table tbody tr")).get(0)).find("td").get(4)).text().replace(',','').replace('.','').match(/\d+/), 10)

            const data = {
                tested,
                infected,
                recovered,
                deceased,
                sourceUrl,
                lastUpdatedAtApify: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString(),
                readMe: 'https://apify.com/tugkan/covid-dk',
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
