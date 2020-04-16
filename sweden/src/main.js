const Apify = require('apify');

const { log,requestAsBrowser } = Apify.utils;
const sourceUrl = 'https://services5.arcgis.com/fsYDFeRKu1hELJJs/arcgis/rest/services/FOHM_Covid_19_FME_1/FeatureServer/0/query?f=json&where=Region%20%3C%3E%20%27dummy%27&returnGeometry=false&spatialRel=esriSpatialRelIntersects&outFields=*&orderByFields=Region%20asc&outSR=102100&resultOffset=0&resultRecordCount=25&cacheHint=true';
const LATEST = 'LATEST';

Apify.main(async () => {
    const requestQueue = await Apify.openRequestQueue();
    const kvStore = await Apify.openKeyValueStore('COVID-19-SWEDEN');
    const dataset = await Apify.openDataset('COVID-19-SWEDEN-HISTORY');

    await requestQueue.addRequest({ url: sourceUrl });
    const crawler = new Apify.BasicCrawler({
        requestQueue,
        useApifyProxy: true,
        handleRequestTimeoutSecs: 60 * 2,
        useSessionPool:true,
        handleRequestFunction: async (context) => {
            const { request, session } = context;
            log.info('Page loaded.');
            const now = new Date();

            // Send request
            const response = await requestAsBrowser({
                url: request.url,
                method: 'GET',
                apifyProxyGroups:['SHADER'],
                timeoutSecs: 120,
                abortFunction: (res) => {
                    // Status code check
                    if (!res || res.statusCode !== 200) {
                        session.markBad();
                        return true;
                    }
                    session.markGood();
                    return false;
                },
            }).catch((err) => {
                session.markBad();
                throw new Error(err);
            });

            const data = response.body;

            const currentData = JSON.parse(data);

            const infectedByRegion = currentData.features.map((r) => {
                const region = r.attributes.Region;
                const infectedCount = r.attributes.Totalt_antal_fall;
                const deathCount = r.attributes.Totalt_antal_avlidna
                const intensiveCareCount = r.attributes.Totalt_antal_intensivvårdade;;
                return {
                    region,
                    infectedCount,
                    deathCount,
                    intensiveCareCount,
                };
            });

            const {infected, deceased, intensiveCare} = infectedByRegion.reduce((sumObj, val) => ({
                ...sumObj,
                infected: val.infectedCount + sumObj.infected,
                deceased: val.deathCount + sumObj.deceased,
                intensiveCare: val.intensiveCareCount + sumObj.intensiveCare,
            }),{
                infected:0,
                deceased:0,
                intensiveCare:0,
            })

            const returningData = {
                infected,
                deceased,
                intensiveCare,
                infectedByRegion,
                sourceUrl,
                lastUpdatedAtApify: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString(),
                readMe: 'https://apify.com/tugkan/covid-se',
            };

            // Compare and save to history
            const latest = await kvStore.getValue(LATEST) || {};
            delete latest.lastUpdatedAtApify;
            const actual = Object.assign({}, returningData);
            delete actual.lastUpdatedAtApify;

            await Apify.pushData({...returningData});

            if (JSON.stringify(latest) !== JSON.stringify(actual)) {
                log.info('Data did change :( storing new to dataset.');
                await dataset.pushData(returningData);
            }

            await kvStore.setValue(LATEST, returningData);
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
