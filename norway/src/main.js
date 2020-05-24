const Apify = require('apify');

const { log } = Apify.utils;
const sourceUrl = 'https://www.fhi.no/sv/smittsomme-sykdommer/corona/dags--og-ukerapporter/dags--og-ukerapporter-om-koronavirus/';
const LATEST = 'LATEST';
const toNumber = (str) => parseInt(str.replace(/\D/g, ""));


Apify.main(async () => {
    const requestQueue = await Apify.openRequestQueue();
    const kvStore = await Apify.openKeyValueStore('COVID-19-NORWAY');
    const dataset = await Apify.openDataset('COVID-19-NORWAY-HISTORY');

    await requestQueue.addRequest({
        url: 'https://www.fhi.no/api/chartdata/api/91322',
        userData: {
            label: 'INFECTED_BY_REGION'
        }
    });

    const crawler = new Apify.CheerioCrawler({
        requestQueue,
        useApifyProxy: true,
        handlePageTimeoutSecs: 60 * 2,
        additionalMimeTypes: ['application/json'],
        handlePageFunction: async ({ request, $, json }) => {
            const { label } = request.userData;
            log.info(`Getting ${request.userData.label} from ${request.url} `)

            switch (label) {
                case 'INFECTED_BY_REGION':
                    const infectedByRegion = json.splice(1, json.length).map(item => {
                        [region, infectedCount] = item;
                        return {
                            region: item[0],
                            infectedCount: item[1]
                        }
                    });
                    await requestQueue.addRequest({
                        url: 'https://www.fhi.no/api/chartdata/api/91672',
                        userData: {
                            label: 'OTHER_DATA',
                            infectedByRegion
                        }
                    });
                    break;
                case 'OTHER_DATA':
                    log.info('Processing and saving data')
                    const { figures } = json;

                    const infected = figures.find(item => item.key === 'cum_n_msis').number;
                    const tested = figures.find(item => item.key === 'n_lab').number;
                    const deaths = figures.find(item => item.key === 'cum_n_deaths').number;
                    const admittedToHospital = figures.find(item => item.key === 'cum_n_hospital_any_cause').number;
                    const admittedToICU = figures.find(item => item.key === 'cum_n_icu').number;

                    [d, m, y] = figures[0].updated.split('/')
                    const sourceDate = new Date(`${m}/${d}/${y}`);
                    const now = new Date();

                    const data = {
                        infected,
                        tested,
                        recovered: 'N/A',
                        deaths,
                        admittedToHospital,
                        admittedToICU,
                        infectedByRegion: request.userData.infectedByRegion,
                        sourceUrl,
                        country: 'Norway',
                        historyData: 'https://api.apify.com/v2/datasets/6tpTe4Z2TBePRWYti/items?format=json&clean=1',
                        lastUpdatedAtApify: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString(),
                        lastUpdatedAtSource: new Date(Date.UTC(sourceDate.getFullYear(), sourceDate.getMonth(), sourceDate.getDate(), sourceDate.getHours(), sourceDate.getMinutes())).toISOString(),
                        readMe: 'https://apify.com/tugkan/covid-no',
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
