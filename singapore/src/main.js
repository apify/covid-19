const Apify = require('apify');

const { log } = Apify.utils;
const sourceUrl = 'https://www.moh.gov.sg/covid-19';
const LATEST = 'LATEST';

Apify.main(async () => {
    const requestQueue = await Apify.openRequestQueue();
    const kvStore = await Apify.openKeyValueStore('COVID-19-SINGAPORE');
    const dataset = await Apify.openDataset('COVID-19-SINGAPORE-HISTORY');

    await requestQueue.addRequest({ url: sourceUrl });
    const crawler = new Apify.CheerioCrawler({
        requestQueue,
        useApifyProxy: true,
        apifyProxyGroups: ['SHADER'],
        handlePageTimeoutSecs: 60 * 2,
        handlePageFunction: async ({ $ }) => {
            log.info('Page loaded.');
            const now = new Date();

            const activeCases = parseInt($($('#ContentPlaceHolder_contentPlaceholder_C072_Col00 tr td').get(1)).text().trim().replace(/\D/, ''), 10);
            const stableHospitalized = parseInt($($('#ContentPlaceHolder_contentPlaceholder_C073_Col01 tr td').get(1)).text().trim().replace(/\D/, ''), 10);
            const criticalHospitalized = parseInt($($('#ContentPlaceHolder_contentPlaceholder_C073_Col02 tr td').get(1)).text().trim().replace(/\D/, ''), 10);
            const deaths = parseInt($($('#ContentPlaceHolder_contentPlaceholder_C073_Col03 tr td').get(1)).text().trim().replace(/\D/, ''), 10);
            const discharged = parseInt($($('#ContentPlaceHolder_contentPlaceholder_C072_Col01 tr td').get(1)).text().trim().replace(/\D/, ''), 10);
            const inCommunityFacilites = parseInt($($('#ContentPlaceHolder_contentPlaceholder_C073_Col00 tr td').get(1)).text().trim().replace(/\D/, ''), 10);

            const data = {
                infected: deaths + discharged + activeCases,
                discharged,
                inCommunityFacilites,
                stableHospitalized,
                criticalHospitalized,
                activeCases,
                deceased: deaths,
                recovered: discharged,
                sourceUrl,
                lastUpdatedAtApify: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString(),
                readMe: 'https://apify.com/tugkan/covid-sg',
            };

            console.log(data);

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
