const Apify = require('apify');
const moment = require('moment');
const { log } = Apify.utils;
const sourceUrl = 'https://www.moh.gov.sg/covid-19/statistics';
const LATEST = 'LATEST';

const toNumber = (str) => parseInt(str.replace(/\D+/, ''));

Apify.main(async () => {
    const requestQueue = await Apify.openRequestQueue();
    const kvStore = await Apify.openKeyValueStore('COVID-19-SINGAPORE');
    const dataset = await Apify.openDataset('COVID-19-SINGAPORE-HISTORY');

    await requestQueue.addRequest({ url: sourceUrl });
    const crawler = new Apify.CheerioCrawler({
        requestQueue,
        useApifyProxy: true,
        // apifyProxyGroups: ['SHADER'],
        handlePageTimeoutSecs: 60 * 2,
        handlePageFunction: async ({ $ }) => {
            log.info('Page loaded.');
            const now = new Date();

            const activeCases = toNumber($('tbody:contains(Active Cases) tr').last().text());
            const stableHospitalized = toNumber($('tbody:contains(Hospitalised (Stable)) tr').last().text());
            const criticalHospitalized = toNumber($('tbody:contains(Hospitalised (Critical)) tr').last().text());
            const deaths = toNumber($('tbody:contains(Deaths) tr').last().text());
            const discharged = toNumber($('tbody:contains(Discharged) tr').last().text());
            const inCommunityFacilites = toNumber($('tbody:contains(In Community Facilities) tr').last().text());


            let srcDate;
            const dateMatch = $('h4:contains(as at)').first().text().match(/(?<=\(as.*at).*(?=\))/g);
            if (dateMatch) {
                console.log(dateMatch[0])
                srcDate = new Date(moment(dateMatch[0].trim(), 'DD MMM YYYY, h:m').format());
            } else {
                log.error('Can not extract the date. Actor need to be checked!');
                process.exit(1);
            }

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
                lastUpdatedAtSource: new Date(Date.UTC(srcDate.getFullYear(), srcDate.getMonth(), srcDate.getDate(), srcDate.getHours(), srcDate.getMinutes())).toISOString(),
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
